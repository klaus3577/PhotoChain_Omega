// A regisztráció állapotának lekérdezési üteme (L21, biztonsági átnézés): 3 másodpercenként, két perc
// után ritkábban, tíz perc után leáll – egy sokáig függő kép se fogyassza el az API kérelemkeretét
// (300 kérés / 15 perc / IP); a 429 a Retry-After szerint vár, a 404 (a kép eltűnt) leállít.
import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/http';
import {
  createPollClock,
  POLL_INTERVAL_MS,
  POLL_LIMIT_MS,
  pollErrorNoteOf,
  pollIntervalOf,
  SLOW_POLL_AFTER_MS,
  SLOW_POLL_INTERVAL_MS,
} from './pollInterval';

const pending = { pending: true, error: null };

describe('createPollClock', () => {
  it('indítás előtt 0; az első indítástól méri az időt, az ismételt indítás nem állítja újra', () => {
    let now = 1000;
    const clock = createPollClock(() => now);

    expect(clock.elapsedMs()).toBe(0);
    clock.start();
    now = 4500;
    expect(clock.elapsedMs()).toBe(3500);
    clock.start();
    now = 6000;
    expect(clock.elapsedMs()).toBe(5000);
  });

  it('a függő elemek követése: csak újonnan megjelenő azonosítónál indul újra (a régóta függő nem nyitja újra az időkeretet)', () => {
    let now = 0;
    const clock = createPollClock(() => now);
    clock.trackPending(['a']);
    now = 500_000;
    expect(clock.elapsedMs()).toBe(500_000);

    clock.trackPending(['a']);
    expect(clock.elapsedMs()).toBe(500_000);
    clock.trackPending(['a', 'b']);
    expect(clock.elapsedMs()).toBe(0);
    now = 700_000;
    clock.trackPending([]);
    clock.trackPending(['b']);
    expect(clock.elapsedMs()).toBe(200_000);
  });

  it('az újraindítás nulláz – amikor újra van mire várni (pl. új függő kép), az időkeret elölről indul', () => {
    let now = 1000;
    const clock = createPollClock(() => now);
    clock.start();
    now = 700_000;

    clock.restart();
    now = 703_000;

    expect(clock.elapsedMs()).toBe(3000);
  });
});

describe('pollIntervalOf', () => {
  it('függő képnél 3 másodperc; két perc után 30 másodperc', () => {
    expect(POLL_INTERVAL_MS).toBe(3000);
    expect(pollIntervalOf({ ...pending, elapsedMs: 0 })).toBe(POLL_INTERVAL_MS);
    expect(pollIntervalOf({ ...pending, elapsedMs: SLOW_POLL_AFTER_MS - 1 })).toBe(
      POLL_INTERVAL_MS,
    );
    expect(pollIntervalOf({ ...pending, elapsedMs: SLOW_POLL_AFTER_MS })).toBe(
      SLOW_POLL_INTERVAL_MS,
    );
  });

  it('tíz perc után leáll', () => {
    expect(pollIntervalOf({ ...pending, elapsedMs: POLL_LIMIT_MS - 1 })).toBe(
      SLOW_POLL_INTERVAL_MS,
    );
    expect(pollIntervalOf({ ...pending, elapsedMs: POLL_LIMIT_MS })).toBe(false);
  });

  it('ha már nincs mire várni (hitelesítve, sikertelen, elrejtve; kifizetett rendelés), leáll', () => {
    expect(pollIntervalOf({ pending: false, error: null, elapsedMs: 0 })).toBe(false);
  });

  it('404 (a kép már nem elérhető): leáll; 429: a Retry-After szerint, de legalább 3 másodperc; más hiba: tovább', () => {
    const at = (error: unknown) => pollIntervalOf({ ...pending, elapsedMs: 0, error });
    expect(at(new ApiError(404, 'NOT_FOUND', 'A kép nem található'))).toBe(false);
    expect(at(new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés', { retryAfterSeconds: 60 }))).toBe(
      60_000,
    );
    expect(at(new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés', { retryAfterSeconds: 1 }))).toBe(
      POLL_INTERVAL_MS,
    );
    expect(at(new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés'))).toBe(SLOW_POLL_INTERVAL_MS);
    // A várakozás nem nyúlhat a tíz perces határon túl (egy hamis vagy óriási Retry-After sem)
    expect(
      pollIntervalOf({
        ...pending,
        elapsedMs: POLL_LIMIT_MS - 1000,
        error: new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés', { retryAfterSeconds: 60 }),
      }),
    ).toBe(false);
    expect(
      at(new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés', { retryAfterSeconds: 2_147_483_647 })),
    ).toBe(false);
    expect(at(new ApiError(500, 'INTERNAL_ERROR', 'Váratlan hiba'))).toBe(POLL_INTERVAL_MS);
    expect(at(new Error('hálózat'))).toBe(POLL_INTERVAL_MS);
  });
});

describe('pollErrorNoteOf', () => {
  const UNAVAILABLE = 'Az állapot a vezérlőpulton nézhető meg.';

  it('404-nél a hívó megjegyzése (a kép már nem elérhető ebben a munkamenetben)', () => {
    expect(pollErrorNoteOf(new ApiError(404, 'NOT_FOUND', 'Nincs ilyen kép'), UNAVAILABLE)).toBe(
      UNAVAILABLE,
    );
  });

  it('429-nél a Retry-After szerinti várakozás: egy percen belül másodpercben, fölötte felfelé kerekített percben', () => {
    const limited = (retryAfterSeconds: number) =>
      new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés', { retryAfterSeconds });

    // A határ és a felfelé kerekítés: 59 s még másodperc, 60 s egy perc, 61 s már két perc
    expect(pollErrorNoteOf(limited(59), UNAVAILABLE)).toBe(
      'Túl sok kérés: a következő lekérdezés kb. 59 másodperc múlva.',
    );
    expect(pollErrorNoteOf(limited(60), UNAVAILABLE)).toBe(
      'Túl sok kérés: a következő lekérdezés kb. 1 perc múlva.',
    );
    expect(pollErrorNoteOf(limited(61), UNAVAILABLE)).toBe(
      'Túl sok kérés: a következő lekérdezés kb. 2 perc múlva.',
    );
  });

  it('más hibánál (429 Retry-After nélkül, szerverhiba, hálózat) az újrapróbálást ígérő általános szöveg', () => {
    const generic =
      'Az állapot lekérdezése most nem sikerült; néhány másodperc múlva újra próbáljuk.';

    expect(pollErrorNoteOf(new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés'), UNAVAILABLE)).toBe(
      generic,
    );
    expect(pollErrorNoteOf(new ApiError(500, 'INTERNAL_ERROR', 'Hiba'), UNAVAILABLE)).toBe(generic);
    expect(pollErrorNoteOf(new Error('hálózat'), UNAVAILABLE)).toBe(generic);
  });
});
