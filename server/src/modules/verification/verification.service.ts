// A nyilvános hitelesség-ellenőrzés üzleti logikája (terv 1.2/7. pont, L12): a vizsgált kép (vagy a
// SHA-256 hash-e) a láncon regisztrált-e (VERIFIED), egy nyilvános képhez nagyon hasonló-e
// (SIMILAR), vagy ismeretlen (NOT_FOUND). A lánc az igazságforrás: VERIFIED csak a lánc rekordja
// alapján lehet, az adatbázis csak kiegészíti. A vizsgált fájl sehol nem tárolódik és nem naplózódik.
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import {
  type BlockchainService,
  ChainError,
  type ChainRecord,
  ownerRefOf,
} from '../../services/blockchain.service.js';
import { transactionProof, type TransactionProof } from '../../services/chainExplorer.js';
import {
  isNearDuplicate,
  rankByDistance,
  type RankedCandidate,
} from '../../services/hashing.service.js';
import { analyseImage, type ImageRules } from '../../services/imageAnalysis.js';
import type { ImageWork } from '../../services/imageWork.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import { isPublic, PUBLIC_PHOTO_WHERE } from '../photos/photos.visibility.js';

/**
 * Az ellenőrizhető kép rövidebb oldalának legkisebb mérete. A feltöltésénél (600 px) kisebb: a
 * 400 képpontos bélyegkép és a weben talált kicsinyített másolatok is ellenőrizhetők legyenek.
 */
export const VERIFY_MIN_EDGE_PX = 100;

const VERIFY_IMAGE_RULES: ImageRules = { minEdgePx: VERIFY_MIN_EDGE_PX, action: 'ellenőrizhető' };

/**
 * Ha a lánc nem érhető el, ennyi ideig nem kérdezzük újra: addig minden ellenőrzés azonnal 503-at
 * kap, így a kérések nem várnak egyenként az olvasás időkorlátjáig.
 */
const CHAIN_PAUSE_MS = 60_000;
const MS_PER_SECOND = 1_000;
/** Ennyi, a láncon megtalált rekordot jegyez meg a szolgáltatás (rekordonként kb. 200 bájt) */
const DEFAULT_REMEMBERED_RECORDS = 1_000;
/**
 * Egy ellenőrzés legfeljebb ennyi, a küszöbön belüli jelöltet erősít meg a láncon (a legközelebbitől
 * sorban). A feltöltés a hasonló képeket elutasítja, így ennél több jelölt csak kivételesen lehet.
 * Legrosszabb esetben egy kérés 1 + 5 láncolvasás (a vizsgált fájl hash-e és öt, a lánc által meg
 * nem erősített jelölt) – az alapbeállításokkal egy IP-cím a 20 kérésével a közös 200-as keret 60 %-át
 * foglalhatja le egy időablakban (korábban, egyetlen jelölttel, 20 %-át); a keret kimerülése 503-at
 * ad, a kérés nem adhat hamis NOT_FOUND-ot.
 */
export const MAX_SIMILAR_CANDIDATES = 5;

export type VerificationOutcome = 'VERIFIED' | 'SIMILAR' | 'NOT_FOUND';

/**
 * A regisztráció bizonyítéka: az idő és – ha az adatbázisban lezárt tranzakció tartozik hozzá – a
 * tranzakció blokkja, hash-e és Etherscan-linkje (ugyanaz az alak, mint a kép tanúsítványáé).
 */
export interface RegistrationProof extends TransactionProof {
  /** A regisztráció ideje (a blokk időbélyege) – VERIFIED-nél a lánc rekordjából */
  registeredAt: Date;
}

/** A nyilvános (REGISTERED) kép adatai. */
export interface VerifiedPhoto {
  id: string;
  title: string;
  thumbnailUrl: string;
  photographer: { id: string; displayName: string };
}

/** Az ellenőrzés eredménye – minden mező mindig jelen van (a nem értelmezhető érték null). */
export interface VerificationResult {
  result: VerificationOutcome;
  /** A vizsgált fájl SHA-256 hash-e (a hash alapú ellenőrzésnél a megadott hash) */
  sha256: string;
  /** A vizsgált fájl dHash-e; a hash alapú ellenőrzésnél nem ismert: null */
  dHash: string | null;
  /** SIMILAR-nál az eltérő bitek száma (Hamming-távolság), egyébként null */
  distance: number | null;
  /** VERIFIED-nél és SIMILAR-nál a regisztráció bizonyítéka, NOT_FOUND-nál null */
  registration: RegistrationProof | null;
  /** A kép adatai – csak ha nyilvános (REGISTERED), egyébként null */
  photo: VerifiedPhoto | null;
}

export interface VerificationService {
  /**
   * 503-as hibát dob, ha a lánc most nem olvasható (szünetel egy elérhetetlenség után, vagy elfogyott
   * a közös keret) – a fájl fogadása előtt hívjuk, hogy ilyenkor a fájlt be se olvassuk.
   */
  ensureChainReadable(): void;
  /** A feltöltött fájl ellenőrzése: pontos egyezés a láncon, illetve hasonlóság. */
  verifyFile(file: Buffer): Promise<VerificationResult>;
  /** Ellenőrzés a SHA-256 hash alapján (64 kisbetűs hexa) – csak pontos egyezés. */
  verifyHash(sha256: string): Promise<VerificationResult>;
}

export interface VerificationServiceDependencies {
  prisma: PrismaClient;
  storage: Pick<StorageService, 'publicUrl'>;
  logger: Logger;
  blockchain: Pick<BlockchainService, 'getRecord'>;
  /** Legfeljebb ennyi eltérő dHash-bitnél számít két kép hasonlónak (DHASH_THRESHOLD) */
  dHashThreshold: number;
  /** A blokklánc-hálózat (CHAIN_ID) – ebből készül a tranzakció linkje */
  chainId: number;
  /**
   * A láncolvasások közös kerete (minden kliensre együtt): egy időablakban legfeljebb ennyi – ez szab
   * felső határt az RPC-szolgáltató kvótája fogyásának (VERIFY_CHAIN_READ_LIMIT)
   */
  chainReadLimit: { limit: number; windowMs: number };
  /** A közös képfeldolgozási sor (L32): a fájl vizsgálata (képbontás) ezen fut */
  imageWork: ImageWork;
  /** Legfeljebb ennyi, a láncon megtalált rekordot jegyez meg (a legrégebbi esik ki) */
  rememberedRecordLimit?: number;
  /** Az óra (a tesztek a lánc-ellenőrzés szüneteltetéséhez állíthatják) */
  now?: () => number;
}

/** A kép azon adatai, amelyekből a válasz készülhet. */
const PHOTO_PROOF_SELECT = {
  id: true,
  sha256: true,
  title: true,
  status: true,
  ownerId: true,
  thumbnailKey: true,
  chainTxHash: true,
  chainBlockNumber: true,
  registeredAt: true,
  owner: { select: { displayName: true, isBlocked: true } },
} as const;

type PhotoProof = Prisma.PhotoGetPayload<{ select: typeof PHOTO_PROOF_SELECT }>;

/** A legközelebbi nyilvános kép, a regisztrációs idejével és a távolságával. */
interface SimilarPhoto {
  photo: PhotoProof;
  registeredAt: Date;
  distance: number;
}

const NO_TRANSACTION: TransactionProof = { blockNumber: null, txHash: null, txUrl: null };

export function createVerificationService({
  prisma,
  storage,
  logger,
  blockchain,
  dHashThreshold,
  chainId,
  chainReadLimit,
  imageWork,
  rememberedRecordLimit = DEFAULT_REMEMBERED_RECORDS,
  now = Date.now,
}: VerificationServiceDependencies): VerificationService {
  /** Eddig az időpontig nem kérdezzük a láncot (egy elérhetetlenség után) */
  let chainPausedUntil = 0;
  /** A közös keret aktuális időablaka: a kezdete és az eddigi láncolvasások száma */
  let readWindowStart = now();
  let readsInWindow = 0;
  /**
   * A láncon megtalált rekordok. A regisztráció a láncon nem változik (a szerződésben nincs törlés
   * vagy felülírás), így a már látott rekordhoz nem kell újra olvasni: a hasonló kép megerősítése és
   * a gyakran ellenőrzött képek nem fogyasztják a keretet, a hash alapú ellenőrzésük pedig a lánc
   * szünetelése alatt is működik. (A fájl alapú ellenőrzés szünetnél a fájl beolvasása előtt 503-at
   * kap – ott a hash még nem ismert.) A nem talált hash-t nem jegyezzük meg: azt bármikor
   * regisztrálhatják. A lánc cseréje (CHAIN_ID) újraindítással jár, ami a tárolót is kiüríti.
   */
  const rememberedRecords = new Map<string, ChainRecord>();

  const retryAfter = (remainingMs: number) => ({
    retryAfterSeconds: Math.ceil(remainingMs / MS_PER_SECOND),
  });
  const chainUnavailable = (remainingMs: number): AppError =>
    new AppError(
      503,
      'CHAIN_UNAVAILABLE',
      'A blokklánc most nem érhető el – az ellenőrzés később megismételhető',
      undefined,
      retryAfter(remainingMs),
    );
  const tooManyChainReads = (remainingMs: number): AppError =>
    new AppError(
      503,
      'SERVER_BUSY',
      'A szerver most túl sok ellenőrzést kapott – próbáld újra később',
      undefined,
      retryAfter(remainingMs),
    );

  /** Ennyi idő múlva lesz újra szabad láncolvasás a közös keretben (0: most is van). */
  function readBudgetWaitMs(): number {
    // Egyetlen időpont: az ablak határán se adjon a két kiolvasás ellentmondó eredményt
    const current = now();
    if (current - readWindowStart >= chainReadLimit.windowMs) {
      readWindowStart = current;
      readsInWindow = 0;
    }
    return readsInWindow < chainReadLimit.limit
      ? 0
      : readWindowStart + chainReadLimit.windowMs - current;
  }

  /**
   * Olvasható-e most a lánc: nem szünetel-e (egy elérhetetlenség után), és van-e még a közös
   * keretben. A fájl-ellenőrzés már a kép feldolgozása előtt megkérdezi – ha úgyis 503 lesz, a
   * képbontás processzorideje ne vesszen kárba.
   */
  function assertChainReadable(): void {
    const remainingPause = chainPausedUntil - now();
    if (remainingPause > 0) throw chainUnavailable(remainingPause);
    const budgetWait = readBudgetWaitMs();
    if (budgetWait > 0) throw tooManyChainReads(budgetWait);
  }

  /** A rekord megjegyzése; ha betelt a hely, a legrégebben megjegyzett esik ki. */
  function remember(sha256: string, record: ChainRecord): void {
    if (rememberedRecords.size >= rememberedRecordLimit) {
      // A Map a beillesztés sorrendjét őrzi: az első kulcs a legrégebbi
      for (const oldest of rememberedRecords.keys()) {
        rememberedRecords.delete(oldest);
        break;
      }
    }
    rememberedRecords.set(sha256, record);
  }

  /** A hash rekordja a láncon. Ha a lánc nem érhető el: 503, és egy ideig nem is kérdezzük. */
  async function readChainRecord(sha256: string): Promise<ChainRecord | null> {
    const remembered = rememberedRecords.get(sha256);
    if (remembered) return remembered;
    assertChainReadable();
    readsInWindow += 1;
    try {
      const record = await blockchain.getRecord(sha256);
      if (record) remember(sha256, record);
      return record;
    } catch (error) {
      // A nem a lánctól eredő hiba programhiba: 500-as válasz lesz belőle, szünet nélkül
      if (!(error instanceof ChainError)) throw error;
      chainPausedUntil = now() + CHAIN_PAUSE_MS;
      logger.warn(
        { reason: error.kind },
        'A blokklánc nem érhető el – a hitelesség-ellenőrzés egy percig szünetel',
      );
      throw chainUnavailable(CHAIN_PAUSE_MS);
    }
  }

  /**
   * A kép adatai – csak a nyilvános képé (regisztrált, a fotósa nincs letiltva); a rejtett, függő
   * vagy letiltott fotósú kép adatai nem.
   */
  function publicPhoto(photo: PhotoProof): VerifiedPhoto | null {
    if (!isPublic(photo)) return null;
    return {
      id: photo.id,
      title: photo.title,
      thumbnailUrl: storage.publicUrl(photo.thumbnailKey),
      photographer: { id: photo.ownerId, displayName: photo.owner.displayName },
    };
  }

  /**
   * VERIFIED: a lánc rekordja, kiegészítve az adatbázis adataival – de csak ha a lánc ugyanazt a
   * tulajdonost (ownerRef) rögzítette, különben az adatbázis sora nem ehhez a regisztrációhoz tartozik.
   */
  async function verified(
    sha256: string,
    dHash: string | null,
    record: ChainRecord,
  ): Promise<VerificationResult> {
    const photo = await prisma.photo.findUnique({ where: { sha256 }, select: PHOTO_PROOF_SELECT });
    const matching = photo && ownerRefOf(photo.ownerId) === record.ownerRef ? photo : null;
    return {
      result: 'VERIFIED',
      sha256,
      dHash,
      distance: null,
      registration: {
        registeredAt: record.registeredAt,
        ...(matching ? transactionProof(chainId, matching) : NO_TRANSACTION),
      },
      photo: matching ? publicPhoto(matching) : null,
    };
  }

  /**
   * Ha az adatbázis szerint regisztrált kép nincs a láncon (pl. másik hálózatra vagy újratelepített
   * szerződésre állt át a szerver), az ellentmondás nyoma a naplóba kerül.
   */
  async function warnIfUnconfirmed(sha256: string): Promise<void> {
    const photo = await prisma.photo.findUnique({
      where: { sha256 },
      select: { id: true, status: true },
    });
    if (photo?.status === 'REGISTERED') {
      logger.warn(
        { photoId: photo.id },
        'Az adatbázis szerint regisztrált kép nincs a láncon – az ellenőrzés NOT_FOUND-ot adott',
      );
    }
  }

  /**
   * A jelölt a regisztrációs idejével, ha még nyilvános, és a lánc ugyanazzal a tulajdonossal
   * megerősíti; különben null. Ha közben elrejtették (vagy a fotósát letiltották), már nem nyilvános:
   * nem adjuk ki. A lánc által meg nem erősített jelölt nyoma a naplóba kerül.
   */
  async function confirmSimilar({ id, distance }: RankedCandidate): Promise<SimilarPhoto | null> {
    const photo = await prisma.photo.findFirst({
      where: { ...PUBLIC_PHOTO_WHERE, id },
      select: PHOTO_PROOF_SELECT,
    });
    if (!photo) return null;
    const record = await readChainRecord(photo.sha256);
    if (record?.ownerRef !== ownerRefOf(photo.ownerId)) {
      logger.warn(
        { photoId: photo.id },
        'A hasonló kép az adatbázis szerint regisztrált, de nincs a láncon (ugyanazzal a ' +
          'tulajdonossal) – az ellenőrzés nem hivatkozik rá',
      );
      return null;
    }
    return { photo, registeredAt: record.registeredAt, distance };
  }

  /**
   * A legközelebbi olyan nyilvános kép, amely a küszöbön belül van, és a lánc is megerősíti
   * (ugyanazzal a tulajdonossal) – a lánc itt is az igazságforrás; a regisztráció ideje a lánc
   * rekordjából. A küszöbön belüli jelölteket távolság szerint sorban vizsgáljuk, és az első
   * megerősítettet adjuk: ha a legközelebbit a lánc nem erősíti meg (vagy közben elrejtették), a
   * következő jön – egyetlen jelölt kiesése nem jelenti, hogy nincs találat (témavezetői észrevétel,
   * 2026-10-27). A vizsgált fájllal azonos hash-ű sor nem számít: azt a lánc nem erősítette meg.
   * Prototípus-méretben elég minden dHash-sel összevetni (mint a feltöltésnél); egyenlő távolságnál a
   * korábban feltöltött kép számít eredetinek.
   */
  async function findSimilar(sha256: string, dHash: string): Promise<SimilarPhoto | null> {
    const candidates = await prisma.photo.findMany({
      where: { ...PUBLIC_PHOTO_WHERE, sha256: { not: sha256 } },
      select: { id: true, dHash: true },
      // Azonos időpontnál az azonosító dönt, így az egyenlő távolságú jelöltek sorrendje is állandó
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const withinThreshold = rankByDistance(dHash, candidates).filter((candidate) =>
      isNearDuplicate(candidate.distance, dHashThreshold),
    );
    const examined = withinThreshold.slice(0, MAX_SIMILAR_CANDIDATES);
    for (const candidate of examined) {
      const similar = await confirmSimilar(candidate);
      if (similar) return similar;
    }
    // Csak ha a megvizsgáltak egyike sem igazolt, és maradt vizsgálatlan jelölt: a NOT_FOUND
    // ilyenkor lehet a keret miatt téves – ennek nyoma a naplóban marad
    if (withinThreshold.length > examined.length) {
      logger.warn(
        { candidates: withinThreshold.length, examined: examined.length },
        'A küszöbön belüli hasonló képek közül csak a legközelebbieket vizsgáltuk, a lánc egyiket ' +
          'sem erősítette meg (láncolvasási keret)',
      );
    }
    return null;
  }

  async function verify(sha256: string, dHash: string | null): Promise<VerificationResult> {
    const record = await readChainRecord(sha256);
    if (record) return verified(sha256, dHash, record);

    await warnIfUnconfirmed(sha256);
    // A hash alapú ellenőrzésnél nincs dHash: hasonlóságot nem keresünk
    const similar = dHash === null ? null : await findSimilar(sha256, dHash);
    return similar
      ? {
          result: 'SIMILAR',
          sha256,
          dHash,
          distance: similar.distance,
          registration: {
            registeredAt: similar.registeredAt,
            ...transactionProof(chainId, similar.photo),
          },
          photo: publicPhoto(similar.photo),
        }
      : { result: 'NOT_FOUND', sha256, dHash, distance: null, registration: null, photo: null };
  }

  return {
    ensureChainReadable: assertChainReadable,

    async verifyFile(file) {
      // A fájl beérkezése alatt a helyzet változhatott: a képbontás előtt még egyszer
      assertChainReadable();
      const image = await imageWork(async () => analyseImage(file, logger, VERIFY_IMAGE_RULES));
      return verify(image.sha256, image.dHash);
    },
    verifyHash: (sha256) => verify(sha256, null),
  };
}
