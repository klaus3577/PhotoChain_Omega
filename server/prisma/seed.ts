// A seed belépési pontja: `npm run db:seed` (= `prisma db seed`, lásd prisma.config.ts).
// A logika a src/db/seed.ts-ben van (ott tesztelt és típusellenőrzött); ez csak betölti a
// beállításokat, lefuttatja, és kiírja az eredményt – jelszavak nélkül.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { EnvValidationError } from '../src/config/env.js';
import { parseSeedEnv, seedDatabase } from '../src/db/seed.js';
import { createPrismaClient } from '../src/lib/prisma.js';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function main(): Promise<void> {
  const config = parseSeedEnv(process.env);
  const prisma = createPrismaClient(config.databaseUrl, { sslCaFile: config.sslCaFile });
  try {
    const { categories, users } = await seedDatabase(prisma, config);
    console.log(
      `Seed kész: ${categories} kategória, ${users} felhasználó (1 admin + ${users - 1} demó).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exitCode = 1;
});
