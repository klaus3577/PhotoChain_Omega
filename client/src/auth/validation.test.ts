// A belépés és a regisztráció kliensoldali ellenőrzése: ugyanazokat a szabályokat követi, mint a
// szerver (server/src/modules/auth/auth.schemas.ts), csak teljes mondatos, magyar üzenetekkel – így a
// felhasználó már beküldés előtt látja a hibát. A végső döntés a szerveré.
import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/http';
import { serverFieldErrors, validateLogin, validateRegister } from './validation';

const cp = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

describe('validateLogin', () => {
  it('az üres mezőkhöz kitöltési üzenetet ad', () => {
    expect(validateLogin({ email: '  ', password: '' })).toEqual({
      email: 'Add meg az e-mail-címedet.',
      password: 'Add meg a jelszavadat.',
    });
  });

  it('a hibás formátumú e-mail-címet jelzi, a helyeset (szóközökkel, nagybetűvel is) elfogadja', () => {
    for (const email of [
      'anna',
      'anna@pelda',
      'anna pelda@pelda.hu',
      '@pelda.hu',
      'anna@.hu',
      'anna.@pelda.hu',
      // a legfelső szintű tartomány legalább két betű (mint a szerver Zod-mintájában)
      'anna@pelda.h',
    ]) {
      expect(validateLogin({ email, password: 'x' }).email).toBe(
        'Az e-mail-cím formátuma nem megfelelő (pl. nev@pelda.hu).',
      );
    }
    for (const email of ['anna@pelda.hu', '  Anna.Kiss+foto@Pelda.Co.Hu  ', "o'brien@pelda.hu"]) {
      expect(validateLogin({ email, password: 'x' })).toEqual({});
    }
  });

  it('a túl hosszú e-mail-címet jelzi (legfeljebb 254 karakter)', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.hu`;
    expect(email).toHaveLength(254);
    expect(validateLogin({ email, password: 'x' })).toEqual({});
    expect(validateLogin({ email: `a${email}`, password: 'x' }).email).toBe(
      'Az e-mail-cím legfeljebb 254 karakter lehet.',
    );
  });

  it('belépésnél a jelszó hosszát nem ellenőrzi (a hibás jelszóra a szerver egységesen válaszol)', () => {
    expect(validateLogin({ email: 'anna@pelda.hu', password: ' ' })).toEqual({});
  });
});

describe('validateRegister', () => {
  const valid = { displayName: 'Kiss Anna', email: 'anna@pelda.hu', password: 'hosszu-jelszo' };

  it('a helyes adatokra nincs hiba', () => {
    expect(validateRegister(valid)).toEqual({});
  });

  it('a jelszó legalább 8 karakter, és legfeljebb 72 bájt (az ékezetes betű 2 bájt)', () => {
    expect(validateRegister({ ...valid, password: '' }).password).toBe('Add meg a jelszót.');
    expect(validateRegister({ ...valid, password: '1234567' }).password).toBe(
      'A jelszó legalább 8 karakter legyen.',
    );
    expect(validateRegister({ ...valid, password: 'a'.repeat(72) })).toEqual({});
    expect(validateRegister({ ...valid, password: 'á'.repeat(37) }).password).toBe(
      'A jelszó legfeljebb 72 bájt lehet (egy ékezetes betű 2 bájt).',
    );
  });

  it('a név 2–50 karakter; a láthatatlan karakter nem számít bele a minimumba', () => {
    expect(validateRegister({ ...valid, displayName: '   ' }).displayName).toBe(
      'Add meg a megjelenített nevet.',
    );
    expect(validateRegister({ ...valid, displayName: 'A' }).displayName).toBe(
      'A név legalább 2 karakter legyen.',
    );
    // nulla szélességű szóköz (U+200B): láthatatlan, nem számít
    expect(validateRegister({ ...valid, displayName: `A${cp(0x200b)}` }).displayName).toBe(
      'A név legalább 2 karakter legyen.',
    );
    expect(validateRegister({ ...valid, displayName: 'A'.repeat(50) })).toEqual({});
    expect(validateRegister({ ...valid, displayName: 'A'.repeat(51) }).displayName).toBe(
      'A név legfeljebb 50 karakter lehet.',
    );
  });

  it('a hosszt – mint a szerver (Zod 4) – kódpontban méri: a kiegészítő síkú betű is egy karakter', () => {
    const astral = cp(0x1d400);
    expect(validateRegister({ ...valid, displayName: astral.repeat(50) })).toEqual({});
    expect(validateRegister({ ...valid, displayName: astral.repeat(51) }).displayName).toBe(
      'A név legfeljebb 50 karakter lehet.',
    );
    // 7 kódpont (8 UTF-16 egység): a szerver elutasítaná
    expect(validateRegister({ ...valid, password: `abcdef${astral}` }).password).toBe(
      'A jelszó legalább 8 karakter legyen.',
    );
    expect(validateRegister({ ...valid, password: `abcdefg${astral}` })).toEqual({});
  });

  it('a név nem tartalmazhat vezérlő- és irányváltó karaktert, és kell benne betű vagy szám', () => {
    for (const hidden of [cp(0x0a), cp(0x09), cp(0x2028), cp(0x202e), cp(0x2066)]) {
      expect(validateRegister({ ...valid, displayName: `Kiss${hidden}Anna` }).displayName).toBe(
        'A név nem tartalmazhat sortörést vagy vezérlőkaraktert.',
      );
    }
    expect(validateRegister({ ...valid, displayName: '-- !!' }).displayName).toBe(
      'A név tartalmazzon legalább egy betűt vagy számot.',
    );
    expect(validateRegister({ ...valid, displayName: 'Ödön 2' })).toEqual({});
  });
});

describe('serverFieldErrors', () => {
  const fields = ['displayName', 'email', 'password'] as const;

  it('a szerver validációs hibáit a mezőkhöz rendeli (mondatként)', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', {
      details: [
        { path: 'email', message: 'érvényes e-mail-cím kell' },
        { path: 'password', message: 'legalább 8 karakter kell' },
        { path: 'ismeretlen', message: 'x' },
      ],
    });

    expect(serverFieldErrors(error, fields)).toEqual({
      email: 'Érvényes e-mail-cím kell.',
      password: 'Legalább 8 karakter kell.',
    });
  });

  it('ha egy mezőhöz több üzenet jön, az elsőt mutatja', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', {
      details: [
        { path: 'password', message: 'legalább 8 karakter kell' },
        { path: 'password', message: 'legfeljebb 72 bájt lehet' },
      ],
    });

    expect(serverFieldErrors(error, fields)).toEqual({ password: 'Legalább 8 karakter kell.' });
  });

  it('a foglalt e-mail-címet (409) az e-mail mezőhöz rendeli', () => {
    const error = new ApiError(409, 'EMAIL_TAKEN', 'Ezzel az e-mail-címmel már regisztráltak');

    expect(serverFieldErrors(error, fields)).toEqual({
      email: 'Ezzel az e-mail-címmel már regisztráltak.',
    });
  });

  it('üres szerverüzenetből nem lesz üres mezőhiba (a következő üzenet vagy saját szöveg jön)', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', {
      details: [
        { path: 'password', message: '  ' },
        { path: 'password', message: 'legalább 8 karakter kell' },
        { path: 'email', message: '' },
      ],
    });

    expect(serverFieldErrors(error, fields)).toEqual({ password: 'Legalább 8 karakter kell.' });
    expect(serverFieldErrors(new ApiError(409, 'EMAIL_TAKEN', ' '), fields)).toEqual({
      email: 'Ezzel az e-mail-címmel már regisztráltak.',
    });
  });

  it('más hibánál (hibás belépés, hálózat, ismeretlen) nincs mezőhiba', () => {
    expect(serverFieldErrors(new ApiError(401, 'INVALID_CREDENTIALS', 'Hibás'), fields)).toEqual(
      {},
    );
    expect(
      serverFieldErrors(
        new ApiError(400, 'VALIDATION_ERROR', 'x', { details: 'nem tömb' }),
        fields,
      ),
    ).toEqual({});
    expect(serverFieldErrors(new Error('x'), fields)).toEqual({});
  });
});
