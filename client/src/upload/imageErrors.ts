// A szerver kép- és kérésformátum-hibái (server/src/middleware/upload.ts, services/imageAnalysis.ts;
// README – a feltöltés és az ellenőrzés hibakódjai). A feltöltés (L21) és a hitelesség-ellenőrzés (L24)
// ugyanúgy teszi a helyére: a kép hibája a fogadóterülethez, a hibás vagy megszakadt kérésé riasztásként –
// a fejlesztői üzenet helyett a felhasználónak szóló szöveggel.
import type { ApiError } from '../api/http';
import { serverFieldErrors } from '../auth/validation';
import { toSentence } from '../lib/text';

/** A szerver a képet utasította el */
export const IMAGE_ERROR_CODES: ReadonlySet<string> = new Set([
  'IMAGE_TOO_SMALL',
  'IMAGE_TOO_LARGE',
  'LOW_DETAIL_IMAGE',
  'UNSUPPORTED_IMAGE',
  'PAYLOAD_TOO_LARGE',
]);

/** A kérés formája hibás vagy megszakadt (a szerver fejlesztői üzenete helyett a felhasználónak szóló) */
export const RETRY_CODES: ReadonlySet<string> = new Set([
  'INVALID_UPLOAD',
  'UNSUPPORTED_MEDIA_TYPE',
]);
export const RETRY_TEXT = 'A kérés nem érkezett meg hiánytalanul – próbáld újra.';

/** A kép hibájának szövege a szerver válaszából – vagy undefined, ha nem a képről szól. */
export function imageErrorOf(error: ApiError): string | undefined {
  if (IMAGE_ERROR_CODES.has(error.code)) return toSentence(error.message);
  return serverFieldErrors(error, ['image']).image;
}
