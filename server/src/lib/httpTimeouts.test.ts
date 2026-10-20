import { once } from 'node:events';
import { Agent, createServer, get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import {
  closeGracefully,
  configureHttpTimeouts,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from './httpTimeouts.js';

describe('configureHttpTimeouts', () => {
  it('beállítja a kérés, a fejlécek és az üresjárati kapcsolat időkorlátját', () => {
    const server = createServer();

    configureHttpTimeouts(server);

    expect(server.requestTimeout).toBe(REQUEST_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
  });

  it('az üresjárati kapcsolatot tovább tartja nyitva, mint a Node alapértéke (5 s) és a proxy (120 s)', () => {
    // A fordított proxy (Render) az üresjárati kapcsolatot újrahasznosítja: ha a szerver előbb zárja
    // le, a proxy egy már lezárt kapcsolatra küldheti a kérést → időnként 502-es hiba
    expect(KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(120_000);
  });

  it('a fejlécek időkorlátja nagyobb az üresjárati időnél, de nem nagyobb a teljes kérésénél', () => {
    expect(HEADERS_TIMEOUT_MS).toBeGreaterThan(KEEP_ALIVE_TIMEOUT_MS);
    expect(HEADERS_TIMEOUT_MS).toBeLessThanOrEqual(REQUEST_TIMEOUT_MS);
  });
});

describe('closeGracefully', () => {
  it('a leállítás közben futó kérés befejeződik, és utána a nyitva maradó kapcsolat sem tartja fel a leállást', async () => {
    // A kérés lassú: a leállítás alatta indul (mint egy SIGTERM egy folyamatban lévő kérés közben)
    const server = createServer((_req, res) => {
      setTimeout(() => res.end('kész'), 300);
    });
    configureHttpTimeouts(server);
    server.listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const agent = new Agent({ keepAlive: true });

    const response = new Promise<{ status: number | undefined; body: string }>((resolve) => {
      get({ port, agent }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
    });
    await sleep(100);
    const started = Date.now();
    const closed = new Promise<void>((resolve) => closeGracefully(server, resolve));

    expect(await response).toEqual({ status: 200, body: 'kész' });
    await closed;
    // Az üresjárati időkorlát (125 s) helyett legfeljebb néhány másodperc
    expect(Date.now() - started).toBeLessThan(5_000);
    agent.destroy();
  });
});
