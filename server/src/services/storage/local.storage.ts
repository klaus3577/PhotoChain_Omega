// Helyi lemezes tárhely a fejlesztéshez. Az eredeti képek a privát <gyökér>/originals mappába
// kerülnek, az előnézetek és a bélyegképek a <gyökér>/public alá – a webszerver csak ez utóbbit
// szolgálja ki (terv D10).
// Forrás: Node.js dokumentáció – fs (writeFile „wx” jelzővel, rm, mkdir, open és
// FileHandle.createReadStream),
// https://nodejs.org/api/fs.html (adaptálva); OWASP File Upload Cheat Sheet (szerver adta fájlnév),
// https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { parseStorageKey, publicMediaUrl, type StorageService } from './storage.types.js';

const PUBLIC_DIRECTORY = 'public';

/** A nyilvánosan kiszolgálható mappa a tárhely gyökerén belül. */
export const localPublicDirectory = (rootDirectory: string): string =>
  join(rootDirectory, PUBLIC_DIRECTORY);

export function createLocalStorage(rootDirectory: string): StorageService {
  // A parseStorageKey csak a szerver által előállított alakú kulcsot engedi át, így az útvonal
  // nem vezethet ki a gyökérmappából
  const pathOf = (key: string): string => {
    const { folder, fileName } = parseStorageKey(key);
    return folder === 'originals'
      ? join(rootDirectory, folder, fileName)
      : join(localPublicDirectory(rootDirectory), folder, fileName);
  };

  return {
    async save(key, data) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      // „wx”: ha a fájl már létezik, hibát ad – meglévő képet semmi nem írhat felül
      await writeFile(path, data, { flag: 'wx' });
    },

    async read(key) {
      return readFile(pathOf(key));
    },

    async openRead(key) {
      const handle = await open(pathOf(key), 'r');
      try {
        const { size } = await handle.stat();
        // A folyam a végén vagy megszakításkor maga zárja be a fájlt (autoClose)
        return { size, stream: handle.createReadStream() };
      } catch (error) {
        await handle.close();
        throw error;
      }
    },

    async delete(key) {
      await rm(pathOf(key), { force: true });
    },

    publicUrl: publicMediaUrl,
  };
}
