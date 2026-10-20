// Strukturált (JSON) naplózás pinóval; fejlesztéskor olvasható, színes kimenettel (pino-pretty).
// Forrás: pino dokumentáció – API (hooks.streamWrite), Redaction, Transports, https://getpino.io/
// (adaptálva)
import { type DestinationStream, pino, type Logger } from 'pino';

import type { Env } from '../config/env.js';

const CENSOR = '[REJTETT]';

/** Érzékeny adatok, amelyek sosem kerülhetnek a naplóba (munkamenet-süti, jogosultsági fejléc). */
const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

export interface LoggerOptions {
  /**
   * Titkos értékek (pl. az RPC-URL a kulccsal, a privát kulcs – config/env.ts sensitiveValues), amelyek
   * egyetlen naplósorba sem kerülhetnek ki: ha egy hibaüzenet vagy mező mégis tartalmazza, kitakarjuk.
   */
  secrets?: readonly string[];
  /** A napló célja (a teszteknek); alapból a standard kimenet */
  destination?: DestinationStream;
}

/**
 * A kész (JSON) naplósorból kitakarja a titkokat. A sorban minden szöveg JSON-escape-elt alakban
 * szerepel (pl. a fordított perjel duplán), ezért a titkot is így keressük – a nyers alak cseréje a
 * sor szerkezetét is elronthatná (pl. egy perjelre végződő titok esetén).
 */
function maskSecrets(line: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (masked, secret) => masked.replaceAll(JSON.stringify(secret).slice(1, -1), CENSOR),
    line,
  );
}

export function createLogger(
  env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>,
  { secrets = [], destination }: LoggerOptions = {},
): Logger {
  const options = {
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: CENSOR },
    // Utolsó védvonal: a kiírás előtt minden sorból kitakarjuk a titkokat
    ...(secrets.length > 0
      ? { hooks: { streamWrite: (line: string) => maskSecrets(line, secrets) } }
      : {}),
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            // A kérés/válasz részletei a tömör üzenetsorban már szerepelnek
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss',
              ignore: 'pid,hostname,req,res,responseTime',
            },
          },
        }
      : {}),
  };
  return destination ? pino(options, destination) : pino(options);
}
