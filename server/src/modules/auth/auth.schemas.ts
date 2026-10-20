// Az auth-végpontok bemeneti sémái (Zod). Az ismeretlen mezőket a z.object eldobja, így a kérésben
// küldött szerepkör vagy tiltási állapot nem juthat el az adatbázisig.
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva); a jelszószabályok: OWASP Password Storage
// Cheat Sheet, https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
import { z } from 'zod';

import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from '../../lib/password.js';
import { isReservedDisplayName, RESERVED_NAME_MESSAGE } from '../../lib/reservedNames.js';
import { textInput, whenValidSoFar, withoutHiddenCharacters } from '../../lib/schemas.js';
import { hasVisibleLetterOrDigit, NO_CONTROL_CHARACTERS, visibleLength } from '../../lib/text.js';

/** A users.email oszlop hossza; egyben az e-mail-címek szabvány szerinti felső korlátja. */
const MAX_EMAIL_LENGTH = 254;
const MIN_DISPLAY_NAME_LENGTH = 2;
/** A users.displayName oszlop hossza */
const MAX_DISPLAY_NAME_LENGTH = 50;

/**
 * E-mail-cím, normalizálva: szóközök nélkül, kisbetűsen. Az adatbázisban a users.email egyedisége
 * kis- és nagybetű-érzékeny (az `Anna@x.hu` és az `anna@x.hu` két külön sor lehetne), ezért minden
 * beszúrás és keresés előtt ez a séma alakítja egységessé a címet.
 */
export const emailSchema = z
  .string({ error: 'kötelező' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'érvényes e-mail-cím kell' })
      .max(MAX_EMAIL_LENGTH, { error: `legfeljebb ${MAX_EMAIL_LENGTH} karakter lehet` }),
  );

/** Új jelszó (regisztráció, seed). A jelszót nem módosítjuk: a szóköz is a része lehet. */
export const newPasswordSchema = z
  .string({ error: 'kötelező' })
  .min(MIN_PASSWORD_LENGTH, { error: `legalább ${MIN_PASSWORD_LENGTH} karakter kell` })
  .refine((password) => Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES, {
    error: `legfeljebb ${MAX_PASSWORD_BYTES} bájt lehet (egy ékezetes betű 2 bájt)`,
  });

/** A megjelenített név – a regisztrációnál és a profil módosításánál (L13) ugyanazokkal a szabályokkal. */
// A név nem jelenhet meg üresen (a galériában, a profilon, a hitelesség-ellenőrzés válaszában): a
// láthatatlan karakterek nem számítanak a hosszba, és kell legalább egy látható betű vagy szám
export const displayNameSchema = textInput('szöveg kell')
  .trim()
  // A hosszt a tárolandó (rejtett karakterek nélküli, körülvágott) alakon mérjük – L30
  .refine((name) => visibleLength(withoutHiddenCharacters(name)) >= MIN_DISPLAY_NAME_LENGTH, {
    error: `legalább ${MIN_DISPLAY_NAME_LENGTH} karakter kell`,
  })
  .max(MAX_DISPLAY_NAME_LENGTH, {
    error: `legfeljebb ${MAX_DISPLAY_NAME_LENGTH} karakter lehet`,
  })
  .regex(NO_CONTROL_CHARACTERS, { error: 'vezérlőkaraktert (pl. sortörést) nem tartalmazhat' })
  .refine(hasVisibleLetterOrDigit, {
    error: 'legalább egy betűt vagy számot tartalmazzon',
    when: whenValidSoFar,
  })
  // A láthatatlan karakterek kimaradnak (L30): a tárolt név az, amit az olvasó lát
  .transform(withoutHiddenCharacters);

export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  // A platformra vagy a moderátorokra emlékeztető név nem választható (L30); a profil módosításánál
  // ugyanez a szolgáltatásban (users.service.ts) – ott a már meglévő név megtartható
  displayName: displayNameSchema.refine((name) => !isReservedDisplayName(name), {
    error: RESERVED_NAME_MESSAGE,
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Itt nincs hosszszabály: a hibás jelszóra egységesen 401 a válasz, nem validációs hiba
  password: z.string({ error: 'kötelező' }).min(1, { error: 'kötelező' }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
