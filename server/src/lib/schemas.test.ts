// A modulok közös Zod-építőelemei: az azonosító útvonal-paraméter, a lapozás query-paraméterei (az
// URL-ben szövegként érkeznek, többször megadva tömbként) és a lapozás adatai (meta).
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  DEFAULT_PAGE_SIZE,
  idParamsSchema,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  pageMeta,
  paginationQuerySchema,
} from './schemas.js';

const PHOTO_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';

/** A hibás mezők és az első (legfontosabb) üzenetük: { mező: üzenet }. */
function issuesOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.toReversed().map((issue) => [issue.path.join('.'), issue.message]),
  );
}

describe('idParamsSchema', () => {
  it('UUID-t fogad el (a kis- és a nagybetűset is)', () => {
    expect(idParamsSchema.parse({ id: PHOTO_ID })).toEqual({ id: PHOTO_ID });
    expect(idParamsSchema.parse({ id: PHOTO_ID.toUpperCase() }).id).toBe(PHOTO_ID.toUpperCase());
  });

  it.each([
    ['üres', ''],
    ['szám', '42'],
    ['csonka', PHOTO_ID.slice(0, -1)],
    ['hosszabb', `${PHOTO_ID}0`],
    ['SQL-töredék', "1' OR '1'='1"],
    ['útvonal', `../${PHOTO_ID}`],
  ])('más alakú azonosítóra magyar hibaüzenetet ad – %s', (_name, id) => {
    expect(issuesOf(idParamsSchema, { id })).toEqual({ id: 'érvénytelen azonosító' });
  });
});

describe('paginationQuerySchema', () => {
  it('alapértelmezés: 1. oldal, oldalanként 20 elem', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  it('a szöveges számokat számmá alakítja; a határértékek még elfogadottak', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
    expect(
      paginationQuerySchema.parse({ page: String(MAX_PAGE), pageSize: String(MAX_PAGE_SIZE) }),
    ).toEqual({ page: MAX_PAGE, pageSize: MAX_PAGE_SIZE });
  });

  it('az oldalszám 1 és MAX_PAGE, az oldalméret 1 és 50 közötti', () => {
    expect(MAX_PAGE_SIZE).toBe(50);
    expect(issuesOf(paginationQuerySchema, { page: '0' })).toEqual({ page: 'legalább 1 lehet' });
    expect(issuesOf(paginationQuerySchema, { page: String(MAX_PAGE + 1) })).toEqual({
      page: `legfeljebb ${MAX_PAGE} lehet`,
    });
    expect(issuesOf(paginationQuerySchema, { pageSize: '0' })).toEqual({
      pageSize: 'legalább 1 lehet',
    });
    expect(issuesOf(paginationQuerySchema, { pageSize: '51' })).toEqual({
      pageSize: 'legfeljebb 50 lehet',
    });
  });

  it.each([
    ['betű', 'abc'],
    ['negatív', '-1'],
    ['tört', '1.5'],
    ['üres', ''],
    ['szóköz', ' 2'],
    ['hexadecimális', '0x10'],
    ['exponenciális', '1e3'],
    ['nem ASCII számjegy', String.fromCodePoint(0x663)],
  ])('csak tízes számrendszerű egész szám lehet – %s', (_name, value) => {
    expect(issuesOf(paginationQuerySchema, { page: value, pageSize: value })).toEqual({
      page: 'nem negatív egész szám kell',
      pageSize: 'nem negatív egész szám kell',
    });
  });

  it('az óriási számot nem alakítja át (pontatlan lenne): a felső korlátot adja meg', () => {
    expect(issuesOf(paginationQuerySchema, { page: '9'.repeat(400) })).toEqual({
      page: `legfeljebb ${MAX_PAGE} lehet`,
    });
  });

  it('a hosszú, nem számjegyekből álló értékre egyetlen hibát ad (a felső korlátot nem)', () => {
    const result = paginationQuerySchema.safeParse({ page: 'abcdefghijkl' });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'nem negatív egész szám kell',
    ]);
  });

  it('a vezető nullák nem számítanak bele a számjegyek számába', () => {
    expect(paginationQuerySchema.parse({ page: '00000000001', pageSize: '000050' })).toEqual({
      page: 1,
      pageSize: 50,
    });
  });

  it('a többször megadott paraméter (tömb) érthető hibát ad', () => {
    expect(issuesOf(paginationQuerySchema, { page: ['1', '2'], pageSize: ['5', '6'] })).toEqual({
      page: 'egyetlen érték kell',
      pageSize: 'egyetlen érték kell',
    });
  });
});

describe('pageMeta', () => {
  it('az oldalak száma felfelé kerekítve; üres találatnál 0 oldal', () => {
    expect(pageMeta({ page: 2, pageSize: 20 }, 45)).toEqual({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
    expect(pageMeta({ page: 1, pageSize: 20 }, 40).totalPages).toBe(2);
    expect(pageMeta({ page: 1, pageSize: 20 }, 0).totalPages).toBe(0);
  });
});
