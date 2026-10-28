// A beérkező képfájl vizsgálata: ép-e, támogatott-e a formátuma és a mérete, valamint a két
// ujjlenyomata (SHA-256, dHash). A feltöltés (photos) és a nyilvános hitelesség-ellenőrzés
// (verification) közös lépése; a kép hibáiból a kliensnek szóló 4xx hiba (AppError) lesz.
import type { Logger } from 'pino';

import { AppError } from '../lib/errors.js';
import {
  dHashFromGrid,
  dHashRowBytes,
  InvalidImageError,
  rowBrightnessRanges,
  sha256,
  toDHashGrid,
} from './hashing.service.js';
import {
  type ImageInfo,
  ImageTooLargeError,
  ImageTooSmallError,
  inspectImage,
  UnsupportedImageError,
} from './image.service.js';
import { currentMaxImagePixels } from './imageDecoding.js';

/**
 * Ha a 9×8-as szürke kép egy sorában a legvilágosabb és a legsötétebb cella között ennél kisebb a
 * különbség, a sor gyakorlatilag egyszínű: a pontosan egyszínű sor csupa 0 bitet ad, a közel
 * egyszínű sor bitjei pedig zajból jönnek (a kép két másolatában más-más) – egyik sem információ.
 */
const MIN_BRIGHTNESS_RANGE = 16;

/**
 * A sor bájtja csupa 0 (a sor egyszínű, vagy balról jobbra végig sötétedik) vagy csupa 1 (végig
 * világosodik): a szomszédpárok mind ugyanabba az irányba változnak, a sor bitjei nem különböztetik
 * meg a képet más ilyen képektől.
 */
const UNIFORM_ROW_BYTES = new Set([0x00, 0xff]);

/**
 * Legalább ennyi informatív sor kell, hogy a kép ujjlenyomata használható legyen. Egy sor akkor
 * informatív, ha van benne MIN_BRIGHTNESS_RANGE fényességkülönbség, és a bájtja nem egységes
 * (UNIFORM_ROW_BYTES). A dHash soronként a szomszédos cellákat veti össze, ezért a soronként egyszínű
 * kép (függőleges fényességátmenet, vízszintes sávok) hash-e csupa 0, a balról jobbra végig
 * világosodó vagy sötétedő képé (vízszintes vagy átlós átmenet) csupa 1 vagy csupa 0 – akármekkora
 * a kontraszt –, és minden más ilyen kép „másolatának” számítana; a kép egészének
 * fényességtartománya egyiket sem szűri ki (témavezetői észrevétel, 2026-10-27). Mérés: a saját
 * tesztfotókon 5–8 informatív sor van, a gyertyás kép 20 %-kal sötétebb másolatán 3; a témavezető
 * két példaképén, a képpontonként véletlen zajon és egy folttal kiegészített átmeneten 0–2. A 3 sor
 * (24 bit) a mért fotókat még átengedi; az ennél kevesebb bitből álló ujjlenyomat más ilyen képtől
 * nem különböztetné meg a képet. A gyakorlatilag egyszínű képet ugyanez a szabály szűri ki.
 */
const MIN_INFORMATIVE_ROWS = 3;

const PIXELS_PER_MEGAPIXEL = 1_000_000;

export interface AnalysedImage {
  info: ImageInfo;
  sha256: string;
  dHash: string;
}

/** A vizsgálat szabályai – a feltöltésnél és a hitelesség-ellenőrzésnél eltérnek. */
export interface ImageRules {
  /** A kép rövidebb oldalának legkisebb mérete képpontban */
  minEdgePx: number;
  /** Mit tehet a kliens az ilyen képpel – a hibaüzenetekbe kerül („tölthető fel”, „ellenőrizhető”) */
  action: string;
}

/** A képfeldolgozás hibáiból a kliensnek szóló 4xx hiba lesz; minden más hiba továbbmegy. */
function toImageAppError(error: unknown, { minEdgePx, action }: ImageRules): unknown {
  if (error instanceof UnsupportedImageError || error instanceof InvalidImageError) {
    return new AppError(415, 'UNSUPPORTED_IMAGE', `Csak ép JPEG-, PNG- vagy WebP-kép ${action}`);
  }
  if (error instanceof ImageTooSmallError) {
    return new AppError(
      400,
      'IMAGE_TOO_SMALL',
      `A kép mindkét oldala legalább ${minEdgePx} képpont legyen`,
    );
  }
  if (error instanceof ImageTooLargeError) {
    return new AppError(
      400,
      'IMAGE_TOO_LARGE',
      `A kép legfeljebb ${currentMaxImagePixels() / PIXELS_PER_MEGAPIXEL} megapixeles lehet`,
    );
  }
  return error;
}

/**
 * A kliensnek 415 a válasz, de ha a képdekóder (sharp) hibája van mögötte, annak oka a naplóba
 * kerül: egy szerveroldali gond (pl. elfogyott memória, időtúllépés) így nem marad rejtve.
 */
function logDecoderFailure(error: unknown, logger: Logger): void {
  const isImageError = error instanceof UnsupportedImageError || error instanceof InvalidImageError;
  if (isImageError && error.cause !== undefined) {
    logger.warn({ err: error }, 'A feltöltött fájl nem dolgozható fel képként');
  }
}

/** A képfeldolgozás hibája: naplózás (ha dekóderhiba van mögötte), majd a kliensnek szóló hiba. */
export function imageFailure(error: unknown, logger: Logger, rules: ImageRules): unknown {
  logDecoderFailure(error, logger);
  return toImageAppError(error, rules);
}

/** Van-e elég informatív sor a 9×8-as rácsban ahhoz, hogy a dHash használható ujjlenyomat legyen. */
function hasUsableFingerprint(grid: Uint8Array): boolean {
  const rowBytes = dHashRowBytes(grid);
  const informativeRows = rowBrightnessRanges(grid).filter(
    (range, row) => range >= MIN_BRIGHTNESS_RANGE && !UNIFORM_ROW_BYTES.has(rowBytes[row] ?? 0),
  );
  return informativeRows.length >= MIN_INFORMATIVE_ROWS;
}

/** A fájl ellenőrzése és a két ujjlenyomat kiszámítása. */
export async function analyseImage(
  file: Buffer,
  logger: Logger,
  rules: ImageRules,
): Promise<AnalysedImage> {
  try {
    const info = await inspectImage(file, rules.minEdgePx);
    const grid = await toDHashGrid(file);
    if (!hasUsableFingerprint(grid)) {
      throw new AppError(
        400,
        'LOW_DETAIL_IMAGE',
        'A kép túl kevés részletet tartalmaz (egyszínű, vagy csak egy irányban változik) – ' +
          `nem ${rules.action}`,
      );
    }
    return { info, sha256: sha256(file), dHash: dHashFromGrid(grid) };
  } catch (error) {
    throw imageFailure(error, logger, rules);
  }
}
