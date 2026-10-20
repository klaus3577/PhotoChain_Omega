// A képek végpontjainak bemeneti sémái (Zod): a feltöltés szöveges mezői (multipart űrlap), a galéria
// query-paraméterei és a módosítás (PATCH) JSON-törzse. Az űrlapban és az URL-ben minden érték szöveg
// (ha többször szerepel, tömb), ezért a számokat szigorú mintával olvassuk be – a z.coerce az üres
// mezőt 0-nak venné. A feltöltés ismeretlen mezőit a z.object eldobja; a módosításé hiba.
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import { z } from 'zod';

import { MAX_PRICE_HUF, MIN_PRICE_HUF } from '../../lib/price.js';
import {
  cleanMultilineText,
  clearable,
  CONTROL_CHARACTER_MESSAGE,
  integerText,
  paginationQuerySchema,
  patchBody,
  queryText,
  searchQueryText,
  textInput,
  whenValidSoFar,
  withoutHiddenCharacters,
} from '../../lib/schemas.js';
import { hasVisibleLetterOrDigit, NO_CONTROL_CHARACTERS, visibleLength } from '../../lib/text.js';

const MIN_TITLE_LENGTH = 3;
/** A photos.title, illetve a photos.description oszlop hossza */
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
/** A PostgreSQL integer típusának felső határa (categories.id) */
const MAX_INTEGER = 2_147_483_647;

/** A galéria rendezései; döntetlennél mindig az azonosító dönt (stabil lapozás). */
export const PHOTO_SORTS = ['newest', 'oldest', 'price_asc', 'price_desc'] as const;
export type PhotoSort = (typeof PHOTO_SORTS)[number];

/** A multipart űrlap szöveges mezője (a többször elküldött mező tömbként érkezik). */
const formText = (): z.ZodString => textInput('egyetlen szöveges érték kell');

/** A JSON-törzs szöveges mezője. */
const jsonText = (): z.ZodString => textInput('szöveg kell');

/** A JSON-törzs egész szám mezője, a megadott határok között. */
const jsonInteger = (min: number, max: number) =>
  z
    .number({ error: 'egész szám kell' })
    .int({ error: 'egész szám kell' })
    .min(min, { error: `legalább ${min} lehet` })
    .max(max, { error: `legfeljebb ${max} lehet` });

/** A kép címe – a feltöltésnél és a módosításnál ugyanazokkal a szabályokkal. */
const titleText = (input: z.ZodString) =>
  input
    .trim()
    // A hosszt a tárolandó (rejtett karakterek nélküli, körülvágott) alakon mérjük – L30
    .refine((title) => visibleLength(withoutHiddenCharacters(title)) >= MIN_TITLE_LENGTH, {
      error: `legalább ${MIN_TITLE_LENGTH} karakter kell`,
    })
    .max(MAX_TITLE_LENGTH, { error: `legfeljebb ${MAX_TITLE_LENGTH} karakter lehet` })
    .regex(NO_CONTROL_CHARACTERS, { error: CONTROL_CHARACTER_MESSAGE })
    .refine(hasVisibleLetterOrDigit, {
      error: 'legalább egy betűt vagy számot tartalmazzon',
      when: whenValidSoFar,
    })
    // A rejtett karakterek kimaradnak (L30)
    .transform(withoutHiddenCharacters);

export const createPhotoSchema = z.object({
  title: titleText(formText()),
  description: cleanMultilineText(formText(), MAX_DESCRIPTION_LENGTH).optional(),
  // A Stripe legkisebb terhelhető összege és az Amex 9 számjegye között (lib/price.ts)
  priceHuf: integerText(formText(), { min: MIN_PRICE_HUF, max: MAX_PRICE_HUF }),
  categoryId: integerText(formText(), { max: MAX_INTEGER }),
});

export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;

/**
 * A galéria (GET /api/photos) query-paraméterei. Az ismeretlen paramétert (pl. egy gyorsítótár-törlő
 * „_=…”) figyelmen kívül hagyja; a hibás értékű ismert paraméter 400.
 */
export const listPhotosQuerySchema = paginationQuerySchema
  .extend({
    q: searchQueryText().optional(),
    categoryId: integerText(queryText(), { min: 1, max: MAX_INTEGER }).optional(),
    ownerId: queryText()
      .pipe(z.uuid({ error: 'érvénytelen azonosító' }))
      .optional(),
    minPrice: integerText(queryText(), { max: MAX_PRICE_HUF }).optional(),
    maxPrice: integerText(queryText(), { max: MAX_PRICE_HUF }).optional(),
    sort: z
      .enum(PHOTO_SORTS, { error: `a rendezés lehetséges értékei: ${PHOTO_SORTS.join(', ')}` })
      .default('newest'),
  })
  .refine(
    ({ minPrice, maxPrice }) =>
      minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    {
      error: 'a minimális ár nem lehet nagyobb a maximálisnál',
      path: ['minPrice'],
      // Hibás ár mellett az összevetés értelmetlen (és félrevezető második üzenetet adna)
      when: whenValidSoFar,
    },
  );

export type ListPhotosQuery = z.infer<typeof listPhotosQuerySchema>;

/**
 * A kép adatainak módosítása (PATCH /api/photos/:id): cím, leírás, ár, kategória. A kép maga (a fájl
 * és az ujjlenyomatai), az állapota és a tulajdonosa nem módosítható – az ilyen mező hiba.
 */
export const updatePhotoSchema = patchBody({
  title: titleText(jsonText()).optional(),
  description: clearable(cleanMultilineText(jsonText(), MAX_DESCRIPTION_LENGTH)).optional(),
  priceHuf: jsonInteger(MIN_PRICE_HUF, MAX_PRICE_HUF).optional(),
  categoryId: jsonInteger(1, MAX_INTEGER).optional(),
});

export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;
