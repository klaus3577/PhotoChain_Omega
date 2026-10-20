// A közös képelemzés tesztje: a nagy, nem soronként bontható kép (WebP) képpontjai sem kerülnek a
// lemezre. A libvips 100 MB fölött ideiglenes fájlba bontaná ki a képet (lásd config/imageMemory.ts –
// a tesztekben a Vitest setupFiles-a, a szerverben a server.ts első importja állítja be a küszöböt).
import { watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

import { pino } from 'pino';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { analyseImage } from './imageAnalysis.js';

/** 7000 × 7000 képpont (49 MP) kibontva 147 MB – a libvips alapértelmezett 100 MB-os küszöbe fölött */
const LARGE_SIDE_PX = 7000;
/** A fájlrendszer-értesítések megérkezésére hagyott idő */
const WATCH_SETTLE_MS = 200;

describe('analyseImage – ideiglenes fájlok', () => {
  it('a nagy WebP-kép kibontott képpontjai nem kerülnek ideiglenes fájlba a lemezen', async () => {
    const largeWebp = await sharp({
      create: { width: LARGE_SIDE_PX, height: LARGE_SIDE_PX, channels: 3, background: '#336699' },
    })
      .webp()
      .toBuffer();
    const created: string[] = [];
    const watcher = watch(tmpdir(), (_event, fileName) => {
      if (fileName?.startsWith('vips-')) created.push(fileName);
    });

    try {
      // Egyszínű kép: az elemzés a teljes kép kibontása után utasítja el
      await expect(
        analyseImage(largeWebp, pino({ level: 'silent' }), {
          minEdgePx: 100,
          action: 'ellenőrizhető',
        }),
      ).rejects.toMatchObject({ code: 'LOW_DETAIL_IMAGE' });
      await sleep(WATCH_SETTLE_MS);
    } finally {
      watcher.close();
    }

    expect(created).toEqual([]);
  }, 30_000);
});
