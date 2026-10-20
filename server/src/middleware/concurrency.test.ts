// Az egyidejű kérések korlátjának tesztjei (a képfeltöltés memóriaigényének felső határa).
import { once } from 'node:events';
import type { Server } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type ConcurrencyLimitMessages, createConcurrencyLimit } from './concurrency.js';
import { errorHandler } from './errorHandler.js';

let server: Server | undefined;

afterEach(() => {
  server?.closeAllConnections();
  server?.close();
  server = undefined;
});

/** A felhasználót a próbában az X-Felhasznalo fejléc adja. */
const USER_HEADER = 'X-Felhasznalo';

/**
 * Próbaszerver közös korláttal: a /lassu kérései addig várnak, amíg a release() el nem engedi
 * őket; a /gyors azonnal válaszol (ha van szabad hely); a /kesleltetett a korlát előtt vár egy
 * kicsit (mint a valódi útvonalon a bejelentkezés adatbázis-ellenőrzése).
 */
async function startProbe(total: number, perKey = total, messages?: ConcurrencyLimitMessages) {
  const waiting: (() => void)[] = [];
  const limit = createConcurrencyLimit({
    total,
    perKey,
    keyOf: (req) => req.get(USER_HEADER) ?? 'névtelen',
    messages,
  });
  const app = express();
  app.post('/lassu', limit, (_req, res) => {
    waiting.push(() => res.json({ data: { ok: true } }));
  });
  app.post('/gyors', limit, (_req, res) => {
    res.json({ data: { ok: true } });
  });
  app.post(
    '/kesleltetett',
    async (_req, _res, next) => {
      await sleep(100);
      next();
    },
    limit,
    (_req, res) => {
      res.json({ data: { ok: true } });
    },
  );
  app.use(errorHandler);
  const listening = app.listen(0);
  server = listening;
  await once(listening, 'listening');
  return {
    slow: (user = 'anna') => request(listening).post('/lassu').set(USER_HEADER, user),
    fast: (user = 'anna') => request(listening).post('/gyors').set(USER_HEADER, user),
    delayed: (user = 'anna') => request(listening).post('/kesleltetett').set(USER_HEADER, user),
    /** Megvárja, hogy `count` lassú kérés a kezelőben várakozzon. */
    entered: (count: number) => vi.waitFor(() => expect(waiting).toHaveLength(count)),
    release: () => waiting.splice(0).forEach((respond) => respond()),
  };
}

describe('createConcurrencyLimit', () => {
  it('az elutasítások üzenete útvonalanként megadható', async () => {
    const probe = await startProbe(1, 1, {
      perKey: 'Csak egy ellenőrzésed futhat',
      total: 'Most túl sok az ellenőrzés',
    });
    const first = probe.slow('anna').then();
    await probe.entered(1);

    const sameUser = await probe.fast('anna');
    const otherUser = await probe.fast('bela');

    expect(sameUser.body.error.message).toBe('Csak egy ellenőrzésed futhat');
    expect(otherUser.body.error.message).toBe('Most túl sok az ellenőrzés');
    probe.release();
    expect((await first).status).toBe(200);
  });

  it('a korlát fölötti kérést 503-mal (Retry-After fejléccel) elutasítja', async () => {
    const probe = await startProbe(2, 1);
    const first = probe.slow('anna').then();
    const second = probe.slow('bela').then();
    await probe.entered(2);

    const third = await probe.fast('cecil');

    expect(third.status).toBe(503);
    expect(third.body.error.code).toBe('SERVER_BUSY');
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    probe.release();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
  });

  it('felhasználónként is korlátoz: a második egyidejű kérése 429, a többieké átmegy', async () => {
    const probe = await startProbe(4, 1);
    const first = probe.slow('anna').then();
    await probe.entered(1);

    const sameUser = await probe.fast('anna');
    const otherUser = await probe.fast('bela');

    expect(sameUser.status).toBe(429);
    expect(sameUser.body.error.code).toBe('RATE_LIMITED');
    expect(otherUser.status).toBe(200);
    probe.release();
    await first;
    await vi.waitFor(async () => expect((await probe.fast('anna')).status).toBe(200));
  });

  it('kulcsonként több hely is engedélyezhető; a helyek egyenként szabadulnak fel', async () => {
    const probe = await startProbe(4, 2);
    const first = probe.slow('anna').then();
    const second = probe.slow('anna').then();
    await probe.entered(2);

    expect((await probe.fast('anna')).status).toBe(429);

    probe.release();
    await Promise.all([first, second]);
    await vi.waitFor(async () => expect((await probe.fast('anna')).status).toBe(200));
  });

  it('a válasz elküldése után a hely felszabadul', async () => {
    const probe = await startProbe(1);
    const first = probe.slow('anna').then();
    await probe.entered(1);
    expect((await probe.fast('bela')).status).toBe(503);

    probe.release();
    await first;

    await vi.waitFor(async () => expect((await probe.fast('bela')).status).toBe(200));
  });

  it('a megszakított kérés helye is felszabadul', async () => {
    const probe = await startProbe(1);
    const pending = probe.slow();
    const outcome = pending.then(
      () => 'válasz',
      () => 'megszakadt',
    );
    await probe.entered(1);

    pending.abort();

    await expect(outcome).resolves.toBe('megszakadt');
    // A szerver a kapcsolat bontásáról kicsivel később értesül
    await vi.waitFor(async () => expect((await probe.fast()).status).toBe(200));
  });

  // A kapcsolat már a korlát előtt megszakadt: a „close” esemény addigra lezajlott – a helyet nem
  // foglalhatja le örökre egy olyan kérés, amelyre már senki nem vár
  it('a korlát előtt megszakadt kérés sem foglal le helyet', async () => {
    const probe = await startProbe(1);
    const pending = probe.delayed();
    const outcome = pending.then(
      () => 'válasz',
      () => 'megszakadt',
    );
    await sleep(20);

    pending.abort();
    await expect(outcome).resolves.toBe('megszakadt');
    await sleep(200);

    expect((await probe.fast()).status).toBe(200);
  });
});
