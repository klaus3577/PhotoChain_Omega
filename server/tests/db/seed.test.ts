// A seed (kezdeti adatok) tesztjei valódi PostgreSQL-tesztadatbázison.
import { compare } from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CATEGORIES, DEMO_USERS, seedDatabase } from '../../src/db/seed.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetDatabase } from '../helpers/testDatabase.js';

const OPTIONS = {
  adminEmail: 'admin@photochain.test',
  adminPassword: 'teszt-admin-jelszo',
  demoPassword: 'teszt-demo-jelszo',
};

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  // A futás végén is üres marad a tesztadatbázis (lásd schema.test.ts)
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

describe('seedDatabase', () => {
  it('létrehozza a kategóriákat, az admint és a két demó felhasználót', async () => {
    const summary = await seedDatabase(prisma, OPTIONS);

    expect(summary).toEqual({ categories: CATEGORIES.length, users: 1 + DEMO_USERS.length });
    const categories = await prisma.category.findMany({ orderBy: { id: 'asc' } });
    expect(categories.map((category) => category.slug)).toEqual(
      CATEGORIES.map((category) => category.slug),
    );
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: OPTIONS.adminEmail } });
    expect(admin.role).toBe('ADMIN');
    const demoUsers = await prisma.user.findMany({ where: { role: 'USER' } });
    expect(demoUsers.map((user) => user.email).sort()).toEqual(
      DEMO_USERS.map((user) => user.email).sort(),
    );
  });

  it('a jelszavakat bcrypt-hashként tárolja, nem nyílt szövegként', async () => {
    await seedDatabase(prisma, OPTIONS);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: OPTIONS.adminEmail } });
    const demo = await prisma.user.findFirstOrThrow({ where: { role: 'USER' } });
    expect(admin.passwordHash).not.toContain(OPTIONS.adminPassword);
    await expect(compare(OPTIONS.adminPassword, admin.passwordHash)).resolves.toBe(true);
    await expect(compare(OPTIONS.demoPassword, demo.passwordHash)).resolves.toBe(true);
  });

  it('többszöri futtatás sem hoz létre duplikátumot (idempotens)', async () => {
    await seedDatabase(prisma, OPTIONS);
    await seedDatabase(prisma, OPTIONS);

    expect(await prisma.category.count()).toBe(CATEGORIES.length);
    expect(await prisma.user.count()).toBe(1 + DEMO_USERS.length);
  });
});
