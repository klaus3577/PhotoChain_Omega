// Tesztsegédek a képfeltöltés tesztjeihez: a saját tesztfotók, ideiglenes tárhelymappa, és a
// versenyhelyzetek kiszámítható előidézéséhez egy kívülről teljesíthető ígéret.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A tests/fixtures/images mappa egy fotója (a szerző saját képe). */
export const fixtureImage = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`../fixtures/images/${name}`, import.meta.url)));

export const createTempUploadDir = (): string => mkdtempSync(join(tmpdir(), 'photochain-uploads-'));

/** A tárhelymappa összes fájlja (a gyökérhez viszonyított úttal, / elválasztóval, rendezve). */
export const listStoredFiles = (uploadDir: string): string[] =>
  readdirSync(uploadDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(uploadDir.length + 1))
    .map((path) => path.replaceAll('\\', '/'))
    .sort();

export interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

/** Ígéret, amelyet a teszt teljesít – ezzel egy művelet a kívánt pillanatig visszatartható. */
export function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
