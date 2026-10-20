// A képfeltöltő szolgáltatás (createPhotosService) tesztjei közvetlenül, HTTP nélkül: a hibák utáni
// takarítás és a feldolgozási sor viselkedése. A hibákat a tárhely „elrontott” változataival idézzük
// elő; a versenyhelyzeteket egy kívülről nyitható sorompóval tesszük kiszámíthatóvá.
import { rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createPhotosService,
  type PhotosService,
  type PhotosServiceDependencies,
} from '../../src/modules/photos/photos.service.js';
import { ChainError, resolveContractAddress } from '../../src/services/blockchain.service.js';
import { createImageWork, type ImageWork } from '../../src/services/imageWork.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import type { StorageService } from '../../src/services/storage/storage.types.js';
import { createFakeBlockchain } from '../helpers/fakeBlockchain.js';
import { TEST_ENV, UNKNOWN_USER_ID } from '../helpers/testApp.js';
import {
  createCategory,
  createTestPrisma,
  createUser,
  resetDatabase,
} from '../helpers/testDatabase.js';
import {
  createTempUploadDir,
  deferred,
  fixtureImage,
  listStoredFiles,
} from '../helpers/uploads.js';

const PUDDLE = fixtureImage('01_tocsa_tukrozodes.jpg');
const CANDLES = fixtureImage('02_gyertyak.jpg');
const BASS_GUITAR = fixtureImage('03_basszusgitar.jpg');

let prisma: PrismaClient;
let uploadDir: string;
let local: StorageService;
let ownerId: string;
let categoryId: number;
let logLines: string[];

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  rmSync(uploadDir, { recursive: true, force: true });
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  uploadDir = createTempUploadDir();
  local = createLocalStorage(uploadDir);
  ownerId = (await createUser(prisma)).id;
  categoryId = (await createCategory(prisma)).id;
  logLines = [];
});

function createService(overrides: Partial<PhotosServiceDependencies> = {}): PhotosService {
  const logger = pino({ level: 'warn' }, { write: (line: string) => logLines.push(line) });
  return createPhotosService({
    prisma,
    storage: local,
    logger,
    dHashThreshold: 10,
    chainId: TEST_ENV.CHAIN_ID,
    contractAddress: resolveContractAddress(TEST_ENV.CHAIN_ID),
    blockchain: createFakeBlockchain().blockchain,
    registration: { schedule: vi.fn() },
    imageWork: createImageWork(TEST_ENV.IMAGE_PROCESSING_CONCURRENCY),
    ...overrides,
  });
}

const fields = (title = 'Tócsa') => ({ title, priceHuf: 2500, categoryId });
const storedFiles = (): string[] => listStoredFiles(uploadDir);

// L32: a képbontás a közös képfeldolgozási soron fut – a kis memóriájú tárhelyen egyszerre egy kép
// bontása, a feltöltés, a hitelesség-ellenőrzés és az admin-visszaállítás között összesen
describe('createPhotosService – közös képfeldolgozási sor (L32)', () => {
  it('a feltöltött kép vizsgálata és az előnézetek elkészítése is a soron át fut', async () => {
    let calls = 0;
    const imageWork: ImageWork = async (task) => {
      calls += 1;
      return task();
    };

    await createService({ imageWork }).upload({ ownerId, file: PUDDLE, fields: fields() });

    expect(calls).toBe(2);
  });
});

describe('createPhotosService – hiba mentés közben', () => {
  const diskFull = new Error('megtelt a lemez');
  const failingThumbnail = (): StorageService => ({
    ...local,
    save: (key, data) =>
      key.startsWith('thumbnails/') ? Promise.reject(diskFull) : local.save(key, data),
  });

  it('ha az egyik fájl mentése nem sikerül, a hiba továbbmegy, rekord és fájl nem marad', async () => {
    const service = createService({ storage: failingThumbnail() });

    await expect(service.upload({ ownerId, file: PUDDLE, fields: fields() })).rejects.toBe(
      diskFull,
    );

    await expect(prisma.photo.count()).resolves.toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('ha az adatbázisba írás nem sikerül, a már elmentett fájlokat törli', async () => {
    const service = createService();

    // Nem létező tulajdonos: a beszúrás idegenkulcs-hibával áll meg (nem egyedi index sérül)
    await expect(
      service.upload({ ownerId: UNKNOWN_USER_ID, file: PUDDLE, fields: fields() }),
    ).rejects.toThrow();

    await expect(prisma.photo.count()).resolves.toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('ha a takarítás sem sikerül, azt naplózza, és az eredeti hibát adja tovább', async () => {
    const service = createService({
      storage: { ...failingThumbnail(), delete: () => Promise.reject(new Error('zárolt fájl')) },
    });

    await expect(service.upload({ ownerId, file: PUDDLE, fields: fields() })).rejects.toBe(
      diskFull,
    );

    expect(logLines).toHaveLength(1);
    const entry = JSON.parse(logLines[0] ?? '{}') as { msg: string; keys: string[] };
    expect(entry.msg).toMatch(/nem sikerült törölni/);
    expect(entry.keys).toHaveLength(3);
    // Az eredeti és az előnézet ott maradt – ezért kell a naplóbejegyzés
    expect(storedFiles()).toHaveLength(2);
  });
});

describe('createPhotosService – feldolgozási sor', () => {
  /** Tárhely, amelynek a mentései a sorompó nyitásáig várnak. */
  function gatedStorage() {
    const gate = deferred();
    const save = vi.fn(async (key: string, data: Buffer) => {
      await gate.promise;
      await local.save(key, data);
    });
    return { storage: { ...local, save } satisfies StorageService, save, open: gate.resolve };
  }

  it('a sorban álló feltöltés megszakítható: a szolgáltatás fel sem dolgozza', async () => {
    const gated = gatedStorage();
    const service = createService({ storage: gated.storage });
    const abort = new AbortController();

    const first = service.upload({ ownerId, file: PUDDLE, fields: fields() });
    const second = service.upload({
      ownerId,
      file: CANDLES,
      fields: fields('Gyertyák'),
      signal: abort.signal,
    });
    // A második még az első mögött várakozik, amikor a kliense bontja a kapcsolatot
    await vi.waitFor(() => expect(gated.save).toHaveBeenCalledTimes(1));
    abort.abort();

    await expect(second).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_UPLOAD' });
    gated.open();
    await expect(first).resolves.toMatchObject({ title: 'Tócsa' });
    await expect(prisma.photo.count()).resolves.toBe(1);
    expect(storedFiles()).toHaveLength(3);
  });

  // A futó feldolgozást nem szakítjuk meg: különben a sor elindítaná mellette a következőt, és egy
  // ideig két feltöltés futna egyszerre (a hasonló képek szűrése ezen múlik)
  it('a már futó feldolgozást a kliens megszakítása nem állítja le, a következő megvárja', async () => {
    const gated = gatedStorage();
    const service = createService({ storage: gated.storage });
    const clientGone = new AbortController();

    const first = service.upload({
      ownerId,
      file: PUDDLE,
      fields: fields(),
      signal: clientGone.signal,
    });
    const second = service.upload({ ownerId, file: CANDLES, fields: fields('Gyertyák') });
    await vi.waitFor(() => expect(gated.save).toHaveBeenCalledTimes(1));
    clientGone.abort();
    // A második feltöltés elemzése kb. 100 ms volna – ennyi idő alatt sem ért el a mentésig
    await sleep(500);
    expect(gated.save).toHaveBeenCalledTimes(1);

    gated.open();

    await expect(first).resolves.toMatchObject({ title: 'Tócsa' });
    await expect(second).resolves.toMatchObject({ title: 'Gyertyák' });
  });

  it('a már megszakított kérést be sem állítja a sorba', async () => {
    const service = createService();

    await expect(
      service.upload({ ownerId, file: PUDDLE, fields: fields(), signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: 'INVALID_UPLOAD' });

    await expect(prisma.photo.count()).resolves.toBe(0);
  });

  // A duplikáció-szűrés azon múlik, hogy a második feltöltés ellenőrzése már lássa az elsőt
  it('egyszerre csak egy feldolgozás fut: a következő az előző befejezéséig nem indul el', async () => {
    const gated = gatedStorage();
    const service = createService({ storage: gated.storage });

    const first = service.upload({ ownerId, file: PUDDLE, fields: fields() });
    const second = service.upload({ ownerId, file: CANDLES, fields: fields('Gyertyák') });
    await vi.waitFor(() => expect(gated.save).toHaveBeenCalledTimes(1));
    // A második feltöltés elemzése kb. 100 ms volna – ennyi idő alatt sem ért el a mentésig
    await sleep(500);
    expect(gated.save).toHaveBeenCalledTimes(1);

    gated.open();

    await expect(first).resolves.toMatchObject({ title: 'Tócsa' });
    await expect(second).resolves.toMatchObject({ title: 'Gyertyák' });
    expect(gated.save).toHaveBeenCalledTimes(6);
  });
});

describe('createPhotosService – lánc-ellenőrzés és lánc-regisztráció', () => {
  it('a sikeres feltöltés után ütemezi a kép lánc-regisztrációját', async () => {
    const schedule = vi.fn();
    const service = createService({ registration: { schedule } });

    const photo = await service.upload({ ownerId, file: PUDDLE, fields: fields() });

    expect(schedule).toHaveBeenCalledExactlyOnceWith(photo.id);
  });

  it('az elutasított (duplikált) feltöltéshez nem ütemez regisztrációt', async () => {
    const schedule = vi.fn();
    const service = createService({ registration: { schedule } });
    await service.upload({ ownerId, file: PUDDLE, fields: fields() });

    await expect(service.upload({ ownerId, file: PUDDLE, fields: fields() })).rejects.toMatchObject(
      { statusCode: 409 },
    );

    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['időtúllépés', new ChainError('TIMEOUT', 'Időtúllépés'), 'TIMEOUT'],
    ['váratlan hiba', new Error('váratlan'), 'UNKNOWN'],
  ])(
    'ha a lánc-ellenőrzés nem sikerül (%s), figyelmeztetést naplóz, és a feltöltés folytatódik',
    async (_label, error, reason) => {
      const { blockchain } = createFakeBlockchain();
      blockchain.isRegistered.mockRejectedValue(error);
      const service = createService({ blockchain });

      await expect(
        service.upload({ ownerId, file: PUDDLE, fields: fields() }),
      ).resolves.toMatchObject({ status: 'PENDING_CHAIN' });

      expect(logLines).toHaveLength(1);
      expect(JSON.parse(logLines[0] ?? '{}')).toMatchObject({
        level: 40,
        reason,
        msg: expect.stringMatching(/lánc/),
      });
    },
  );

  it('ha a lánc nem érhető el, egy percig nem kérdezi újra – nem lassít minden feltöltést', async () => {
    const { blockchain } = createFakeBlockchain();
    blockchain.isRegistered.mockRejectedValue(new ChainError('TIMEOUT', 'Időtúllépés'));
    let now = 1_000_000;
    const service = createService({ blockchain, now: () => now });

    await service.upload({ ownerId, file: PUDDLE, fields: fields() });
    now += 59_000;
    await service.upload({ ownerId, file: CANDLES, fields: fields('Gyertyák') });
    expect(blockchain.isRegistered).toHaveBeenCalledTimes(1);

    now += 2_000;
    await service.upload({ ownerId, file: BASS_GUITAR, fields: fields('Basszusgitár') });
    expect(blockchain.isRegistered).toHaveBeenCalledTimes(2);
  });
});

describe('createPhotosService – a fel nem dolgozható fájl', () => {
  it('a képdekóder hibáját (az okát) naplózza, a kliensnek 415-öt ad', async () => {
    const service = createService();
    const truncated = PUDDLE.subarray(0, 20_000);

    await expect(
      service.upload({ ownerId, file: truncated, fields: fields() }),
    ).rejects.toMatchObject({ statusCode: 415, code: 'UNSUPPORTED_IMAGE' });

    expect(logLines).toHaveLength(1);
    const entry = JSON.parse(logLines[0] ?? '{}') as { level: number; msg: string; err: unknown };
    expect(entry.level).toBe(40); // warn
    expect(entry.msg).toMatch(/nem dolgozható fel/);
    expect(JSON.stringify(entry.err)).toMatch(/cause/);
  });

  it('az előnézet készítésekor kiderülő képhibát is naplózza, és 415-öt ad', async () => {
    const service = createService();
    const start = Math.round(PUDDLE.length * 0.5);
    const corrupted = Buffer.concat([PUDDLE.subarray(0, start), PUDDLE.subarray(start + 1000)]);

    await expect(
      service.upload({ ownerId, file: corrupted, fields: fields() }),
    ).rejects.toMatchObject({ statusCode: 415, code: 'UNSUPPORTED_IMAGE' });

    expect(logLines).toHaveLength(1);
    expect(JSON.parse(logLines[0] ?? '{}')).toMatchObject({ level: 40 });
    expect(logLines[0]).toMatch(/Corrupt JPEG/i);
    expect(storedFiles()).toEqual([]);
  });

  it('a fájl eleji azonosító alapján elutasított fájlhoz (nincs dekóderhiba) nem ír naplót', async () => {
    const service = createService();

    await expect(
      service.upload({ ownerId, file: Buffer.from('ez nem kép'), fields: fields() }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' });

    expect(logLines).toEqual([]);
  });
});
