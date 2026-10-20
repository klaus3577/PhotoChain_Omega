// A lánc-regisztráció költségének becslése (L29): a regisztráció gázfelhasználása (a Sepolia- és a
// Hardhat-mérés, illetve az adatbázis regisztrált képeinek gasUsed értéke) szorozva a gázárral az
// Ethereum-főhálózaton és két L2-hálózaton (Base, OP Mainnet). A gázár a ténylegesen fizetett ár
// (alapdíj + prioritási díj) az utolsó 1024 blokk eth_feeHistory adataiból, a mediánnal és a 10–90.
// percentilis tartományával; a díjplafon (maxFeePerGas) külön szerepel. Az L2-n a díj a végrehajtás
// díjából és az L1-re írt adat díjából áll – utóbbit a hálózat GasPriceOracle szerződése (getL1Fee) adja
// az aláíratlan tranzakció RLP-kódjára (és ha van, az operátordíj is bekerül). Az ETH-árfolyam (USD,
// HUF) a CoinGecko nyilvános API-jából jön. Titkos kulcs nem kell: minden lekérdezés nyilvános és csak
// olvas. A kimenet: docs/kiertekeles/gas-cost.md, gas-cost.html és gas-cost.csv (időbélyeggel).
// Használat (server/): npm run experiment:gas
// Forrás: ethereum.org – Gas and fees (EIP-1559), https://ethereum.org/developers/docs/gas/; OP Stack –
// Transaction fees (L1 data fee, GasPriceOracle.getL1Fee, operátordíj),
// https://docs.optimism.io/stack/transactions/fees; Base – Network information (nyilvános RPC),
// https://docs.base.org/chain/network-information; CoinGecko API – /simple/price,
// https://docs.coingecko.com/reference/simple-price (adaptálva)
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import {
  Contract,
  FetchRequest,
  formatEther,
  formatUnits,
  Interface,
  JsonRpcProvider,
  Transaction,
} from 'ethers';

import photoRegistry from '../src/contracts/PhotoRegistry.json' with { type: 'json' };
import { createPrismaClient, DatabaseConnectionError } from '../src/lib/prisma.js';
import { csvFile } from './lib/csv.js';
import { renderReportHtml } from './lib/reportHtml.js';

const OUTPUT_DIR = fileURLToPath(new URL('../../docs/kiertekeles/', import.meta.url));
const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));
const REQUEST_TIMEOUT_MS = 20_000;
/** Ennyi blokk díjelőzménye adja a gázár tartományát (a főhálózaton kb. 3,4 óra) */
const FEE_HISTORY_BLOCKS = 1024;
const FEE_PERCENTILES = [10, 50, 90] as const;

/** Korábbi mérések (docs/fejlesztesi-naplo.md L04, L11): egy regisztráció gázfelhasználása */
const MEASURED_GAS = {
  /** Sepolia, optimalizált bájtkód (0x8c326b…, 11 820 993. blokk) */
  sepolia: 71_686n,
  /** lokális Hardhat-hálózat, fejlesztői fordítási profil (npm run test:gas) */
  hardhat: 72_820n,
  /** a szerződés telepítése (egyszeri költség), optimalizált bájtkód */
  deployment: 325_903n,
};

/** Forgatókönyvek a főhálózaton (gwei): a dolgozat ezekkel is számol (forrás: Etherscan gázár-grafikon) */
const SCENARIO_GAS_PRICES_GWEI = [10n, 30n];
/** A szerver díjplafonja (server/src/config/env.ts, CHAIN_MAX_FEE_GWEI alapértéke): e fölött vár */
const SERVER_FEE_CEILING_GWEI = 50n;
const GWEI = 1_000_000_000n;

/** Az OP Stack hálózatok közös GasPriceOracle előre telepített szerződése */
const GAS_PRICE_ORACLE = '0x420000000000000000000000000000000000000F';
const GAS_PRICE_ORACLE_ABI = [
  'function getL1Fee(bytes data) view returns (uint256)',
  'function getOperatorFee(uint256 gasUsed) view returns (uint256)',
];

interface Network {
  name: string;
  rpcUrl: string;
  chainId: bigint;
  /** OP Stack L2: az L1-adatdíjat és az operátordíjat az oracle adja */
  opStack: boolean;
}

const NETWORKS: Network[] = [
  {
    name: 'Ethereum (főhálózat)',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    chainId: 1n,
    opStack: false,
  },
  {
    name: 'Base (L2, OP Stack)',
    rpcUrl: 'https://mainnet.base.org',
    chainId: 8453n,
    opStack: true,
  },
  {
    name: 'OP Mainnet (L2, OP Stack)',
    rpcUrl: 'https://mainnet.optimism.io',
    chainId: 10n,
    opStack: true,
  },
];

interface GasStats {
  count: number;
  average: bigint;
  min: bigint;
  max: bigint;
}

/** Az adatbázis láncon regisztrált képeinek gázfelhasználása (ha van adatbázis; értéket nem ír ki). */
async function databaseGasStats(): Promise<GasStats | null> {
  // Csak az adatbázis címe kell a .env-ből (a többi titkot nem töltjük be a folyamatba)
  const databaseUrl =
    process.env.DATABASE_URL ??
    (existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')).DATABASE_URL : undefined);
  if (!databaseUrl) return null;
  const prisma = createPrismaClient(databaseUrl);
  try {
    const rows = await prisma.photo.findMany({
      where: { gasUsed: { not: null } },
      select: { gasUsed: true },
    });
    const values = rows.map((row) => row.gasUsed).filter((gas): gas is bigint => gas !== null);
    if (values.length === 0) return { count: 0, average: 0n, min: 0n, max: 0n };
    const total = values.reduce((sum, gas) => sum + gas, 0n);
    return {
      count: values.length,
      average: total / BigInt(values.length),
      min: values.reduce((a, b) => (a < b ? a : b)),
      max: values.reduce((a, b) => (a > b ? a : b)),
    };
  } catch (error) {
    console.warn(
      `  ${new DatabaseConnectionError({ cause: error }).message} – a gázstatisztika kimarad`,
    );
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

/** Egy regisztrációs hívás adata a valódi ABI-val, véletlen (nem tömöríthető) értékekkel */
function registrationCalldata(): string {
  const abi = new Interface(photoRegistry.abi);
  return abi.encodeFunctionData('registerPhoto', [
    `0x${randomBytes(32).toString('hex')}`,
    `0x${randomBytes(8).toString('hex')}`,
    `0x${randomBytes(32).toString('hex')}`,
  ]);
}

interface FeeHistory {
  baseFeePerGas: string[];
  reward?: string[][];
}

interface PriceSample {
  /** A fizetett ár (alapdíj + medián prioritási díj) blokkonként */
  pricesWei: bigint[];
  /** A következő blokk alapdíja + a legutóbbi blokkok medián prioritási díja */
  currentWei: bigint;
}

/** A fizetett gázár az eth_feeHistory alapján; ha a végpont nem támogatja, a gasPrice az egyetlen minta */
async function samplePrices(provider: JsonRpcProvider): Promise<PriceSample> {
  try {
    const history = (await provider.send('eth_feeHistory', [
      `0x${FEE_HISTORY_BLOCKS.toString(16)}`,
      'latest',
      [50],
    ])) as FeeHistory;
    const baseFees = history.baseFeePerGas.map(BigInt);
    const tips = (history.reward ?? []).map((block) => BigInt(block[0] ?? '0x0'));
    const pricesWei = tips.map((tip, index) => (baseFees[index] ?? 0n) + tip);
    if (pricesWei.length === 0) throw new Error('üres díjelőzmény');
    const nextBaseFee = baseFees[baseFees.length - 1] ?? 0n;
    const recentTips = tips.slice(-16).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const medianTip = recentTips[Math.floor(recentTips.length / 2)] ?? 0n;
    return { pricesWei, currentWei: nextBaseFee + medianTip };
  } catch {
    const { gasPrice } = await provider.getFeeData();
    if (gasPrice === null) throw new Error('nincs gázár a válaszban');
    return { pricesWei: [gasPrice], currentWei: gasPrice };
  }
}

const percentile = (sorted: bigint[], p: number): bigint =>
  sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0n;

interface FeeQuote {
  network: string;
  l2: boolean;
  currentWei: bigint;
  p10Wei: bigint;
  p50Wei: bigint;
  p90Wei: bigint;
  maxFeeWei: bigint | null;
  l1FeeWei: bigint;
  operatorFeeWei: bigint;
  /** végrehajtás az aktuális áron + L1-adatdíj + operátordíj */
  totalWei: bigint;
  /** ugyanez a 90. percentilis gázárral */
  totalP90Wei: bigint;
}

async function quoteNetwork(network: Network, gas: bigint): Promise<FeeQuote> {
  const request = new FetchRequest(network.rpcUrl);
  request.timeout = REQUEST_TIMEOUT_MS;
  const provider = new JsonRpcProvider(request, Number(network.chainId), { staticNetwork: true });
  try {
    const { pricesWei, currentWei } = await samplePrices(provider);
    const sorted = [...pricesWei].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const [p10Wei, p50Wei, p90Wei] = FEE_PERCENTILES.map((p) => percentile(sorted, p)) as [
      bigint,
      bigint,
      bigint,
    ];
    const { maxFeePerGas } = await provider.getFeeData();
    let l1FeeWei = 0n;
    let operatorFeeWei = 0n;
    if (network.opStack) {
      const oracle = new Contract(GAS_PRICE_ORACLE, GAS_PRICE_ORACLE_ABI, provider);
      // Az oracle az aláíratlan, RLP-kódolt tranzakció méretéből számol; a hívás adata valódi
      const unsigned = Transaction.from({
        type: 2,
        chainId: network.chainId,
        to: photoRegistry.networks['11155111']?.address ?? GAS_PRICE_ORACLE,
        data: registrationCalldata(),
        gasLimit: gas,
        maxFeePerGas: maxFeePerGas ?? currentWei,
        maxPriorityFeePerGas: 0n,
        nonce: 1,
      }).unsignedSerialized;
      const l1Fee: unknown = await oracle.getFunction('getL1Fee')(unsigned);
      if (typeof l1Fee !== 'bigint') throw new Error('getL1Fee: nem szám a válasz');
      l1FeeWei = l1Fee;
      try {
        const operatorFee: unknown = await oracle.getFunction('getOperatorFee')(gas);
        if (typeof operatorFee === 'bigint') operatorFeeWei = operatorFee;
      } catch {
        // Régebbi oracle: nincs operátordíj
      }
    }
    const extras = l1FeeWei + operatorFeeWei;
    return {
      network: network.name,
      l2: network.opStack,
      currentWei,
      p10Wei,
      p50Wei,
      p90Wei,
      maxFeeWei: maxFeePerGas,
      l1FeeWei,
      operatorFeeWei,
      totalWei: currentWei * gas + extras,
      totalP90Wei: p90Wei * gas + extras,
    };
  } finally {
    provider.destroy();
  }
}

interface EthPrice {
  usd: number;
  huf: number;
}

async function ethPrice(): Promise<EthPrice> {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,huf',
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) throw new Error(`CoinGecko: HTTP ${response.status}`);
  const body = (await response.json()) as { ethereum?: { usd?: number; huf?: number } };
  if (typeof body.ethereum?.usd !== 'number' || typeof body.ethereum.huf !== 'number') {
    throw new Error('CoinGecko: hiányzó árfolyam a válaszban');
  }
  return { usd: body.ethereum.usd, huf: body.ethereum.huf };
}

const hu = (value: number, options: Intl.NumberFormatOptions): string =>
  value.toLocaleString('hu-HU', options);
const gasOf = (gas: bigint): string => hu(Number(gas), {});
const gweiOf = (wei: bigint): string =>
  hu(Number(formatUnits(wei, 'gwei')), { maximumSignificantDigits: 3 });
const ethOf = (wei: bigint): string =>
  hu(Number(formatEther(wei)), { maximumSignificantDigits: 3 });
const usdOf = (wei: bigint, price: EthPrice): string =>
  hu(Number(formatEther(wei)) * price.usd, { maximumSignificantDigits: 3 });
const hufOf = (wei: bigint, price: EthPrice): string =>
  hu(Number(formatEther(wei)) * price.huf, { maximumFractionDigits: 2 });

interface ReportInput {
  stamp: string;
  gas: bigint;
  gasSource: string;
  stats: GasStats | null;
  price: EthPrice;
  quotes: FeeQuote[];
  unavailable: string[];
}

function report({ stamp, gas, gasSource, stats, price, quotes, unavailable }: ReportInput): string {
  const quoteRows = quotes.map(
    (quote) =>
      `| ${quote.network} | ${gweiOf(quote.currentWei)} | ${gweiOf(quote.p10Wei)}–${gweiOf(quote.p90Wei)} (medián ${gweiOf(quote.p50Wei)}) | ${quote.maxFeeWei === null ? '–' : gweiOf(quote.maxFeeWei)} | ${quote.l2 ? ethOf(quote.l1FeeWei + quote.operatorFeeWei) : '–'} | ${ethOf(quote.totalWei)} | ${usdOf(quote.totalWei, price)} | ${hufOf(quote.totalWei, price)} | ${hufOf(quote.totalP90Wei, price)} |`,
  );
  const scenarioRows = [...SCENARIO_GAS_PRICES_GWEI, SERVER_FEE_CEILING_GWEI].map((gwei) => {
    const wei = gwei * GWEI * gas;
    const label =
      gwei === SERVER_FEE_CEILING_GWEI
        ? `Ethereum, a szerver díjplafonja (${gwei} gwei) – felső korlát regisztrációnként`
        : `Ethereum, forgatókönyv ${gwei} gwei`;
    return `| ${label} | ${gwei} | – | – | – | ${ethOf(wei)} | ${usdOf(wei, price)} | ${hufOf(wei, price)} | – |`;
  });
  const mainnet = quotes.find((quote) => !quote.l2);
  const deploymentWei = mainnet ? mainnet.currentWei * MEASURED_GAS.deployment : 0n;
  const statsRow = stats
    ? `| fejlesztői adatbázis, ${stats.count} láncon regisztrált kép${stats.count === 1 ? ' (ugyanaz a Sepolia-tranzakció)' : ' (átlag / min / max)'} | ${stats.count > 0 ? (stats.count === 1 ? gasOf(stats.average) : `${gasOf(stats.average)} / ${gasOf(stats.min)} / ${gasOf(stats.max)}`) : '–'} |\n`
    : '';
  return `# A lánc-regisztráció költsége (L29)

Mérés ideje: ${stamp} (\`npm run experiment:gas\`, \`server/scripts/gas-cost.ts\`). A gázfelhasználás saját
mérésből (Sepolia-tranzakció, Hardhat), a gázár a hálózatok nyilvános RPC-végpontjáról: a ténylegesen
fizetett ár (alapdíj + prioritási díj) az utolsó ${FEE_HISTORY_BLOCKS} blokk \`eth_feeHistory\` adataiból – „most” = a
következő blokk alapdíja + a legutóbbi blokkok medián prioritási díja –, a díjplafon (\`maxFeePerGas\`)
külön. Az L1-adatdíj az OP Stack hálózatok \`GasPriceOracle.getL1Fee\` hívásából egy \`registerPhoto\` hívás
aláíratlan tranzakciójára (véletlen adattal), az operátordíj a \`getOperatorFee\`-ből (ha van). Az
ETH-árfolyam a CoinGecko API-ból ugyanebben a pillanatban: ${hu(price.usd, {})} USD, ${hu(price.huf, {})} HUF.

## Gázfelhasználás regisztrációnként

| Forrás | Gáz |
| --- | --- |
| Sepolia, optimalizált bájtkód (L11, 0x8c326b…) | ${gasOf(MEASURED_GAS.sepolia)} |
| lokális Hardhat-hálózat, fejlesztői profil (L04, \`npm run test:gas\`) | ${gasOf(MEASURED_GAS.hardhat)} |
${statsRow}| a szerződés telepítése (egyszeri) | ${gasOf(MEASURED_GAS.deployment)} |

A szerződésben nincs számláló vagy lista: minden regisztráció ugyanannyi friss tárhelyet ír és egy
eseményt bocsát ki, ezért a gáz képenként gyakorlatilag állandó (csak a hívásadat nulla bájtjai miatt
ingadozik néhány tucat gázzal). A becslés **${gasOf(gas)} gázzal** számol – ${gasSource}.

## Becsült díj regisztrációnként

| Hálózat | Gázár most (gwei) | Tartomány, ${FEE_HISTORY_BLOCKS} blokk (gwei) | Díjplafon (gwei) | L1-adatdíj + operátordíj (ETH) | Díj (ETH) | Díj (USD) | Díj (Ft) | Díj a 90. percentilis áron (Ft) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${[...quoteRows, ...scenarioRows].join('\n')}
${unavailable.length > 0 ? `\nNem elérhető hálózat a mérés pillanatában: ${unavailable.join(', ')}.\n` : ''}
A forgatókönyv-sorok a főhálózat korábbi éveiben jellemző, 10 és 30 gwei-es gázárral számolnak ugyanarra a
gázfelhasználásra (a napi átlagos gázár alakulása: Etherscan gázár-grafikon); a mai árfolyammal szorozva
ezek forgatókönyvek, nem korabeli tényleges költségek. A szerver a \`CHAIN_MAX_FEE_GWEI\` plafon (alapértéke
${SERVER_FEE_CEILING_GWEI} gwei) fölött nem küldi el a tranzakciót, hanem később újrapróbálja, ezért egy regisztráció díja
legfeljebb ${ethOf(SERVER_FEE_CEILING_GWEI * GWEI * gas)} ETH (${hufOf(SERVER_FEE_CEILING_GWEI * GWEI * gas, price)} Ft a mai árfolyamon).${
    mainnet
      ? ` A szerződés egyszeri telepítése a főhálózaton az
aktuális áron ${ethOf(deploymentWei)} ETH (${hufOf(deploymentWei, price)} Ft) volna.`
      : ''
  }

## Fenntartások

- Egyetlen pillanatkép: a gázár és az árfolyam óráról órára változik; a tartomány-oszlop a legutóbbi
  ${FEE_HISTORY_BLOCKS} blokk szórását mutatja.
- Az L2-díj a végrehajtás díja + az L1-adatdíj (+ az esetleges operátordíj); a sorrendet és az
  időbélyeget az L2-n a sequencer adja, ami más bizalmi modell, mint a főhálózaté.
- A szerződés nincs L2-re telepítve: a becslés az EVM-egyenértékűségre épít, a gázfelhasználást a
  főhálózatéval azonosnak veszi.
- A díjat a platform fizeti (nem a felhasználó); a Sepolia teszthálózaton ingyenes.
- A gázütemezés hálózatfrissítéssel változhat; a telepítési költség egyszeri.
`;
}

async function main(): Promise<void> {
  const stamp = new Date().toISOString();
  console.log('A regisztráció költségének becslése:');
  const stats = await databaseGasStats();
  if (stats) {
    console.log(
      `  Adatbázis: ${stats.count} láncon regisztrált kép` +
        (stats.count > 0
          ? `, gáz ${gasOf(stats.average)}${stats.count > 1 ? ` (min ${gasOf(stats.min)}, max ${gasOf(stats.max)})` : ''}`
          : ''),
    );
  }
  const gas = stats && stats.count > 0 ? stats.average : MEASURED_GAS.sepolia;
  const gasSource =
    stats && stats.count > 1
      ? `az adatbázis ${stats.count} regisztrált képének átlaga`
      : 'a Sepolia-mérés (L11)';
  console.log(`  Számított gázfelhasználás: ${gasOf(gas)} (${gasSource})`);

  const price = await ethPrice();
  console.log(`  ETH-árfolyam: ${hu(price.usd, {})} USD, ${hu(price.huf, {})} HUF`);
  const quotes: FeeQuote[] = [];
  const unavailable: string[] = [];
  for (const network of NETWORKS) {
    try {
      const quote = await quoteNetwork(network, gas);
      quotes.push(quote);
      console.log(
        `  ${quote.network}: ${gweiOf(quote.currentWei)} gwei (${gweiOf(quote.p10Wei)}–${gweiOf(quote.p90Wei)}) → ${ethOf(quote.totalWei)} ETH (${hufOf(quote.totalWei, price)} Ft)`,
      );
    } catch (error) {
      unavailable.push(network.name);
      const reason = (error as Error).message.split('\n')[0];
      console.warn(`  ${network.name}: a lekérdezés nem sikerült (${reason})`);
    }
  }
  if (quotes.length === 0) throw new Error('Egyetlen hálózat gázára sem érhető el');

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const markdown = report({ stamp, gas, gasSource, stats, price, quotes, unavailable });
  writeFileSync(`${OUTPUT_DIR}gas-cost.md`, markdown);
  writeFileSync(`${OUTPUT_DIR}gas-cost.html`, renderReportHtml(markdown));
  writeFileSync(
    `${OUTPUT_DIR}gas-cost.csv`,
    csvFile(
      [
        'measured_at',
        'network',
        'gas',
        'gas_price_gwei',
        'gas_price_p10_gwei',
        'gas_price_p50_gwei',
        'gas_price_p90_gwei',
        'max_fee_gwei',
        'l1_fee_eth',
        'operator_fee_eth',
        'total_eth',
        'total_p90_eth',
        'eth_usd',
        'eth_huf',
        'total_usd',
        'total_huf',
      ],
      quotes.map((quote) => [
        stamp,
        quote.network,
        gas,
        formatUnits(quote.currentWei, 'gwei'),
        formatUnits(quote.p10Wei, 'gwei'),
        formatUnits(quote.p50Wei, 'gwei'),
        formatUnits(quote.p90Wei, 'gwei'),
        quote.maxFeeWei === null ? '' : formatUnits(quote.maxFeeWei, 'gwei'),
        formatEther(quote.l1FeeWei),
        formatEther(quote.operatorFeeWei),
        formatEther(quote.totalWei),
        formatEther(quote.totalP90Wei),
        price.usd,
        price.huf,
        (Number(formatEther(quote.totalWei)) * price.usd).toFixed(6),
        (Number(formatEther(quote.totalWei)) * price.huf).toFixed(4),
      ]),
    ),
  );
  console.log(`  Kész: ${OUTPUT_DIR}gas-cost.md, gas-cost.html, gas-cost.csv`);
}

await main();
