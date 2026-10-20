// Minden tábla kiürítése egy lépésben (L28): a tesztadatbázist az adatbázis-tesztek minden eset előtt
// (tests/helpers/testDatabase.ts), az end-to-end futás pedig az elején (scripts/reset-test-db.ts)
// üríti – ugyanazzal az utasítással, hogy egy új táblát csak itt kelljen felvenni. A sorszám-számlálók
// (kategória-azonosító) is visszaállnak. Csak tesztadatbázison hívható: a hívók a nevet („_test”
// végződés) előbb ellenőrzik.
import type { PrismaClient } from '../generated/prisma/client.js';

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`TRUNCATE TABLE reviews, orders, photos, categories, users RESTART IDENTITY CASCADE`;
}
