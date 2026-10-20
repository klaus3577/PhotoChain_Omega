// Folyamatkezelő segédek az E2E-környezethez: egyszeri lépések (fordítás, telepítés, migráció)
// megvárva, hosszan futó folyamatok (lánc, szerver, kliens) naplófájlba irányítva, a portok és a
// HTTP-végpontok készenlétének megvárása, leállítás. Minden folyamatot közvetlenül a Node indít (nem
// shell-en át), így Windowson is a tényleges folyamatot állítjuk le. Minden indított folyamat egy
// közös listába kerül, hogy hibás előkészítés után se maradjon árva folyamat (stopAll).
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';

import { LOG_DIR } from './env';

const CENSOR = '[REJTETT]';
/** Egy egyszeri lépés (fordítás, telepítés, migráció) leghosszabb futása */
const STEP_TIMEOUT_MS = 10 * 60 * 1000;
/** Ennyit várunk a leállított folyamat kilépésére, mielőtt kényszerrel zárnánk le */
const STOP_GRACE_MS = 5000;
const POLL_MS = 500;
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'] as const;

export interface StepOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Ezeket az értékeket a hibaüzenetből kitakarjuk (pl. az adatbázis jelszava) */
  mask?: readonly string[];
}

function masked(text: string, mask: readonly string[]): string {
  return mask.filter(Boolean).reduce((result, secret) => result.replaceAll(secret, CENSOR), text);
}

/** Egy egyszeri lépés megvárva; hibánál a kimenet végével (titkok nélkül) dob. */
export function runStep(
  label: string,
  command: string,
  args: readonly string[],
  { cwd, env, mask = [] }: StepOptions,
): string {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: STEP_TIMEOUT_MS,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    const reason = result.error
      ? result.error.message
      : `kilépési kód ${result.status ?? '?'}${result.signal ? `, jel ${result.signal}` : ''}`;
    throw new Error(`${label}: sikertelen (${reason})\n${masked(output.slice(-3000), mask)}`);
  }
  console.log(`  ${label} – kész (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  return output;
}

export interface ProcessOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** A naplófájl neve a logs/ mappában */
  logName: string;
}

export interface ManagedProcess {
  child: ChildProcess;
  /** A folyamat neve a hibaüzenetekben */
  label: string;
  logName: string;
}

/** Az ebben a futásban indított, még le nem állított folyamatok (indítási sorrendben) */
const running: ManagedProcess[] = [];

/** Hosszan futó folyamat; a kimenete (stdout és stderr) a logs/<logName> fájlba megy. */
export function startProcess(
  label: string,
  command: string,
  args: readonly string[],
  { cwd, env, logName }: ProcessOptions,
): ManagedProcess {
  mkdirSync(LOG_DIR, { recursive: true });
  const log = createWriteStream(join(LOG_DIR, logName));
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Két forrás egy fájlba: egyik lezárulása se zárja le a naplót (a másik még írhat); a naplót a
  // folyamat kilépése zárja
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  child.once('exit', () => log.end());
  const managed = { child, label, logName };
  running.push(managed);
  return managed;
}

/** Leállítja a folyamatot, és megvárja a kilépését; ha nem lép ki időben, kényszerrel zárja le. */
export async function stopProcess(process: ManagedProcess | undefined): Promise<void> {
  if (!process) return;
  const { child } = process;
  const index = running.indexOf(process);
  if (index >= 0) running.splice(index, 1);
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill();
  const timer = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
  await exited;
  clearTimeout(timer);
}

/** Minden még futó folyamat leállítása, az indításhoz képest fordított sorrendben. */
export async function stopAll(): Promise<void> {
  for (const process of [...running].reverse()) {
    await stopProcess(process);
  }
}

function connects(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Igaz, ha a porton senki sem figyel – sem az IPv4-es, sem az IPv6-os visszacsatoló címen. */
export async function isPortFree(port: number): Promise<boolean> {
  const results = await Promise.all(LOOPBACK_HOSTS.map((host) => connects(host, port)));
  return results.every((listening) => !listening);
}

export interface ReadinessOptions {
  timeoutMs: number;
  /** Mikor számít késznek a válasz (alapból bármilyen HTTP-válasz) */
  accept?: (response: Response) => boolean;
  init?: RequestInit;
  /** A várt folyamat: ha a készenlét előtt kilép (pl. foglalt port), a várakozás azonnal hibával zárul */
  process?: ManagedProcess;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Megvárja, hogy a cím a feltétel szerinti választ adja – vagy hogy a folyamat kilépjen. */
export async function waitForHttp(
  label: string,
  url: string,
  { timeoutMs, accept = () => true, init, process }: ReadinessOptions,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process && (process.child.exitCode !== null || process.child.signalCode !== null)) {
      throw new Error(
        `${label}: a folyamat kilépett (kód ${process.child.exitCode ?? process.child.signalCode}) – lásd logs/${process.logName}`,
      );
    }
    try {
      const response = await fetch(url, init);
      if (accept(response)) return;
    } catch {
      // Még nem fogad kapcsolatot
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${label}: nem indult el ${timeoutMs / 1000} másodperc alatt (${url})`);
}
