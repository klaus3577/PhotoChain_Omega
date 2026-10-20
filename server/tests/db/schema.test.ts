// Az adatmodell (4. fejezet) adatbázis-szintű szabályai: alapértékek, egyedi megszorítások,
// idegen kulcsok, CHECK megszorítások. Valódi PostgreSQL-tesztadatbázison futnak (lásd
// globalSetup.ts).
import { inspect } from 'node:util';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  randomHex,
  resetDatabase,
} from '../helpers/testDatabase.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A Prisma hibakódjai: P2002 – egyedi megszorítás sérül, P2003 – idegen kulcs sérül
const UNIQUE_VIOLATION = { code: 'P2002' };
const FOREIGN_KEY_VIOLATION = { code: 'P2003' };

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  // A futás végén is üres marad a tesztadatbázis: egy későbbi migráció (pl. új megszorítás) így nem
  // akad el bent maradt tesztsorokon
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

/**
 * CHECK megszorítás megsértése. Erre a Prisma nem ad saját hibakódot (mint a P2002 / P2003): a
 * megszorítás nevét a PostgreSQL hibaüzenete tartalmazza, a hiba mélyén (driver-adapter hiba).
 */
async function expectCheckViolation(operation: PromiseLike<unknown>, constraint: string) {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  );

  expect(error, 'a műveletnek hibával kell végződnie').toBeDefined();
  expect(inspect(error, { depth: 8 })).toContain(constraint);
}

async function createOwnerAndPhoto() {
  const owner = await createUser(prisma);
  const category = await createCategory(prisma);
  const photo = await createPhoto(prisma, { ownerId: owner.id, categoryId: category.id });
  return { owner, category, photo };
}

describe('User', () => {
  it('alapértékek: UUID-azonosító, USER szerepkör, nem tiltott, létrehozási idő', async () => {
    const user = await createUser(prisma);

    expect(user.id).toMatch(UUID);
    expect(user.role).toBe('USER');
    expect(user.isBlocked).toBe(false);
    expect(user.bio).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('az e-mail-cím egyedi', async () => {
    await createUser(prisma, 'foglalt@photochain.test');

    await expect(createUser(prisma, 'foglalt@photochain.test')).rejects.toMatchObject(
      UNIQUE_VIOLATION,
    );
  });

  // L30: az egyediség kis- és nagybetű-érzékeny, ezért a cím csak kisbetűs lehet (a sémák minden
  // beszúrás előtt kisbetűsítenek – ez a mélységi védelem, ha egy későbbi kódút kihagyná)
  it('az e-mail-cím csak kisbetűs alakban tárolható', async () => {
    await expectCheckViolation(createUser(prisma, 'Anna@photochain.test'), 'users_email_check');
    const user = await createUser(prisma, 'anna@photochain.test');
    await expectCheckViolation(
      prisma.user.update({ where: { id: user.id }, data: { email: 'ANNA@photochain.test' } }),
      'users_email_check',
    );
  });
});

describe('Photo', () => {
  it('az új kép PENDING_CHAIN állapotú, a blokklánc-adatai még üresek', async () => {
    const { photo } = await createOwnerAndPhoto();

    expect(photo.status).toBe('PENDING_CHAIN');
    expect(photo.chainTxHash).toBeNull();
    expect(photo.chainBlockNumber).toBeNull();
    expect(photo.gasUsed).toBeNull();
    expect(photo.registeredAt).toBeNull();
  });

  it('ugyanaz a SHA-256 ujjlenyomat nem szerepelhet kétszer', async () => {
    const { owner, category, photo } = await createOwnerAndPhoto();

    await expect(
      createPhoto(prisma, { ownerId: owner.id, categoryId: category.id, sha256: photo.sha256 }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('a lánc-regisztráció adatai tárolhatók, a gázfelhasználás BigInt', async () => {
    const { photo } = await createOwnerAndPhoto();
    const registration = {
      status: 'REGISTERED' as const,
      chainTxHash: `0x${randomHex(32)}`,
      chainBlockNumber: 9_123_456,
      gasUsed: 2n ** 40n,
      registeredAt: new Date('2026-09-29T10:00:00Z'),
    };

    await prisma.photo.update({ where: { id: photo.id }, data: registration });

    const stored = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(stored).toMatchObject(registration);
  });

  it('a lánc-regisztráció adatai csak érvényes alakban tárolhatók', async () => {
    const { photo } = await createOwnerAndPhoto();
    const update = (data: { chainTxHash?: string; chainBlockNumber?: number; gasUsed?: bigint }) =>
      prisma.photo.update({ where: { id: photo.id }, data });

    // A tranzakció-hash: 0x + 64 kisbetűs hexadecimális karakter
    await expectCheckViolation(
      update({ chainTxHash: `0x${'A'.repeat(64)}` }),
      'photos_chainTxHash_check',
    );
    await expectCheckViolation(update({ chainTxHash: 'a'.repeat(66) }), 'photos_chainTxHash_check');
    await expectCheckViolation(update({ chainBlockNumber: -1 }), 'photos_chainBlockNumber_check');
    await expectCheckViolation(update({ gasUsed: 0n }), 'photos_gasUsed_check');
  });

  it('a REGISTERED állapotú képnek van regisztrációs ideje', async () => {
    const { photo } = await createOwnerAndPhoto();

    await expectCheckViolation(
      prisma.photo.update({ where: { id: photo.id }, data: { status: 'REGISTERED' } }),
      'photos_registeredAt_check',
    );
  });

  it('az elrejtett képnél tudni kell, ki rejtette el – a nem rejtettnél ez üres', async () => {
    const { photo } = await createOwnerAndPhoto();
    const update = (data: { status?: 'HIDDEN' | 'REGISTERED'; hiddenBy?: 'OWNER' | 'ADMIN' }) =>
      prisma.photo.update({ where: { id: photo.id }, data });

    await expectCheckViolation(update({ status: 'HIDDEN' }), 'photos_hiddenBy_check');
    await expectCheckViolation(update({ hiddenBy: 'ADMIN' }), 'photos_hiddenBy_check');

    await update({ status: 'HIDDEN', hiddenBy: 'ADMIN' });
    const stored = await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(stored).toMatchObject({ status: 'HIDDEN', hiddenBy: 'ADMIN' });
  });

  it('a SHA-256 és a dHash csak kisbetűs hexadecimális lehet, pontos hosszal', async () => {
    const owner = await createUser(prisma);
    const category = await createCategory(prisma);
    const photo = { ownerId: owner.id, categoryId: category.id };

    // Nagybetűvel ugyanaz az ujjlenyomat másik sornak számítana, és megkerülné az egyediséget
    await expectCheckViolation(
      createPhoto(prisma, { ...photo, sha256: 'A'.repeat(64) }),
      'photos_sha256_check',
    );
    await expectCheckViolation(
      createPhoto(prisma, { ...photo, sha256: 'a'.repeat(63) }),
      'photos_sha256_check',
    );
    await expectCheckViolation(
      createPhoto(prisma, { ...photo, dHash: 'nem-hexa-ertek!!' }),
      'photos_dHash_check',
    );
  });

  it('az ár nem lehet negatív', async () => {
    const owner = await createUser(prisma);
    const category = await createCategory(prisma);

    await expectCheckViolation(
      createPhoto(prisma, { ownerId: owner.id, categoryId: category.id, priceHuf: -1 }),
      'photos_priceHuf_check',
    );
  });

  it('nem létező kategóriájú kép nem hozható létre', async () => {
    const owner = await createUser(prisma);

    await expect(createPhoto(prisma, { ownerId: owner.id, categoryId: 999 })).rejects.toMatchObject(
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('akinek képe van, az a felhasználó nem törölhető', async () => {
    const { owner } = await createOwnerAndPhoto();

    await expect(prisma.user.delete({ where: { id: owner.id } })).rejects.toMatchObject(
      FOREIGN_KEY_VIOLATION,
    );
  });
});

describe('Order', () => {
  async function createOrderData() {
    const { photo } = await createOwnerAndPhoto();
    const buyer = await createUser(prisma);
    return { buyerId: buyer.id, photoId: photo.id, amountHuf: 2500 };
  }

  it('az új rendelés PENDING állapotú, és még a Stripe-munkamenet előtt, azonosító nélkül jön létre', async () => {
    // Két különböző vevő–kép pár: ugyanarra a párra egyszerre csak egy élő (PENDING vagy PAID)
    // rendelés lehet (L14 – lásd orders.checkout.test.ts)
    const first = await prisma.order.create({ data: await createOrderData() });
    const second = await prisma.order.create({ data: await createOrderData() });

    expect(first.status).toBe('PENDING');
    expect(first.paidAt).toBeNull();
    // Több, még munkamenet nélküli rendelés is megfér egymás mellett (a NULL nem ütközik)
    expect(first.stripeSessionId).toBeNull();
    expect(second.stripeSessionId).toBeNull();
  });

  it('a Stripe-munkamenet azonosítója egyedi', async () => {
    await prisma.order.create({
      data: { ...(await createOrderData()), stripeSessionId: 'cs_test_1' },
    });

    // Másik vevő–kép pár: csak a munkamenet azonosítója ütközik
    await expect(
      prisma.order.create({ data: { ...(await createOrderData()), stripeSessionId: 'cs_test_1' } }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('a rendelés összege nem lehet negatív', async () => {
    const order = await createOrderData();

    await expectCheckViolation(
      prisma.order.create({ data: { ...order, amountHuf: -1 } }),
      'orders_amountHuf_check',
    );
  });
});

describe('Review', () => {
  it('egy felhasználó egy képet csak egyszer értékelhet', async () => {
    const { photo } = await createOwnerAndPhoto();
    const author = await createUser(prisma);
    const review = { photoId: photo.id, authorId: author.id, rating: 5 };

    await prisma.review.create({ data: review });

    await expect(prisma.review.create({ data: { ...review, rating: 1 } })).rejects.toMatchObject(
      UNIQUE_VIOLATION,
    );
  });

  it('az értékelés csak 1 és 5 közötti lehet', async () => {
    const { photo } = await createOwnerAndPhoto();
    const author = await createUser(prisma);
    const review = { photoId: photo.id, authorId: author.id };

    for (const rating of [0, 6]) {
      await expectCheckViolation(
        prisma.review.create({ data: { ...review, rating } }),
        'reviews_rating_check',
      );
    }
  });
});

// L32 biztonsági átnézés: a Supabase Data API (PostgREST) a public séma tábláit a nyilvános
// kulccsal (anon szerepkör) is kiadná. Sorszintű védelemmel (RLS), szabály nélkül ezek a szerepkörök
// semmit nem érnek el; a szerver a táblák tulajdonosaként kapcsolódik, rá nem vonatkozik. Egy
// később felvett táblán is be kell kapcsolni – ezt is ez a teszt jelzi.
describe('sorszintű védelem (RLS, L32)', () => {
  it('a public séma minden tábláján be van kapcsolva', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string; rowsecurity: boolean }[]>`
      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;

    expect(tables.map((table) => table.tablename)).toEqual(
      expect.arrayContaining([
        '_prisma_migrations',
        'categories',
        'orders',
        'photos',
        'reviews',
        'users',
      ]),
    );
    expect(tables.filter((table) => !table.rowsecurity).map((table) => table.tablename)).toEqual(
      [],
    );
  });
});
