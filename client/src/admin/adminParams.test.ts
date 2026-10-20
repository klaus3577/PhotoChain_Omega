// Az adminfelület nézete az URL-ben (L25): keresőszó, tiltási szűrő és oldal a felhasználóknál,
// állapotszűrő és oldal a képeknél. A hibás érték az alapértelmezés (a szerver 400-at adna rá), az
// URL-be csak az alapértelmezettől eltérő paraméter kerül; a szerver lekérdezése ebből készül.
import { describe, expect, it } from 'vitest';

import {
  adminSearch,
  adminTitle,
  DEFAULT_ADMIN_PARAMS,
  parseAdminParams,
  photosApiQuery,
  usersApiQuery,
} from './adminParams';

const parse = (search: string) => parseAdminParams(new URLSearchParams(search));

describe('parseAdminParams', () => {
  it('üres lekérdezésnél az alapértelmezés: nincs keresés és szűrő, mindkét lista az első oldalon', () => {
    expect(parse('')).toEqual(DEFAULT_ADMIN_PARAMS);
    expect(DEFAULT_ADMIN_PARAMS).toEqual({
      q: '',
      users: 'all',
      usersPage: 1,
      status: null,
      photosPage: 1,
    });
  });

  it('az érvényes értékeket beolvassa: a tiltási szűrő a szerver blocked paramétere', () => {
    expect(parse('q=%20t%C3%B3%20&blocked=true&usersPage=2&status=HIDDEN&photosPage=3')).toEqual({
      q: 'tó',
      users: 'blocked',
      usersPage: 2,
      status: 'HIDDEN',
      photosPage: 3,
    });
    expect(parse('blocked=false').users).toBe('active');
  });

  it('az érvénytelen értékeket elhagyja (a szerver 400-at adna): szűrő, oldalszám, állapot, keresőszó', () => {
    expect(parse('blocked=maybe').users).toBe('all');
    expect(parse('usersPage=0').usersPage).toBe(1);
    expect(parse('usersPage=1001').usersPage).toBe(1);
    expect(parse('photosPage=abc').photosPage).toBe(1);
    expect(parse('status=FOO').status).toBeNull();
    expect(parse('status=registered').status).toBeNull();
    expect(parse('q=a%09b').q).toBe('');
    expect(parse(`q=${'a'.repeat(120)}`).q).toBe('a'.repeat(100));
  });
});

describe('adminSearch', () => {
  it('az alapértelmezett nézeté üres; különben csak az eltérő paraméterek, rögzített sorrendben', () => {
    expect(adminSearch(DEFAULT_ADMIN_PARAMS)).toBe('');
    expect(
      adminSearch({ q: 'tó', users: 'blocked', usersPage: 2, status: 'HIDDEN', photosPage: 3 }),
    ).toBe('?q=t%C3%B3&blocked=true&usersPage=2&status=HIDDEN&photosPage=3');
    expect(adminSearch({ ...DEFAULT_ADMIN_PARAMS, users: 'active' })).toBe('?blocked=false');
  });

  it('oda-vissza: a beolvasott nézet ugyanazt az URL-t adja', () => {
    const search = '?q=fanni&blocked=true&usersPage=2&status=CHAIN_FAILED&photosPage=4';
    expect(adminSearch(parse(search))).toBe(search);
  });
});

describe('usersApiQuery / photosApiQuery', () => {
  it('a szerver lekérdezése: a nézet paraméterei és az oldalméret (20)', () => {
    expect(usersApiQuery(DEFAULT_ADMIN_PARAMS)).toBe('?page=1&pageSize=20');
    expect(
      usersApiQuery({ q: 'tó', users: 'blocked', usersPage: 2, status: 'HIDDEN', photosPage: 3 }),
    ).toBe('?q=t%C3%B3&blocked=true&page=2&pageSize=20');
    expect(usersApiQuery({ ...DEFAULT_ADMIN_PARAMS, users: 'active' })).toBe(
      '?blocked=false&page=1&pageSize=20',
    );
    expect(photosApiQuery(DEFAULT_ADMIN_PARAMS)).toBe('?page=1&pageSize=20');
    expect(
      photosApiQuery({ q: 'tó', users: 'blocked', usersPage: 2, status: 'HIDDEN', photosPage: 3 }),
    ).toBe('?status=HIDDEN&page=3&pageSize=20');
  });
});

describe('adminTitle', () => {
  it('a böngészőfül címe a szűrőkkel és a lapozott listák oldalával – a keresőszó nélkül (az előzményekben maradna)', () => {
    expect(adminTitle(DEFAULT_ADMIN_PARAMS)).toBe('Adminisztráció');
    expect(adminTitle({ ...DEFAULT_ADMIN_PARAMS, q: 'vera@pelda.hu' })).toBe('Adminisztráció');
    expect(adminTitle({ ...DEFAULT_ADMIN_PARAMS, users: 'blocked', status: 'HIDDEN' })).toBe(
      'Adminisztráció – tiltott felhasználók – rejtett képek',
    );
    expect(
      adminTitle({ ...DEFAULT_ADMIN_PARAMS, users: 'active', usersPage: 2, photosPage: 3 }),
    ).toBe('Adminisztráció – aktív felhasználók, 2. oldal – képek, 3. oldal');
    expect(adminTitle({ ...DEFAULT_ADMIN_PARAMS, status: 'CHAIN_FAILED', photosPage: 2 })).toBe(
      'Adminisztráció – sikertelen regisztrációjú képek, 2. oldal',
    );
  });
});
