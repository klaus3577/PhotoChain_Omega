// A tesztadatbázis kiürítése (L28): az end-to-end tesztek előtt minden tábla üres, a sorszám-számlálók
// visszaállnak – ugyanazzal a közös utasítással, mint az adatbázis-tesztek előtt (src/lib/truncateAll.ts).
// Csak „_test” végű nevű adatbázison fut, a fejlesztői adatbázist nem érinti.
// Használat (server/), a tesztadatbázis URL-jével a DATABASE_URL-ben:
//   bash:       DATABASE_URL=<tesztadatbázis> npm run db:reset-test
//   PowerShell: $env:DATABASE_URL = '<tesztadatbázis>'; npm run db:reset-test
import { createPrismaClient } from '../src/lib/prisma.js';
import { truncateAll } from '../src/lib/truncateAll.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('A DATABASE_URL nincs beállítva (a tesztadatbázis URL-je kell)');
if (!URL.canParse(databaseUrl)) {
  throw new Error('A DATABASE_URL nem érvényes URL (az értékét a jelszó miatt nem írjuk ki)');
}
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error(`Csak „_test” végű nevű adatbázis üríthető (most: „${databaseName}”)`);
}

const prisma = createPrismaClient(databaseUrl);
try {
  await truncateAll(prisma);
  console.log(`A(z) ${databaseName} adatbázis kiürítve.`);
} finally {
  await prisma.$disconnect();
}
