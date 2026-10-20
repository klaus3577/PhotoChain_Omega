// A saját profil szerkesztésének kliensoldali ellenőrzése (L23). A név szabályai a regisztrációéi
// (auth/validation.ts – a szerver displayNameSchema-ja), a bemutatkozás legfeljebb 500 kódpont,
// vezérlőkarakter nélkül (a sortörés megengedett – server/src/modules/users/users.schemas.ts).
// A kérés törzse a PATCH /api/me formájában: a név levágva, a bemutatkozás üresen null.
import type { ProfileUpdate } from '../api/users.api';
import { type FieldErrors, onlyErrors, validateDisplayName } from '../auth/validation';
import { codePointLength, CONTROL_CHARACTER_EXCEPT_NEWLINES } from '../lib/text';

export const PROFILE_FIELDS = ['displayName', 'bio'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileValues = Record<ProfileField, string>;

/** A users.bio oszlop hossza */
export const MAX_BIO_LENGTH = 500;
export const BIO_HINT = `Legfeljebb ${MAX_BIO_LENGTH} karakter: ki vagy, mit fotózol.`;

/** A bemutatkozás, ahogy a szerver is olvassa: a Windows-sortörés egy karakter, a széle levágva. */
export const normalizeBio = (value: string): string => value.replace(/\r\n?/g, '\n').trim();

function validateBio(value: string): string | undefined {
  const bio = normalizeBio(value);
  if (codePointLength(bio) > MAX_BIO_LENGTH)
    return `A bemutatkozás legfeljebb ${MAX_BIO_LENGTH} karakter lehet.`;
  if (CONTROL_CHARACTER_EXCEPT_NEWLINES.test(bio))
    return 'A bemutatkozás nem tartalmazhat vezérlőkaraktert.';
  return undefined;
}

export function validateProfile(values: ProfileValues): FieldErrors<ProfileField> {
  return onlyErrors({
    displayName: validateDisplayName(values.displayName),
    bio: validateBio(values.bio),
  });
}

/** A kérés törzse a szerver formájában. */
export function profileUpdateOf(values: ProfileValues): ProfileUpdate {
  const bio = normalizeBio(values.bio);
  return { displayName: values.displayName.trim(), bio: bio === '' ? null : bio };
}
