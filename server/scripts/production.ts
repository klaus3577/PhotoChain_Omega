// Élesítési parancsok a saját gépről (L32): a Render ingyenes csomagjában nincs migrációs lépés és
// parancssor, ezért a Supabase adatbázisán innen futnak – a server/.env.production értékeivel (a
// fejlesztői .env nélkül), ellenőrzött TLS-sel (a Supabase CA-tanúsítványa: server/certs/).
// Használat (server/):
//   npm run production:migrate                 – az adatbázis-migrációk (prisma migrate deploy)
//   npm run production:seed -- --allow-remote-database
//                                              – kategóriák, az admin és a két demó fiók (idempotens)
// A parancsok shell nélkül indulnak (a Prisma CLI és a tsx a saját Node-unkkal), a kapcsolati adat
// csak a gyermekfolyamat környezetébe kerül – parancssorba és kimenetbe nem.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProductionEnv, prismaCliDatabaseUrl } from '../src/db/production.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const ENV_FILE = join(SERVER_DIR, '.env.production');
/** A Supabase adatbázis-tanúsítványát aláíró CA (Dashboard → Database Settings → SSL Configuration) */
const CA_FILE = join(SERVER_DIR, 'certs', 'supabase-prod-ca-2021.crt');
const require = createRequire(import.meta.url);

function run(args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(process.execPath, args, { cwd: SERVER_DIR, env, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}

const command = process.argv[2];
if (command !== 'migrate' && command !== 'seed') {
  throw new Error('Használat: tsx scripts/production.ts migrate|seed');
}
if (!existsSync(CA_FILE)) {
  throw new Error(
    'Hiányzik a Supabase CA-tanúsítványa: server/certs/supabase-prod-ca-2021.crt (lásd README)',
  );
}

if (command === 'migrate') {
  const production = loadProductionEnv(ENV_FILE, ['DATABASE_URL']);
  const prismaCli = require.resolve('prisma/build/index.js');
  run([prismaCli, 'migrate', 'deploy'], {
    ...process.env,
    DATABASE_URL: prismaCliDatabaseUrl(production.DATABASE_URL ?? '', CA_FILE),
  });
} else {
  const production = loadProductionEnv(ENV_FILE, [
    'DATABASE_URL',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD',
    'SEED_DEMO_PASSWORD',
  ]);
  // A jóváhagyást a parancssori kapcsoló adja, nem egy (a munkamenetben megmaradó) környezeti változó
  // vagy fájl: így minden futtatás kifejezett döntés. Kapcsoló nélkül a változó üres – a seed ekkor el
  // sem indul (src/db/seed.ts), akkor sem, ha a fejlesztői .env-ben szerepelne
  const allowRemote = process.argv.includes('--allow-remote-database');
  run(['--import', 'tsx', 'prisma/seed.ts'], {
    ...process.env,
    DATABASE_URL: production.DATABASE_URL,
    DATABASE_SSL_CA_FILE: CA_FILE,
    SEED_ADMIN_EMAIL: production.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: production.SEED_ADMIN_PASSWORD,
    SEED_DEMO_PASSWORD: production.SEED_DEMO_PASSWORD,
    SEED_ALLOW_REMOTE_DATABASE: allowRemote ? 'true' : '',
  });
}
