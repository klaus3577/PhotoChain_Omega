// A nem megbízható képfájlok megnyitásának tesztjei: képpontkorlát és a dekóderek szűkítése.
import { pino } from 'pino';
import sharp, { type Sharp } from 'sharp';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createPreview, ImageTooLargeError, inspectImage } from './image.service.js';
import { imageFailure } from './imageAnalysis.js';
import {
  configureImageMemory,
  currentMaxImagePixels,
  MAX_IMAGE_PIXELS,
  openImage,
  restrictImageDecoders,
  setMaxImageMegapixels,
} from './imageDecoding.js';

const solid = (width: number, height: number): Sharp =>
  sharp({ create: { width, height, channels: 3, background: '#336699' } });
/**
 * Öt kép kódolása és dekódolása egy tesztben, a végén az előnézet vízjelével (SVG-szöveg – az első
 * szövegrenderelés a betűkészlet-gyorsítótár felépítése miatt lassú): a lefedettség műszerezése
 * alatt túllépte az 5 másodperces alapértelmezést (L27)
 */
const DECODERS_TEST_TIMEOUT_MS = 20_000;

// L32: a kisebb memóriájú tárhelyen (az ingyenes Render-példány 512 MB) élesben kisebb korlát
// állítható be (IMAGE_MAX_MEGAPIXELS); a szerver induláskor egyszer állítja be
describe('a képpontkorlát beállítása (L32)', () => {
  afterEach(() => {
    setMaxImageMegapixels(MAX_IMAGE_PIXELS / 1_000_000);
  });

  it('alapból 50 megapixel', () => {
    expect(currentMaxImagePixels()).toBe(MAX_IMAGE_PIXELS);
  });

  it('a beállított korlát fölötti képet nem dekódolja, és már a vizsgálatnál elutasítja', async () => {
    setMaxImageMegapixels(1);
    const image = await solid(1200, 1000).png().toBuffer();

    expect(currentMaxImagePixels()).toBe(1_000_000);
    await expect(openImage(image).resize(9, 8).raw().toBuffer()).rejects.toThrow(/pixel limit/i);
    await expect(inspectImage(image)).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('a kliensnek szóló hibaüzenet a beállított korlátot mondja', () => {
    setMaxImageMegapixels(25);

    const error = imageFailure(new ImageTooLargeError(6000, 5000), pino({ level: 'silent' }), {
      minEdgePx: 600,
      action: 'tölthető fel',
    });

    expect(error).toMatchObject({ statusCode: 400, code: 'IMAGE_TOO_LARGE' });
    expect((error as Error).message).toContain('25 megapixeles');
  });

  it('induláskor a korlát mellett a sharp gyorsítótárát is kikapcsolja (memória, L32)', () => {
    try {
      configureImageMemory(25);

      expect(currentMaxImagePixels()).toBe(25_000_000);
      expect(sharp.cache()).toMatchObject({
        memory: { max: 0 },
        files: { max: 0 },
        items: { max: 0 },
      });
      // L32 biztonsági átnézés: a 0,1 CPU-s példányon a több szál csak memóriát foglal
      expect(sharp.concurrency()).toBe(1);
    } finally {
      sharp.cache(true);
      sharp.concurrency(0);
    }
  });

  it('csak 1 és 50 megapixel közötti egész állítható be', () => {
    for (const megapixels of [0, 51, 2.5]) {
      expect(() => {
        setMaxImageMegapixels(megapixels);
      }).toThrow(RangeError);
    }
    expect(currentMaxImagePixels()).toBe(MAX_IMAGE_PIXELS);
  });
});

describe('openImage', () => {
  it('a képpontkorlátnál nagyobb képet nem dekódolja (tömörített „bomba” ellen)', async () => {
    // Egyszínű kép: a fájl néhány száz kB, kibontva viszont több mint 150 MB volna
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 100;
    const huge = await solid(side, side).png().toBuffer();
    expect(huge.length).toBeLessThan(1024 * 1024);

    await expect(openImage(huge).resize(9, 8).raw().toBuffer()).rejects.toThrow(/pixel limit/i);
  });

  it('a korláton belüli képet megnyitja', async () => {
    const image = await solid(800, 700).jpeg().toBuffer();

    await expect(openImage(image).resize(9, 8).raw().toBuffer()).resolves.toHaveLength(9 * 8 * 3);
  });
});

describe('restrictImageDecoders', () => {
  // A tiltás az egész folyamatra szól – a teszt végén visszaállítjuk
  afterAll(() => {
    sharp.unblock({ operation: ['VipsForeignLoad'] });
  });

  it(
    'csak a JPEG-, a PNG- és a WebP-dekóder marad elérhető (meg a vízjelhez az SVG)',
    async () => {
      const png = await solid(900, 700).png().toBuffer();
      const jpeg = await solid(900, 700).jpeg().toBuffer();
      const webp = await solid(900, 700).webp().toBuffer();
      const gif = await solid(900, 700).gif().toBuffer();
      const tiff = await solid(900, 700).tiff().toBuffer();

      restrictImageDecoders();

      for (const allowed of [png, jpeg, webp]) {
        await expect(sharp(allowed).metadata()).resolves.toMatchObject({ width: 900 });
      }
      for (const blocked of [gif, tiff]) {
        await expect(sharp(blocked).metadata()).rejects.toThrow(/unsupported image format/i);
      }
      // A vízjel SVG-ből készül – az előnézet a szűkítés után is elkészül
      await expect(createPreview(jpeg)).resolves.toBeInstanceOf(Buffer);
    },
    DECODERS_TEST_TIMEOUT_MS,
  );
});
