// A galéria nézete az URL-ben (megosztható, a vissza gomb is működik): keresőszó, kategória, ár-tartomány,
// rendezés, oldal. Az URL kézzel is szerkeszthető, ezért a beolvasás a szerver szabályait követi
// (server/src/modules/photos/photos.schemas.ts): az érvénytelen értéket elhagyja – a szerver 400-at adna
// rá –, így egy elrontott hivatkozás is használható galériát ad.
import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  clearAllLabel,
  DEFAULT_GALLERY_PARAMS,
  galleryApiQuery,
  gallerySearchParams,
  galleryTitle,
  isFiltering,
  MAX_GALLERY_PAGE,
  parseGalleryParams,
  parsePriceInput,
  searchFromInput,
} from './galleryParams';

const parse = (query: string) => parseGalleryParams(new URLSearchParams(query));

describe('parseGalleryParams', () => {
  it('üres URL-nél az alapértékek: nincs szűrő, a legújabb elöl, első oldal', () => {
    expect(parse('')).toEqual({
      q: '',
      categoryId: null,
      minPrice: null,
      maxPrice: null,
      sort: 'newest',
      page: 1,
    });
    expect(DEFAULT_GALLERY_PARAMS).toEqual(parse(''));
  });

  it('az érvényes paramétereket beolvassa (a keresőszót körülvágva)', () => {
    expect(
      parse('q=%20erd%C5%91%20&categoryId=3&minPrice=5000&maxPrice=20000&sort=price_asc&page=2'),
    ).toEqual({
      q: 'erdő',
      categoryId: 3,
      minPrice: 5000,
      maxPrice: 20000,
      sort: 'price_asc',
      page: 2,
    });
  });

  it('a vezető nullák nem számítanak a szám hosszába (a szerver is így olvassa)', () => {
    expect(parse('minPrice=0005000').minPrice).toBe(5000);
    expect(parse('page=00000000000000000002').page).toBe(2);
    expect(parse('categoryId=0000').categoryId).toBeNull();
  });

  it('az érvénytelen értéket elhagyja (a szerver 400-at adna rá)', () => {
    for (const query of [
      'categoryId=abc',
      'categoryId=0',
      'categoryId=1.5',
      'categoryId=2147483648',
      'minPrice=-5',
      'minPrice=10000000',
      'maxPrice=5e3',
      'page=0',
      'page=1001',
      'page=abc',
      'sort=random',
      'minPrice=',
    ]) {
      expect(parse(query)).toEqual(DEFAULT_GALLERY_PARAMS);
    }
  });

  it('ha a minimális ár nagyobb a maximálisnál, egyik sem érvényes', () => {
    expect(parse('minPrice=9000&maxPrice=5000')).toMatchObject({ minPrice: null, maxPrice: null });
    expect(parse('minPrice=5000&maxPrice=5000')).toMatchObject({ minPrice: 5000, maxPrice: 5000 });
  });

  it('a vezérlőkaraktert tartalmazó keresőszót elhagyja, a túl hosszút 100 karakterre vágja', () => {
    expect(parse('q=erd%C5%91%0Aerd%C5%91').q).toBe('');
    expect(parse('q=a%E2%80%AEb').q).toBe('');
    const astral = String.fromCodePoint(0x1d400);
    const long = parse(`q=${encodeURIComponent(astral.repeat(120))}`).q;
    expect([...long]).toHaveLength(100);
    // A 100 kódpontos keresőszó még belefér; a levágott szó végéről a szóköz lemarad
    expect(parse(`q=${'a'.repeat(100)}`).q).toBe('a'.repeat(100));
    expect(parse(`q=${encodeURIComponent(`${'a'.repeat(99)} ${'b'.repeat(20)}`)}`).q).toBe(
      'a'.repeat(99),
    );
  });
});

describe('gallerySearchParams', () => {
  it('csak az alapértéktől eltérő paraméterek kerülnek az URL-be', () => {
    expect(gallerySearchParams(DEFAULT_GALLERY_PARAMS).toString()).toBe('');
    expect(
      gallerySearchParams({
        q: 'erdő',
        categoryId: 3,
        minPrice: 5000,
        maxPrice: null,
        sort: 'oldest',
        page: 2,
      }).toString(),
    ).toBe('q=erd%C5%91&categoryId=3&minPrice=5000&sort=oldest&page=2');
  });
});

describe('galleryApiQuery', () => {
  it('a szerver lekérdezése: az URL paraméterei és az oldalméret (24)', () => {
    expect(galleryApiQuery(DEFAULT_GALLERY_PARAMS)).toBe('?pageSize=24');
    expect(galleryApiQuery({ ...DEFAULT_GALLERY_PARAMS, q: 'tó part', page: 3 })).toBe(
      '?q=t%C3%B3+part&page=3&pageSize=24',
    );
  });
});

describe('activeFilterCount', () => {
  it('a kategória és az ár-tartomány egy-egy szűrő (a keresőszó és a rendezés nem)', () => {
    expect(activeFilterCount(DEFAULT_GALLERY_PARAMS)).toBe(0);
    expect(
      activeFilterCount({ ...DEFAULT_GALLERY_PARAMS, q: 'erdő', sort: 'oldest', categoryId: 3 }),
    ).toBe(1);
    expect(
      activeFilterCount({ ...DEFAULT_GALLERY_PARAMS, categoryId: 3, minPrice: 1, maxPrice: 9 }),
    ).toBe(2);
    expect(activeFilterCount({ ...DEFAULT_GALLERY_PARAMS, maxPrice: 9 })).toBe(1);
  });
});

describe('parsePriceInput', () => {
  it('egész forintösszeg, szóközzel tagolva is; az üres mező „nincs szűrő”', () => {
    expect(parsePriceInput('5000')).toBe(5000);
    expect(parsePriceInput(' 5 000 ')).toBe(5000);
    expect(parsePriceInput(`5${String.fromCharCode(0xa0)}000`)).toBe(5000);
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('   ')).toBeNull();
  });

  it('a nem egész, negatív vagy túl nagy összeg érvénytelen', () => {
    for (const text of ['5,5', '-1', '10000000', 'abc', '1e4']) {
      expect(parsePriceInput(text)).toBe('invalid');
    }
  });
});

describe('searchFromInput', () => {
  it('a beírt keresőszó vezérlőkaraktere (pl. beillesztett tabulátor) szóköz lesz – a keresés nem vész el', () => {
    expect(searchFromInput('  tócsa\ttükör  ')).toBe('tócsa tükör');
    expect(searchFromInput('ő\u0000sz')).toBe('ő sz');
    expect(searchFromInput('\t')).toBe('');
  });
});

describe('isFiltering és clearAllLabel', () => {
  it('a keresőszó és a szűrők szűkítik a találatokat – a rendezés és az oldal nem', () => {
    expect(isFiltering(parse(''))).toBe(false);
    expect(isFiltering(parse('sort=oldest&page=3'))).toBe(false);
    expect(isFiltering(parse('q=t%C3%B3'))).toBe(true);
    expect(isFiltering(parse('maxPrice=9000'))).toBe(true);
  });

  it('a törlés gomb neve azt mondja meg, amit töröl: a keresést, a szűrőket vagy mindkettőt', () => {
    expect(clearAllLabel(parse('categoryId=1'))).toBe('Szűrők törlése');
    expect(clearAllLabel(parse('q=t%C3%B3'))).toBe('Keresés törlése');
    expect(clearAllLabel(parse('q=t%C3%B3&maxPrice=9000'))).toBe('Keresés és szűrők törlése');
  });
});

describe('galleryTitle', () => {
  it('a böngészőfül címe a keresőszót és az oldalt is megmondja', () => {
    expect(galleryTitle(parse(''))).toBe('Galéria');
    expect(galleryTitle(parse('categoryId=1&sort=oldest'))).toBe('Galéria');
    expect(galleryTitle(parse('q=t%C3%B3'))).toBe('Galéria – „tó”');
    expect(galleryTitle(parse('page=2'))).toBe('Galéria – 2. oldal');
    expect(galleryTitle(parse('q=t%C3%B3&page=3'))).toBe('Galéria – „tó” – 3. oldal');
  });
});

describe('MAX_GALLERY_PAGE', () => {
  it('a legnagyobb oldalszám a szerver korlátja: a nagyobbat a beolvasás elhagyja', () => {
    expect(parse(`page=${MAX_GALLERY_PAGE}`).page).toBe(MAX_GALLERY_PAGE);
    expect(parse(`page=${MAX_GALLERY_PAGE + 1}`).page).toBe(1);
  });
});
