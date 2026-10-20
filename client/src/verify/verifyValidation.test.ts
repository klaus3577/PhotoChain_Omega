// A hitelesség-ellenőrzés kliensoldali szabályai (L24): a kép korlátai a feltöltéséi, de a rövidebb
// oldal már 100 képponttól ellenőrizhető (a szerver VERIFY_MIN_EDGE_PX-e – a bélyegkép és a weben
// talált kicsinyített másolat is); a hash mező a szerver sémáját tükrözi (64 hexa karakter, a 0x előtag
// és a nagybetű elfogadott).
import { describe, expect, it } from 'vitest';

import { SHA256 } from '../test/photos';
import {
  HASH_FIELDS,
  HASH_HINT,
  validateHashFields,
  VERIFY_HINT,
  VERIFY_MIN_EDGE_PX,
} from './verifyValidation';

describe('VERIFY_HINT', () => {
  it('a feltöltés korlátai, de a rövidebb oldal már 100 képponttól (bélyegkép, kicsinyített másolat)', () => {
    expect(VERIFY_MIN_EDGE_PX).toBe(100);
    expect(VERIFY_HINT).toBe(
      'JPEG, PNG vagy WebP · legfeljebb 15 MB és 50 megapixel · a rövidebb oldal legalább 100 képpont',
    );
  });
});

describe('validateHashFields', () => {
  it('egyetlen mező: a SHA-256 hash; a súgó a formát mondja', () => {
    expect(HASH_FIELDS).toEqual(['sha256']);
    expect(HASH_HINT).toBe('64 hexadecimális karakter; a 0x előtag elhagyható.');
  });

  it('a 64 hexa karakter jó – kis- és nagybetűvel, 0x előtaggal, körülötte szóközzel is', () => {
    expect(validateHashFields({ sha256: SHA256 })).toEqual({});
    expect(validateHashFields({ sha256: ` 0x${SHA256.toUpperCase()} ` })).toEqual({});
  });

  it('üresen kötelező, más alak hibás – teljes mondattal', () => {
    expect(validateHashFields({ sha256: '' }).sha256).toBe('Add meg a SHA-256 hash-t.');
    expect(validateHashFields({ sha256: '   ' }).sha256).toBe('Add meg a SHA-256 hash-t.');
    for (const text of ['nem-hash', SHA256.slice(0, 63), `${SHA256}0`, SHA256.replace('a', 'g')]) {
      expect(validateHashFields({ sha256: text }).sha256).toBe(
        'A SHA-256 hash 64 hexadecimális karakter (0–9, a–f).',
      );
    }
  });
});
