// A PhotoRegistry okosszerződés elérése a szerverről (ethers v6, terv: 4.1, D5): ingyenes
// lekérdezések (isRegistered, getRecord) és a regisztrációs tranzakciók küldése a platform-tárcából.
// A tranzakciók egy sorban, egyenként mennek ki: a következőt csak az előző blokkba kerülése (vagy
// hibája) után írja alá a szolgáltatás, így két tranzakció nem kaphatja ugyanazt a nonce-ot. Minden
// lánchibát saját ChainError-rá alakít, az eredeti hibaüzenet nélkül: az ethers üzenete az RPC-URL-t
// (benne az Alchemy API-kulcsát) is tartalmazhatja, és ez nem kerülhet naplóba.
// Forrás: ethers.js v6 dokumentáció – JsonRpcProvider, FetchRequest, Wallet, Contract, Interface,
// https://docs.ethers.org/v6/ (adaptálva)
import { setTimeout as sleep } from 'node:timers/promises';

import {
  type BigNumberish,
  Contract,
  FetchRequest,
  formatUnits,
  getAddress,
  getBigInt,
  Interface,
  type InterfaceAbi,
  JsonRpcProvider,
  keccak256,
  parseUnits,
  toUtf8Bytes,
  type TransactionReceipt,
  Wallet,
} from 'ethers';
import PQueue from 'p-queue';

import photoRegistry from '../contracts/PhotoRegistry.json' with { type: 'json' };

/** Egy RPC-kérés felső időkorlátja (az ethers alapértéke 5 perc volna). */
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** A feltöltéskori ingyenes lekérdezés felső korlátja: a feltöltés ennél tovább nem vár a láncra. */
const DEFAULT_READ_TIMEOUT_MS = 5_000;
/** Ennyi ideig várunk, hogy a tranzakció blokkba kerüljön (a Sepolián kb. 12 s-onként jön blokk). */
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 180_000;
/** A tranzakció állapotának lekérdezési gyakorisága (az ethers alapértéke). */
const DEFAULT_POLLING_INTERVAL_MS = 4_000;
/** A díj plafonja gázegységenként (a CHAIN_MAX_FEE_GWEI alapértéke) */
const DEFAULT_MAX_FEE_PER_GAS_WEI = parseUnits('50', 'gwei');
/**
 * Ez alatt a tárca egyenlege „alacsony” (L30): kb. egy tucat regisztrációra elég a díjplafon mellett
 * (≈ 72 000 gáz × 50 gwei ≈ 0,0036 ETH darabonként) – ideje feltölteni, mielőtt a regisztrációk
 * elakadnak.
 */
export const LOW_BALANCE_WEI = parseUnits('0.05', 'ether');
const MS_PER_SECOND = 1_000;
/** A szerződés hibájának neve csak azonosító lehet (pl. AlreadyRegistered) – más szöveg nem */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DHASH_PATTERN = /^[0-9a-f]{16}$/;
/** bytes32 érték (ownerRef, tranzakció-hash): 0x + 64 kisbetűs hexadecimális karakter */
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const REGISTRY_INTERFACE = new Interface(photoRegistry.abi as InterfaceAbi);

/** A lánchibák fajtái – a naplóban és az állapotkezelésben (CHAIN_FAILED) ezek szerepelnek. */
export type ChainErrorKind =
  | 'ALREADY_REGISTERED'
  | 'REVERTED'
  | 'INSUFFICIENT_FUNDS'
  | 'FEE_TOO_HIGH'
  | 'NONCE_CONFLICT'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

/** Ezeknél a hibáknál biztos, hogy a tranzakció nem került (és nem is kerül) a láncra. */
const DEFINITE_REJECTIONS: ReadonlySet<ChainErrorKind> = new Set([
  'ALREADY_REGISTERED',
  'REVERTED',
  'INSUFFICIENT_FUNDS',
  'FEE_TOO_HIGH',
  'NONCE_CONFLICT',
]);

/**
 * A tranzakció biztosan nem került a láncra (a csomópont vagy a szerződés visszautasította): a
 * hash-ét nem érdemes megőrizni. Időtúllépésnél, elérhetetlen csomópontnál ez nem dönthető el.
 */
export const isDefiniteRejection = (error: ChainError): boolean =>
  DEFINITE_REJECTIONS.has(error.kind);

/** A blokklánc hibája. Az üzenete saját, magyar szöveg: titkot (RPC-URL, kulcs) nem tartalmaz. */
export class ChainError extends Error {
  readonly kind: ChainErrorKind;

  constructor(kind: ChainErrorKind, message: string) {
    super(message);
    this.name = 'ChainError';
    this.kind = kind;
  }
}

/** Hibás lánc-beállítás (privát kulcs, szerződéscím, hálózat) – a szerver ilyenkor el sem indul. */
export class ChainConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainConfigError';
  }
}

export interface RegisterPhotoInput {
  /** A képfájl SHA-256 hash-e (64 kisbetűs hexa) – a szerződésben bytes32 */
  sha256: string;
  /** A kép dHash-e (16 kisbetűs hexa) – a szerződésben bytes8 */
  dHash: string;
  /** A feltöltő álnevesített azonosítója (ownerRefOf) */
  ownerRef: string;
}

export interface RegisterPhotoOptions {
  /**
   * A tranzakció hash-ét kapja meg az aláírás után, de még a küldés ELŐTT – ekkor kell elmenteni.
   * Ha hibát dob, a tranzakció nem megy ki.
   */
  beforeBroadcast(txHash: string): Promise<void>;
}

/** A blokkba került regisztrációs tranzakció adatai. */
export interface ChainRegistration {
  txHash: string;
  blockNumber: number;
  gasUsed: bigint;
  /** A blokk időbélyege (a PhotoRegistered eseményből) */
  registeredAt: Date;
}

/** Egy regisztrált kép rekordja a láncon. */
export interface ChainRecord {
  ownerRef: string;
  dHash: string;
  registeredAt: Date;
}

/** A lánc-kapcsolat ellenőrzésének eredménye (a szerver induláskor naplózza). */
export interface ChainConnectionStatus {
  /** Az RPC-csomópont szerinti hálózat */
  chainId: number;
  /** A beállított hálózat (CHAIN_ID) */
  expectedChainId: number;
  walletAddress: string;
  contractAddress: string;
  hasContractCode: boolean;
  isContractOwner: boolean;
  balanceWei: bigint;
}

export interface BlockchainService {
  /** Regisztrálva van-e már a hash (ingyenes olvasás, rövid időkorláttal). */
  isRegistered(sha256: string): Promise<boolean>;
  /** A hash rekordja a láncon; nem regisztrált hash-re null. */
  getRecord(sha256: string): Promise<ChainRecord | null>;
  /** Regisztrációs tranzakció küldése, és várakozás, amíg blokkba kerül (a tranzakció-sorban). */
  registerPhoto(
    input: RegisterPhotoInput,
    options: RegisterPhotoOptions,
  ): Promise<ChainRegistration>;
  /**
   * Egy korábban elküldött tranzakció lezárása (pl. újraindítás után). Ha a csomópont nem ismeri
   * (el sem jutott hozzá, vagy kiesett a várakozók közül), null.
   */
  waitForRegistration(txHash: string, sha256: string): Promise<ChainRegistration | null>;
  /** A hálózat, a szerződés, a tulajdonos és az egyenleg ellenőrzése. */
  checkConnection(): Promise<ChainConnectionStatus>;
}

export interface BlockchainServiceConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  privateKey: string;
  requestTimeoutMs?: number;
  readTimeoutMs?: number;
  confirmationTimeoutMs?: number;
  pollingIntervalMs?: number;
  /** Ha a hálózat ennél többet kér gázegységenként, a tranzakció nem megy ki (FEE_TOO_HIGH) */
  maxFeePerGasWei?: bigint;
}

/**
 * Álnevesített tulajdonos-azonosító a láncra: keccak256(felhasználói azonosító). A láncra így se
 * név, se e-mail-cím nem kerül (terv 4.1, D6 – a blokklánc tartalma nem törölhető).
 */
export function ownerRefOf(userId: string): string {
  return keccak256(toUtf8Bytes(userId));
}

/**
 * A PhotoRegistry címe a megadott hálózaton – a blockchain/ alprojekt exportjából
 * (server/src/contracts/PhotoRegistry.json, L05).
 */
export function resolveContractAddress(
  chainId: number,
  networks: Record<string, { address: string }> = photoRegistry.networks,
): string {
  const address = networks[String(chainId)]?.address;
  if (address === undefined) {
    throw new ChainConfigError(
      `A PhotoRegistry nincs telepítve a(z) ${chainId} azonosítójú hálózaton (CHAIN_ID) – ` +
        'telepítsd, majd futtasd: cd blockchain && npm run export-abi',
    );
  }
  if (!ADDRESS_PATTERN.test(address)) {
    throw new ChainConfigError(`Hibás PhotoRegistry-cím a(z) ${chainId} hálózaton`);
  }
  return address;
}

/** Az ethers- és Node-hibák mezői, amelyekből a hiba fajtája megállapítható. */
interface ErrorFields {
  code?: unknown;
  data?: unknown;
  revert?: { name?: unknown } | null;
  error?: { message?: unknown } | null;
  info?: { responseStatus?: unknown } | null;
}

/** A csomópont „nincs elég pénz” üzenetei (geth: insufficient funds; Hardhat: enough funds). */
const INSUFFICIENT_FUNDS_MESSAGE = /insufficient funds|enough funds/i;
const TIMEOUT_CODES = new Set(['TIMEOUT', 'ETIMEDOUT']);
/** A nonce már foglalt: elhasználta egy korábbi tranzakció, vagy ugyanazzal vár egy másik */
const NONCE_CONFLICT_CODES = new Set(['NONCE_EXPIRED', 'REPLACEMENT_UNDERPRICED']);
const UNAVAILABLE_CODES = new Set([
  'NETWORK_ERROR',
  'SERVER_ERROR',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);
/** Az ethers és a Node hibakódjai (pl. NONCE_EXPIRED) – csak ilyen alakú kód kerülhet az üzenetbe. */
const ERROR_CODE_PATTERN = /^[A-Z][A-Z_]{1,40}$/;

function fieldsOf(error: unknown): ErrorFields {
  return typeof error === 'object' && error !== null ? (error as ErrorFields) : {};
}

function decodedRevertName({ data, revert }: ErrorFields): unknown {
  if (revert?.name !== undefined) return revert.name;
  if (typeof data !== 'string') return undefined;
  try {
    return REGISTRY_INTERFACE.parseError(data)?.name;
  } catch {
    return undefined;
  }
}

/** A szerződés visszautasításának oka (a szerződés saját hibái közül), ha kiolvasható. */
function revertName(fields: ErrorFields): string | undefined {
  const name = decodedRevertName(fields);
  return typeof name === 'string' && IDENTIFIER_PATTERN.test(name) ? name : undefined;
}

/** A HTTP-válasz állapotkódja (pl. 401 – rossz API-kulcs), ha a hiba HTTP-hiba volt. */
function httpStatus({ info }: ErrorFields): string | undefined {
  const status = info?.responseStatus;
  return typeof status === 'string' ? /^\d{3}/.exec(status)?.[0] : undefined;
}

/**
 * A lánc bármilyen hibájából ChainError lesz. Az eredeti hibából csak a fajtája (kód, a szerződés
 * hibájának neve, HTTP-állapot) kerül át – az üzenete nem, és okként (cause) sem csatoljuk.
 */
export function toChainError(error: unknown): ChainError {
  if (error instanceof ChainError) return error;
  const fields = fieldsOf(error);
  const code = typeof fields.code === 'string' ? fields.code : '';
  if (code === 'CALL_EXCEPTION') {
    const name = revertName(fields);
    if (name === 'AlreadyRegistered') {
      return new ChainError(
        'ALREADY_REGISTERED',
        'A kép tartalom-hash-e már regisztrálva van a láncon',
      );
    }
    return new ChainError(
      'REVERTED',
      `A szerződés visszautasította a tranzakciót${name ? ` (${name})` : ''}`,
    );
  }
  const nodeMessage = typeof fields.error?.message === 'string' ? fields.error.message : '';
  if (code === 'INSUFFICIENT_FUNDS' || INSUFFICIENT_FUNDS_MESSAGE.test(nodeMessage)) {
    return new ChainError(
      'INSUFFICIENT_FUNDS',
      'A platform-tárcán nincs elég (teszt-)ETH a tranzakció díjára',
    );
  }
  if (TIMEOUT_CODES.has(code)) {
    return new ChainError('TIMEOUT', 'Időtúllépés: a blokklánc-csomópont nem válaszolt időben');
  }
  if (NONCE_CONFLICT_CODES.has(code)) {
    return new ChainError(
      'NONCE_CONFLICT',
      `A tranzakció nonce-a már foglalt (${code}) – a regisztráció újrapróbálható`,
    );
  }
  if (UNAVAILABLE_CODES.has(code)) {
    const status = httpStatus(fields);
    return new ChainError(
      'UNAVAILABLE',
      `A blokklánc-csomópont (RPC) nem érhető el (${status ? `HTTP ${status}` : code})`,
    );
  }
  const shownCode = ERROR_CODE_PATTERN.test(code) ? ` (${code})` : '';
  return new ChainError('UNKNOWN', `Váratlan blokklánc-hiba${shownCode}`);
}

/** A lánc-kapcsolat beállítási hibái, emberi nyelven (üres lista: minden rendben). */
export function connectionProblems(status: ChainConnectionStatus): string[] {
  const checks: [boolean, string][] = [
    [
      status.chainId !== status.expectedChainId,
      `Az RPC_URL más hálózatra mutat (chainId ${status.chainId}), mint a CHAIN_ID ` +
        `(${status.expectedChainId})`,
    ],
    [
      !status.hasContractCode,
      `A(z) ${status.contractAddress} címen nincs szerződés – telepítsd, majd futtasd az ABI-exportot`,
    ],
    [
      status.hasContractCode && !status.isContractOwner,
      `A platform-tárca (${status.walletAddress}) nem tulajdonosa a szerződésnek – ` +
        'a regisztrációkat a szerződés vissza fogja utasítani',
    ],
    [
      status.balanceWei === 0n,
      `A platform-tárcán (${status.walletAddress}) nincs ETH – a tranzakciók díját nem tudja kifizetni`,
    ],
  ];
  return checks.filter(([failed]) => failed).map(([, message]) => message);
}

/**
 * Figyelmeztetés, ha a tárca egyenlege alacsony, de nem üres (az üres tárca beállítási hiba – lásd
 * connectionProblems). Nem hiba: a faucetből töltött teszttárca gyakran kevesebbet tart, csak
 * teendő (L30).
 */
export function lowBalanceWarning(status: ChainConnectionStatus): string | null {
  if (status.balanceWei === 0n || status.balanceWei >= LOW_BALANCE_WEI) return null;
  return (
    `A platform-tárca (${status.walletAddress}) egyenlege alacsony ` +
    `(${formatUnits(status.balanceWei, 'ether')} ETH) – töltsd fel, mielőtt a regisztrációk elakadnak`
  );
}

function checkedHex(value: string, pattern: RegExp, description: string): string {
  if (!pattern.test(value)) throw new TypeError(`Érvénytelen ${description}`);
  return value;
}

/** A SHA-256 hash a szerződés bytes32 paramétereként. */
const contentHashOf = (sha256: string): string =>
  `0x${checkedHex(sha256, SHA256_PATTERN, 'SHA-256 hash (64 kisbetűs hexa kell)')}`;

function checkedAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    throw new ChainConfigError('Hibás PhotoRegistry-szerződéscím');
  }
}

function createWallet(privateKey: string, provider: JsonRpcProvider): Wallet {
  try {
    return new Wallet(privateKey, provider);
  } catch {
    // Az eredeti hibaüzenet a kulcsot is tartalmazhatja: nem adjuk tovább
    throw new ChainConfigError('A PLATFORM_PRIVATE_KEY nem érvényes privát kulcs');
  }
}

/** A művelet hibáját ChainError-rá alakítja. */
async function chainCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toChainError(error);
  }
}

/** A szerződés PhotoRecord struktúrája, ahogy az ethers az ABI szerint dekódolja. */
type PhotoRecordResult = [ownerRef: string, perceptualHash: string, registeredAt: bigint];

/** A getRecord válasza ChainRecord-ként; a nem regisztrált hash-re null. */
function toChainRecord([
  ownerRef,
  perceptualHash,
  registeredAt,
]: PhotoRecordResult): ChainRecord | null {
  // A szerződés a nem regisztrált hash-re csupa nulla rekordot ad
  if (registeredAt === 0n) return null;
  return {
    ownerRef: ownerRef.toLowerCase(),
    dHash: perceptualHash.slice(2).toLowerCase(),
    registeredAt: new Date(Number(registeredAt) * MS_PER_SECOND),
  };
}

export function createBlockchainService(config: BlockchainServiceConfig): BlockchainService {
  const {
    rpcUrl,
    chainId,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
    confirmationTimeoutMs = DEFAULT_CONFIRMATION_TIMEOUT_MS,
    pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS,
    maxFeePerGasWei = DEFAULT_MAX_FEE_PER_GAS_WEI,
  } = config;
  const contractAddress = checkedAddress(config.contractAddress);
  const request = new FetchRequest(rpcUrl);
  request.timeout = requestTimeoutMs;
  // staticNetwork: a hálózatot nem kérdezi le induláskor (ha az RPC nem érhető el, nincs a konzolra
  // író, újrapróbálkozó háttérciklus); cacheTimeout: -1: nincs gyorsítótár – különben a gyorsan
  // egymás után kért nonce elavult lehet (nonce-ütközés); batchMaxCount: 1: kérésenként egy hívás
  const provider = new JsonRpcProvider(request, chainId, {
    staticNetwork: true,
    cacheTimeout: -1,
    batchMaxCount: 1,
  });
  const wallet = createWallet(config.privateKey, provider);
  const registry = new Contract(contractAddress, REGISTRY_INTERFACE, wallet);
  // Egyszerre egy tranzakció a platform-tárcából (a következő nonce-ot az előző után kérjük le)
  const transactions = new PQueue({ concurrency: 1 });

  /** A feltöltéskori olvasás felső időkorláttal: a feltöltés ennél tovább nem várhat a láncra. */
  async function withReadTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new ChainError(
            'TIMEOUT',
            `Időtúllépés: a blokklánc-csomópont ${readTimeoutMs} ms alatt nem válaszolt`,
          ),
        );
      }, readTimeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Megvárja, amíg a tranzakció blokkba kerül (egy megerősítés – terv L11: wait(1)): a nyugtáját
   * kérdezi le pollingIntervalMs-enként, az időkorlátig; az átmeneti RPC-hiba nem szakítja meg.
   * Szándékosan nem az ethers TransactionResponse.wait() függvénye: annak háttér-lekérdezése egy
   * átmeneti RPC-hibánál kezeletlen ígéret-elutasítást okozhat, amitől a szerver leállna.
   */
  async function waitForReceipt(txHash: string): Promise<TransactionReceipt> {
    const deadline = Date.now() + confirmationTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt !== null) return receipt;
        lastError = undefined;
      } catch (error) {
        lastError = error;
      }
      await sleep(pollingIntervalMs);
    }
    // Ha a csomópont a végén sem volt elérhető, az a pontosabb ok
    if (lastError !== undefined) throw toChainError(lastError);
    throw new ChainError(
      'TIMEOUT',
      `A tranzakció ${confirmationTimeoutMs / MS_PER_SECOND} s alatt nem került blokkba ` +
        '(később még bekerülhet)',
    );
  }

  /** A nyugtából a regisztráció adatai – csak ha ennek a képnek a PhotoRegistered eseménye van benne. */
  function toRegistration(receipt: TransactionReceipt, sha256: string): ChainRegistration {
    if (receipt.status !== 1) {
      throw new ChainError(
        'REVERTED',
        'A tranzakció blokkba került, de a szerződés visszautasította',
      );
    }
    const event = receipt.logs
      .filter((log) => log.address.toLowerCase() === contractAddress.toLowerCase())
      .map((log) => REGISTRY_INTERFACE.parseLog(log))
      .find((parsed) => parsed?.name === 'PhotoRegistered');
    const eventContentHash: unknown = event?.args.getValue('contentHash');
    const eventRegisteredAt: unknown = event?.args.getValue('registeredAt');
    if (eventContentHash !== `0x${sha256}` || typeof eventRegisteredAt !== 'bigint') {
      throw new ChainError(
        'UNKNOWN',
        'A tranzakció nyugtájában nincs a képhez tartozó PhotoRegistered esemény',
      );
    }
    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      registeredAt: new Date(Number(eventRegisteredAt) * MS_PER_SECOND),
    };
  }

  /** Díjugráskor nem küldünk: a hálózat díja (gázegységenként) nem haladhatja meg a plafont. */
  function assertFeeBelowCeiling(fee: BigNumberish | null | undefined): void {
    if (fee === null || fee === undefined || getBigInt(fee) <= maxFeePerGasWei) return;
    throw new ChainError(
      'FEE_TOO_HIGH',
      `A hálózat díja (${formatUnits(fee, 'gwei')} gwei) a plafon ` +
        `(${formatUnits(maxFeePerGasWei, 'gwei')} gwei, CHAIN_MAX_FEE_GWEI) fölött van – ` +
        'a regisztráció később újrapróbálható',
    );
  }

  /** Az aláírt regisztrációs tranzakció (szerializálva). */
  async function signRegistration(args: [string, string, string]): Promise<string> {
    return chainCall(async () => {
      const unsigned = await registry.getFunction('registerPhoto').populateTransaction(...args);
      // A nonce-ot, a gázkeretet és a díjat a csomópont adja. A gázbecslés a szerződést próbaképp
      // lefuttatja: a visszautasítandó tranzakció (pl. AlreadyRegistered) így ki sem megy, díjat sem
      // fizetünk érte.
      const populated = await wallet.populateTransaction(unsigned);
      assertFeeBelowCeiling(populated.maxFeePerGas ?? populated.gasPrice);
      return wallet.signTransaction(populated);
    });
  }

  /**
   * A tranzakció elküldése. Ha a hibából nem dönthető el, hogy a csomópont megkapta-e (pl. csak a
   * válasza veszett el), úgy vesszük, mintha megkapta volna: a hívó a nyugtára vár, és a sor addig
   * nem enged új tranzakciót – az ugyanazt a nonce-ot kaphatná. Ilyenkor a küldés hibáját adja
   * vissza (ha a tranzakció mégsem jelenik meg, ez a valódi ok).
   */
  async function broadcast(signed: string): Promise<ChainError | null> {
    try {
      await provider.broadcastTransaction(signed);
      return null;
    } catch (error) {
      const chainError = toChainError(error);
      if (isDefiniteRejection(chainError)) throw chainError;
      return chainError;
    }
  }

  /** A küldés után a nyugta; ha a bizonytalan küldés után sem jelent meg, a küldés hibája az ok. */
  async function receiptAfterBroadcast(
    txHash: string,
    broadcastError: ChainError | null,
  ): Promise<TransactionReceipt> {
    try {
      return await waitForReceipt(txHash);
    } catch (error) {
      if (broadcastError === null || !(error instanceof ChainError) || error.kind !== 'TIMEOUT') {
        throw error;
      }
      throw new ChainError(
        broadcastError.kind,
        `${broadcastError.message} – a tranzakció ${confirmationTimeoutMs / MS_PER_SECOND} s alatt ` +
          'sem jelent meg a láncon',
      );
    }
  }

  async function sendRegistration(
    args: [string, string, string],
    sha256: string,
    beforeBroadcast: (txHash: string) => Promise<void>,
  ): Promise<ChainRegistration> {
    const signed = await signRegistration(args);
    // A tranzakció hash-e az aláírt, szerializált tranzakció keccak256-hash-e – már küldés előtt
    // ismert. Az adatbázisba a küldés ELŐTT kerül: ha a szerver a küldés után leállna, újraindításkor
    // ebből tudja, hogy van elküldött tranzakció (és nem küld másodikat). Ha a mentés nem sikerül, a
    // tranzakció ki sem megy.
    const txHash = keccak256(signed);
    await beforeBroadcast(txHash);
    const broadcastError = await broadcast(signed);
    return chainCall(async () =>
      toRegistration(await receiptAfterBroadcast(txHash, broadcastError), sha256),
    );
  }

  async function waitForExisting(
    txHash: string,
    sha256: string,
  ): Promise<ChainRegistration | null> {
    return chainCall(async () => {
      const mined = await provider.getTransactionReceipt(txHash);
      if (mined !== null) return toRegistration(mined, sha256);
      // A csomópont nem ismeri: el sem jutott hozzá, vagy kiesett a várakozók közül
      if ((await provider.getTransaction(txHash)) === null) return null;
      return toRegistration(await waitForReceipt(txHash), sha256);
    });
  }

  return {
    // A válaszok típusát (bool; bytes32, bytes8 → hexa szöveg; uint64 → bigint) az ethers az ABI
    // szerint dekódolva adja – ha a címen nem ez a szerződés van, már a dekódolás hibát dob
    async isRegistered(sha256) {
      const contentHash = contentHashOf(sha256);
      return (await chainCall(() =>
        withReadTimeout(registry.getFunction('isRegistered').staticCall(contentHash)),
      )) as boolean;
    },

    async getRecord(sha256) {
      const contentHash = contentHashOf(sha256);
      const record = (await chainCall(() =>
        withReadTimeout(registry.getFunction('getRecord').staticCall(contentHash)),
      )) as PhotoRecordResult;
      return toChainRecord(record);
    },

    async registerPhoto({ sha256, dHash, ownerRef }, { beforeBroadcast }) {
      const args: [string, string, string] = [
        contentHashOf(sha256),
        `0x${checkedHex(dHash, DHASH_PATTERN, 'dHash (16 kisbetűs hexa kell)')}`,
        checkedHex(ownerRef, BYTES32_PATTERN, 'ownerRef (0x + 64 kisbetűs hexa kell)'),
      ];
      return transactions.add(() => sendRegistration(args, sha256, beforeBroadcast));
    },

    async waitForRegistration(txHash, sha256) {
      const hash = checkedHex(txHash, BYTES32_PATTERN, 'tranzakció-hash');
      contentHashOf(sha256);
      // Ez is a sorban vár: az előző tranzakció lezárultáig új nem megy ki
      return transactions.add(() => waitForExisting(hash, sha256));
    },

    async checkConnection() {
      return chainCall(async () => {
        const [networkChainId, code, balanceWei] = await Promise.all([
          provider.send('eth_chainId', []) as Promise<unknown>,
          provider.getCode(contractAddress),
          provider.getBalance(wallet.address),
        ]);
        const hasContractCode = code !== '0x';
        const owner: unknown = hasContractCode
          ? await registry.getFunction('owner').staticCall()
          : null;
        return {
          chainId: Number(networkChainId),
          expectedChainId: chainId,
          walletAddress: wallet.address,
          contractAddress,
          hasContractCode,
          isContractOwner:
            typeof owner === 'string' && owner.toLowerCase() === wallet.address.toLowerCase(),
          balanceWei,
        };
      });
    },
  };
}
