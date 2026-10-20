// A feltöltés kliensoldali ellenőrzése (L21): a mezők a szerver szabályait tükrözik
// (server/src/modules/photos/photos.schemas.ts, lib/text.ts – kódpontban mért hossz, látható
// karakterek, vezérlőkarakterek), a fájlt a típusa, a mérete és – ha a böngésző ki tudja olvasni – a
// felbontása alapján szűri még a küldés előtt.
import { describe, expect, it } from 'vitest';

import {
  checkImageDimensions,
  checkImageFile,
  imageHintOf,
  MAX_IMAGE_PIXELS,
  MAX_UPLOAD_BYTES,
  maxImageMegapixelsFrom,
  MIN_IMAGE_EDGE_PX,
  UPLOAD_FIELDS,
  UPLOAD_HINT,
  type UploadValues,
  validateUploadFields,
} from './uploadValidation';

// L32: élesben a szerver képpontkorlátja kisebb lehet (512 MB-os tárhely) – a kliens buildje ugyanazt
// az értéket kapja (VITE_IMAGE_MAX_MEGAPIXELS), hogy a súgó és az előzetes ellenőrzés egyezzen vele
describe('maxImageMegapixelsFrom (L32)', () => {
  it('a build értékét használja (1–50 közötti egész)', () => {
    expect(maxImageMegapixelsFrom('25')).toBe(25);
    expect(maxImageMegapixelsFrom('1')).toBe(1);
    expect(maxImageMegapixelsFrom('50')).toBe(50);
  });

  it('hiányzó vagy érvénytelen értéknél a szerver alapértékét (50) adja', () => {
    for (const value of [undefined, '', '0', '51', '2.5', 'sok', ' 25']) {
      expect(maxImageMegapixelsFrom(value)).toBe(50);
    }
  });

  it('a build nélkül (fejlesztés, tesztek) a korlát 50 megapixel', () => {
    expect(MAX_IMAGE_PIXELS).toBe(50_000_000);
  });
});

const NBSP = '\u00A0';

const values = (overrides: Partial<UploadValues> = {}): UploadValues => ({
  title: 'Őszi erdő ködben',
  description: '',
  priceHuf: '12 500',
  categoryId: '3',
  ...overrides,
});

const file = (name: string, type: string, size = 1024) =>
  new File([new Uint8Array(size)], name, { type });

describe('validateUploadFields', () => {
  it('a kitöltött űrlap hibátlan; a leírás nem kötelező', () => {
    expect(validateUploadFields(values())).toEqual({});
    expect(UPLOAD_FIELDS).toEqual(['title', 'description', 'priceHuf', 'categoryId']);
  });

  it('a cím: kötelező, 3–120 karakter (kódpontban, a láthatatlanok nélkül), vezérlőkarakter nélkül, legalább egy betűvel vagy számmal', () => {
    expect(validateUploadFields(values({ title: '' })).title).toBe('Add meg a kép címét.');
    expect(validateUploadFields(values({ title: '  ' })).title).toBe('Add meg a kép címét.');
    expect(validateUploadFields(values({ title: 'ab' })).title).toBe(
      'A cím legalább 3 karakter legyen.',
    );
    // A nulla szélességű szóköz nem számít a minimumba
    expect(validateUploadFields(values({ title: `ab${'\u200B'.repeat(5)}` })).title).toBe(
      'A cím legalább 3 karakter legyen.',
    );
    // Kiegészítő síkú betű: a szerver (Zod 4) kódpontban mér – 120 még jó, 121 már nem
    const astral = String.fromCodePoint(0x1d400);
    expect(validateUploadFields(values({ title: astral.repeat(120) })).title).toBeUndefined();
    expect(validateUploadFields(values({ title: astral.repeat(121) })).title).toBe(
      'A cím legfeljebb 120 karakter lehet.',
    );
    expect(validateUploadFields(values({ title: 'Kép\ncím' })).title).toBe(
      'A cím nem tartalmazhat sortörést vagy vezérlőkaraktert.',
    );
    expect(validateUploadFields(values({ title: 'kep\u202Egpj' })).title).toBe(
      'A cím nem tartalmazhat sortörést vagy vezérlőkaraktert.',
    );
    expect(validateUploadFields(values({ title: '!!! ???' })).title).toBe(
      'A cím tartalmazzon legalább egy betűt vagy számot.',
    );
  });

  it('a leírás: legfeljebb 2000 karakter (a Windows-sortörés egy karakter), sortörés és tabulátor megengedett, más vezérlőkarakter nem', () => {
    expect(validateUploadFields(values({ description: 'a'.repeat(2000) })).description).toBe(
      undefined,
    );
    expect(
      validateUploadFields(values({ description: `${'a'.repeat(1998)}\r\nb` })).description,
    ).toBeUndefined();
    expect(validateUploadFields(values({ description: 'a'.repeat(2001) })).description).toBe(
      'A leírás legfeljebb 2000 karakter lehet.',
    );
    expect(validateUploadFields(values({ description: 'első sor\n\tmásodik' })).description).toBe(
      undefined,
    );
    expect(validateUploadFields(values({ description: 'a\u0000b' })).description).toBe(
      'A leírás nem tartalmazhat vezérlőkaraktert.',
    );
  });

  it('az ár: kötelező egész forintösszeg (szóközzel tagolva is), 175 és 9 999 999 Ft között', () => {
    expect(validateUploadFields(values({ priceHuf: '' })).priceHuf).toBe('Add meg az árat.');
    expect(validateUploadFields(values({ priceHuf: '12 500' })).priceHuf).toBeUndefined();
    expect(validateUploadFields(values({ priceHuf: `9${NBSP}999${NBSP}999` })).priceHuf).toBe(
      undefined,
    );
    for (const text of ['12,5', '12.5', '-5', 'abc', '1e4', '5 000 Ft']) {
      expect(validateUploadFields(values({ priceHuf: text })).priceHuf).toBe(
        'Az ár egész forintösszeg legyen (pl. 12 500).',
      );
    }
    expect(validateUploadFields(values({ priceHuf: '174' })).priceHuf).toBe(
      'Az ár legalább 175 Ft legyen.',
    );
    expect(validateUploadFields(values({ priceHuf: '175' })).priceHuf).toBeUndefined();
    expect(validateUploadFields(values({ priceHuf: '10000000' })).priceHuf).toBe(
      'Az ár legfeljebb 9 999 999 Ft lehet.',
    );
    expect(validateUploadFields(values({ priceHuf: '0000175' })).priceHuf).toBeUndefined();
  });

  it('a kategória kötelező', () => {
    expect(validateUploadFields(values({ categoryId: '' })).categoryId).toBe('Válassz kategóriát.');
  });
});

describe('checkImageFile', () => {
  it('JPEG, PNG és WebP kép elfogadott – a típus a böngésző szerinti MIME-típusból, annak hiányában a kiterjesztésből', () => {
    expect(checkImageFile(file('kep.jpg', 'image/jpeg'))).toBeUndefined();
    expect(checkImageFile(file('kep.png', 'image/png'))).toBeUndefined();
    expect(checkImageFile(file('kep.webp', 'image/webp'))).toBeUndefined();
    expect(checkImageFile(file('kep.JPEG', ''))).toBeUndefined();
  });

  it('más típus (szöveg, GIF, kiterjesztés nélküli ismeretlen) elutasítva', () => {
    for (const candidate of [
      file('jegyzet.txt', 'text/plain'),
      file('anim.gif', 'image/gif'),
      file('kep.svg', 'image/svg+xml'),
      file('ismeretlen', ''),
      file('kep.jpg.exe', 'application/octet-stream'),
    ]) {
      expect(checkImageFile(candidate)).toBe('Csak JPEG, PNG vagy WebP kép tölthető fel.');
    }
  });

  it('a 15 MB-nál nagyobb fájl elutasítva, a méretek kiírásával; a határ még jó', () => {
    expect(MAX_UPLOAD_BYTES).toBe(15 * 1024 * 1024);
    expect(checkImageFile(file('kep.jpg', 'image/jpeg', MAX_UPLOAD_BYTES))).toBeUndefined();
    // A korlát egész MB-ban (mint a súgóban), a fájl mérete egy tizedessel
    expect(checkImageFile(file('kep.jpg', 'image/jpeg', MAX_UPLOAD_BYTES + 1))).toBe(
      `A fájl túl nagy: legfeljebb 15 MB lehet (a kiválasztott fájl 15,0${NBSP}MB).`,
    );
    expect(checkImageFile(file('kep.jpg', 'image/jpeg', 19_000_000))).toBe(
      `A fájl túl nagy: legfeljebb 15 MB lehet (a kiválasztott fájl 18,1${NBSP}MB).`,
    );
  });
});

describe('checkImageDimensions', () => {
  it('a rövidebb oldal legalább 600 képpont (a szerver korlátja)', () => {
    expect(MIN_IMAGE_EDGE_PX).toBe(600);
    expect(checkImageDimensions(600, 4000)).toBeUndefined();
    expect(checkImageDimensions(4000, 600)).toBeUndefined();
    expect(checkImageDimensions(480, 320)).toBe(
      'A kép túl kicsi: a rövidebb oldala legalább 600 képpont legyen (a kiválasztott kép 480 × 320 képpontos).',
    );
    expect(checkImageDimensions(6000, 599)).toBe(
      'A kép túl kicsi: a rövidebb oldala legalább 600 képpont legyen (a kiválasztott kép 6000 × 599 képpontos).',
    );
  });

  it('legfeljebb 50 megapixel (a szerver dekódolási korlátja – a „tömörített bomba” ellen)', () => {
    expect(MAX_IMAGE_PIXELS).toBe(50_000_000);
    expect(checkImageDimensions(8660, 5773)).toBeUndefined();
    expect(checkImageDimensions(9000, 6000)).toBe(
      'A kép túl nagy: legfeljebb 50 megapixel lehet (a kiválasztott kép 9000 × 6000 képpontos).',
    );
  });

  it('a rövidebb oldal korlátja megadható (az ellenőrzésnél 100 képpont – L24)', () => {
    expect(checkImageDimensions(100, 4000, 100)).toBeUndefined();
    expect(checkImageDimensions(400, 99, 100)).toBe(
      'A kép túl kicsi: a rövidebb oldala legalább 100 képpont legyen (a kiválasztott kép 400 × 99 képpontos).',
    );
  });
});

describe('UPLOAD_HINT', () => {
  it('a korlátok előre látszanak, a hibaüzenetek szóhasználatával (MB, megapixel, képpont)', () => {
    expect(UPLOAD_HINT).toBe(
      'JPEG, PNG vagy WebP · legfeljebb 15 MB és 50 megapixel · a rövidebb oldal legalább 600 képpont',
    );
    expect(imageHintOf(100)).toBe(
      'JPEG, PNG vagy WebP · legfeljebb 15 MB és 50 megapixel · a rövidebb oldal legalább 100 képpont',
    );
  });
});
