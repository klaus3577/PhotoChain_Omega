import { describe, expect, it } from 'vitest';

import {
  redactRequestPath,
  requestLogLevel,
  requestLogMessage,
  requestPath,
} from './requestLogging.js';

describe('requestLogLevel', () => {
  it('sikeres válasznál info szintet ad', () => {
    expect(requestLogLevel(200)).toBe('info');
    expect(requestLogLevel(304)).toBe('info');
  });

  it('kliensoldali hibánál (4xx) warn szintet ad', () => {
    expect(requestLogLevel(404)).toBe('warn');
    expect(requestLogLevel(429)).toBe('warn');
  });

  it('szerverhibánál (5xx) vagy kivételnél error szintet ad', () => {
    expect(requestLogLevel(500)).toBe('error');
    expect(requestLogLevel(502)).toBe('error');
    expect(requestLogLevel(200, new Error('megszakadt kapcsolat'))).toBe('error');
  });

  // A 503 szándékos terheléskorlátozás (túl sok egyidejű feltöltés), nem hiba
  it('a 503-as („a szerver most foglalt”) választ warn szinten naplózza', () => {
    expect(requestLogLevel(503)).toBe('warn');
  });
});

describe('requestPath', () => {
  it('a teljes útvonalat adja, akkor is, ha az Express a req.url-t egy router alatt lerövidítette', () => {
    expect(requestPath({ url: '/register', originalUrl: '/api/auth/register' })).toBe(
      '/api/auth/register',
    );
  });

  it('Express nélkül (nincs originalUrl) a req.url-t adja', () => {
    expect(requestPath({ url: '/api/health' })).toBe('/api/health');
  });

  it('a hitelesség-ellenőrzésre küldött hash-t kitakarja (csak az útvonal mintája marad)', () => {
    expect(requestPath({ originalUrl: `/api/verify/${'a'.repeat(64)}` })).toBe(
      '/api/verify/:sha256',
    );
    expect(requestPath({ url: `/api/verify/0x${'A'.repeat(64)}?forras=etherscan` })).toBe(
      '/api/verify/:sha256',
    );
  });
});

describe('redactRequestPath', () => {
  it('csak a /api/verify/ utáni szakaszt takarja ki, a többi útvonalat változatlanul hagyja', () => {
    expect(redactRequestPath('/api/verify/nem-hash')).toBe('/api/verify/:sha256');
    expect(redactRequestPath('/api/verify')).toBe('/api/verify');
    expect(redactRequestPath('/api/photos/123?tag=verify')).toBe('/api/photos/123?tag=verify');
    expect(redactRequestPath(undefined)).toBeUndefined();
  });

  // A keresőszó személynév is lehet (pl. egy fotós neve): a naplóba csak a helye kerül
  it('a galéria keresőszavát (q) kitakarja, a többi paramétert megtartja', () => {
    expect(redactRequestPath('/api/photos?q=Kiss%20Anna&page=2')).toBe('/api/photos?q=***&page=2');
    expect(redactRequestPath('/api/photos?sort=newest&q=t%C3%B3csa')).toBe(
      '/api/photos?sort=newest&q=***',
    );
    expect(redactRequestPath('/api/photos?q=')).toBe('/api/photos?q=***');
    expect(redactRequestPath('/api/photos?quality=1&faq=2')).toBe('/api/photos?quality=1&faq=2');
  });

  // A lekérdezési rész kulcsát is dekódolja a szerver: a %71 („q”) ugyanaz a paraméter
  it('a százalékkódolt kulccsal (%71=) küldött keresőszót is kitakarja', () => {
    expect(redactRequestPath('/api/photos?%71=Kiss%20Anna&page=2')).toBe(
      '/api/photos?%71=***&page=2',
    );
    expect(redactRequestPath('/api/photos?%2571=x')).toBe('/api/photos?%2571=x');
  });

  // Az Express az útvonalban nem különbözteti meg a kis- és nagybetűt, és a teljes URL-es
  // („abszolút alakú”) kérést is kiszolgálja – a hash ilyenkor sem kerülhet a naplóba
  it('a nagybetűs és a teljes URL-es útvonalat is kitakarja', () => {
    const hash = 'A'.repeat(64);
    expect(redactRequestPath(`/API/VERIFY/${hash}`)).toBe('/API/VERIFY/:sha256');
    expect(redactRequestPath('/API/Verify/nem-hash')).toBe('/API/Verify/:sha256');
    expect(redactRequestPath(`http://pelda.hu/api/verify/${hash}`)).toBe(
      'http://pelda.hu/api/verify/:sha256',
    );
  });

  it('a Stripe-munkamenet azonosítóját (a rendelés állapotának útvonalán) kitakarja', () => {
    expect(redactRequestPath('/api/orders/by-session/cs_test_a1B2c3D4')).toBe(
      '/api/orders/by-session/:sessionId',
    );
    expect(redactRequestPath('/api/orders/by-session/cs_test_a1B2c3D4?x=1')).toBe(
      '/api/orders/by-session/:sessionId',
    );
    expect(redactRequestPath('/API/Orders/By-Session/cs_test_a1B2c3D4')).toBe(
      '/API/Orders/By-Session/:sessionId',
    );
  });

  it('bármely útvonalon kitakarja a 64 jegyű hexadecimális (SHA-256 alakú) szakaszt', () => {
    const hash = `0x${'b'.repeat(64)}`;
    expect(redactRequestPath(`/api//verify/${hash}?x=1`)).toBe('/api//verify/:sha256?x=1');
    expect(redactRequestPath('/api/photos/2f1c?nem=hash')).toBe('/api/photos/2f1c?nem=hash');
  });
});

describe('requestLogMessage', () => {
  it('egysoros, olvasható üzenetet ad: metódus, útvonal, státusz, idő', () => {
    expect(requestLogMessage('GET', '/api/photos?page=2', 200, 12.4)).toBe(
      'GET /api/photos?page=2 → 200 (12 ms)',
    );
  });
});
