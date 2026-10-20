import { describe, expect, it } from 'vitest';

import { loginSchema, registerSchema } from './auth.schemas.js';

const VALID = {
  email: 'anna@photochain.test',
  password: 'titkos-jelszo',
  displayName: 'Teszt Anna',
};

/** A hibás mezők neve (ismétlődés nélkül), vagy üres tömb, ha a bemenet érvényes. */
function invalidFields(schema: typeof registerSchema | typeof loginSchema, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].sort();
}

describe('registerSchema', () => {
  it('érvényes bemenetet elfogad', () => {
    expect(registerSchema.parse(VALID)).toEqual(VALID);
  });

  it('az e-mail-címet kisbetűsíti, a körülötte lévő szóközöket levágja', () => {
    const parsed = registerSchema.parse({ ...VALID, email: '  Anna@PhotoChain.TEST ' });

    expect(parsed.email).toBe('anna@photochain.test');
  });

  it('hibás vagy hiányzó e-mail-címet elutasít', () => {
    expect(invalidFields(registerSchema, { ...VALID, email: 'nem-email' })).toEqual(['email']);
    expect(invalidFields(registerSchema, { ...VALID, email: undefined })).toEqual(['email']);
    expect(invalidFields(registerSchema, { ...VALID, email: `${'a'.repeat(250)}@x.hu` })).toEqual([
      'email',
    ]);
  });

  it('a jelszó legalább 8 karakter', () => {
    expect(invalidFields(registerSchema, { ...VALID, password: '1234567' })).toEqual(['password']);
    expect(invalidFields(registerSchema, { ...VALID, password: '12345678' })).toEqual([]);
  });

  it('a jelszó legfeljebb 72 bájt (a bcrypt ennél többet nem vesz figyelembe)', () => {
    // Az ékezetes betűk UTF-8-ban 2 bájtosak: 37 karakter = 74 bájt
    expect(invalidFields(registerSchema, { ...VALID, password: 'á'.repeat(37) })).toEqual([
      'password',
    ]);
    expect(invalidFields(registerSchema, { ...VALID, password: 'a'.repeat(72) })).toEqual([]);
    expect(invalidFields(registerSchema, { ...VALID, password: 'a'.repeat(73) })).toEqual([
      'password',
    ]);
  });

  it('a jelszót nem módosítja (a szóközök is a jelszó részei)', () => {
    const parsed = registerSchema.parse({ ...VALID, password: '  Szóközös Jelszó  ' });

    expect(parsed.password).toBe('  Szóközös Jelszó  ');
  });

  it('a megjelenítési név 2–50 karakter, a széleiről levágja a szóközöket', () => {
    expect(registerSchema.parse({ ...VALID, displayName: '  Anna  ' }).displayName).toBe('Anna');
    expect(invalidFields(registerSchema, { ...VALID, displayName: ' A ' })).toEqual([
      'displayName',
    ]);
    expect(invalidFields(registerSchema, { ...VALID, displayName: 'a'.repeat(51) })).toEqual([
      'displayName',
    ]);
    expect(invalidFields(registerSchema, { ...VALID, displayName: undefined })).toEqual([
      'displayName',
    ]);
  });

  it('a megjelenítési névben vezérlőkaraktert (NUL, sortörés, escape) nem fogad el', () => {
    for (const displayName of ['An\u0000na', 'Anna\nAdminisztrátor', 'An\u001bna', 'An\u007fna']) {
      expect(invalidFields(registerSchema, { ...VALID, displayName })).toEqual(['displayName']);
    }
    // Az ékezetes betűk, a szóköz és a kötőjel természetesen megengedett
    expect(invalidFields(registerSchema, { ...VALID, displayName: 'Kővári-Nagy Ágnes' })).toEqual(
      [],
    );
  });

  it('a megjelenítési név nem lehet láthatatlan vagy csupa írásjel (a galériában üresnek látszana)', () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b);

    for (const displayName of [zeroWidthSpace.repeat(3), `A${zeroWidthSpace}`, '!!', '...']) {
      expect(invalidFields(registerSchema, { ...VALID, displayName })).toEqual(['displayName']);
    }
  });

  // L30: a platformra vagy a moderátorokra emlékeztető név megtévesztésre adna módot
  it('a foglalt (a platform vagy a moderátorok nevére emlékeztető) nevet elutasítja', () => {
    for (const displayName of ['Adminisztrátor', 'admin', 'Ph0t0Chain', 'Moderátor Kati']) {
      const result = registerSchema.safeParse({ ...VALID, displayName });

      expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
        ['displayName', 'ez a név foglalt (a platform vagy a moderátorok nevére emlékeztet)'],
      ]);
    }
    expect(invalidFields(registerSchema, { ...VALID, displayName: 'Badminton Béla' })).toEqual([]);
  });

  // Átnézés: a „[ZWSP] a” (nulla szélességű szóköz + szóköz + betű) tisztítva csak „a” volna
  it('a minimális hosszt a rejtett karakterek nélküli (tárolandó) néven méri', () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b);

    expect(invalidFields(registerSchema, { ...VALID, displayName: `${zeroWidthSpace} a` })).toEqual(
      ['displayName'],
    );
  });

  it('a névből a láthatatlan (rejtett) karakterek kimaradnak', () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b);

    expect(
      registerSchema.parse({
        ...VALID,
        displayName: `Teszt${zeroWidthSpace} Anna${zeroWidthSpace}`,
      }).displayName,
    ).toBe('Teszt Anna');
  });

  it('az ismeretlen mezőket (pl. szerepkör) eldobja', () => {
    const parsed = registerSchema.parse({ ...VALID, role: 'ADMIN', isBlocked: true });

    expect(parsed).toEqual(VALID);
  });

  it('nem objektum bemenetet elutasít', () => {
    expect(registerSchema.safeParse(undefined).success).toBe(false);
    expect(registerSchema.safeParse('szöveg').success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('az e-mail-címet ugyanúgy normalizálja, mint a regisztráció', () => {
    const parsed = loginSchema.parse({ email: ' Anna@PhotoChain.test', password: 'x' });

    expect(parsed).toEqual({ email: 'anna@photochain.test', password: 'x' });
  });

  it('hiányzó e-mail-címet vagy jelszót elutasít', () => {
    expect(invalidFields(loginSchema, { email: 'anna@photochain.test', password: '' })).toEqual([
      'password',
    ]);
    expect(invalidFields(loginSchema, {})).toEqual(['email', 'password']);
  });

  it('a jelszóra nem ír elő szabályt: a hibás jelszó 401-et ad, nem validációs hibát', () => {
    expect(
      invalidFields(loginSchema, { email: 'anna@photochain.test', password: 'rövid' }),
    ).toEqual([]);
  });
});
