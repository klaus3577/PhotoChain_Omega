// A beérkező képfájl vizsgálata: ép-e, támogatott-e a formátuma és a mérete, valamint a két
// ujjlenyomata (SHA-256, dHash). A feltöltés (photos) és a nyilvános hitelesség-ellenőrzés
// (verification) közös lépése; a kép hibáiból a kliensnek szóló 4xx hiba (AppError) lesz.
import type { Logger } from 'pino';

import { AppError } from '../lib/errors.js';
import { dHashFromGrid, InvalidImageError, sha256, toDHashGrid } from './hashing.service.js';
import {
  type ImageInfo,
  ImageTooLargeError,
  ImageTooSmallError,
  inspectImage,
  UnsupportedImageError,
} from './image.service.js';
import { currentMaxImagePixels } from './imageDecoding.js';

/**
 * Ha a 9×8-as szürke kép legvilágosabb és legsötétebb pontja között ennél kisebb a különbség, a kép
 * gyakorlatilag egyszínű: a dHash-e csupa 0 lenne, és minden más egyszínű kép „másolatának” számítana.
 */
const MIN_BRIGHTNESS_RANGE = 16;

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

/** A fájl ellenőrzése és a két ujjlenyomat kiszámítása. */
export async function analyseImage(
  file: Buffer,
  logger: Logger,
  rules: ImageRules,
): Promise<AnalysedImage> {
  try {
    const info = await inspectImage(file, rules.minEdgePx);
    const grid = await toDHashGrid(file);
    if (Math.max(...grid) - Math.min(...grid) < MIN_BRIGHTNESS_RANGE) {
      throw new AppError(
        400,
        'LOW_DETAIL_IMAGE',
        `A kép gyakorlatilag egyszínű – nem ${rules.action}`,
      );
    }
    return { info, sha256: sha256(file), dHash: dHashFromGrid(grid) };
  } catch (error) {
    throw imageFailure(error, logger, rules);
  }
}
