// Az E2E-környezet felépítése a tesztek előtt és lebontása utánuk (Playwright globalSetup, L28):
// 1. a szerver és a kliens lefordítása (a tesztek a produkciós buildet használják);
// 2. lokális Hardhat-lánc indítása (8545) és a PhotoRegistry telepítése rá – a lánc minden futásban
//    friss, ezért az Ignition helyi naplója előbb törlődik; a telepített cím egyezik a szerverével;
// 3. a tesztadatbázis migrálása, kiürítése és seedelése (kategóriák, adminfiók eldobható jelszóval);
// 4. a lefordított szerver indítása a tesztadatbázison, a lokális lánccal, eldobható JWT- és
//    webhook-titokkal (a Stripe-tesztkulcs a szerver saját .env-jéből jön – ha nincs, vagy a Stripe
//    nem fogadja el, a fizetés forgatókönyve kimarad); 5. a kliens kiszolgálása (vite preview, a /api
//    proxyval).
// A portok szabadságát közvetlenül az indítás előtt is ellenőrizzük, és a készenlét-várakozás
// hibával zárul, ha a saját folyamat időközben kilépett – így a tesztek nem futhatnak egy idegen
// (pl. fejlesztői) szerver ellen. A tesztek a process.env-ből kapják, amit tudniuk kell
// (webhook-titok, az admin belépése) – ezek csak ebben a futásban érvényesek, a naplóba nem kerülnek.
// Forrás: Playwright – Global setup and teardown,
// https://playwright.dev/docs/test-global-setup-teardown; Hardhat 3 – `hardhat node`, Ignition
// deploy, https://hardhat.org/docs (adaptálva)
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { FullConfig } from '@playwright/test';
import { HDNodeWallet } from 'ethers';

import {
  BLOCKCHAIN_DIR,
  CHAIN_PORT,
  CHAIN_URL,
  CLIENT_DIR,
  CLIENT_PORT,
  CLIENT_URL,
  E2E_DIR,
  ENV_KEYS,
  readServerEnv,
  SERVER_DIR,
  SERVER_PORT,
  SERVER_URL,
} from './env';
import { isPortFree, runStep, startProcess, stopAll, waitForHttp } from './processes';
import { checkStripeKey, STRIPE_SKIP_REASONS } from './stripeKey';

/** A Hardhat beépített, nyilvános teszt-mnemonicja: a 0. fiók a platform kulcsa a lokális láncon. */
const HARDHAT_TEST_MNEMONIC = 'test test test test test test test test test test test junk';
const HARDHAT_FIRST_ACCOUNT_PATH = "m/44'/60'/0'/0/0";
const LOCAL_CHAIN_ID = '31337';
const STARTUP_TIMEOUT_MS = 120_000;
/** Hamis Stripe-kulcs, ha a szerver .env-jében nincs elfogadott tesztkulcs (a fizetés forgatókönyve kimarad) */
const STRIPE_PLACEHOLDER_KEY = 'sk_test_hamis_e2e_kulcs_nincs_stripe';

const node = process.execPath;
const tool = (dir: string, ...segments: string[]) => join(dir, 'node_modules', ...segments);
const ignitionDeployments = join(
  BLOCKCHAIN_DIR,
  'ignition',
  'deployments',
  `chain-${LOCAL_CHAIN_ID}`,
);

async function assertPortsFree(): Promise<void> {
  for (const [name, port] of [
    ['Hardhat-lánc', CHAIN_PORT],
    ['szerver', SERVER_PORT],
    ['kliens (vite preview)', CLIENT_PORT],
  ] as const) {
    if (!(await isPortFree(port))) {
      throw new Error(
        `A ${port}-es port foglalt (${name}): állítsd le a rajta futó folyamatot az E2E-tesztek előtt`,
      );
    }
  }
}

function build(): void {
  runStep(
    'A szerver fordítása',
    node,
    [tool(SERVER_DIR, 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.build.json'],
    { cwd: SERVER_DIR },
  );
  runStep('A kliens típusellenőrzése', node, [tool(CLIENT_DIR, 'typescript', 'bin', 'tsc'), '-b'], {
    cwd: CLIENT_DIR,
  });
  runStep('A kliens fordítása', node, [tool(CLIENT_DIR, 'vite', 'bin', 'vite.js'), 'build'], {
    cwd: CLIENT_DIR,
  });
}

/** A szerver a lokális láncon ezt a címet hívja (server/src/contracts/PhotoRegistry.json, L05). */
function expectedContractAddress(): string {
  const contract = JSON.parse(
    readFileSync(join(SERVER_DIR, 'src', 'contracts', 'PhotoRegistry.json'), 'utf8'),
  ) as { networks: Record<string, { address: string }> };
  const address = contract.networks[LOCAL_CHAIN_ID]?.address;
  if (!address)
    throw new Error(`A PhotoRegistry.json nem ad címet a(z) ${LOCAL_CHAIN_ID} hálózathoz`);
  return address;
}

/** Az Ignition által most telepített cím (a lokális telepítés determinisztikus: 0. fiók, 0. nonce). */
function deployedContractAddress(): string {
  const deployed = JSON.parse(
    readFileSync(join(ignitionDeployments, 'deployed_addresses.json'), 'utf8'),
  ) as Record<string, string>;
  const address = Object.entries(deployed).find(([key]) => key.endsWith('#PhotoRegistry'))?.[1];
  if (!address) throw new Error('Az Ignition telepítési naplójában nincs PhotoRegistry-cím');
  return address;
}

async function startChain() {
  // Friss lánc: a korábbi lokális telepítés naplója félrevezetné az Ignitiont
  rmSync(ignitionDeployments, { recursive: true, force: true });
  const chain = startProcess(
    'A Hardhat-lánc',
    node,
    [tool(BLOCKCHAIN_DIR, 'hardhat', 'dist', 'src', 'cli.js'), 'node'],
    { cwd: BLOCKCHAIN_DIR, logName: 'hardhat-node.log' },
  );
  await waitForHttp(chain.label, CHAIN_URL, {
    timeoutMs: STARTUP_TIMEOUT_MS,
    accept: (response) => response.ok,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    },
    process: chain,
  });
  runStep(
    'A PhotoRegistry telepítése a lokális láncra',
    node,
    [
      tool(BLOCKCHAIN_DIR, 'hardhat', 'dist', 'src', 'cli.js'),
      'ignition',
      'deploy',
      'ignition/modules/PhotoRegistry.ts',
      '--network',
      'localhost',
    ],
    { cwd: BLOCKCHAIN_DIR },
  );
  const expected = expectedContractAddress();
  const deployed = deployedContractAddress();
  if (deployed.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `A lokális láncra telepített PhotoRegistry címe (${deployed}) nem egyezik a szerverével (${expected}): a szerver nem ezt a szerződést hívná`,
    );
  }
}

interface SeedAccounts {
  admin: { email: string; password: string };
  demoPassword: string;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function prepareDatabase(databaseUrl: string, { admin, demoPassword }: SeedAccounts): void {
  const prisma = tool(SERVER_DIR, 'prisma', 'build', 'index.js');
  const { password } = new URL(databaseUrl);
  // A hibaüzenetekből az adatbázis jelszava és a seed jelszavai is kimaradnak
  const mask = [password, safeDecode(password), admin.password, demoPassword];
  const env = { DATABASE_URL: databaseUrl };
  runStep('A tesztadatbázis migrációja', node, [prisma, 'migrate', 'deploy'], {
    cwd: SERVER_DIR,
    env,
    mask,
  });
  runStep(
    'A tesztadatbázis kiürítése',
    node,
    [tool(SERVER_DIR, 'tsx', 'dist', 'cli.mjs'), 'scripts/reset-test-db.ts'],
    { cwd: SERVER_DIR, env, mask },
  );
  // Közvetlenül a tsx-szel (a `prisma db seed` shellből hívná a tsx-et, ami itt nincs a PATH-on)
  runStep(
    'A tesztadatbázis seedelése',
    node,
    [tool(SERVER_DIR, 'tsx', 'dist', 'cli.mjs'), 'prisma/seed.ts'],
    {
      cwd: SERVER_DIR,
      env: {
        ...env,
        SEED_ADMIN_EMAIL: admin.email,
        SEED_ADMIN_PASSWORD: admin.password,
        SEED_DEMO_PASSWORD: demoPassword,
      },
      mask,
    },
  );
}

interface ServerSecrets {
  databaseUrl: string;
  webhookSecret: string;
  stripeConfigured: boolean;
}

async function startServer({ databaseUrl, webhookSecret, stripeConfigured }: ServerSecrets) {
  const uploads = join(E2E_DIR, 'test-results', 'uploads');
  rmSync(uploads, { recursive: true, force: true });
  mkdirSync(uploads, { recursive: true });
  const platform = HDNodeWallet.fromPhrase(
    HARDHAT_TEST_MNEMONIC,
    undefined,
    HARDHAT_FIRST_ACCOUNT_PATH,
  );
  // A szerver a saját .env-jének többi beállítását (pl. DHASH_THRESHOLD) megtartja; az itt megadott
  // értékek elsőbbséget élveznek. A sebességkorlátok az alapértékek: a forgatókönyvek beléjük férnek,
  // és a számlálók minden futásban nullázódnak (a szerver újraindul)
  const server = startProcess('A szerver', node, ['dist/server.js'], {
    cwd: SERVER_DIR,
    logName: 'server.log',
    env: {
      // Teszt mód: JSON-napló; a biztonsági viselkedés a fejlesztőivel azonos (a süti Secure jelzője
      // és a trust proxy csak élesben más – ezeket az E2E nem fedi le)
      NODE_ENV: 'test',
      PORT: String(SERVER_PORT),
      LOG_LEVEL: 'info',
      DATABASE_URL: databaseUrl,
      JWT_SECRET: randomBytes(48).toString('base64url'),
      UPLOAD_DIR: uploads,
      RPC_URL: CHAIN_URL,
      CHAIN_ID: LOCAL_CHAIN_ID,
      PLATFORM_PRIVATE_KEY: platform.privateKey,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      ...(stripeConfigured ? {} : { STRIPE_SECRET_KEY: STRIPE_PLACEHOLDER_KEY }),
      APP_BASE_URL: CLIENT_URL,
    },
  });
  await waitForHttp(server.label, `${SERVER_URL}/api/health`, {
    timeoutMs: STARTUP_TIMEOUT_MS,
    accept: (response) => response.ok,
    process: server,
  });
}

async function startClient() {
  const client = startProcess(
    'A kliens (vite preview)',
    node,
    [tool(CLIENT_DIR, 'vite', 'bin', 'vite.js'), 'preview'],
    { cwd: CLIENT_DIR, logName: 'client.log' },
  );
  await waitForHttp(client.label, CLIENT_URL, {
    timeoutMs: STARTUP_TIMEOUT_MS,
    accept: (response) => response.ok,
    process: client,
  });
}

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  const { testDatabaseUrl, stripeKey } = readServerEnv();
  await assertPortsFree();
  const stripeStatus = await checkStripeKey(stripeKey);
  const stripeConfigured = stripeStatus === 'accepted';
  console.log('E2E-környezet előkészítése:');
  build();

  const seed: SeedAccounts = {
    admin: {
      email: 'admin.e2e@photochain.test',
      password: `E2e-${randomBytes(12).toString('base64url')}`,
    },
    demoPassword: `Demo-${randomBytes(9).toString('base64url')}`,
  };
  const webhookSecret = `whsec_${randomBytes(24).toString('hex')}`;
  try {
    // A fordítás alatt is elindulhatott valami a portokon: közvetlenül az indítás előtt újra nézzük
    await assertPortsFree();
    await startChain();
    prepareDatabase(testDatabaseUrl, seed);
    await startServer({ databaseUrl: testDatabaseUrl, webhookSecret, stripeConfigured });
    await startClient();
  } catch (error) {
    await stopAll();
    throw error;
  }

  process.env[ENV_KEYS.webhookSecret] = webhookSecret;
  process.env[ENV_KEYS.stripe] = stripeConfigured ? 'on' : 'off';
  process.env[ENV_KEYS.adminEmail] = seed.admin.email;
  process.env[ENV_KEYS.adminPassword] = seed.admin.password;
  if (stripeStatus !== 'accepted') {
    process.env[ENV_KEYS.stripeSkipReason] = STRIPE_SKIP_REASONS[stripeStatus];
    console.log(`  ${STRIPE_SKIP_REASONS[stripeStatus]}: a fizetés forgatókönyve kimarad.`);
  }
  console.log(`  Kész: kliens ${CLIENT_URL}, szerver ${SERVER_URL}, lánc ${CHAIN_URL}\n`);

  return stopAll;
}
