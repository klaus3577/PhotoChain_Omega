// A lánc-regisztráció (photos.registration.ts) tesztjei a tesztadatbázison, a blokklánc-szolgáltatás
// memóriabeli utánzatával (tests/helpers/fakeBlockchain.ts): a háttérben futó regisztráció, a
// lánchibák kezelése (CHAIN_FAILED + napló), az újrapróbálás és a szerver-újraindítás utáni folytatás.
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createPhotoRegistration,
  type PhotoRegistration,
} from '../../src/modules/photos/photos.registration.js';
import {
  ChainError,
  type ChainErrorKind,
  ownerRefOf,
} from '../../src/services/blockchain.service.js';
import {
  createFakeBlockchain,
  type FakeBlockchain,
  randomTxHash,
  REGISTRATION_GAS,
} from '../helpers/fakeBlockchain.js';
import { UNKNOWN_USER_ID } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  resetDatabase,
} from '../helpers/testDatabase.js';
import { deferred } from '../helpers/uploads.js';

const TX_HASH = /^0x[0-9a-f]{64}$/;

/** A Prisma-kliens, amelynek photo.updateMany hívásai hibát dobnak (mintha leállt volna az adatbázis). */
function withFailingPhotoUpdates(client: PrismaClient): PrismaClient {
  const failing = () => Promise.reject(new Error('az adatbázis nem érhető el'));
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (property !== 'photo') return typeof value === 'function' ? value.bind(target) : value;
      const photo = value as object;
      return new Proxy(photo, {
        get(delegate, method) {
          const member: unknown = Reflect.get(delegate, method);
          if (method === 'updateMany') return failing;
          return typeof member === 'function' ? member.bind(delegate) : member;
        },
      });
    },
  });
}

let prisma: PrismaClient;
let ownerId: string;
let categoryId: number;
let fake: FakeBlockchain;
let registration: PhotoRegistration;
let logLines: string[];

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  ownerId = (await createUser(prisma)).id;
  categoryId = (await createCategory(prisma)).id;
  fake = createFakeBlockchain();
  logLines = [];
  registration = createPhotoRegistration({
    prisma,
    blockchain: fake.blockchain,
    logger: pino({ level: 'info' }, { write: (line: string) => logLines.push(line) }),
  });
});

interface LogEntry {
  level: number;
  msg: string;
  photoId?: string;
  reason?: string;
  txHash?: string;
}

const logEntries = (): LogEntry[] => logLines.map((line) => JSON.parse(line) as LogEntry);
/** A hiba szintű (error, fatal) naplóbejegyzések. */
const errorLogs = (): LogEntry[] => logEntries().filter((entry) => entry.level >= 50);

const newPhoto = (overrides: { status?: PhotoStatus; chainTxHash?: string } = {}) =>
  createPhoto(prisma, { ownerId, categoryId, ...overrides });
const reload = (id: string) => prisma.photo.findUniqueOrThrow({ where: { id } });

/** Ütemezi a képek regisztrációját, és megvárja, amíg a háttérben befejeződik. */
async function register(...ids: string[]): Promise<void> {
  for (const id of ids) registration.schedule(id);
  await registration.whenIdle();
}

describe('lánc-regisztráció a háttérben', () => {
  it('a PENDING_CHAIN képet regisztrálja: REGISTERED, tranzakció-hash, blokkszám, gáz, időpont', async () => {
    const photo = await newPhoto();

    await register(photo.id);

    const stored = await reload(photo.id);
    expect(stored.chainTxHash).toMatch(TX_HASH);
    const onChain = fake.mined.get(stored.chainTxHash ?? '');
    expect(stored).toMatchObject({
      status: 'REGISTERED',
      chainBlockNumber: onChain?.blockNumber,
      gasUsed: REGISTRATION_GAS,
      registeredAt: onChain?.registeredAt,
    });
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledWith(
      { sha256: photo.sha256, dHash: photo.dHash, ownerRef: ownerRefOf(ownerId) },
      expect.anything(),
    );
    expect(logEntries()).toContainEqual(
      expect.objectContaining({ level: 30, photoId: photo.id, txHash: stored.chainTxHash }),
    );
  });

  it('a tranzakció hash-e a küldés előtt az adatbázisba kerül (a folytatáshoz újraindítás után)', async () => {
    const photo = await newPhoto();
    const txHash = randomTxHash();
    let beforeSending: { status: PhotoStatus; chainTxHash: string | null } | undefined;
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, { beforeBroadcast }) => {
      await beforeBroadcast(txHash);
      beforeSending = await reload(photo.id);
      return fake.mine(input, txHash);
    });

    await register(photo.id);

    expect(beforeSending).toMatchObject({ status: 'PENDING_CHAIN', chainTxHash: txHash });
    await expect(reload(photo.id)).resolves.toMatchObject({
      status: 'REGISTERED',
      chainTxHash: txHash,
    });
  });

  const failures: [string, ChainErrorKind][] = [
    ['elérhetetlen RPC-csomópont', 'UNAVAILABLE'],
    ['elfogyott a teszt-ETH', 'INSUFFICIENT_FUNDS'],
    ['visszautasított tranzakció', 'REVERTED'],
    ['váratlan lánchiba', 'UNKNOWN'],
  ];

  it.each(failures)(
    '%s: CHAIN_FAILED és hibanapló, a következő kép regisztrációja rendben lefut',
    async (_label, kind) => {
      const failing = await newPhoto();
      const next = await newPhoto();
      fake.failRegistration(failing.sha256, new ChainError(kind, 'a lánc hibája'));

      await register(failing.id, next.id);

      await expect(reload(failing.id)).resolves.toMatchObject({
        status: 'CHAIN_FAILED',
        chainTxHash: null,
      });
      await expect(reload(next.id)).resolves.toMatchObject({ status: 'REGISTERED' });
      expect(errorLogs()).toEqual([
        expect.objectContaining({
          photoId: failing.id,
          reason: kind,
          msg: expect.stringMatching(/a lánc hibája/),
        }),
      ]);
    },
  );

  it('időtúllépésnél CHAIN_FAILED, de a tranzakció-hash megmarad (később még blokkba kerülhet)', async () => {
    const photo = await newPhoto();
    const txHash = randomTxHash();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (_input, { beforeBroadcast }) => {
      await beforeBroadcast(txHash);
      throw new ChainError('TIMEOUT', 'időtúllépés');
    });

    await register(photo.id);

    await expect(reload(photo.id)).resolves.toMatchObject({
      status: 'CHAIN_FAILED',
      chainTxHash: txHash,
    });
    expect(errorLogs()).toEqual([
      expect.objectContaining({ photoId: photo.id, reason: 'TIMEOUT' }),
    ]);
  });

  it.each([
    ['visszautasított tranzakció', 'REVERTED'],
    ['a küldéskor elfogyott a teszt-ETH', 'INSUFFICIENT_FUNDS'],
  ] as const)(
    '%s után a hash törlődik (a tranzakció biztosan nem került a láncra): újrapróbáláskor új kell',
    async (_label, kind) => {
      const photo = await newPhoto();
      fake.blockchain.registerPhoto.mockImplementationOnce(async (_input, { beforeBroadcast }) => {
        await beforeBroadcast(randomTxHash());
        throw new ChainError(kind, 'a csomópont visszautasította');
      });

      await register(photo.id);

      await expect(reload(photo.id)).resolves.toMatchObject({
        status: 'CHAIN_FAILED',
        chainTxHash: null,
      });
    },
  );

  it('ha a láncon már ugyanez a felhasználó regisztrálta (elveszett nyugta), REGISTERED a lánc adataival', async () => {
    // A korábbi tranzakció hash-ét a lánc nem ismeri – de a kép a láncon ennek a felhasználónak a
    // nevén már szerepel
    const photo = await newPhoto({ chainTxHash: randomTxHash() });
    const registeredAt = new Date('2026-10-01T08:00:00Z');
    fake.records.set(photo.sha256, {
      ownerRef: ownerRefOf(ownerId),
      dHash: photo.dHash,
      registeredAt,
    });

    await register(photo.id);

    await expect(reload(photo.id)).resolves.toMatchObject({
      status: 'REGISTERED',
      registeredAt,
      chainTxHash: null,
      chainBlockNumber: null,
      gasUsed: null,
    });
    expect(errorLogs()).toEqual([]);
  });

  it('ha a láncon más regisztrálta ugyanezt a képet, CHAIN_FAILED és hibanapló', async () => {
    const photo = await newPhoto();
    fake.records.set(photo.sha256, {
      ownerRef: ownerRefOf(UNKNOWN_USER_ID),
      dHash: photo.dHash,
      registeredAt: new Date(),
    });

    await register(photo.id);

    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'CHAIN_FAILED' });
    expect(errorLogs()).toEqual([
      expect.objectContaining({ photoId: photo.id, reason: 'ALREADY_REGISTERED' }),
    ]);
  });

  it('ha a visszaellenőrzéskor a lánc nem érhető el, CHAIN_FAILED', async () => {
    const photo = await newPhoto();
    fake.blockchain.registerPhoto.mockRejectedValueOnce(
      new ChainError('ALREADY_REGISTERED', 'már regisztrálva'),
    );
    fake.blockchain.getRecord.mockRejectedValueOnce(new ChainError('UNAVAILABLE', 'nem érhető el'));

    await register(photo.id);

    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'CHAIN_FAILED' });
    expect(errorLogs()).toEqual([
      expect.objectContaining({ photoId: photo.id, reason: 'UNAVAILABLE' }),
    ]);
  });

  it('ugyanazt a képet kétszer ütemezve csak egy tranzakciót küld', async () => {
    const photo = await newPhoto();

    await register(photo.id, photo.id);

    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
  });

  it('a nem PENDING_CHAIN állapotú vagy nem létező képhez nem küld tranzakciót', async () => {
    const statuses = ['REGISTERED', 'CHAIN_FAILED', 'HIDDEN'] as const;
    const photos = await Promise.all(statuses.map((status) => newPhoto({ status })));

    await register(...photos.map((photo) => photo.id), UNKNOWN_USER_ID);

    expect(fake.blockchain.registerPhoto).not.toHaveBeenCalled();
    expect(fake.blockchain.waitForRegistration).not.toHaveBeenCalled();
  });

  it('ha a hash mentése nem sikerül (adatbázis-hiba), a tranzakció nem megy ki, a kép PENDING_CHAIN marad', async () => {
    const photo = await newPhoto();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, { beforeBroadcast }) => {
      // Ezt a hash-t az adatbázis nem fogadja el (photos_chainTxHash_check)
      await beforeBroadcast('0xNEM-HEXA');
      return fake.mine(input, randomTxHash());
    });

    await register(photo.id);

    await expect(reload(photo.id)).resolves.toMatchObject({
      status: 'PENDING_CHAIN',
      chainTxHash: null,
    });
    expect(fake.records.size).toBe(0);
    expect(errorLogs()).toEqual([
      expect.objectContaining({ photoId: photo.id, msg: expect.stringMatching(/váratlan/i) }),
    ]);
  });

  it('ha a regisztráció után az adatbázisba írás nem sikerül, a kép PENDING_CHAIN marad, és újraindításkor lezárul', async () => {
    const photo = await newPhoto();
    const txHash = randomTxHash();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, { beforeBroadcast }) => {
      await beforeBroadcast(txHash);
      // Az adatbázis ezt nem fogadja el (photos_gasUsed_check) – mintha az írás közben hiba történne
      return { ...fake.mine(input, txHash), gasUsed: 0n };
    });

    await register(photo.id);

    await expect(reload(photo.id)).resolves.toMatchObject({
      status: 'PENDING_CHAIN',
      chainTxHash: txHash,
    });
    expect(errorLogs()).toHaveLength(1);

    await expect(registration.resumePending()).resolves.toBe(1);
    await registration.whenIdle();

    await expect(reload(photo.id)).resolves.toMatchObject({
      status: 'REGISTERED',
      chainTxHash: txHash,
      gasUsed: REGISTRATION_GAS,
    });
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
  });

  it('ha a kép közben állapotot váltott (pl. elrejtették), a lánc adatai mentődnek, az állapot marad', async () => {
    const photo = await newPhoto();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, { beforeBroadcast }) => {
      const txHash = randomTxHash();
      await beforeBroadcast(txHash);
      await prisma.photo.update({
        where: { id: photo.id },
        data: { status: 'HIDDEN', hiddenBy: 'OWNER' },
      });
      return fake.mine(input, txHash);
    });

    await register(photo.id);

    const stored = await reload(photo.id);
    expect(stored.status).toBe('HIDDEN');
    expect(stored.chainTxHash).toMatch(TX_HASH);
    expect(stored.registeredAt).toBeInstanceOf(Date);
  });
});

describe('retryRegistration (az adminisztrátor újrapróbálása – végpontja az L16-ban)', () => {
  it('a CHAIN_FAILED képet újra regisztrálja', async () => {
    const photo = await newPhoto({ status: 'CHAIN_FAILED' });

    await registration.retryRegistration(photo.id);
    await registration.whenIdle();

    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'REGISTERED' });
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
  });

  it('ha a korábbi tranzakció közben blokkba került, nem küld újat, hanem azt zárja le', async () => {
    const txHash = randomTxHash();
    const photo = await newPhoto({ status: 'CHAIN_FAILED', chainTxHash: txHash });
    fake.mine({ sha256: photo.sha256, dHash: photo.dHash, ownerRef: ownerRefOf(ownerId) }, txHash);

    await registration.retryRegistration(photo.id);
    await registration.whenIdle();

    await expect(reload(photo.id)).resolves.toMatchObject({
      status: 'REGISTERED',
      chainTxHash: txHash,
    });
    expect(fake.blockchain.waitForRegistration).toHaveBeenCalledWith(txHash, photo.sha256);
    expect(fake.blockchain.registerPhoto).not.toHaveBeenCalled();
  });

  it('ha a korábbi tranzakciót a lánc nem ismeri (el sem jutott a csomópontig), újat küld', async () => {
    const lostTxHash = randomTxHash();
    const photo = await newPhoto({ status: 'CHAIN_FAILED', chainTxHash: lostTxHash });

    await registration.retryRegistration(photo.id);
    await registration.whenIdle();

    const stored = await reload(photo.id);
    expect(stored.status).toBe('REGISTERED');
    expect(stored.chainTxHash).toMatch(TX_HASH);
    expect(stored.chainTxHash).not.toBe(lostTxHash);
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
  });

  it('a beragadt (futó feladat nélküli) PENDING_CHAIN kép is újrapróbálható', async () => {
    // Pl. az adatbázis hibája miatt maradt PENDING_CHAIN állapotban, futó regisztráció nélkül
    const photo = await newPhoto();

    await registration.retryRegistration(photo.id);
    await registration.whenIdle();

    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'REGISTERED' });
  });

  it('a még folyamatban lévő regisztráció nem indítható újra: 409', async () => {
    const photo = await newPhoto();
    const gate = deferred();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, options) => {
      await gate.promise;
      return fake.registerPhoto(input, options);
    });
    registration.schedule(photo.id);
    await vi.waitFor(() => expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1));

    await expect(registration.retryRegistration(photo.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });

    gate.resolve();
    await registration.whenIdle();
    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'REGISTERED' });
  });

  it.each(['REGISTERED', 'HIDDEN'] as const)(
    '%s állapotú kép nem próbálható újra: 409',
    async (status) => {
      const photo = await newPhoto({ status });

      await expect(registration.retryRegistration(photo.id)).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
      });
      await registration.whenIdle();
      expect(fake.blockchain.registerPhoto).not.toHaveBeenCalled();
    },
  );

  it('nem létező vagy érvénytelen azonosítóra 404', async () => {
    await expect(registration.retryRegistration(UNKNOWN_USER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    await expect(registration.retryRegistration('nem-uuid')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('letiltott tulajdonos (L16)', () => {
  it('a letiltott fotós képéhez nem megy ki tranzakció: PENDING_CHAIN marad, a feloldás után folytatódik', async () => {
    const photo = await newPhoto();
    await prisma.user.update({ where: { id: ownerId }, data: { isBlocked: true } });

    await register(photo.id);
    const whileBlocked = await reload(photo.id);
    // A folytatás sem veszi sorra, amíg a tiltás tart
    const resumedWhileBlocked = await registration.resumePending();
    await prisma.user.update({ where: { id: ownerId }, data: { isBlocked: false } });
    const resumedAfterUnblock = await registration.resumePending();
    await registration.whenIdle();

    expect(whileBlocked.status).toBe('PENDING_CHAIN');
    expect(resumedWhileBlocked).toBe(0);
    expect(resumedAfterUnblock).toBe(1);
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
    expect((await reload(photo.id)).status).toBe('REGISTERED');
    expect(logEntries()).toContainEqual(
      expect.objectContaining({
        photoId: photo.id,
        level: 30,
        msg: expect.stringMatching(/le van tiltva/),
      }),
    );
  });
});

describe('letiltott tulajdonos – versenyhelyzet (L16)', () => {
  it('ha a fotóst a küldés előkészítése közben tiltják le, a tranzakció már nem megy ki', async () => {
    const photo = await newPhoto();
    // A tiltás az ellenőrzés után, de a tranzakció hash-ének mentése (a küldés) előtt érkezik
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, options) => {
      await prisma.user.update({ where: { id: ownerId }, data: { isBlocked: true } });
      return fake.registerPhoto(input, options);
    });

    await register(photo.id);

    const stored = await reload(photo.id);
    expect(stored.status).toBe('PENDING_CHAIN');
    expect(stored.chainTxHash).toBeNull();
    expect(fake.records.has(stored.sha256)).toBe(false);
  });
});

describe('resumePending (szerverinduláskor)', () => {
  it('folytatja a félbemaradt regisztrációkat, a többi képhez nem nyúl', async () => {
    const fresh = await newPhoto();
    const sentTxHash = randomTxHash();
    const sent = await newPhoto({ chainTxHash: sentTxHash });
    fake.mine(
      { sha256: sent.sha256, dHash: sent.dHash, ownerRef: ownerRefOf(ownerId) },
      sentTxHash,
    );
    const failed = await newPhoto({ status: 'CHAIN_FAILED' });
    await newPhoto({ status: 'REGISTERED' });

    await expect(registration.resumePending()).resolves.toBe(2);
    await registration.whenIdle();

    await expect(reload(fresh.id)).resolves.toMatchObject({ status: 'REGISTERED' });
    await expect(reload(sent.id)).resolves.toMatchObject({
      status: 'REGISTERED',
      chainTxHash: sentTxHash,
    });
    await expect(reload(failed.id)).resolves.toMatchObject({ status: 'CHAIN_FAILED' });
    // Új tranzakció csak a még el sem küldött képhez ment ki
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
  });

  it('a már folyamatban lévő regisztrációt nem indítja és nem számolja újra (időszakos ismétlés)', async () => {
    const photo = await newPhoto();
    const gate = deferred();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, options) => {
      await gate.promise;
      return fake.registerPhoto(input, options);
    });

    await expect(registration.resumePending()).resolves.toBe(1);
    await vi.waitFor(() => expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1));
    await expect(registration.resumePending()).resolves.toBe(0);

    gate.resolve();
    await registration.whenIdle();
    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'REGISTERED' });
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
  });

  it('sok félbemaradt kép esetén is egyszerre csak egy regisztráció fut (nincs indításkori roham)', async () => {
    const photos = await Promise.all(Array.from({ length: 8 }, () => newPhoto()));
    let active = 0;
    let maxActive = 0;
    fake.blockchain.registerPhoto.mockImplementation(async (input, options) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        return await fake.registerPhoto(input, options);
      } finally {
        active -= 1;
      }
    });

    await expect(registration.resumePending()).resolves.toBe(photos.length);
    await registration.whenIdle();

    expect(maxActive).toBe(1);
    await expect(prisma.photo.count({ where: { status: 'REGISTERED' } })).resolves.toBe(8);
  });
});

describe('close (a szerver leállításakor)', () => {
  it('a futó regisztrációt megvárja, a sorban várót nem indítja el (az a következő induláskor folytatódik)', async () => {
    const first = await newPhoto();
    const second = await newPhoto();
    const gate = deferred();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, options) => {
      await gate.promise;
      return fake.registerPhoto(input, options);
    });
    registration.schedule(first.id);
    registration.schedule(second.id);
    await vi.waitFor(() => expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1));

    const closing = registration.close();
    gate.resolve();
    await closing;

    await expect(reload(first.id)).resolves.toMatchObject({ status: 'REGISTERED' });
    await expect(reload(second.id)).resolves.toMatchObject({ status: 'PENDING_CHAIN' });
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
    // Leállítás után új regisztráció sem indul
    registration.schedule(second.id);
    await registration.whenIdle();
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1);
  });
});

describe('hibatűrés (a kód átnézésének nyomán)', () => {
  it('a lánchibát akkor is naplózza, ha az állapot mentése (az adatbázis) sem sikerül', async () => {
    const photo = await newPhoto();
    const failing = createPhotoRegistration({
      prisma: withFailingPhotoUpdates(prisma),
      blockchain: fake.blockchain,
      logger: pino({ level: 'info' }, { write: (line: string) => logLines.push(line) }),
    });
    fake.blockchain.registerPhoto.mockRejectedValueOnce(
      new ChainError('UNAVAILABLE', 'nem érhető el'),
    );

    failing.schedule(photo.id);
    await failing.whenIdle();

    expect(errorLogs()).toContainEqual(
      expect.objectContaining({ photoId: photo.id, reason: 'UNAVAILABLE' }),
    );
  });

  it('ha a képet a küldés előtt elrejtették, a tranzakció nem megy ki', async () => {
    const photo = await newPhoto();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, options) => {
      await prisma.photo.update({
        where: { id: photo.id },
        data: { status: 'HIDDEN', hiddenBy: 'OWNER' },
      });
      return fake.registerPhoto(input, options);
    });

    await register(photo.id);

    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'HIDDEN', chainTxHash: null });
    expect(fake.records.size).toBe(0);
    expect(errorLogs()).toEqual([]);
  });

  it('ha a képet közben CHAIN_FAILED-nek jelölték, de a tranzakció blokkba került, REGISTERED lesz', async () => {
    const photo = await newPhoto();
    fake.blockchain.registerPhoto.mockImplementationOnce(async (input, { beforeBroadcast }) => {
      const txHash = randomTxHash();
      await beforeBroadcast(txHash);
      await prisma.photo.update({ where: { id: photo.id }, data: { status: 'CHAIN_FAILED' } });
      return fake.mine(input, txHash);
    });

    await register(photo.id);

    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'REGISTERED' });
  });

  it('ha futás közben újra ütemezik, a futás után még egyszer sorra veszi (nem vész el a kérés)', async () => {
    const photo = await newPhoto();
    const gate = deferred();
    // Az első kísérlet nem lánchibával áll meg (pl. az adatbázis hibája): a kép PENDING_CHAIN marad
    fake.blockchain.registerPhoto.mockImplementationOnce(async () => {
      await gate.promise;
      throw new Error('átmeneti adatbázis-hiba');
    });
    registration.schedule(photo.id);
    await vi.waitFor(() => expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(1));

    registration.schedule(photo.id);
    gate.resolve();
    await registration.whenIdle();

    await expect(reload(photo.id)).resolves.toMatchObject({ status: 'REGISTERED' });
    expect(fake.blockchain.registerPhoto).toHaveBeenCalledTimes(2);
  });
});
