// A képfeldolgozó szolgáltatás tesztjei: típus- és méretellenőrzés, vízjeles előnézet, bélyegkép.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  createPreview,
  createThumbnail,
  ImageTooLargeError,
  ImageTooSmallError,
  inspectImage,
  MIN_IMAGE_EDGE_PX,
  PREVIEW_MAX_EDGE_PX,
  THUMBNAIL_MAX_EDGE_PX,
  UnsupportedImageError,
} from './image.service.js';
import { MAX_IMAGE_PIXELS } from './imageDecoding.js';

const PHOTO = readFileSync(
  fileURLToPath(new URL('../../tests/fixtures/images/03_basszusgitar.jpg', import.meta.url)),
);

/** Egyszínű tesztkép a megadott méretben. */
const solid = (width: number, height: number, background = '#336699'): Sharp =>
  sharp({ create: { width, height, channels: 3, background } });

/** Egy PNG-blokk: hossz, típus, adat, CRC. */
function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** Animált PNG (APNG) egy sima PNG-ből: a fejléc (IHDR) után egy acTL blokk jelzi az animációt. */
function withAnimationChunk(png: Buffer): Buffer {
  const headerEnd = 8 + 4 + 4 + 13 + 4; // aláírás + az IHDR blokk (hossz, típus, 13 bájt adat, CRC)
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(2, 0); // 2 képkocka, végtelen ismétlés
  return Buffer.concat([
    png.subarray(0, headerEnd),
    pngChunk('acTL', animationControl),
    png.subarray(headerEnd),
  ]);
}

/** Két azonos méretű kép képpontjainak átlagos eltérése (0–255). */
async function meanDifference(first: Buffer, second: Buffer): Promise<number> {
  const [a, b] = await Promise.all([first, second].map((image) => sharp(image).raw().toBuffer()));
  if (!a || !b || a.length !== b.length) throw new Error('A két kép mérete eltér');
  return a.reduce((sum, value, index) => sum + Math.abs(value - (b[index] ?? 0)), 0) / a.length;
}

describe('inspectImage', () => {
  it('JPEG-, PNG- és WebP-képet elfogad, és megadja a formátumot és a méretet', async () => {
    await expect(inspectImage(PHOTO)).resolves.toEqual({
      format: 'jpeg',
      width: 1067,
      height: 1600,
    });
    await expect(solid(800, 700).png().toBuffer().then(inspectImage)).resolves.toEqual({
      format: 'png',
      width: 800,
      height: 700,
    });
    await expect(solid(800, 700).webp().toBuffer().then(inspectImage)).resolves.toMatchObject({
      format: 'webp',
    });
  });

  it('a méretet a megjelenő (EXIF szerint elforgatott) állásban adja', async () => {
    const rotated = await solid(1200, 800).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    await expect(inspectImage(rotated)).resolves.toMatchObject({ width: 800, height: 1200 });
  });

  it('a típust a tartalomból állapítja meg: más formátumot, SVG-t, nem képet elutasít', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"/>');
    const gif = await solid(800, 800).gif().toBuffer();
    const tiff = await solid(800, 800).tiff().toBuffer();

    for (const input of [gif, tiff, svg, Buffer.from('ez nem kép'), Buffer.alloc(0)]) {
      await expect(inspectImage(input)).rejects.toBeInstanceOf(UnsupportedImageError);
    }
  });

  it('a több képkockás (animált) WebP-t elutasítja – a dHash csak az első képkockát látná', async () => {
    const frames = await Promise.all(
      ['#ff0000', '#0000ff'].map((color) => solid(800, 800, color).png().toBuffer()),
    );
    const animated = await sharp(frames, { join: { animated: true } })
      .webp()
      .toBuffer();

    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expect(inspectImage(animated)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  // A PNG-dekóder az animációs blokkokat figyelmen kívül hagyja: a hash és az előnézet az első
  // (akár rejtett) képből készülne, a böngésző viszont az animációt mutatná
  it('az animált PNG-t (APNG) is elutasítja, bár a sharp egy képkockásnak látja', async () => {
    const png = await solid(800, 700).png().toBuffer();
    const apng = withAnimationChunk(png);

    expect(await sharp(apng).metadata()).toMatchObject({ format: 'png', width: 800 });
    expect((await sharp(apng).metadata()).pages).toBeUndefined();
    await expect(inspectImage(apng)).rejects.toBeInstanceOf(UnsupportedImageError);
    await expect(inspectImage(png)).resolves.toMatchObject({ format: 'png' });
  });

  it('a fájl eleji azonosító mögött más tartalmat (csonka, összefűzött fájlt) elutasítja', async () => {
    const jpeg = await solid(800, 700).jpeg().toBuffer();
    const png = await solid(800, 700).png().toBuffer();
    const jpegHeaderOnly = Buffer.concat([jpeg.subarray(0, 3), Buffer.from('ez nem kép')]);
    const pngSignatureThenJpeg = Buffer.concat([png.subarray(0, 8), jpeg]);
    const riffButNotWebp = Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVEfmt ', 'latin1');

    for (const input of [jpegHeaderOnly, pngSignatureThenJpeg, riffButNotWebp]) {
      await expect(inspectImage(input)).rejects.toBeInstanceOf(UnsupportedImageError);
    }
  });

  it('a képpontkorlátnál nagyobb felbontású képet dekódolás nélkül elutasítja', async () => {
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 100;
    const huge = await solid(side, side).png().toBuffer();

    await expect(inspectImage(huge)).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it(`a ${MIN_IMAGE_EDGE_PX} képpontnál kisebb oldalú képet elutasítja`, async () => {
    const tooNarrow = await solid(MIN_IMAGE_EDGE_PX - 1, 900)
      .jpeg()
      .toBuffer();
    const smallest = await solid(MIN_IMAGE_EDGE_PX, MIN_IMAGE_EDGE_PX).jpeg().toBuffer();

    await expect(inspectImage(tooNarrow)).rejects.toBeInstanceOf(ImageTooSmallError);
    await expect(inspectImage(smallest)).resolves.toMatchObject({ width: MIN_IMAGE_EDGE_PX });
  });

  it('a legkisebb oldalhossz megadható (a hitelesség-ellenőrzés kisebb képet is elfogad)', async () => {
    const small = await solid(100, 150).jpeg().toBuffer();
    const tooSmall = await solid(99, 150).jpeg().toBuffer();

    await expect(inspectImage(small, 100)).resolves.toMatchObject({ width: 100, height: 150 });
    await expect(inspectImage(tooSmall, 100)).rejects.toBeInstanceOf(ImageTooSmallError);
    await expect(inspectImage(small)).rejects.toBeInstanceOf(ImageTooSmallError);
  });
});

describe('createPreview', () => {
  it(`legfeljebb ${PREVIEW_MAX_EDGE_PX} képpontos JPEG-et ad, a képarány megtartásával`, async () => {
    const original = await solid(3000, 2000).jpeg().toBuffer();

    const metadata = await sharp(await createPreview(original)).metadata();

    expect(metadata).toMatchObject({ format: 'jpeg', width: PREVIEW_MAX_EDGE_PX, height: 800 });
  });

  it('a kisebb képet nem nagyítja fel', async () => {
    const small = await solid(700, 650).png().toBuffer();

    const metadata = await sharp(await createPreview(small)).metadata();

    expect(metadata).toMatchObject({ format: 'jpeg', width: 700, height: 650 });
  });

  it('vízjelet tesz a képre: az előnézet láthatóan eltér a sima kicsinyítéstől', async () => {
    const plain = await sharp(PHOTO)
      .resize({ width: PREVIEW_MAX_EDGE_PX, height: PREVIEW_MAX_EDGE_PX, fit: 'inside' })
      .jpeg()
      .toBuffer();

    const preview = await createPreview(PHOTO);

    expect(await meanDifference(preview, plain)).toBeGreaterThan(2);
  });

  it('a vízjel átlátszatlansága megadható (a kiértékeléshez): halványabb vízjel, 0-nál nincs vízjel', async () => {
    const plain = await sharp(PHOTO)
      .resize({ width: PREVIEW_MAX_EDGE_PX, height: PREVIEW_MAX_EDGE_PX, fit: 'inside' })
      .jpeg()
      .toBuffer();

    const standard = await meanDifference(await createPreview(PHOTO), plain);
    const faint = await meanDifference(
      await createPreview(PHOTO, { watermarkOpacity: 0.1 }),
      plain,
    );
    const none = await meanDifference(await createPreview(PHOTO, { watermarkOpacity: 0 }), plain);

    expect(faint).toBeLessThan(standard);
    expect(none).toBeLessThan(faint);
    expect(none).toBeLessThan(2);
  });

  it('az előnézetbe nem kerülnek át a metaadatok (EXIF, GPS), a tájolást viszont alkalmazza', async () => {
    const withExif = await solid(1200, 800)
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'Titkos Szerző' } } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const preview = await createPreview(withExif);
    const metadata = await sharp(preview).metadata();

    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(preview.toString('latin1')).not.toContain('Titkos');
    expect(metadata).toMatchObject({ width: 800, height: 1200 });
  });
});

// A fuzz-próba találta: ha egy JPEG közepéből hiányzik egy darab, a fejléc és a kicsinyítve olvasó
// dHash még átmegy, a teljes felbontású dekódolás viszont hibára fut
describe('sérült képadat, amely csak a teljes dekódoláskor derül ki', () => {
  /** A fájl közepéből kivág `length` bájtot. */
  const withMiddleCut = (image: Buffer, fraction: number, length: number): Buffer => {
    const start = Math.round(image.length * fraction);
    return Buffer.concat([image.subarray(0, start), image.subarray(start + length)]);
  };

  it('a fejléc még érvényes, de az előnézet és a bélyegkép UnsupportedImageError-t ad', async () => {
    const corrupted = withMiddleCut(PHOTO, 0.7, 3000);
    await expect(inspectImage(corrupted)).resolves.toMatchObject({ format: 'jpeg' });

    await expect(createPreview(corrupted)).rejects.toBeInstanceOf(UnsupportedImageError);
    await expect(createThumbnail(corrupted)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('a hiba oka (a képdekóder üzenete) megmarad', async () => {
    const error = await createPreview(withMiddleCut(PHOTO, 0.5, 1000)).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(UnsupportedImageError);
    expect(String((error as Error).cause)).toMatch(/corrupt jpeg/i);
  });
});

describe('szokatlan, de érvényes képek', () => {
  const transparent = (): Sharp =>
    sharp({
      create: { width: 900, height: 700, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    });

  it.each([
    ['szürkeárnyalatos JPEG', () => solid(900, 700).greyscale().jpeg().toBuffer()],
    ['átlátszó PNG', () => transparent().png().toBuffer()],
    ['16 bites PNG', () => solid(900, 700).toColourspace('rgb16').png().toBuffer()],
    ['CMYK JPEG', () => solid(900, 700).toColourspace('cmyk').jpeg().toBuffer()],
  ])(
    '%s: elfogadja, és sRGB JPEG előnézet, illetve bélyegkép készül belőle',
    async (_name, make) => {
      const input = await make();

      await expect(inspectImage(input)).resolves.toMatchObject({ width: 900, height: 700 });
      const preview = await sharp(await createPreview(input)).metadata();
      const thumbnail = await sharp(await createThumbnail(input)).metadata();

      expect(preview).toMatchObject({ format: 'jpeg', space: 'srgb', channels: 3, width: 900 });
      expect(thumbnail).toMatchObject({ format: 'jpeg', space: 'srgb', channels: 3, width: 400 });
    },
  );

  it('az átlátszó részek fehér hátteret kapnak (a JPEG nem ismer átlátszóságot)', async () => {
    const thumbnail = await createThumbnail(await transparent().png().toBuffer());

    const { channels } = await sharp(thumbnail).stats();

    for (const channel of channels) expect(channel.mean).toBeGreaterThan(250);
  });
});

describe('createThumbnail', () => {
  it(`legfeljebb ${THUMBNAIL_MAX_EDGE_PX} képpontos, metaadat nélküli JPEG-et ad`, async () => {
    const thumbnail = await createThumbnail(PHOTO);
    const metadata = await sharp(thumbnail).metadata();

    expect(metadata).toMatchObject({ format: 'jpeg', width: 267, height: THUMBNAIL_MAX_EDGE_PX });
    expect(metadata.exif).toBeUndefined();
    expect(thumbnail.length).toBeLessThan(100 * 1024);
  });
});
