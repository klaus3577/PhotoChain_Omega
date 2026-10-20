// Több modul közös Zod-építőelemei: szöveges bemenet magyar hibaüzenettel, tízes számrendszerű egész
// szám szövegből (űrlapmező, query-paraméter), keresőszó, többsoros szöveg, részleges módosítás
// (PATCH) JSON-törzse, azonosító útvonal-paraméter, valamint a lapozás query-paraméterei és adatai
// (meta).
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import { z } from 'zod';

import {
  collapseBlankLines,
  NO_CONTROL_CHARACTERS,
  NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES,
  removeHiddenCharacters,
} from './text.js';

/** A listák alapértelmezett és legnagyobb oldalmérete */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
/**
 * A legnagyobb oldalszám: mélyebb lapozásnál az adatbázisnak egyre több sort kell átlépnie (OFFSET)
 * – a korlát a szándékosan költséges kérések ellen véd.
 */
export const MAX_PAGE = 1000;

export const CONTROL_CHARACTER_MESSAGE = 'vezérlőkaraktert nem tartalmazhat';

/**
 * Szöveges bemenet: hiányzó értékre „kötelező”, más típusú értékre (pl. a többször elküldött
 * űrlapmező vagy query-paraméter tömbje, a JSON-ban szám vagy null) a megadott üzenet.
 */
export const textInput = (typeMessage: string): z.ZodString =>
  z.string({ error: (issue) => (issue.input === undefined ? 'kötelező' : typeMessage) });

/** Egyetlen query-paraméter értéke (a többször megadott paraméter tömbként érkezik). */
export const queryText = (): z.ZodString => textInput('egyetlen érték kell');

/** A keresőszó (galéria, admin felhasználólista) leghosszabb megengedett hossza */
export const MAX_SEARCH_LENGTH = 100;

/** Keresőszó query-paraméterben: körülvágva, vezérlőkarakter nélkül; az üres keresőszó nem szűr. */
export const searchQueryText = () =>
  queryText()
    .trim()
    .max(MAX_SEARCH_LENGTH, { error: `legfeljebb ${MAX_SEARCH_LENGTH} karakter lehet` })
    .regex(NO_CONTROL_CHARACTERS, { error: CONTROL_CHARACTER_MESSAGE })
    .transform((q) => q || undefined);

interface IntegerBounds {
  min?: number;
  max: number;
}

/** Egy további ellenőrzés csak akkor fusson, ha az érték eddig hibátlan (ne adjon második üzenetet). */
export const whenValidSoFar = ({ issues }: { issues: readonly unknown[] }): boolean =>
  issues.length === 0;

/** Tízes számrendszerű egész szám szövegként (űrlapmező, query-paraméter), a megadott határok között. */
export const integerText = (input: z.ZodString, { min = 0, max }: IntegerBounds) =>
  input
    .regex(/^\d+$/, { error: 'nem negatív egész szám kell' })
    // A felső korlátnál több számjegyű szám (a vezető nullák nélkül) biztosan túl nagy: a Number()
    // ilyenkor már pontatlan vagy végtelen értéket adna, ezért át sem alakítjuk
    .refine((digits) => digits.replace(/^0+(?=\d)/, '').length <= String(max).length, {
      error: `legfeljebb ${max} lehet`,
      when: whenValidSoFar,
    })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, { error: `legalább ${min} lehet` })
        .max(max, { error: `legfeljebb ${max} lehet` }),
    );

/**
 * Többsoros szabad szöveg (leírás, bemutatkozás): a sortörések egységesen LF alakban kerülnek az
 * adatbázisba (a böngészők CRLF-et küldenek). A hosszt már az egységesített szövegen mérjük: azt
 * tároljuk, és azt látja a felhasználó is.
 */
export const multilineText = (input: z.ZodString, maxLength: number) =>
  input
    .transform((text) => text.replace(/\r\n?/g, '\n').trim())
    .pipe(
      z
        .string()
        .max(maxLength, { error: `legfeljebb ${maxLength} karakter lehet` })
        .regex(NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES, { error: CONTROL_CHARACTER_MESSAGE }),
    );

/**
 * A rejtett karakterek nélküli egysoros szöveg (név, cím): a láthatatlan karakterekkel írt szöveg
 * az olvasónak nem látszik, egy gépi feldolgozó (kereső, nyelvi modell) viszont elolvassa (L15, L30).
 */
export const withoutHiddenCharacters = (text: string): string =>
  removeHiddenCharacters(text).trim();

/**
 * Többsoros szabad szöveg (leírás, bemutatkozás) a rejtett karakterek nélkül, két bekezdés között
 * legfeljebb egy üres sorral (L30 – mint a vélemény, L15). A csak rejtett karakterekből álló szöveg
 * üres lesz (a törölhető mezőben null).
 */
export const cleanMultilineText = (input: z.ZodString, maxLength: number) =>
  multilineText(input, maxLength).transform((text) =>
    collapseBlankLines(removeHiddenCharacters(text)).trim(),
  );

/** Törölhető szöveg: a null és az üres szöveg egyaránt null-ként kerül az adatbázisba. */
export const clearable = (schema: z.ZodType<string>) =>
  schema.transform((text) => text || null).nullable();

/**
 * Szigorú JSON-törzs: csak a felsorolt mezők szerepelhetnek benne – az ismeretlen mező hiba, nem
 * csendben eldobott adat (pl. a klienstől nem fogadott összeg vagy visszatérési URL).
 */
export const strictBody = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.strictObject(shape, {
    // Az objektum saját hibája csak kétféle lehet: ismeretlen mező, vagy nem is objektum a törzs
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `ismeretlen mező: ${issue.keys.join(', ')}`
        : 'JSON-objektum kell',
  });

/**
 * Részleges módosítás (PATCH) JSON-törzse: szigorú törzs (lásd strictBody), és legalább egy mezőt
 * meg kell adni.
 */
export const patchBody = <Shape extends z.ZodRawShape>(shape: Shape) =>
  strictBody(shape).refine((body) => Object.keys(body).length > 0, {
    error: 'legalább egy módosítandó mező kell',
    // A már hibás törzsnél (pl. csak ismeretlen mező) ez az üzenet félrevezető volna
    when: whenValidSoFar,
  });

/** Az azonosító (UUID) útvonal-paraméter: más alakú érték az adatbázisig sem jut el. */
export const idParamsSchema = z.object({ id: z.uuid({ error: 'érvénytelen azonosító' }) });

/** A listák lapozó query-paraméterei. */
export const paginationQuerySchema = z.object({
  page: integerText(queryText(), { min: 1, max: MAX_PAGE }).default(1),
  pageSize: integerText(queryText(), { min: 1, max: MAX_PAGE_SIZE }).default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.infer<typeof paginationQuerySchema>;

/** A lista-válaszok meta objektuma (terv 5.1). */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function pageMeta({ page, pageSize }: Pagination, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
