// A hitelesség-ellenőrzés kliensoldali szabályai (L24). A kép korlátai a feltöltéséi
// (upload/uploadValidation.ts), de a rövidebb oldal már 100 képponttól ellenőrizhető – a szerver
// VERIFY_MIN_EDGE_PX-e (verification.service.ts): a bélyegkép és a weben talált kicsinyített másolat is
// ellenőrizhető legyen. A hash mező a szerver sémáját tükrözi (verification.schemas.ts): 64 hexadecimális
// karakter, a 0x előtag és a nagybetű elfogadott – a végső döntés a szerveré.
import { normalizeSha256 } from '../api/verify.api';
import { type FieldErrors, onlyErrors } from '../auth/validation';
import { imageHintOf } from '../upload/uploadValidation';

/** Az ellenőrizhető kép rövidebb oldalának legkisebb mérete (a szerver korlátja) */
export const VERIFY_MIN_EDGE_PX = 100;
/** A fogadóterület súgója – a korlátok előre látszanak */
export const VERIFY_HINT = imageHintOf(VERIFY_MIN_EDGE_PX);

export const HASH_FIELDS = ['sha256'] as const;
export type HashField = (typeof HASH_FIELDS)[number];
export type HashValues = Record<HashField, string>;
export const HASH_HINT = '64 hexadecimális karakter; a 0x előtag elhagyható.';

function validateSha256(value: string): string | undefined {
  if (value.trim() === '') return 'Add meg a SHA-256 hash-t.';
  if (normalizeSha256(value) === null)
    return 'A SHA-256 hash 64 hexadecimális karakter (0–9, a–f).';
  return undefined;
}

export const validateHashFields = (values: HashValues): FieldErrors<HashField> =>
  onlyErrors({ sha256: validateSha256(values.sha256) });
