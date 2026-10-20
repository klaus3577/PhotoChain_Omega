// Képfeltöltés fogadása (multipart/form-data) a multerrel: egyetlen fájl, a memóriában tartva – a
// feldolgozás (hash, előnézet) úgyis a teljes tartalmat igényli, a méretet pedig korlát védi.
// Forrás: multer README (memoryStorage, limits, hibakezelés), https://github.com/expressjs/multer
// (adaptálva)
import type { RequestHandler } from 'express';
import multer from 'multer';

import { AppError } from '../lib/errors.js';

/** A képfájl mezőneve az űrlapban */
export const IMAGE_FIELD_NAME = 'image';

const MAX_TEXT_FIELDS = 10;
const MAX_TEXT_FIELD_BYTES = 10 * 1024;
const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * A multer (és az alatta futó busboy) hibáiból a kliensnek szóló 4xx hiba lesz: ezeket a kérés
 * tartalma váltja ki (túl nagy fájl, sérült űrlap, váratlan mező).
 */
function toUploadError(error: unknown, maxBytes: number): AppError {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    const megabytes = (maxBytes / BYTES_PER_MEGABYTE).toFixed(1);
    return new AppError(413, 'PAYLOAD_TOO_LARGE', `A fájl túl nagy (legfeljebb ${megabytes} MB)`);
  }
  return new AppError(
    400,
    'INVALID_UPLOAD',
    `A feltöltés nem dolgozható fel: a szöveges mezők mellett egyetlen képfájl küldhető, „${IMAGE_FIELD_NAME}” néven`,
  );
}

export function createImageUpload(maxBytes: number): RequestHandler {
  const receiveSingleImage = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: MAX_TEXT_FIELDS,
      fieldSize: MAX_TEXT_FIELD_BYTES,
      // Az űrlap mezői egyszerű nevűek: az „a[b]”, „a[5]” alakú nevekből a multer egymásba
      // ágyazott objektumot, illetve (nagy indexnél óriási) tömböt építene – a szögletes
      // zárójeles mezőnevet ezért elutasítja
      fieldNestingDepth: 0,
    },
  }).single(IMAGE_FIELD_NAME);

  return (req, res, next) => {
    // A multer a nem multipart kérést szó nélkül továbbengedné (fájl és mezők nélkül)
    if (!req.is('multipart/form-data')) {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'A feltöltést multipart/form-data űrlapként kell küldeni',
      );
    }
    receiveSingleImage(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      // A kliens hibája nem szerverhiba, de a naplóban nyoma marad (pl. egy váratlan belső hibának).
      // Ha a kliens maga szakította meg a feltöltést, az csak hibakeresési szintű bejegyzés.
      const clientAborted = req.readableAborted || req.destroyed;
      req.log?.[clientAborted ? 'debug' : 'warn'](
        { err: error },
        'A feltöltés fogadása nem sikerült',
      );
      next(toUploadError(error, maxBytes));
    });
  };
}
