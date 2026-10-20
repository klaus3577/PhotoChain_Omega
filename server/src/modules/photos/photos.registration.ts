// A feltöltött képek lánc-regisztrációja (terv: 3.2, D12, L11). A feltöltés nem vár a láncra: a kép
// PENDING_CHAIN állapotban jön létre, a regisztráció a háttérben fut, a végén a kép REGISTERED, vagy
// – a lánc bármilyen hibájánál – CHAIN_FAILED állapotba kerül (a szerver közben nem áll le, a hibát
// naplózza). A sikertelen regisztráció újrapróbálható (retryRegistration – az adminisztrátor végpontja
// az L16-ban), a szerver újraindításakor pedig a félbemaradtak folytatódnak (resumePending). A
// letiltott fotós képeihez nem megy ki tranzakció (gázdíj): a tiltás idejére várnak (L16).
// Forrás: p-queue README (concurrency, onIdle), https://github.com/sindresorhus/p-queue (adaptálva)
import PQueue from 'p-queue';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import {
  type BlockchainService,
  ChainError,
  type ChainRegistration,
  isDefiniteRejection,
  ownerRefOf,
} from '../../services/blockchain.service.js';

export interface PhotoRegistration {
  /** A kép regisztrációja a háttérben: nem vár, nem dob hibát, a már folyamatban lévőt nem kettőzi. */
  schedule(photoId: string): void;
  /**
   * A sikertelen (CHAIN_FAILED) – vagy futó feladat nélkül beragadt PENDING_CHAIN – regisztráció
   * újrapróbálása: az adminisztrátor végpontja (L16).
   */
  retryRegistration(photoId: string): Promise<void>;
  /**
   * A félbemaradt (PENDING_CHAIN) regisztrációk folytatása – induláskor és időnként; az újonnan
   * ütemezettek számát adja (a már folyamatban lévőket nem számolja).
   */
  resumePending(): Promise<number>;
  /** Megvárja, amíg a folyamatban lévő regisztrációk befejeződnek. */
  whenIdle(): Promise<void>;
  /**
   * Leállításkor: új regisztráció nem indul (a sorban várók PENDING_CHAIN állapotban maradnak, és a
   * következő induláskor folytatódnak); a már futót megvárja.
   */
  close(): Promise<void>;
}

export interface PhotoRegistrationDependencies {
  prisma: PrismaClient;
  blockchain: BlockchainService;
  logger: Logger;
}

const REGISTRATION_SELECT = {
  id: true,
  ownerId: true,
  sha256: true,
  dHash: true,
  status: true,
  chainTxHash: true,
  owner: { select: { isBlocked: true } },
} as const;

type PhotoToRegister = Prisma.PhotoGetPayload<{ select: typeof REGISTRATION_SELECT }>;

/** A lánc adatai az adatbázisban. Ha csak a lánc rekordja ismert, a tranzakció adatai null-ok. */
interface ChainData {
  chainTxHash: string | null;
  chainBlockNumber: number | null;
  gasUsed: bigint | null;
  registeredAt: Date;
}

/**
 * A kép a küldés előtt kikerült a PENDING_CHAIN állapotból (pl. elrejtették), vagy a fotóst
 * letiltották: most nem regisztráljuk.
 */
class RegistrationCancelledError extends Error {
  constructor() {
    super('A kép már nem vár lánc-regisztrációra');
    this.name = 'RegistrationCancelledError';
  }
}

const photoIdSchema = z.uuid();

const fromRegistration = (registration: ChainRegistration): ChainData => ({
  chainTxHash: registration.txHash,
  chainBlockNumber: registration.blockNumber,
  gasUsed: registration.gasUsed,
  registeredAt: registration.registeredAt,
});

/** A lánc szerint a kép már regisztrálva van – lehet, hogy éppen a mi korábbi tranzakciónk volt. */
const mayAlreadyBeOurs = (error: unknown): error is ChainError =>
  error instanceof ChainError && (error.kind === 'ALREADY_REGISTERED' || error.kind === 'REVERTED');

export function createPhotoRegistration({
  prisma,
  blockchain,
  logger,
}: PhotoRegistrationDependencies): PhotoRegistration {
  // A regisztrációk egyenként futnak (a tranzakciók úgyis egymás után mennek ki): így sok félbemaradt
  // kép folytatása sem terheli egyszerre az adatbázist
  const jobs = new PQueue({ concurrency: 1 });
  /** Az ütemezett vagy futó regisztrációk (képazonosító → feladat): ugyanazt a képet nem kettőzzük. */
  const scheduled = new Map<string, Promise<void>>();
  /** A futás közben újra kért képek: a futás után még egyszer sorra kerülnek. */
  const rerun = new Set<string>();
  /** Leállítás után új regisztráció nem indul */
  let closed = false;

  /** A tranzakció hash-ének mentése a küldés előtt – csak ha a kép még regisztrációra vár. */
  async function saveTxHash(photoId: string, txHash: string): Promise<void> {
    // A küldés előtti utolsó lépés: ha a fotóst közben letiltották, a tranzakció sem megy ki
    const { count } = await prisma.photo.updateMany({
      where: { id: photoId, status: 'PENDING_CHAIN', owner: { isBlocked: false } },
      data: { chainTxHash: txHash },
    });
    if (count === 0) throw new RegistrationCancelledError();
  }

  /**
   * A korábban elküldött tranzakció lezárása (pl. a szerver újraindítása után), vagy ha ilyen nincs,
   * illetve a lánc nem ismeri, egy új tranzakció. Az új tranzakció hash-e még a küldés előtt az
   * adatbázisba kerül.
   */
  async function sendOrResume(
    photo: PhotoToRegister,
    ownerRef: string,
  ): Promise<ChainRegistration> {
    if (photo.chainTxHash !== null) {
      const earlier = await blockchain.waitForRegistration(photo.chainTxHash, photo.sha256);
      if (earlier !== null) return earlier;
    }
    return blockchain.registerPhoto(
      { sha256: photo.sha256, dHash: photo.dHash, ownerRef },
      { beforeBroadcast: (txHash) => saveTxHash(photo.id, txHash) },
    );
  }

  /** A regisztráció a láncon. Ha a kép a láncon már a feltöltő nevén szerepel, az is siker. */
  async function registerOnChain(photo: PhotoToRegister): Promise<ChainData> {
    const ownerRef = ownerRefOf(photo.ownerId);
    try {
      return fromRegistration(await sendOrResume(photo, ownerRef));
    } catch (error) {
      if (!mayAlreadyBeOurs(error)) throw error;
      // Pl. a korábbi tranzakció blokkba került, de a nyugtája elveszett: a lánc rekordja szerint a
      // kép ennek a felhasználónak a nevén van – ez a mi regisztrációnk
      const record = await blockchain.getRecord(photo.sha256);
      if (record?.ownerRef !== ownerRef) throw error;
      return {
        chainTxHash: null,
        chainBlockNumber: null,
        gasUsed: null,
        registeredAt: record.registeredAt,
      };
    }
  }

  async function markRegistered(photoId: string, data: ChainData): Promise<void> {
    // A közben CHAIN_FAILED-nek jelölt kép is regisztrált lesz: a tranzakció mégis blokkba került
    const { count } = await prisma.photo.updateMany({
      where: { id: photoId, status: { in: ['PENDING_CHAIN', 'CHAIN_FAILED'] } },
      data: { status: 'REGISTERED', ...data },
    });
    // A kép közben más állapotba került (pl. elrejtették): a lánc adatai akkor is mentődnek
    if (count === 0) await prisma.photo.updateMany({ where: { id: photoId }, data });
  }

  async function markFailed(photo: PhotoToRegister, error: ChainError): Promise<void> {
    // Előbb a napló: ha az állapot mentése (az adatbázis) is hibára fut, a lánchiba oka akkor se vesszen el
    logger.error(
      { photoId: photo.id, reason: error.kind },
      `A kép lánc-regisztrációja nem sikerült: ${error.message}`,
    );
    // A biztosan visszautasított tranzakció hash-e már nem kell (újrapróbáláskor új tranzakció megy
    // ki); a többié igen: például az időtúllépéses tranzakció később még blokkba kerülhet
    await prisma.photo.updateMany({
      where: { id: photo.id, status: 'PENDING_CHAIN' },
      data: {
        status: 'CHAIN_FAILED',
        ...(isDefiniteRejection(error) ? { chainTxHash: null } : {}),
      },
    });
  }

  /** A lánc hibája: CHAIN_FAILED; a közben elrejtett kép kimarad; minden más hiba továbbmegy. */
  async function handleFailure(photo: PhotoToRegister, error: unknown): Promise<null> {
    if (error instanceof RegistrationCancelledError) {
      logger.info(
        { photoId: photo.id },
        'A kép a küldés előtt kikerült a sorból (elrejtették, vagy a fotóst letiltották) – most nem regisztráljuk',
      );
      return null;
    }
    // Más hiba (pl. az adatbázisé a hash mentésekor) továbbmegy: a kép PENDING_CHAIN marad, és a
    // következő folytatáskor (resumePending) újra sorra kerül
    if (!(error instanceof ChainError)) throw error;
    await markFailed(photo, error);
    return null;
  }

  async function register(photoId: string): Promise<void> {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      select: REGISTRATION_SELECT,
    });
    if (photo?.status !== 'PENDING_CHAIN') return;
    // A letiltott fotós képéért nem fizetünk gázdíjat: a tiltás idejére vár (PENDING_CHAIN marad),
    // a feloldás után a folytatás (resumePending) sorra veszi
    if (photo.owner.isBlocked) {
      logger.info(
        { photoId: photo.id },
        'A fotós le van tiltva – a kép regisztrációja a feloldásig vár',
      );
      return;
    }
    const data = await registerOnChain(photo).catch(async (error: unknown) =>
      handleFailure(photo, error),
    );
    if (data === null) return;
    await markRegistered(photo.id, data);
    logger.info(
      {
        photoId: photo.id,
        txHash: data.chainTxHash,
        blockNumber: data.chainBlockNumber,
        gasUsed: data.gasUsed?.toString() ?? null,
      },
      data.chainTxHash === null
        ? 'A kép már szerepelt a láncon a feltöltő nevén – regisztráltnak jelölve'
        : 'A kép regisztrálva a blokkláncon',
    );
  }

  /** Ütemezi a kép regisztrációját (ha már ütemezve van, a futása után még egyszer sorra kerül). */
  function enqueue(photoId: string): void {
    if (closed) return;
    if (scheduled.has(photoId)) {
      // Futás közben újra kérték (pl. újrapróbálás): a futás után még egyszer sorra vesszük
      rerun.add(photoId);
      return;
    }
    const job = jobs
      .add(() => register(photoId))
      .catch((error: unknown) => {
        logger.error(
          { photoId, err: error },
          'Váratlan hiba a lánc-regisztráció közben – a kép a következő folytatáskor újra sorra kerül',
        );
      })
      .finally(() => {
        scheduled.delete(photoId);
        if (rerun.delete(photoId)) enqueue(photoId);
      });
    scheduled.set(photoId, job);
  }

  async function retryRegistration(requestedId: string): Promise<void> {
    const notFound = new AppError(404, 'NOT_FOUND', 'A kép nem található');
    if (!photoIdSchema.safeParse(requestedId).success) throw notFound;
    // A futó feladatok kisbetűs azonosítóval szerepelnek: a nagybetűs UUID ugyanaz a kép
    const photoId = requestedId.toLowerCase();
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      select: { status: true, owner: { select: { isBlocked: true } } },
    });
    if (photo === null) throw notFound;
    // A letiltott fotós képéhez nem megy ki tranzakció (register) – az újrapróbálás sem indulhat el
    if (photo.owner.isBlocked) {
      throw new AppError(409, 'CONFLICT', 'A fotós le van tiltva – a feloldás után próbáld újra', {
        status: photo.status,
      });
    }
    // A futó feladat nélkül beragadt PENDING_CHAIN kép (pl. adatbázis-hiba után) is újraindítható
    const isStuck = photo.status === 'PENDING_CHAIN' && !scheduled.has(photoId);
    const { count } = await prisma.photo.updateMany({
      where: { id: photoId, status: isStuck ? 'PENDING_CHAIN' : 'CHAIN_FAILED' },
      data: { status: 'PENDING_CHAIN' },
    });
    if (count === 0) {
      throw new AppError(
        409,
        'CONFLICT',
        'Csak a sikertelen (CHAIN_FAILED) vagy beragadt lánc-regisztráció próbálható újra',
        { status: photo.status },
      );
    }
    enqueue(photoId);
  }

  async function resumePending(): Promise<number> {
    // A letiltott fotósok képei a feloldásig várnak
    const pending = await prisma.photo.findMany({
      where: { status: 'PENDING_CHAIN', owner: { isBlocked: false } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const fresh = pending.filter(({ id }) => !scheduled.has(id));
    for (const { id } of fresh) enqueue(id);
    return fresh.length;
  }

  async function whenIdle(): Promise<void> {
    // Egy befejeződő feladat újraütemezheti a képét (rerun): addig várunk, amíg nincs több
    while (scheduled.size > 0) await Promise.all(scheduled.values());
  }

  async function close(): Promise<void> {
    closed = true;
    // A sorban várók nem indulnak el (PENDING_CHAIN marad, a következő induláskor folytatódnak)
    jobs.pause();
    jobs.clear();
    await jobs.onIdle();
    scheduled.clear();
    rerun.clear();
  }

  return {
    schedule: enqueue,
    retryRegistration,
    resumePending,
    whenIdle,
    close,
  };
}
