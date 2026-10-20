// A közös képfeldolgozási sor (L32) tesztjei: a feltöltés, a hitelesség-ellenőrzés és az
// admin-visszaállítás képbontásai együtt legfeljebb a beállított számban futnak egyszerre.
import { describe, expect, it } from 'vitest';

import { createImageWork } from './imageWork.js';

/** Kívülről befejezhető feladat, amely számolja, hány fut belőle egyszerre. */
function createTracker() {
  let running = 0;
  let maxRunning = 0;
  const finishers: (() => void)[] = [];
  const task = (result: string) => async (): Promise<string> => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise<void>((resolve) => finishers.push(resolve));
    running -= 1;
    return result;
  };
  /** Befejezi az összes eddig elindult feladatot, és megvárja, hogy a sor továbblépjen. */
  const finishStarted = async (): Promise<void> => {
    for (const finish of finishers.splice(0)) finish();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { task, finishStarted, maxRunning: () => maxRunning };
}

describe('createImageWork (L32)', () => {
  it('egy hellyel a feladatok egymás után, a beérkezés sorrendjében futnak', async () => {
    const imageWork = createImageWork(1);
    const tracker = createTracker();

    const results = [
      imageWork(tracker.task('a')),
      imageWork(tracker.task('b')),
      imageWork(tracker.task('c')),
    ];
    for (let round = 0; round < 3; round += 1) await tracker.finishStarted();

    expect(await Promise.all(results)).toEqual(['a', 'b', 'c']);
    expect(tracker.maxRunning()).toBe(1);
  });

  it('két hellyel két feladat fut egyszerre, a harmadik vár', async () => {
    const imageWork = createImageWork(2);
    const tracker = createTracker();

    const results = [
      imageWork(tracker.task('a')),
      imageWork(tracker.task('b')),
      imageWork(tracker.task('c')),
    ];
    for (let round = 0; round < 2; round += 1) await tracker.finishStarted();

    expect(await Promise.all(results)).toEqual(['a', 'b', 'c']);
    expect(tracker.maxRunning()).toBe(2);
  });

  it('a hibás feladat hibája a hívóhoz jut, a sor tovább halad', async () => {
    const imageWork = createImageWork(1);
    const broken = new Error('sérült kép');

    await expect(imageWork(async () => Promise.reject(broken))).rejects.toBe(broken);
    await expect(imageWork(async () => 'következő')).resolves.toBe('következő');
  });
});
