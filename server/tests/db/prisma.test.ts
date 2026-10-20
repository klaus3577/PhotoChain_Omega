// A Prisma-kliens és az adatbázis-kapcsolat ellenőrzése.
import { describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  DatabaseConnectionError,
  verifyDatabaseConnection,
} from '../../src/lib/prisma.js';
import { createTestPrisma } from '../helpers/testDatabase.js';

describe('createPrismaClient + verifyDatabaseConnection', () => {
  it('a kliens a PostgreSQL 17-es adatbázishoz csatlakozik', async () => {
    const prisma = createTestPrisma();
    try {
      await expect(verifyDatabaseConnection(prisma)).resolves.toBeUndefined();

      const [row] = await prisma.$queryRaw<{ server_version: string }[]>`SHOW server_version`;
      expect(row?.server_version).toMatch(/^17\./);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('elérhetetlen adatbázisnál érthető hibát ad, a jelszó nélkül', async () => {
    const prisma = createPrismaClient('postgresql://teszt:TITOK@127.0.0.1:1/nincs_test');
    try {
      const error = await verifyDatabaseConnection(prisma).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DatabaseConnectionError);
      expect(String(error)).toMatch(/adatbázis nem érhető el/);
      // Az ok röviden (itt: a megadott porton senki nem fogad kapcsolatot), egysoros üzenetben
      expect(String(error)).toMatch(/\((DatabaseNotReachable|ECONNREFUSED)\)$/);
      expect(String(error)).not.toContain('\n');
      expect(String(error)).not.toContain('TITOK');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('nem válaszoló gépnél nem vár a végtelenségig: az időkorlát után hibát ad', async () => {
    // 192.0.2.1: dokumentációs célra fenntartott, nem irányított cím (RFC 5737) – a kapcsolódási
    // kísérletre nem jön válasz (ilyen pl. egy tűzfal mögötti vagy leállított adatbázis-szerver)
    const prisma = createPrismaClient('postgresql://teszt:TITOK@192.0.2.1:5432/nincs_test', {
      connectionTimeoutMs: 500,
    });
    const startedAt = Date.now();
    try {
      await expect(verifyDatabaseConnection(prisma)).rejects.toBeInstanceOf(
        DatabaseConnectionError,
      );

      expect(Date.now() - startedAt).toBeLessThan(5_000);
    } finally {
      await prisma.$disconnect();
    }
  });
});
