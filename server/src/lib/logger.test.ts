// A napló titokszűrésének tesztje: a megadott titkos értékek (RPC-URL a kulccsal, privát kulcs)
// egyetlen naplósorba sem kerülhetnek ki – akkor sem, ha egy hiba üzenete vagy egy mező tartalmazza.
import { Writable } from 'node:stream';

import { symbols } from 'pino';
import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

const RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/ALCHEMY-KULCS-1234567890';
const PRIVATE_KEY = `0x${'ab'.repeat(32)}`;

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, destination };
}

describe('createLogger – titokszűrés', () => {
  it('a megadott titkokat minden naplósorban kitakarja: üzenet, mezők, hibaobjektum', () => {
    const { lines, destination } = capture();
    const logger = createLogger(
      { NODE_ENV: 'test', LOG_LEVEL: 'info' },
      { secrets: [RPC_URL, PRIVATE_KEY], destination },
    );

    logger.info(`kapcsolódás: ${RPC_URL}`);
    logger.warn({ url: RPC_URL, key: PRIVATE_KEY }, 'beállítás');
    logger.error({ err: new Error(`server response 401 (requestUrl="${RPC_URL}")`) }, 'hiba');

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line) as unknown).not.toThrow();
      expect(line).not.toContain('ALCHEMY-KULCS');
      expect(line).not.toContain('ab'.repeat(32));
      expect(line).toContain('[REJTETT]');
    }
  });

  it('a naplósor a kitakarás után is érvényes JSON marad (fordított perjeles, idézőjeles titok)', () => {
    const { lines, destination } = capture();
    // A JSON-sorban a fordított perjel duplázva, az idézőjel escape-elve szerepel
    const secrets = ['jelszo"idezojellel\\', 'perjelre-vegzodik\\'];
    const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'info' }, { secrets, destination });

    for (const secret of secrets) logger.info({ value: secret }, `a titok: ${secret} vége`);

    for (const line of lines) {
      const entry = JSON.parse(line) as { msg: string; value: string };
      expect(entry.msg).toBe('a titok: [REJTETT] vége');
      expect(entry.value).toBe('[REJTETT]');
    }
  });

  it('fejlesztői módban a pino-pretty transzporttal (külön szálon) jön létre a naplózó, a szint a beállítás szerint (L27)', () => {
    // A transzport külön szálon fut (ThreadStream): a naplózó csak létrejön, a némaság miatt nem ír
    const logger = createLogger({ NODE_ENV: 'development', LOG_LEVEL: 'silent' });
    const stream = (logger as unknown as Record<symbol, { constructor: { name: string } }>)[
      symbols.streamSym
    ];

    expect(logger.level).toBe('silent');
    expect(stream?.constructor.name).toBe('ThreadStream');
    expect(() => logger.info('próba')).not.toThrow();
  });

  it('titkok nélkül a naplósor változatlan', () => {
    const { lines, destination } = capture();
    const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'info' }, { destination });

    logger.info('minden rendben');

    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ msg: 'minden rendben' });
  });
});
