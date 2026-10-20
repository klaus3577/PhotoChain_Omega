// A kérés törzsének beérkezési határideje: a lassan csepegtetett törzs nem tarthat foglalva egy
// helyet az egyidejűségi korlátban (a hitelesség-ellenőrzésnél).
import { EventEmitter, once } from 'node:events';
import { request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBodyDeadline } from './bodyDeadline.js';

let server: Server | undefined;

afterEach(() => {
  server?.closeAllConnections();
  server?.close();
  server = undefined;
});

/** Próbaszerver: a törzset végigolvassa, és utána válaszol. */
async function startProbe(timeoutMs: number): Promise<Server> {
  const app = express();
  app.post('/', createBodyDeadline(timeoutMs), (req, res) => {
    req.resume();
    req.on('end', () => {
      res.json({ data: { ok: true } });
    });
  });
  const listening = app.listen(0);
  await once(listening, 'listening');
  server = listening;
  return listening;
}

describe('createBodyDeadline', () => {
  it('ha a törzs a határidőig nem érkezik meg teljesen, a kapcsolatot bontja', async () => {
    const probe = await startProbe(100);
    const { port } = probe.address() as AddressInfo;
    const pending = httpRequest({ port, method: 'POST', headers: { 'Content-Length': '1000' } });
    // A bejelentett 1000 bájtból csak 10 érkezik meg – a többi sosem
    pending.write('a'.repeat(10));

    const [error] = (await once(pending, 'error')) as [NodeJS.ErrnoException];

    expect(error.code).toBe('ECONNRESET');
  });

  it('a határidőn belül beérkező törzzsel a kérés rendben lefut', async () => {
    const probe = await startProbe(300);
    const { port } = probe.address() as AddressInfo;
    const pending = httpRequest({ port, method: 'POST', headers: { 'Content-Length': '20' } });
    const responded = once(pending, 'response');

    // Két részletben, de a határidőn belül
    pending.write('a'.repeat(10));
    await sleep(50);
    pending.end('b'.repeat(10));
    const [response] = (await responded) as [IncomingMessage];

    expect(response.statusCode).toBe(200);
  });

  it.each(['end', 'close'])(
    'a beolvasott (end) vagy lezárult (close) kérés határidejét törli – nem marad futó időzítő (%s)',
    (event) => {
      vi.useFakeTimers();
      try {
        const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
        const next = vi.fn();

        createBodyDeadline(1_000)(req as never, {} as never, next);
        expect(next).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(1);
        req.emit(event);

        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(2_000);
        expect(req.destroy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('a gyorsan beérkező kérés után a határidő lejárta sem okoz hibát', async () => {
    const probe = await startProbe(50);

    const response = await request(probe).post('/').send('rövid törzs');
    await sleep(100);

    expect(response.status).toBe(200);
    expect((await request(probe).post('/').send('még egy')).status).toBe(200);
  });
});
