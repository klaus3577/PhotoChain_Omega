import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from './jwt.js';

const SECRET = 'teszt-titok-legalabb-32-karakter-hosszu';
const USER_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';

const base64Url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('signSessionToken + verifySessionToken', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ha a könyvtár nem objektum törzset adna vissza (szöveges payload), azt is elutasítja', () => {
    // A jsonwebtoken a maxAge miatt a szöveges törzsű tokent már maga elveti (nincs iat); az őr
    // (`typeof payload !== 'object'`) védekező ág, amely a könyvtár jövőbeli viselkedésétől
    // függetlenül tartja a „csak objektum törzs” szabályt – a teszt ezt az ágat fedi le, az
    // eredményt az őr nélkül is a UUID-ellenőrzés adná (L27)
    const verify = vi.spyOn(jwt, 'verify').mockReturnValue('csak-szoveg' as never);

    expect(verifySessionToken('akarmi', SECRET)).toBeNull();
    // A helyettesítés valóban élt, és az ellenőrzés a rögzített algoritmussal és élettartammal hív
    expect(verify).toHaveBeenCalledWith('akarmi', SECRET, {
      algorithms: ['HS256'],
      maxAge: SESSION_TTL_SECONDS,
    });
  });

  it('az aláírt tokenből visszaadja a felhasználó azonosítóját', () => {
    const token = signSessionToken(USER_ID, SECRET);

    expect(verifySessionToken(token, SECRET)).toBe(USER_ID);
  });

  it('HS256-tal aláírt JWT; a törzsében csak az azonosító és a két időbélyeg van', () => {
    const decoded = jwt.decode(signSessionToken(USER_ID, SECRET), { complete: true });
    const payload = decoded?.payload as jwt.JwtPayload;

    expect(decoded?.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(payload.sub).toBe(USER_ID);
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(SESSION_TTL_SECONDS);
  });

  it('a token 7 napig érvényes, utána lejár', () => {
    vi.useFakeTimers({ now: new Date('2026-10-01T12:00:00Z') });
    const token = signSessionToken(USER_ID, SECRET);

    vi.setSystemTime(new Date('2026-10-08T11:59:00Z'));
    expect(verifySessionToken(token, SECRET)).toBe(USER_ID);

    vi.setSystemTime(new Date('2026-10-08T12:00:01Z'));
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it('más titokkal aláírt tokent elutasít', () => {
    const token = signSessionToken(USER_ID, 'egy-masik-titok-ami-szinten-eleg-hosszu');

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it('módosított törzsű tokent elutasít (az aláírás már nem egyezik)', () => {
    const [header, , signature] = signSessionToken(USER_ID, SECRET).split('.');
    const forgedPayload = base64Url({ sub: 'masik-felhasznalo', iat: 1, exp: 9_999_999_999 });

    expect(verifySessionToken(`${header}.${forgedPayload}.${signature}`, SECRET)).toBeNull();
  });

  // Megjegyzés: ezt a jsonwebtoken az algoritmus rögzítése nélkül is elutasítaná (titok megadásakor
  // az aláírás kötelező); az algoritmus rögzítését a következő, HS512-es teszt bizonyítja
  it('aláírás nélküli („alg: none”) tokent elutasít', () => {
    const unsigned = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ sub: USER_ID })}.`;

    expect(verifySessionToken(unsigned, SECRET)).toBeNull();
  });

  it('más algoritmussal (HS512) aláírt tokent elutasít', () => {
    const token = jwt.sign({}, SECRET, { algorithm: 'HS512', subject: USER_ID });

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it('felhasználó-azonosító (sub) nélküli tokent elutasít', () => {
    const token = jwt.sign({ userId: USER_ID }, SECRET, { algorithm: 'HS256' });

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it('érvényesen aláírt, de nem UUID azonosítójú tokent elutasít', () => {
    const token = jwt.sign({}, SECRET, { algorithm: 'HS256', subject: 'nem-uuid', expiresIn: 60 });

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it('kiállítási idő (iat) nélküli tokent elutasít', () => {
    const token = jwt.sign({}, SECRET, { algorithm: 'HS256', subject: USER_ID, noTimestamp: true });

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it('lejárat (exp) nélküli tokent is csak a kiállítástól számított 7 napig fogad el', () => {
    const issuedAt = (daysAgo: number): number => Math.floor(Date.now() / 1000) - daysAgo * 86_400;
    const sign = (iat: number): string =>
      jwt.sign({ iat }, SECRET, { algorithm: 'HS256', subject: USER_ID });

    expect(verifySessionToken(sign(issuedAt(6)), SECRET)).toBe(USER_ID);
    expect(verifySessionToken(sign(issuedAt(8)), SECRET)).toBeNull();
  });

  it('nem JWT formájú szöveget elutasít', () => {
    expect(verifySessionToken('ez-nem-token', SECRET)).toBeNull();
    expect(verifySessionToken('', SECRET)).toBeNull();
  });

  it('érvényes fejlécű, de nem JSON törzsű tokenre sem dob hibát, hanem elutasítja', () => {
    // A jsonwebtoken a törzset az aláírás ellenőrzése előtt értelmezi, és ilyenkor SyntaxError-t dob
    const header = base64Url({ alg: 'HS256', typ: 'JWT' });
    const brokenPayloads = ['ez-nem-json', '{"sub":'];

    for (const payload of brokenPayloads) {
      const token = `${header}.${Buffer.from(payload).toString('base64url')}.x`;
      expect(verifySessionToken(token, SECRET)).toBeNull();
    }
  });
});
