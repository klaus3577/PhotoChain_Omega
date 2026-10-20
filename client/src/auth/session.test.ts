// A munkamenethez tartozó kis segédek: a belépés utáni visszairányítás célja (csak az alkalmazás saját,
// relatív útvonala lehet – nyílt átirányítás ellen) és a fiókmenü monogramja.
import { describe, expect, it } from 'vitest';

import { isAuthRequired, monogram, redirectTarget, returnTo } from './session';

describe('redirectTarget', () => {
  it('a védett oldal teljes címét adja vissza (útvonal, lekérdezés, horgony)', () => {
    expect(redirectTarget({ from: { pathname: '/upload', search: '?x=1', hash: '#a' } })).toBe(
      '/upload?x=1#a',
    );
    expect(redirectTarget({ from: { pathname: '/dashboard' } })).toBe('/dashboard');
  });

  it('a „?” nélküli lekérdezést és a „#” nélküli horgonyt elhagyja (nem toldja az útvonalhoz)', () => {
    expect(redirectTarget({ from: { pathname: '/upload', search: 'x=1', hash: 'a' } })).toBe(
      '/upload',
    );
  });

  it('külső vagy protokollrelatív címre nem irányít (nyílt átirányítás ellen)', () => {
    for (const pathname of [
      '//gonosz.hu',
      'https://gonosz.hu',
      '/\\gonosz.hu',
      'javascript:alert(1)',
      '',
    ]) {
      expect(redirectTarget({ from: { pathname } })).toBeNull();
    }
  });

  it('vezérlőkaraktert tartalmazó célra sem (a böngésző a tabulátort és a sortörést kihagyja a címből, így a „/[tab]/x” „//x” lenne)', () => {
    const nul = String.fromCharCode(0);
    for (const from of [
      { pathname: '/\t/gonosz.hu' },
      { pathname: '/\n/gonosz.hu' },
      { pathname: '/\r/gonosz.hu' },
      { pathname: `/upload${nul}` },
      { pathname: '/upload', search: '?x=\n1' },
    ]) {
      expect(redirectTarget({ from })).toBeNull();
    }
  });

  it('a belépő és a regisztrációs oldalra nem irányít vissza (körbeirányítás ellen)', () => {
    expect(redirectTarget({ from: { pathname: '/login' } })).toBeNull();
    expect(redirectTarget({ from: { pathname: '/register', search: '?a=1' } })).toBeNull();
  });

  it('a belépő oldal más írásmódjait is felismeri (a router kis- és nagybetűtől, záró perjeltől függetlenül illeszt)', () => {
    for (const pathname of ['/login/', '/LOGIN', '/Register/', '/register//']) {
      expect(redirectTarget({ from: { pathname } })).toBeNull();
    }
  });

  it('érvénytelen vagy hiányzó állapotnál nincs cél', () => {
    for (const state of [
      undefined,
      null,
      'szöveg',
      {},
      { from: null },
      { from: { pathname: 42 } },
    ]) {
      expect(redirectTarget(state)).toBeNull();
    }
  });
});

describe('isAuthRequired', () => {
  it('csak akkor igaz, ha a védett oldal kérte (required pontosan true) és a cél érvényes', () => {
    expect(isAuthRequired({ from: { pathname: '/_vedett' }, required: true })).toBe(true);
    for (const required of [false, undefined, 'true', 1]) {
      expect(isAuthRequired({ from: { pathname: '/_vedett' }, required })).toBe(false);
    }
    expect(isAuthRequired({ from: { pathname: '//gonosz.hu' }, required: true })).toBe(false);
  });
});

describe('returnTo', () => {
  const at = (pathname: string, state: unknown = null) => ({
    pathname,
    search: '',
    hash: '',
    state,
    key: 'k1',
  });

  it('a belépés vagy a regisztráció után az aktuális oldalra tér vissza', () => {
    const location = at('/fotok/1');

    expect(returnTo(location)).toEqual({ from: location });
  });

  it('a belépő és a regisztrációs oldalon a meglévő célt viszi tovább (a védett oldal nem vész el)', () => {
    const state = { from: { pathname: '/_vedett' }, required: true };

    expect(returnTo(at('/login', state))).toBe(state);
    expect(returnTo(at('/register', state))).toBe(state);
    expect(returnTo(at('/Login/', state))).toBe(state);
    expect(returnTo(at('/register'))).toBeNull();
  });
});

describe('monogram', () => {
  it('az első két szó kezdőbetűje nagybetűvel', () => {
    expect(monogram('Fekete Nóra')).toBe('FN');
    expect(monogram('  kiss   anna  maria ')).toBe('KA');
    expect(monogram('Ödön')).toBe('Ö');
  });

  it('kódpontonként vág (a kiegészítő síkon álló karaktert nem vágja ketté)', () => {
    const astral = String.fromCodePoint(0x1d400);
    expect(monogram(`${astral}bc Def`)).toBe(`${astral}D`);
  });

  it('betű nélküli névnél kérdőjel', () => {
    expect(monogram('   ')).toBe('?');
  });
});
