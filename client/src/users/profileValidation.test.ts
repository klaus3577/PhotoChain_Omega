// A saját profil szerkesztésének kliensoldali ellenőrzése (L23): a név szabályai a regisztrációéi
// (auth/validation.ts – a szerver displayNameSchema-ja), a bemutatkozás legfeljebb 500 kódpont,
// vezérlőkarakter nélkül (a sortörés megengedett). A kérés törzse a PATCH /api/me formájában.
import { describe, expect, it } from 'vitest';

import {
  MAX_BIO_LENGTH,
  PROFILE_FIELDS,
  profileUpdateOf,
  validateProfile,
} from './profileValidation';

const values = (overrides: Partial<Record<'displayName' | 'bio', string>> = {}) => ({
  displayName: 'Fotós Fanni',
  bio: '',
  ...overrides,
});

describe('validateProfile', () => {
  it('a mezők: a név és a bemutatkozás', () => {
    expect(PROFILE_FIELDS).toEqual(['displayName', 'bio']);
  });

  it('a név szabályai ugyanazok, mint a regisztrációnál', () => {
    expect(validateProfile(values({ displayName: '' }))).toEqual({
      displayName: 'Add meg a megjelenített nevet.',
    });
    expect(validateProfile(values({ displayName: 'A' }))).toEqual({
      displayName: 'A név legalább 2 karakter legyen.',
    });
    expect(validateProfile(values({ displayName: 'x'.repeat(51) }))).toEqual({
      displayName: 'A név legfeljebb 50 karakter lehet.',
    });
    expect(validateProfile(values({ displayName: 'a\nb' }))).toEqual({
      displayName: 'A név nem tartalmazhat sortörést vagy vezérlőkaraktert.',
    });
    expect(validateProfile(values({ displayName: '***' }))).toEqual({
      displayName: 'A név tartalmazzon legalább egy betűt vagy számot.',
    });
    expect(validateProfile(values())).toEqual({});
  });

  it('a bemutatkozás nem kötelező; legfeljebb 500 kódpont, vezérlőkarakter nélkül (a sortörés megengedett)', () => {
    expect(validateProfile(values({ bio: 'Tájképek\nés portrék.' }))).toEqual({});
    expect(validateProfile(values({ bio: 'ő'.repeat(MAX_BIO_LENGTH) }))).toEqual({});
    expect(validateProfile(values({ bio: 'ő'.repeat(MAX_BIO_LENGTH + 1) }))).toEqual({
      bio: 'A bemutatkozás legfeljebb 500 karakter lehet.',
    });
    expect(validateProfile(values({ bio: `x${String.fromCodePoint(7)}` }))).toEqual({
      bio: 'A bemutatkozás nem tartalmazhat vezérlőkaraktert.',
    });
  });
});

describe('profileUpdateOf', () => {
  it('a kérés törzse: a név levágva, a bemutatkozás normalizálva – üresen null', () => {
    expect(profileUpdateOf(values({ displayName: ' Fanni ', bio: ' Hello\r\nvilág ' }))).toEqual({
      displayName: 'Fanni',
      bio: 'Hello\nvilág',
    });
    expect(profileUpdateOf(values({ bio: '  ' }))).toEqual({
      displayName: 'Fotós Fanni',
      bio: null,
    });
  });
});
