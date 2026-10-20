// A feltöltés szöveges mezőinek sémája: a multipart űrlapban minden érték szöveg (vagy – ha egy
// mező többször szerepel – tömb), ezért a határeseteket külön ellenőrizzük. A láthatatlan és
// vezérlőkaraktereket kódpontjukkal állítjuk elő, hogy a forrásfájlban ne szerepeljenek.
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  createPhotoSchema,
  listPhotosQuerySchema,
  PHOTO_SORTS,
  updatePhotoSchema,
} from './photos.schemas.js';

const VALID = { title: 'Tócsa tükröződéssel', priceHuf: '2500', categoryId: '3' };
const OWNER_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';
const SORT_MESSAGE = 'a rendezés lehetséges értékei: newest, oldest, price_asc, price_desc';

const NUL = String.fromCodePoint(0);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);

/** A hibás mezők és az első (legfontosabb) üzenetük: { mező: üzenet }. */
function issuesOf(input: unknown, schema: z.ZodType = createPhotoSchema): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  // Fordított sorrendben építjük fel, így mezőnként az első hiba marad meg
  return Object.fromEntries(
    result.error.issues.toReversed().map((issue) => [issue.path.join('.'), issue.message]),
  );
}

describe('createPhotoSchema', () => {
  it('érvényes mezőkből típusos értéket ad: a számok számok, a cím szóközök nélkül', () => {
    expect(createPhotoSchema.parse({ ...VALID, title: '  Tócsa  ' })).toEqual({
      title: 'Tócsa',
      priceHuf: 2500,
      categoryId: 3,
    });
  });

  it('az ismeretlen mezőket eldobja (pl. a kérésben küldött tulajdonost vagy állapotot)', () => {
    const parsed = createPhotoSchema.parse({ ...VALID, ownerId: 'x', status: 'REGISTERED' });

    expect(parsed).not.toHaveProperty('ownerId');
    expect(parsed).not.toHaveProperty('status');
  });

  it('a leírás elhagyható; a sortörései megmaradnak, egységesen LF alakban', () => {
    const sent = [' első', 'második', 'harmadik '].join('\r\n').replace('második\r\n', 'második\r');

    expect(createPhotoSchema.parse(VALID).description).toBeUndefined();
    expect(createPhotoSchema.parse({ ...VALID, description: sent }).description).toBe(
      ['első', 'második', 'harmadik'].join('\n'),
    );
  });

  // L30: a rejtett karakterekkel írt szöveg az olvasónak nem látszik, egy gépi feldolgozó (kereső,
  // nyelvi modell) viszont elolvassa – mint a véleménynél (L15)
  it('a címből és a leírásból a rejtett karakterek kimaradnak, a leírásban legfeljebb egy üres sor', () => {
    const tagA = String.fromCodePoint(0xe0061);

    expect(
      createPhotoSchema.parse({
        ...VALID,
        title: `Tócsa${ZERO_WIDTH_SPACE} tükröződéssel${tagA}`,
        description: `Esti fény${tagA}${tagA}\n\n\n\n\nVárosliget${ZERO_WIDTH_SPACE}`,
      }),
    ).toMatchObject({ title: 'Tócsa tükröződéssel', description: 'Esti fény\n\nVárosliget' });
    // A minimális hossz a tárolandó (rejtett karakterek nélküli) címre vonatkozik – átnézés
    expect(issuesOf({ ...VALID, title: `${ZERO_WIDTH_SPACE} ab` }).title).toMatch(/legalább 3/);
    // Az emoji-sorozat összekötője megmarad
    const family = ['👩', '👩', '👧'].join(ZERO_WIDTH_JOINER);
    expect(createPhotoSchema.parse({ ...VALID, title: `Család ${family}` }).title).toBe(
      `Család ${family}`,
    );
  });

  it('hiányzó kötelező mezőknél mezőnként „kötelező” az üzenet', () => {
    expect(issuesOf({})).toEqual({
      title: 'kötelező',
      priceHuf: 'kötelező',
      categoryId: 'kötelező',
    });
  });

  it('a többször elküldött mező (tömb) magyar, érthető hibát ad', () => {
    const issues = issuesOf({
      title: ['egy', 'kettő'],
      description: ['a', 'b'],
      priceHuf: ['1', '2'],
      categoryId: '3',
    });

    expect(issues).toEqual({
      title: 'egyetlen szöveges érték kell',
      description: 'egyetlen szöveges érték kell',
      priceHuf: 'egyetlen szöveges érték kell',
    });
  });

  it.each([
    ['negatív', '-5'],
    ['tört', '2.5'],
    ['üres', ''],
    ['szóköz', ' 5'],
    ['hexadecimális', '0x10'],
    ['exponenciális', '1e3'],
    ['nem ASCII számjegy', String.fromCodePoint(0x663)],
    ['záró sortörés', `5${'\n'}`],
  ])('az ár és a kategória csak tízes számrendszerű egész lehet – %s', (_name, value) => {
    const issues = issuesOf({ ...VALID, priceHuf: value, categoryId: value });

    expect(issues.priceHuf).toBe('nem negatív egész szám kell');
    expect(issues.categoryId).toBe('nem negatív egész szám kell');
  });

  // A Stripe a HUF-ban legalább 175 Ft-ot terhel; a 9 999 999 Ft fillérben (×100) még 9 számjegy –
  // ennyit minden kártyatársaság (az American Express is) elfogad [S29]
  it('az ár 175 és 9 999 999 forint között lehet – a 0 (ingyenes) sem megengedett', () => {
    expect(createPhotoSchema.parse({ ...VALID, priceHuf: '175' }).priceHuf).toBe(175);
    expect(createPhotoSchema.parse({ ...VALID, priceHuf: '9999999' }).priceHuf).toBe(9_999_999);
    expect(issuesOf({ ...VALID, priceHuf: '174' }).priceHuf).toBe('legalább 175 lehet');
    expect(issuesOf({ ...VALID, priceHuf: '0' }).priceHuf).toBe('legalább 175 lehet');
    expect(issuesOf({ ...VALID, priceHuf: '10000000' }).priceHuf).toBe('legfeljebb 9999999 lehet');
  });

  // A nagyon hosszú számjegysorból a Number() pontatlan vagy végtelen értéket adna – ezt el sem
  // végezzük, de az üzenet ilyenkor is a felső korlátot mondja meg
  it.each([
    ['11 számjegy', '12345678901'],
    ['több száz számjegy', '9'.repeat(400)],
  ])('túl hosszú szám (%s): a felső korlátot adja meg', (_name, value) => {
    const issues = issuesOf({ ...VALID, priceHuf: value, categoryId: value });

    expect(issues.priceHuf).toBe('legfeljebb 9999999 lehet');
    expect(issues.categoryId).toBe('legfeljebb 2147483647 lehet');
  });

  it('a cím 3–120 látható karakter, és tartalmaznia kell betűt vagy számot', () => {
    expect(issuesOf({ ...VALID, title: 'ab' }).title).toMatch(/legalább 3/);
    expect(issuesOf({ ...VALID, title: 'a'.repeat(121) }).title).toMatch(/legfeljebb 120/);
    // A láthatatlan (nulla szélességű) karakterek nem számítanak bele a hosszba
    expect(issuesOf({ ...VALID, title: ZERO_WIDTH_SPACE.repeat(3) }).title).toMatch(/legalább 3/);
    expect(issuesOf({ ...VALID, title: `a${ZERO_WIDTH_SPACE.repeat(2)}` }).title).toMatch(
      /legalább 3/,
    );
    expect(issuesOf({ ...VALID, title: '!!!???' }).title).toMatch(/betűt vagy számot/);
  });

  it('az ékezetes betűk és az összekötött emoji-sorozatok megengedettek', () => {
    const family = ['👨', '👩', '👧'].join(ZERO_WIDTH_JOINER);
    const title = `Árvíztűrő család ${family}`;

    expect(createPhotoSchema.parse({ ...VALID, title }).title).toBe(title);
  });

  it('a cím szabályainak megsértésekor egyetlen, pontos üzenet jön', () => {
    const messagesOf = (title: string) =>
      createPhotoSchema.safeParse({ ...VALID, title }).error?.issues.map((issue) => issue.message);

    expect(messagesOf(String.fromCodePoint(0x3164).repeat(5))).toEqual([
      'legalább 3 karakter kell',
    ]);
    expect(messagesOf('!!!')).toEqual(['legalább egy betűt vagy számot tartalmazzon']);
    // Két, a kiegészítő síkon álló betű (UTF-16-ban négy kódegység) két karakter
    expect(messagesOf(String.fromCodePoint(0x20bb7).repeat(2))).toEqual([
      'legalább 3 karakter kell',
    ]);
  });

  it('az üresen megjelenő cím (pl. hangul kitöltő karakterek) nem fogadható el', () => {
    const hangulFiller = String.fromCodePoint(0x3164);
    const zeroWidthNonJoiner = String.fromCodePoint(0x200c);

    expect(issuesOf({ ...VALID, title: hangulFiller.repeat(5) }).title).toMatch(/legalább 3/);
    expect(issuesOf({ ...VALID, title: `ab${hangulFiller.repeat(3)}` }).title).toMatch(
      /legalább 3/,
    );
    // A szövegben álló láthatatlan összekötő (pl. a perzsa írásban) önmagában nem hiba – de L30 óta
    // kimarad, mint a véleményből (L15; a nem latin írások láthatatlan jelei: elfogadott ár)
    const withJoiner = `Árvíz${zeroWidthNonJoiner}tűrő`;
    expect(createPhotoSchema.parse({ ...VALID, title: withJoiner }).title).toBe('Árvíztűrő');
  });

  it('a megjelenítést megtévesztő karaktereket a címben és a leírásban is elutasítja', () => {
    const reversed = `kep${RIGHT_TO_LEFT_OVERRIDE}gpj.exe`;

    expect(issuesOf({ ...VALID, title: reversed }).title).toMatch(/vezérlőkarakter/);
    expect(issuesOf({ ...VALID, title: ['két', 'sor'].join('\n') }).title).toMatch(
      /vezérlőkarakter/,
    );
    expect(issuesOf({ ...VALID, description: `a${NUL}b` }).description).toMatch(/vezérlőkarakter/);
    expect(issuesOf({ ...VALID, description: reversed }).description).toMatch(/vezérlőkarakter/);
  });

  it('a leírás legfeljebb 2000 karakter', () => {
    const longest = 'a'.repeat(2000);

    expect(createPhotoSchema.parse({ ...VALID, description: longest }).description).toBe(longest);
    expect(issuesOf({ ...VALID, description: `${longest}a` }).description).toMatch(
      /legfeljebb 2000/,
    );
  });

  // A böngésző a szövegmező sortöréseit CRLF alakban küldi: a hosszt a tárolandó (egységesített)
  // szövegen kell mérni, különben a felhasználó által látott 2000 karakter sem férne bele
  it('a hosszkorlátot a sortörések egységesítése után ellenőrzi', () => {
    const lines = Array.from({ length: 64 }, () => 'x'.repeat(30));
    const asTyped = lines.join('\n'); // 64 × 30 + 63 = 1983 karakter
    const asSent = lines.join('\r\n'); // 2046 karakter

    expect(asSent.length).toBeGreaterThan(2000);
    expect(createPhotoSchema.parse({ ...VALID, description: asSent }).description).toBe(asTyped);
  });
});

describe('listPhotosQuerySchema', () => {
  const issues = (input: unknown) => issuesOf(input, listPhotosQuerySchema);

  it('üres query: 1. oldal, 20 elem, a legújabb elöl, szűrő nélkül', () => {
    expect(listPhotosQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, sort: 'newest' });
  });

  it('minden szűrőt típusos értékké alakít; a keresőszót szóközök nélkül', () => {
    expect(
      listPhotosQuerySchema.parse({
        q: '  Tócsa ',
        categoryId: '3',
        ownerId: OWNER_ID,
        minPrice: '0',
        maxPrice: '5000',
        sort: 'price_asc',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      q: 'Tócsa',
      categoryId: 3,
      ownerId: OWNER_ID,
      minPrice: 0,
      maxPrice: 5000,
      sort: 'price_asc',
      page: 2,
      pageSize: 50,
    });
  });

  it('a rendezés négy értéke: newest, oldest, price_asc, price_desc – más érték hiba', () => {
    expect(PHOTO_SORTS).toEqual(['newest', 'oldest', 'price_asc', 'price_desc']);
    for (const sort of PHOTO_SORTS) expect(listPhotosQuerySchema.parse({ sort }).sort).toBe(sort);
    for (const sort of ['random', 'NEWEST', '', 'price']) {
      expect(issues({ sort })).toEqual({ sort: SORT_MESSAGE });
    }
  });

  it('az üres vagy csak szóközből álló keresőszó nem szűr', () => {
    expect(listPhotosQuerySchema.parse({ q: '' }).q).toBeUndefined();
    expect(listPhotosQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });

  it('a keresőszó legfeljebb 100 karakter, vezérlő- és megtévesztő karakter nélkül', () => {
    expect(listPhotosQuerySchema.parse({ q: 'a'.repeat(100) }).q).toHaveLength(100);
    expect(issues({ q: 'a'.repeat(101) }).q).toBe('legfeljebb 100 karakter lehet');
    expect(issues({ q: `a${NUL}b` }).q).toMatch(/vezérlőkarakter/);
    expect(issues({ q: `kep${RIGHT_TO_LEFT_OVERRIDE}gpj` }).q).toMatch(/vezérlőkarakter/);
  });

  it('az ár 0 és 10 millió közötti egész; a minimum nem lehet nagyobb a maximumnál', () => {
    expect(listPhotosQuerySchema.parse({ minPrice: '2500', maxPrice: '2500' })).toMatchObject({
      minPrice: 2500,
      maxPrice: 2500,
    });
    expect(issues({ minPrice: '-1' }).minPrice).toBe('nem negatív egész szám kell');
    expect(issues({ maxPrice: '10000000' }).maxPrice).toBe('legfeljebb 9999999 lehet');
    expect(issues({ minPrice: '5000', maxPrice: '1000' })).toEqual({
      minPrice: 'a minimális ár nem lehet nagyobb a maximálisnál',
    });
  });

  it('az árakat csak akkor veti össze, ha mindkettő hibátlan (nincs hamis második üzenet)', () => {
    const messagesOf = (input: unknown) =>
      listPhotosQuerySchema
        .safeParse(input)
        .error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

    expect(messagesOf({ minPrice: 'abc', maxPrice: '5' })).toEqual([
      'minPrice: nem negatív egész szám kell',
    ]);
    expect(messagesOf({ minPrice: '5', maxPrice: 'abc' })).toEqual([
      'maxPrice: nem negatív egész szám kell',
    ]);
  });

  it('a kategória pozitív egész, a fotós UUID', () => {
    expect(issues({ categoryId: '0' }).categoryId).toBe('legalább 1 lehet');
    expect(issues({ categoryId: 'abc' }).categoryId).toBe('nem negatív egész szám kell');
    expect(issues({ categoryId: '2147483648' }).categoryId).toBe('legfeljebb 2147483647 lehet');
    expect(issues({ ownerId: 'nem-uuid' }).ownerId).toBe('érvénytelen azonosító');
  });

  it('a többször megadott paraméter (tömb) minden szűrőnél hiba', () => {
    const twice = (value: string) => [value, value];

    expect(
      issues({
        q: twice('tó'),
        categoryId: twice('1'),
        ownerId: twice(OWNER_ID),
        minPrice: twice('1'),
        maxPrice: twice('2'),
        sort: twice('newest'),
      }),
    ).toEqual({
      q: 'egyetlen érték kell',
      categoryId: 'egyetlen érték kell',
      ownerId: 'egyetlen érték kell',
      minPrice: 'egyetlen érték kell',
      maxPrice: 'egyetlen érték kell',
      sort: SORT_MESSAGE,
    });
  });

  it('az ismeretlen paramétert figyelmen kívül hagyja (pl. a gyorsítótár-törlő _=…)', () => {
    expect(listPhotosQuerySchema.parse({ _: '123', utm_source: 'hirlevel' })).toEqual({
      page: 1,
      pageSize: 20,
      sort: 'newest',
    });
  });
});

describe('updatePhotoSchema', () => {
  const issues = (input: unknown) => issuesOf(input, updatePhotoSchema);

  it('csak a megadott mezőket adja vissza, ellenőrizve és egységesítve', () => {
    expect(updatePhotoSchema.parse({ title: '  Új cím ', priceHuf: 3000 })).toEqual({
      title: 'Új cím',
      priceHuf: 3000,
    });
    expect(updatePhotoSchema.parse({ categoryId: 2 })).toEqual({ categoryId: 2 });
  });

  it('a leírás törölhető (null vagy üres szöveg); a sortörései egységesen LF alakban', () => {
    expect(updatePhotoSchema.parse({ description: null })).toEqual({ description: null });
    expect(updatePhotoSchema.parse({ description: '   ' })).toEqual({ description: null });
    expect(updatePhotoSchema.parse({ description: 'első\r\nmásodik' })).toEqual({
      description: 'első\nmásodik',
    });
  });

  it('üres törzsre: legalább egy mezőt módosítani kell', () => {
    expect(issues({})).toEqual({ '': 'legalább egy módosítandó mező kell' });
  });

  it('minden hibás törzsre pontosan egy, a valódi okot megnevező üzenet jön', () => {
    const messagesOf = (input: unknown) =>
      updatePhotoSchema.safeParse(input).error?.issues.map((issue) => issue.message);

    // Csak ismeretlen mező: a „legalább egy módosítandó mező” itt félrevezető volna
    expect(messagesOf({ sha256: 'x' })).toEqual(['ismeretlen mező: sha256']);
    expect(messagesOf({})).toEqual(['legalább egy módosítandó mező kell']);
    expect(messagesOf([])).toEqual(['JSON-objektum kell']);
  });

  it.each([
    'image',
    'sha256',
    'dHash',
    'status',
    'ownerId',
    'originalKey',
    'previewKey',
    'chainTxHash',
  ])('a kép és a hitelesítés adatai nem módosíthatók: az ismeretlen mező (%s) hiba', (field) => {
    expect(issues({ title: 'Új cím', [field]: 'x' })).toEqual({ '': `ismeretlen mező: ${field}` });
  });

  it('nem JSON-objektum törzsre (tömb, szöveg, hiányzó törzs) magyar hibát ad', () => {
    for (const body of [[], 'cím', 42, null, undefined]) {
      expect(issues(body)).toEqual({ '': 'JSON-objektum kell' });
    }
  });

  it('az ár és a kategória JSON-szám; a szövegként küldött vagy tört szám hiba', () => {
    expect(issues({ priceHuf: '3000' }).priceHuf).toBe('egész szám kell');
    expect(issues({ priceHuf: 2.5 }).priceHuf).toBe('egész szám kell');
    expect(issues({ priceHuf: null }).priceHuf).toBe('egész szám kell');
    expect(issues({ priceHuf: Number.POSITIVE_INFINITY }).priceHuf).toBe('egész szám kell');
    // Ugyanazok az árhatárok, mint a feltöltésnél (a Stripe minimuma és az Amex 9 számjegye)
    expect(updatePhotoSchema.parse({ priceHuf: 175 }).priceHuf).toBe(175);
    expect(updatePhotoSchema.parse({ priceHuf: 9_999_999 }).priceHuf).toBe(9_999_999);
    expect(issues({ priceHuf: -1 }).priceHuf).toBe('legalább 175 lehet');
    expect(issues({ priceHuf: 174 }).priceHuf).toBe('legalább 175 lehet');
    expect(issues({ priceHuf: 10_000_000 }).priceHuf).toBe('legfeljebb 9999999 lehet');
    expect(issues({ categoryId: 0 }).categoryId).toBe('legalább 1 lehet');
    expect(issues({ categoryId: 2_147_483_648 }).categoryId).toBe('legfeljebb 2147483647 lehet');
  });

  it('a cím és a leírás szabályai ugyanazok, mint a feltöltésnél', () => {
    expect(issues({ title: 'ab' }).title).toMatch(/legalább 3/);
    expect(issues({ title: null }).title).toBe('szöveg kell');
    expect(issues({ title: 42 }).title).toBe('szöveg kell');
    expect(issues({ title: '!!!???' }).title).toMatch(/betűt vagy számot/);
    expect(issues({ title: `kep${RIGHT_TO_LEFT_OVERRIDE}gpj.exe` }).title).toMatch(
      /vezérlőkarakter/,
    );
    expect(issues({ description: `a${NUL}b` }).description).toMatch(/vezérlőkarakter/);
    expect(issues({ description: 'a'.repeat(2001) }).description).toMatch(/legfeljebb 2000/);
  });

  it('a módosításnál is kimaradnak a rejtett karakterek; a csak rejtett leírás törlésnek számít', () => {
    expect(
      updatePhotoSchema.parse({
        title: `Új${ZERO_WIDTH_SPACE} cím`,
        description: `első\n\n\n\nmásodik${ZERO_WIDTH_SPACE}`,
      }),
    ).toEqual({ title: 'Új cím', description: 'első\n\nmásodik' });
    expect(updatePhotoSchema.parse({ description: ZERO_WIDTH_SPACE.repeat(3) })).toEqual({
      description: null,
    });
  });
});
