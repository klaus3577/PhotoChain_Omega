// A nyilvános hitelesség-ellenőrző HTTP-rétege. Mindhárom eredmény (VERIFIED, SIMILAR, NOT_FOUND)
// 200-as válasz: az ellenőrzés lefutott, az eredményt a `result` mező adja.
import type { RequestHandler } from 'express';

import { AppError } from '../../lib/errors.js';
import { IMAGE_FIELD_NAME } from '../../middleware/upload.js';
import { verifyHashParamsSchema } from './verification.schemas.js';
import type { VerificationService } from './verification.service.js';

export interface VerificationController {
  /** A fájl fogadása ELŐTT: ha a lánc most úgysem olvasható, a fájlt be sem olvassuk (503) */
  ensureChainReadable: RequestHandler;
  verifyFile: RequestHandler;
  verifyHash: RequestHandler;
}

export function createVerificationController(
  verificationService: VerificationService,
): VerificationController {
  return {
    ensureChainReadable: (_req, _res, next) => {
      verificationService.ensureChainReadable();
      next();
    },

    // A fájlt a multer (middleware/upload.ts) a memóriába olvasta – innen nem kerül sehova tovább
    verifyFile: async (req, res) => {
      if (!req.file) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', [
          { path: IMAGE_FIELD_NAME, message: 'képfájl kötelező' },
        ]);
      }
      res.json({ data: await verificationService.verifyFile(req.file.buffer) });
    },

    // Hibás hash: a séma ZodError-t dob, ebből a hibakezelő 400-as VALIDATION_ERROR-t készít
    verifyHash: async (req, res) => {
      const { sha256 } = verifyHashParamsSchema.parse(req.params);
      res.json({ data: await verificationService.verifyHash(sha256) });
    },
  };
}
