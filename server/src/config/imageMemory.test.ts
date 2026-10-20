// A libvips lemezre bontási küszöbének beállítása (a kép képpontjai ne kerüljenek ideiglenes fájlba).
import { describe, expect, it } from 'vitest';

import { MAX_IMAGE_PIXELS } from '../services/imageDecoding.js';
import {
  raiseVipsDiscThreshold,
  VIPS_DISC_THRESHOLD,
  VIPS_DISC_THRESHOLD_BYTES,
} from './imageMemory.js';

/** Egy képpont legfeljebb 4 bájt (RGBA, csatornánként 8 bit – a WebP-nél ennyi a legtöbb) */
const MAX_BYTES_PER_PIXEL = 4;

describe('raiseVipsDiscThreshold', () => {
  it('a küszöböt beállítja, ha a környezet nem adja meg', () => {
    const env: NodeJS.ProcessEnv = {};

    raiseVipsDiscThreshold(env);

    expect(env.VIPS_DISC_THRESHOLD).toBe(VIPS_DISC_THRESHOLD);
  });

  // Az üres érték (pl. egy compose-fájl „VIPS_DISC_THRESHOLD=” sora) a libvips-nek 0 lenne:
  // minden kép a lemezre kerülne
  it('az üresen hagyott értéket is felülírja', () => {
    const env: NodeJS.ProcessEnv = { VIPS_DISC_THRESHOLD: '' };

    raiseVipsDiscThreshold(env);

    expect(env.VIPS_DISC_THRESHOLD).toBe(VIPS_DISC_THRESHOLD);
  });

  it('a környezetben kifejezetten megadott értéket nem írja felül', () => {
    const env: NodeJS.ProcessEnv = { VIPS_DISC_THRESHOLD: '1g' };

    raiseVipsDiscThreshold(env);

    expect(env.VIPS_DISC_THRESHOLD).toBe('1g');
  });

  it('a legnagyobb megengedett kép kibontva is belefér a memóriába szánt keretbe', () => {
    expect(VIPS_DISC_THRESHOLD).toBe('256m');
    expect(VIPS_DISC_THRESHOLD_BYTES).toBe(256 * 1024 * 1024);
    expect(VIPS_DISC_THRESHOLD_BYTES).toBeGreaterThanOrEqual(
      MAX_IMAGE_PIXELS * MAX_BYTES_PER_PIXEL,
    );
  });
});
