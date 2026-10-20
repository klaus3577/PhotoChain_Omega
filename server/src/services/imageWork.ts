// A közös képfeldolgozási sor (L32): a feltöltés, a hitelesség-ellenőrzés és az admin-visszaállítás
// képbontásai együtt legfeljebb IMAGE_PROCESSING_CONCURRENCY számban futnak egyszerre. Egy 25 MP-es
// WebP bontása a mérés szerint kb. 240 MB memória – a kis memóriájú tárhelyen (az ingyenes
// Render-példány 512 MB) a szerver mellett egyszerre csak egy fér el. A sor nem utasít el semmit: a
// feladat a helyére vár (a beérkezés sorrendjében); a kérések számát a végpontok korlátai szabják meg.
// Forrás: p-queue README (concurrency), https://github.com/sindresorhus/p-queue (adaptálva)
import PQueue from 'p-queue';

/** Egy képfeldolgozó feladat futtatása a közös soron – a feladat eredményével vagy hibájával. */
export type ImageWork = <T>(task: () => Promise<T>) => Promise<T>;

export function createImageWork(concurrency: number): ImageWork {
  const queue = new PQueue({ concurrency });
  return async (task) => queue.add(task);
}
