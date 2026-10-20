// A szerver belépési pontja: konfiguráció betöltése, adatbázis-kapcsolat ellenőrzése, alkalmazás
// összeállítása, port megnyitása, a blokklánc-kapcsolat ellenőrzése és a félbemaradt
// lánc-regisztrációk folytatása.
// Elsőként: a libvips lemezre bontási küszöbe a sharp betöltése előtt (lásd config/imageMemory.ts)
import './config/imageMemory.js';

import { setTimeout as sleep } from 'node:timers/promises';

import { parseUnits } from 'ethers';
import type { Logger } from 'pino';

import { createApp } from './app.js';
import {
  configWarnings,
  EnvValidationError,
  loadEnv,
  sensitiveValues,
  type Env,
} from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { closeGracefully, configureHttpTimeouts } from './lib/httpTimeouts.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient, verifyDatabaseConnection } from './lib/prisma.js';
import {
  createPhotoRegistration,
  type PhotoRegistration,
} from './modules/photos/photos.registration.js';
import {
  type BlockchainService,
  ChainConfigError,
  createBlockchainService,
  resolveContractAddress,
} from './services/blockchain.service.js';
import { reportChainHealth } from './services/chainHealth.js';
import { configureImageMemory, restrictImageDecoders } from './services/imageDecoding.js';
import { createStripeClient, createStripePaymentService } from './services/payment.service.js';
import { createStorageFromEnv, type SelectedStorage } from './services/storage/storageFromEnv.js';

/** Ilyen gyakran nézzük meg, maradt-e futó feladat nélküli PENDING_CHAIN kép (pl. adatbázis-hiba után) */
const REGISTRATION_SWEEP_INTERVAL_MS = 10 * 60_000;
/** Leállításkor legfeljebb ennyi ideig várunk a folyamatban lévő lánc-regisztrációkra */
const SHUTDOWN_GRACE_MS = 10_000;

function loadEnvOrExit(): Env {
  try {
    return loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      // A napló még nincs beállítva (a szintje is a konfigurációból jönne), ezért a konzolra írunk.
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

async function connectDatabaseOrExit(prisma: PrismaClient, logger: Logger): Promise<void> {
  try {
    await verifyDatabaseConnection(prisma);
    logger.info('Az adatbázis-kapcsolat rendben');
  } catch (error) {
    logger.fatal(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/** Hibás lánc-beállításnál (ismeretlen hálózat, érvénytelen kulcs) a szerver el sem indul. */
function createBlockchainServiceOrExit(env: Env, logger: Logger): BlockchainService {
  try {
    return createBlockchainService({
      rpcUrl: env.RPC_URL,
      chainId: env.CHAIN_ID,
      contractAddress: resolveContractAddress(env.CHAIN_ID),
      privateKey: env.PLATFORM_PRIVATE_KEY,
      maxFeePerGasWei: parseUnits(String(env.CHAIN_MAX_FEE_GWEI), 'gwei'),
    });
  } catch (error) {
    if (error instanceof ChainConfigError) {
      logger.fatal(error.message);
      process.exit(1);
    }
    throw error;
  }
}

/** A tárhely induláskori ellenőrzése (Supabase: a bucketek); hibánál a szerver el sem indul. */
async function checkStorageOrExit(selected: SelectedStorage, logger: Logger): Promise<void> {
  try {
    await selected.checkReady();
    logger.info(`A képek tárhelye: ${selected.description}`);
  } catch (error) {
    logger.fatal(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/** A félbemaradt (pl. a szerver leállása miatt) regisztrációk folytatása a háttérben. */
async function resumeRegistrations(registration: PhotoRegistration, logger: Logger): Promise<void> {
  try {
    const count = await registration.resumePending();
    if (count > 0) logger.info(`${count} félbemaradt lánc-regisztráció folytatódik`);
  } catch (error) {
    logger.error({ err: error }, 'A félbemaradt lánc-regisztrációk nem kérdezhetők le');
  }
}

const env = loadEnvOrExit();
// A titkos értékek a naplóba akkor sem kerülhetnek, ha egy hibaüzenet tartalmazná őket
const logger = createLogger(env, { secrets: sensitiveValues(env) });
// Elfogadható, de valószínűleg elfelejtett beállítások (pl. https-cím éles mód nélkül, L32)
for (const warning of configWarnings(env)) logger.warn(warning);
// A lánc titkai a beolvasás után a környezetből is törlődnek (pl. a gyermekfolyamatok, a
// diagnosztikai jelentés ne lássa őket); a szerver a már ellenőrzött env objektumot használja
delete process.env.PLATFORM_PRIVATE_KEY;
delete process.env.RPC_URL;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.JWT_SECRET;
delete process.env.DATABASE_URL;
// Utolsó védvonal: egy kezeletlen ígéret-elutasítás (pl. egy külső könyvtár háttérfeladatából) ne
// állítsa le a szervert – a titokszűrő naplón át naplózzuk. (A kód minden ismert úton kezeli a
// hibákat; ez csak az előre nem látott esetre szól.)
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Kezeletlen ígéret-elutasítás – a szerver tovább fut');
});
// A feltöltött fájlok csak a három elfogadott képformátum dekóderéhez juthatnak el
restrictImageDecoders();
// A képpontkorlát (élesben kisebb, L32) és a sharp gyorsítótárának kikapcsolása (memória)
configureImageMemory(env.IMAGE_MAX_MEGAPIXELS);
// Folyamatonként egy Prisma-kliens (egy kapcsolatkészlet); a modulok függőségként kapják meg. A
// távoli adatbázis kapcsolata ellenőrzött TLS-sel megy, ha a CA meg van adva (L32)
const prisma = createPrismaClient(env.DATABASE_URL, { sslCaFile: env.DATABASE_SSL_CA_FILE });
await connectDatabaseOrExit(prisma, logger);
// A képek tárhelye: fejlesztéskor a helyi lemez, élesben a Supabase Storage (L32)
const selectedStorage = createStorageFromEnv(env);
await checkStorageOrExit(selectedStorage, logger);
// A PhotoRegistry elérése; a regisztrációs tranzakciókat a platform-tárca írja alá (terv D5)
const blockchain = createBlockchainServiceOrExit(env, logger);
const photoRegistration = createPhotoRegistration({ prisma, blockchain, logger });
// Helyi tárhelynél a nyilvános képeket az Express szolgálja ki a mappából, távolinál a szerver adja
// tovább a tárhelyről (mindkettő a /media útvonalon)
const app = createApp({
  env,
  logger,
  prisma,
  storage: selectedStorage.storage,
  publicUploadsDirectory: selectedStorage.publicUploadsDirectory,
  blockchain,
  photoRegistration,
  // A Stripe által hosztolt Checkout (teszt mód, terv D9): a kártyaadat a szerverhez el sem jut
  payments: createStripePaymentService(createStripeClient(env.STRIPE_SECRET_KEY)),
});
// A háttérben: a lánc ellenőrzése és a félbemaradt regisztrációk folytatása (egyik sem akasztja meg
// az indulást, és a hibájuk sem állítja le a szervert)
void reportChainHealth(blockchain, logger, 'startup');
void resumeRegistrations(photoRegistration, logger);
// Időnként a futó feladat nélkül maradt PENDING_CHAIN képeket is folytatjuk, és a lánc beállítását
// (tulajdonos, egyenleg) is újra megnézzük – egy kiszivárgott kulcs vagy kifogyó tárca így nem csak
// a következő induláskor derül ki (L30). Az időzítő nem tartja életben a folyamatot.
setInterval(() => {
  void resumeRegistrations(photoRegistration, logger);
  void reportChainHealth(blockchain, logger, 'periodic');
}, REGISTRATION_SWEEP_INTERVAL_MS).unref();

const server = app.listen(env.PORT, (error) => {
  if (error) {
    logger.fatal({ err: error }, `A szerver nem tudott elindulni a(z) ${env.PORT} porton`);
    process.exit(1);
  }
  logger.info(`A PhotoChain szerver fut: http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
// A kérés, a fejlécek és az üresjárati kapcsolat időkorlátja (lásd lib/httpTimeouts.ts): a lassú
// feltöltés nem foglalhat sokáig feltöltési helyet, a fordított proxy pedig nem kap lezárt kapcsolatot
configureHttpTimeouts(server);

// Leállításkor a folyamatban lévő kérések még befejeződnek, a lánc-regisztrációkra rövid ideig
// várunk (a félbemaradtak a következő induláskor folytatódnak), utána záródnak az adatbázis-kapcsolatok
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info(`${signal} – a szerver leáll`);
    closeGracefully(server, () => {
      void Promise.race([photoRegistration.close(), sleep(SHUTDOWN_GRACE_MS)])
        .then(() => prisma.$disconnect())
        .finally(() => process.exit(0));
    });
  });
}
