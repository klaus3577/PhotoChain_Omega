// A hitelesítés robusztussági kísérlete (L29): a saját tesztfotók × módosítások → egyezik-e még az
// SHA-256 (bájtpontos ujjlenyomat), és mekkora a dHash Hamming-távolsága az eredetitől; a küszöb
// kimérése (melyik küszöbnél hány tartalommegőrző másolatot ismer fel a rendszer, és hány idegen
// képet tekintene tévesen másolatnak); a vágás és a kis forgatás törési görbéje; a platform
// vízjelének hatása (kontroll vízjel nélkül, átlátszatlanság-sorozat, „törékeny” bitek); a különböző
// képek páronkénti távolsága; a hash futásideje méretosztályonként. A módosításokat a script maga
// állítja elő a sharp-pal, és ugyanazzal a hash-modullal számol, mint a szerver.
// Kimenet (docs/kiertekeles/): hash-experiment.csv (fotó × módosítás), hash-experiment-comparisons.csv
// (összevetések idegen képekkel), hash-experiment.md és .html (táblázatok), hash-experiment-chart.html
// és hash-experiment-sheet.html (ábrák – a képgenerátor html módjával PNG-vé).
// Használat (server/): npm run experiment:hash [képmappa] [kimeneti mappa]
//   A képmappa originals/ almappájában a tesztfotók teljes felbontású eredetije lehet (a repóban
//   nincs benne): azonos törzsnevű fájl, vagy – ha a darabszám egyezik – névsorrend szerint párosítva.
// Forrás: Krawetz, N. (2013): Kind of Like That (dHash, a 10-es küszöb) [S40]; Zauner, C. (2010):
// Implementation and Benchmarking of Perceptual Image Hash Functions (a robusztusság mérése
// módosítássorozattal) [S42]; sharp – resize, extract, modulate, linear, flop, rotate, composite, jpeg,
// webp, https://sharp.pixelplumbing.com/ (adaptálva)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename, extname, join, parse, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import sharp, { type Sharp } from 'sharp';

import {
  DEFAULT_DHASH_THRESHOLD,
  DHASH_BITS,
  DHASH_COLUMNS,
  DHASH_ROWS,
  dHash,
  hammingDistance,
  isNearDuplicate,
  sha256,
  toDHashGrid,
} from '../src/services/hashing.service.js';
import {
  createPreview,
  DEFAULT_WATERMARK_OPACITY,
  MIN_IMAGE_EDGE_PX,
  PREVIEW_MAX_EDGE_PX,
} from '../src/services/image.service.js';
import { csvFile } from './lib/csv.js';
import { escapeHtml, renderReportHtml } from './lib/reportHtml.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_IMAGES_DIR = join(SERVER_DIR, 'tests', 'fixtures', 'images');
const DEFAULT_OUTPUT_DIR = join(SERVER_DIR, '..', 'docs', 'kiertekeles');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
/** A módosított másolatok mentési minősége (ahogy egy képszerkesztő alapból menti) */
const SAVE_JPEG_QUALITY = 85;
/** A küszöb-táblázat ennyi lehetséges küszöböt vizsgál (0 … MAX) */
const MAX_THRESHOLD_IN_TABLE = 24;
const THUMBNAIL_PX = 220;
/** A futásidő-mérés ismétlése képenként (a medián kerül a jelentésbe) */
const TIMING_REPEATS = 5;
/** Egy rácspár „törékeny”, ha a két szomszédos fényesség ennyire vagy kevésbé tér el */
const FRAGILE_BIT_DELTA = 2;
/** Ennél távolabbi originals/ fájl nem lehet a tesztfotó eredetije (hibás párosítás) */
const ORIGINAL_MAX_DISTANCE = 15;
/** A vízjel vizsgált átlátszatlanságai (az utolsó a platform alapértéke) */
const WATERMARK_OPACITIES = [0.15, 0.25, 0.35, DEFAULT_WATERMARK_OPACITY];
/** A feltöltés fájlméret-korlátja (server/src/config/env.ts, UPLOAD_MAX_BYTES alapértéke) */
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
/** A sharp verziója a package.json-ból (a csomag exports-térképe a fájlt nem teszi importálhatóvá) */
const SHARP_VERSION = (
  JSON.parse(readFileSync(join(SERVER_DIR, 'node_modules', 'sharp', 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

type Category = 'A' | 'B' | 'C' | 'D' | 'E';
const CATEGORY_LABEL: Record<Category, string> = {
  A: 'formátum, minőség, tónus',
  B: 'vágás',
  C: 'a platform előnézete',
  D: 'ismert korlát',
  E: 'valós módosítási lánc',
};
/** Melyik táblázatba kerül a változat: fő táblázat (és ábra), görbe (vágás, forgatás), vízjel */
type Table = 'main' | 'curve' | 'watermark';

interface Output {
  format: 'jpeg' | 'webp';
  quality: number;
}
type Make = (image: Sharp, width: number, height: number) => Sharp | Promise<Sharp>;

interface Variant {
  id: string;
  label: string;
  category: Category;
  table: Table;
  make: Make;
  output: Output;
}

const JPEG: Output = { format: 'jpeg', quality: SAVE_JPEG_QUALITY };

const captionSvg = (width: number, height: number): Buffer => {
  const bandHeight = Math.max(24, Math.round(height * 0.06));
  const fontSize = Math.round(bandHeight * 0.55);
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${height - bandHeight}" width="${width}" height="${bandHeight}" fill="rgba(0,0,0,0.55)"/>
      <text x="${Math.round(width / 2)}" y="${height - Math.round(bandHeight * 0.32)}" font-family="Arial, sans-serif"
        font-size="${fontSize}" fill="#ffffff" text-anchor="middle">Saját fotó – PhotoChain teszt</text>
    </svg>`,
  );
};

/** Vinyetta: a szélek felé sötétedő, átlátszó közepű sugaras átmenet (telefonos szűrők kelléke) */
const vignetteSvg = (width: number, height: number): Buffer =>
  Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="v" cx="50%" cy="50%" r="72%">
        <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
      </radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#v)"/>
    </svg>`,
  );

/** Minden oldalról a megadott hányad levágása */
function cropEdges(image: Sharp, width: number, height: number, ratio: number): Sharp {
  const left = Math.round(width * ratio);
  const top = Math.round(height * ratio);
  return image.extract({ left, top, width: width - 2 * left, height: height - 2 * top });
}

/** Csak az alsó szél levágása (pl. egy aláírás vagy felirat eltüntetése) */
const cropBottom = (image: Sharp, width: number, height: number, ratio: number): Sharp =>
  image.extract({ left: 0, top: 0, width, height: height - Math.round(height * ratio) });

/** Kis forgatás, a fekete sarkok nélkül: a forgatott képből az eredeti méretű közép marad */
async function rotateAndTrim(image: Sharp, width: number, height: number, degrees: number) {
  const rotated = await image.rotate(degrees, { background: '#000000' }).toBuffer();
  const { width: rotatedWidth = width, height: rotatedHeight = height } =
    await sharp(rotated).metadata();
  return sharp(rotated).extract({
    left: Math.floor((rotatedWidth - width) / 2),
    top: Math.floor((rotatedHeight - height) / 2),
    width,
    height,
  });
}

const resizeInside = (image: Sharp, edge: number): Sharp =>
  image.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });

const crop = (id: string, label: string, ratio: number, table: Table): Variant => ({
  id,
  label,
  category: 'B',
  table,
  make: (image, width, height) => cropEdges(image, width, height, ratio),
  output: JPEG,
});
const rotation = (id: string, degrees: number): Variant => ({
  id,
  label: `forgatás ${degrees.toLocaleString('hu-HU')}° (a sarkok levágva)`,
  category: 'B',
  table: 'curve',
  make: (image, width, height) => rotateAndTrim(image, width, height, degrees),
  output: JPEG,
});

const VARIANTS: Variant[] = [
  {
    id: 'resize50',
    label: 'kicsinyítés 50 %',
    category: 'A',
    table: 'main',
    make: (image, width) => image.resize({ width: Math.round(width / 2) }),
    output: JPEG,
  },
  {
    id: 'resize25',
    label: 'kicsinyítés 25 %',
    category: 'A',
    table: 'main',
    make: (image, width) => image.resize({ width: Math.round(width / 4) }),
    output: JPEG,
  },
  {
    id: 'jpeg60',
    label: 'JPEG-újratömörítés q60',
    category: 'A',
    table: 'main',
    make: (image) => image,
    output: { format: 'jpeg', quality: 60 },
  },
  {
    id: 'jpeg20',
    label: 'JPEG-újratömörítés q20',
    category: 'A',
    table: 'main',
    make: (image) => image,
    output: { format: 'jpeg', quality: 20 },
  },
  {
    id: 'webp80',
    label: 'WebP-konverzió q80',
    category: 'A',
    table: 'main',
    make: (image) => image,
    output: { format: 'webp', quality: 80 },
  },
  {
    id: 'brightness110',
    label: 'fényerő +10 %',
    category: 'A',
    table: 'main',
    make: (image) => image.modulate({ brightness: 1.1 }),
    output: JPEG,
  },
  {
    id: 'greyscale',
    label: 'szürkeárnyalat',
    category: 'A',
    table: 'main',
    make: (image) => image.greyscale(),
    output: JPEG,
  },
  {
    id: 'caption',
    label: 'szöveges felirat (alsó sáv)',
    category: 'A',
    table: 'main',
    make: (image, width, height) =>
      image.composite([{ input: captionSvg(width, height), top: 0, left: 0 }]),
    output: JPEG,
  },
  crop('crop5', 'vágás 5 % (minden oldalról)', 0.05, 'main'),
  crop('crop10', 'vágás 10 % (minden oldalról)', 0.1, 'main'),
  {
    id: 'chain_messenger',
    label: 'üzenetküldőn át: 1080 px + JPEG q75',
    category: 'E',
    table: 'main',
    make: (image) => resizeInside(image, 1080),
    output: { format: 'jpeg', quality: 75 },
  },
  {
    id: 'chain_filter',
    label: 'telefonos szűrő: kontraszt +15 %, telítettség +20 %, vinyetta',
    category: 'E',
    table: 'main',
    make: (image, width, height) =>
      image
        .modulate({ brightness: 1.05, saturation: 1.2 })
        .linear(1.15, -(128 * 0.15))
        .composite([{ input: vignetteSvg(width, height), top: 0, left: 0 }]),
    output: JPEG,
  },
  {
    id: 'chain_share',
    label: 'megosztás: 1200 px + vágás 2 % + JPEG q70',
    category: 'E',
    table: 'main',
    make: async (image, width, height) => {
      const resized = await resizeInside(image, 1200).toBuffer();
      const { width: w = width, height: h = height } = await sharp(resized).metadata();
      return cropEdges(sharp(resized), w, h, 0.02);
    },
    output: { format: 'jpeg', quality: 70 },
  },
  {
    id: 'mirror',
    label: 'tükrözés (vízszintes)',
    category: 'D',
    table: 'main',
    make: (image) => image.flop(),
    output: JPEG,
  },
  {
    id: 'rotate90',
    label: 'forgatás 90°',
    category: 'D',
    table: 'main',
    make: (image) => image.rotate(90),
    output: JPEG,
  },
  crop('crop1', 'vágás 1 % (minden oldalról)', 0.01, 'curve'),
  crop('crop2', 'vágás 2 % (minden oldalról)', 0.02, 'curve'),
  crop('crop3', 'vágás 3 % (minden oldalról)', 0.03, 'curve'),
  crop('crop7', 'vágás 7 % (minden oldalról)', 0.07, 'curve'),
  {
    id: 'crop_bottom5',
    label: 'vágás 5 % (csak alul)',
    category: 'B',
    table: 'curve',
    make: (image, width, height) => cropBottom(image, width, height, 0.05),
    output: JPEG,
  },
  {
    id: 'crop_bottom10',
    label: 'vágás 10 % (csak alul)',
    category: 'B',
    table: 'curve',
    make: (image, width, height) => cropBottom(image, width, height, 0.1),
    output: JPEG,
  },
  rotation('rotate05', 0.5),
  rotation('rotate1', 1),
  rotation('rotate2', 2),
  rotation('rotate5', 5),
];
/** A vágásgörbe sorai (a fő táblázat 5 és 10 %-os vágásával együtt), a mérték sorrendjében */
const CROP_CURVE_IDS = [
  'crop1',
  'crop2',
  'crop3',
  'crop5',
  'crop7',
  'crop10',
  'crop_bottom5',
  'crop_bottom10',
];
const ROTATION_CURVE_IDS = ['rotate05', 'rotate1', 'rotate2', 'rotate5', 'rotate90'];

/** Rövid feliratok az ábra vízszintes tengelyén (ahol a teljes címke nem férne el) */
const CHART_LABELS: Record<string, string> = {
  preview_original: 'előnézet az eredetiből',
  chain_messenger: 'üzenetküldőn át',
  chain_filter: 'telefonos szűrő',
  chain_share: 'megosztás',
};

/** A változatok rögzített sorrendje a fő táblázatban és az ábrán */
const MAIN_ORDER = [
  'identity',
  'original',
  ...VARIANTS.filter((v) => v.table === 'main' && v.category === 'A').map((v) => v.id),
  'crop5',
  'crop10',
  ...VARIANTS.filter((v) => v.category === 'E').map((v) => v.id),
  'preview',
  'preview_original',
  'mirror',
  'rotate90',
];

interface BaseImage {
  name: string;
  bytes: Buffer;
  sha256: string;
  dHash: string;
  width: number;
  height: number;
  /** A teljes felbontású eredeti (originals/), ha van */
  original?: { name: string; bytes: Buffer; sha256: string; dHash: string };
}

interface Measurement {
  photo: string;
  variantId: string;
  variant: string;
  category: Category | '–';
  table: Table;
  /** A tartalom ugyanaz, a rendszernek fel kell ismernie (az ismert korlátoknál hamis) */
  mustRecognise: boolean;
  bytes: number;
  sha256Matches: boolean;
  dHash: string;
  distance: number;
  duplicateAtDefault: boolean;
  thumbnail?: string;
}

const isImageFile = (name: string): boolean => IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** A megjelenő (EXIF szerint elforgatott) méret */
async function orientedSize(bytes: Buffer): Promise<{ width: number; height: number }> {
  const { autoOrient } = await sharp(bytes).metadata();
  if (!autoOrient.width || !autoOrient.height) throw new Error('Ismeretlen képméret');
  return { width: autoOrient.width, height: autoOrient.height };
}

async function loadBase(path: string): Promise<BaseImage> {
  const bytes = readFileSync(path);
  return {
    name: basename(path),
    bytes,
    sha256: sha256(bytes),
    dHash: await dHash(bytes),
    ...(await orientedSize(bytes)),
  };
}

/**
 * Az originals/ almappa képei a tesztfotókhoz párosítva: azonos törzsnév szerint, vagy – ha a
 * darabszám egyezik – névsorrendben. A párosítást a dHash-távolság csak ellenőrzi (nem ez dönt).
 */
async function attachOriginals(imagesDir: string, bases: BaseImage[]): Promise<void> {
  const dir = join(imagesDir, 'originals');
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter(isImageFile).sort();
  const byStem = new Map(bases.map((base) => [parse(base.name).name, base]));
  const pairs: [string, BaseImage][] = [];
  if (files.every((file) => byStem.has(parse(file).name))) {
    for (const file of files) pairs.push([file, byStem.get(parse(file).name)!]);
  } else if (files.length === bases.length) {
    files.forEach((file, index) => pairs.push([file, bases[index]!]));
  } else {
    console.warn(
      `  originals/: ${files.length} fájl ${bases.length} tesztfotóhoz – nincs egyértelmű párosítás, kihagyva`,
    );
    return;
  }
  for (const [file, base] of pairs) {
    const bytes = readFileSync(join(dir, file));
    const hash = await dHash(bytes);
    const distance = hammingDistance(base.dHash, hash);
    if (distance > ORIGINAL_MAX_DISTANCE) {
      console.warn(
        `  originals/${file} → ${base.name}: ${distance} bit – nem ugyanaz a kép? Kihagyva`,
      );
      continue;
    }
    console.log(`  originals/${file} → ${base.name} (dHash-távolság ${distance})`);
    base.original = { name: file, bytes, sha256: sha256(bytes), dHash: hash };
  }
}

async function thumbnailOf(bytes: Buffer): Promise<string> {
  const data = await sharp(bytes)
    .autoOrient()
    .resize({ width: THUMBNAIL_PX, height: THUMBNAIL_PX, fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${data.toString('base64')}`;
}

/** A módosított másolat fájlként (JPEG vagy WebP) */
async function produce(variant: Variant, source: Buffer): Promise<Buffer> {
  const { width, height } = await orientedSize(source);
  const image = await variant.make(sharp(source).autoOrient(), width, height);
  return variant.output.format === 'webp'
    ? image.webp({ quality: variant.output.quality }).toBuffer()
    : image.jpeg({ quality: variant.output.quality }).toBuffer();
}

interface MeasureInput {
  photo: string;
  variantId: string;
  variant: string;
  category: Category | '–';
  table: Table;
  mustRecognise: boolean;
  bytes: Buffer;
  /** A hivatkozási alap: a tesztfotó (vagy az eredeti) ujjlenyomatai */
  reference: { sha256: string; dHash: string };
  withThumbnail?: boolean;
}

async function measure(input: MeasureInput): Promise<Measurement> {
  const hash = await dHash(input.bytes);
  const distance = hammingDistance(input.reference.dHash, hash);
  return {
    photo: input.photo,
    variantId: input.variantId,
    variant: input.variant,
    category: input.category,
    table: input.table,
    mustRecognise: input.mustRecognise,
    bytes: input.bytes.length,
    sha256Matches: sha256(input.bytes) === input.reference.sha256,
    dHash: hash,
    distance,
    duplicateAtDefault: isNearDuplicate(distance, DEFAULT_DHASH_THRESHOLD),
    ...(input.withThumbnail ? { thumbnail: await thumbnailOf(input.bytes) } : {}),
  };
}

/** Egy tesztfotó összes mérése (a változatok, az eredeti, az előnézetek, a vízjel-sorozat) */
async function measurePhoto(base: BaseImage): Promise<Measurement[]> {
  const reference = { sha256: base.sha256, dHash: base.dHash };
  const common = { photo: base.name, reference, withThumbnail: true };
  const results: Measurement[] = [
    await measure({
      ...common,
      variantId: 'identity',
      variant: 'ugyanaz a fájl',
      category: '–',
      table: 'main',
      mustRecognise: true,
      bytes: base.bytes,
    }),
  ];
  if (base.original) {
    results.push(
      await measure({
        ...common,
        variantId: 'original',
        variant: 'teljes felbontású eredeti (originals/)',
        category: 'A',
        table: 'main',
        mustRecognise: true,
        bytes: base.original.bytes,
      }),
    );
  }
  for (const variant of VARIANTS) {
    try {
      results.push(
        await measure({
          ...common,
          variantId: variant.id,
          variant: variant.label,
          category: variant.category,
          table: variant.table,
          mustRecognise: variant.category !== 'D',
          bytes: await produce(variant, base.bytes),
          withThumbnail: variant.table === 'main',
        }),
      );
    } catch (error) {
      throw new Error(`${base.name} – ${variant.label}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
  results.push(
    await measure({
      ...common,
      variantId: 'preview',
      variant: 'a platform vízjeles előnézete',
      category: 'C',
      table: 'main',
      mustRecognise: true,
      bytes: await createPreview(base.bytes),
    }),
  );
  if (base.original) {
    // A valóságban az előnézet a feltöltött (teljes felbontású) fájlból készül, és annak hash-e kerül
    // a láncra: ezt az esetet az eredeti ujjlenyomataihoz mérjük
    results.push(
      await measure({
        photo: base.name,
        variantId: 'preview_original',
        variant: 'a platform előnézete a teljes felbontású eredetiből (az eredetihez mérve)',
        category: 'C',
        table: 'main',
        mustRecognise: true,
        bytes: await createPreview(base.original.bytes),
        reference: { sha256: base.original.sha256, dHash: base.original.dHash },
        withThumbnail: true,
      }),
    );
  }
  results.push(
    await measure({
      ...common,
      variantId: 'preview_nowm',
      variant: `előnézet vízjel nélkül (${PREVIEW_MAX_EDGE_PX} px, kontroll)`,
      category: 'C',
      table: 'watermark',
      mustRecognise: true,
      bytes: await createPreview(base.bytes, { watermarkOpacity: 0 }),
      withThumbnail: false,
    }),
  );
  for (const opacity of WATERMARK_OPACITIES) {
    results.push(
      await measure({
        ...common,
        variantId: `preview_wm${Math.round(opacity * 100)}`,
        variant: `előnézet, a vízjel átlátszatlansága ${opacity.toLocaleString('hu-HU')}${opacity === DEFAULT_WATERMARK_OPACITY ? ' (a platform alapértéke)' : ''}`,
        category: 'C',
        table: 'watermark',
        mustRecognise: true,
        bytes: await createPreview(base.bytes, { watermarkOpacity: opacity }),
        withThumbnail: false,
      }),
    );
  }
  return results;
}

/** A 9×8-as rács szomszédos párjai közül hány „döntetlenközeli” (|Δ| ≤ FRAGILE_BIT_DELTA) */
async function fragileBits(bytes: Buffer): Promise<number> {
  const grid = await toDHashGrid(bytes);
  let count = 0;
  for (let row = 0; row < DHASH_ROWS; row += 1) {
    for (let column = 0; column < DHASH_COLUMNS - 1; column += 1) {
      const left = grid[row * DHASH_COLUMNS + column] ?? 0;
      const right = grid[row * DHASH_COLUMNS + column + 1] ?? 0;
      if (Math.abs(left - right) <= FRAGILE_BIT_DELTA) count += 1;
    }
  }
  return count;
}

interface Comparison {
  first: string;
  variantId: string;
  variant: string;
  second: string;
  distance: number;
}

/** Az összevetések: minden kép minden változata (az azonos fájl kivételével) a többi kép eredetijével */
function compare(bases: BaseImage[], measurements: Measurement[]): Comparison[] {
  const comparisons: Comparison[] = [];
  for (const first of bases) {
    for (const second of bases) {
      if (first === second) continue;
      for (const m of measurements.filter(
        (row) => row.photo === first.name && row.variantId !== 'identity',
      )) {
        comparisons.push({
          first: first.name,
          variantId: m.variantId,
          variant: m.variant,
          second: second.name,
          distance: hammingDistance(m.dHash, second.dHash),
        });
      }
    }
  }
  return comparisons;
}

interface TimingClass {
  label: string;
  medianMs: number;
  minMs: number;
  maxMs: number;
  count: number;
}

/** A dHash futásideje méretosztályonként: képenként TIMING_REPEATS futás mediánja */
async function timing(bases: BaseImage[], measurements: Measurement[]): Promise<TimingClass[]> {
  const classes: { label: string; buffers: Buffer[] }[] = [
    { label: 'tesztfotó (1600 px JPEG)', buffers: bases.map((b) => b.bytes) },
    {
      label: 'teljes felbontású eredeti (9–22 MB JPEG)',
      buffers: bases.flatMap((b) => (b.original ? [b.original.bytes] : [])),
    },
  ];
  const webp = measurements.filter((m) => m.variantId === 'webp80');
  if (webp.length > 0) {
    const buffers: Buffer[] = [];
    for (const base of bases)
      buffers.push(
        await produce(
          VARIANTS.find((v) => v.id === 'webp80')!,
          base.bytes,
        ),
      );
    classes.push({ label: 'WebP-változat (1600 px)', buffers });
  }
  const result: TimingClass[] = [];
  for (const { label, buffers } of classes) {
    if (buffers.length === 0) continue;
    const medians: number[] = [];
    for (const buffer of buffers) {
      await dHash(buffer); // bemelegítés (dekóder, gyorsítótár)
      const runs: number[] = [];
      for (let i = 0; i < TIMING_REPEATS; i += 1) {
        const started = performance.now();
        await dHash(buffer);
        runs.push(performance.now() - started);
      }
      medians.push(median(runs));
    }
    result.push({
      label,
      medianMs: median(medians),
      minMs: Math.min(...medians),
      maxMs: Math.max(...medians),
      count: buffers.length,
    });
  }
  return result;
}

const hu = (value: number, digits = 1): string =>
  value.toLocaleString('hu-HU', { maximumFractionDigits: digits });
const cell = (m: Measurement | undefined): string =>
  m ? `${m.distance}${m.duplicateAtDefault ? '' : ' ✗'}` : '–';
const find = (measurements: Measurement[], photo: string, variantId: string) =>
  measurements.find((m) => m.photo === photo && m.variantId === variantId);

interface Row {
  id: string;
  label: string;
  category: Category | '–';
}

/** A fő táblázat sorai a rögzített sorrendben (az eredeti csak akkor, ha volt originals/) */
function mainRows(measurements: Measurement[]): Row[] {
  const rows = new Map<string, Row>();
  for (const m of measurements.filter((row) => row.table === 'main')) {
    if (!rows.has(m.variantId))
      rows.set(m.variantId, { id: m.variantId, label: m.variant, category: m.category });
  }
  return [...rows.values()].sort((a, b) => MAIN_ORDER.indexOf(a.id) - MAIN_ORDER.indexOf(b.id));
}

function distanceTable(
  bases: BaseImage[],
  measurements: Measurement[],
  rows: Row[],
  withCategory: boolean,
): string {
  const header = `| Módosítás |${withCategory ? ' Kategória |' : ''} ${bases.map((b) => b.name).join(' | ')} | SHA-256 egyezik |`;
  const divider = `| --- |${withCategory ? ' --- |' : ''} ${bases.map(() => '---').join(' | ')} | --- |`;
  const lines = rows.map((row) => {
    const cells = bases.map((base) => cell(find(measurements, base.name, row.id)));
    const sha = measurements.filter((m) => m.variantId === row.id).every((m) => m.sha256Matches);
    return `| ${row.label} |${withCategory ? ` ${row.category} |` : ''} ${cells.join(' | ')} | ${sha ? 'igen' : 'nem'} |`;
  });
  return [header, divider, ...lines].join('\n');
}

function thresholdTable(measurements: Measurement[], comparisons: Comparison[]): string {
  const main = measurements.filter(
    (m) => m.table === 'main' && m.mustRecognise && m.variantId !== 'identity',
  );
  const groups: [string, Measurement[]][] = (['A', 'B', 'C', 'E'] as const).map((category) => [
    `${category} – ${CATEGORY_LABEL[category]}`,
    main.filter((m) => m.category === category),
  ]);
  const header = `| Küszöb | ${groups.map(([label, items]) => `${label} (${items.length})`).join(' | ')} | téves egyezés (${comparisons.length} összevetés) |`;
  const divider = `| --- | ${groups.map(() => '---').join(' | ')} | --- |`;
  const lines: string[] = [];
  for (let threshold = 0; threshold <= MAX_THRESHOLD_IN_TABLE; threshold += 1) {
    const counts = groups.map(
      ([, items]) =>
        `${items.filter((m) => isNearDuplicate(m.distance, threshold)).length} / ${items.length}`,
    );
    const falseMatches = comparisons.filter((c) => isNearDuplicate(c.distance, threshold)).length;
    lines.push(`| ${threshold} | ${counts.join(' | ')} | ${falseMatches} |`);
  }
  return [header, divider, ...lines].join('\n');
}

function chartHtml(
  bases: BaseImage[],
  measurements: Measurement[],
  comparisons: Comparison[],
): string {
  const rows = mainRows(measurements).filter((row) => row.id !== 'identity');
  const barWidth = 18;
  const groupWidth = barWidth * bases.length + 26;
  const chartHeight = 320;
  const left = 60;
  const width = left + groupWidth * rows.length + 90;
  const scale = (distance: number) => (chartHeight * distance) / DHASH_BITS;
  const colors = ['#0f6e56', '#1f5fbf', '#b24a00', '#7c3aed', '#be185d', '#0891b2'];
  const shortLabel = (id: string, label: string): string =>
    CHART_LABELS[id] ?? label.split(' (')[0]?.split(':')[0] ?? label;
  const groups = rows
    .map((row, index) => {
      const x = left + index * groupWidth;
      const bars = bases
        .map((base, b) => {
          const m = find(measurements, base.name, row.id);
          if (!m) return '';
          const h = scale(m.distance);
          const bx = x + b * barWidth;
          const opacity = row.category === 'D' ? 0.45 : 1;
          return `<rect x="${bx}" y="${chartHeight - h}" width="${barWidth - 3}" height="${h}" fill="${colors[b % colors.length]}" fill-opacity="${opacity}"/>
            <text x="${bx + (barWidth - 3) / 2}" y="${chartHeight - h - 4}" font-size="11" text-anchor="middle" fill="#1f2937">${m.distance}</text>`;
        })
        .join('');
      const label = `${row.category === 'D' ? '[korlát] ' : ''}${shortLabel(row.id, row.label)}`;
      return `${bars}<text transform="translate(${x + (groupWidth - 26) / 2},${chartHeight + 10}) rotate(35)" font-size="11" fill="#374151">${escapeHtml(label)}</text>`;
    })
    .join('');
  const thresholdY = chartHeight - scale(DEFAULT_DHASH_THRESHOLD);
  const minForeign = Math.min(...comparisons.map((c) => c.distance));
  const minForeignY = chartHeight - scale(minForeign);
  const legend = bases
    .map(
      (base, b) =>
        `<rect x="${left + b * 190}" y="-26" width="12" height="12" fill="${colors[b % colors.length]}"/><text x="${left + b * 190 + 16}" y="-16" font-size="12" fill="#1f2937">${escapeHtml(base.name)}</text>`,
    )
    .join('');
  const ticks = [0, 10, 20, 32, 48, 64]
    .map(
      (t) =>
        `<line x1="${left - 4}" x2="${width - 10}" y1="${chartHeight - scale(t)}" y2="${chartHeight - scale(t)}" stroke="#e5e7eb"/><text x="${left - 8}" y="${chartHeight - scale(t) + 4}" font-size="11" text-anchor="end" fill="#6b7280">${t}</text>`,
    )
    .join('');
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>dHash-távolság módosításonként</title>
<style>body{margin:0;background:#fff;font-family:Arial,sans-serif;color:#111827}h1{font-size:18px;margin:16px 24px 4px}p{margin:0 24px 8px;font-size:13px;color:#374151}</style></head>
<body><h1>dHash-távolság az eredetitől módosításonként (bit a 64-ből)</h1>
<p>Zöld vonal: a ${DEFAULT_DHASH_THRESHOLD}-es küszöb (e fölött a rendszer már nem tekinti másolatnak). Piros vonal: a legkisebb távolság, amelyre egy kép valamelyik változata egy idegen kép eredetijét megközelítette (${minForeign}). A halvány oszlopok az ismert korlátok (tükrözés, forgatás).</p>
<svg width="${width}" height="${chartHeight + 150}" viewBox="0 -40 ${width} ${chartHeight + 150}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif">
<g>${legend}</g>${ticks}
<line x1="${left - 4}" x2="${width - 10}" y1="${thresholdY}" y2="${thresholdY}" stroke="#15803d" stroke-width="2" stroke-dasharray="6 4"/>
<text x="${left}" y="${thresholdY - 5}" font-size="11" fill="#15803d">küszöb = ${DEFAULT_DHASH_THRESHOLD}</text>
<line x1="${left - 4}" x2="${width - 10}" y1="${minForeignY}" y2="${minForeignY}" stroke="#b91c1c" stroke-width="2" stroke-dasharray="6 4"/>
<text x="${left}" y="${minForeignY - 5}" font-size="11" fill="#b91c1c">legkisebb távolság idegen kép eredetijétől (bármely változat) = ${minForeign}</text>
${groups}
<line x1="${left - 4}" x2="${width - 10}" y1="${chartHeight}" y2="${chartHeight}" stroke="#9ca3af"/>
</svg></body></html>`;
}

function sheetHtml(base: BaseImage, measurements: Measurement[]): string {
  const rows = mainRows(measurements);
  const cards = rows
    .map((row) => find(measurements, base.name, row.id))
    .filter((m): m is Measurement => m !== undefined && m.thumbnail !== undefined)
    .map(
      (m) => `<figure>
  <img src="${m.thumbnail}" alt="${escapeHtml(m.variant)}">
  <figcaption><strong>${escapeHtml(m.variant)}</strong><br>SHA-256: ${m.sha256Matches ? 'egyezik' : 'más'} · dHash-távolság: <b>${m.distance}</b> · ${m.duplicateAtDefault ? 'másolat' : 'nem ismeri fel'}</figcaption>
</figure>`,
    )
    .join('\n');
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>Módosított másolatok – ${escapeHtml(base.name)}</title>
<style>body{margin:0;background:#fff;font-family:Arial,sans-serif;color:#111827}h1{font-size:18px;margin:16px 24px 8px}
main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px 16px;padding:0 24px 16px}figure{margin:0;text-align:center}
img{max-width:100%;height:auto;max-height:${THUMBNAIL_PX}px;border:1px solid #e5e7eb}figcaption{font-size:11px;line-height:1.35;margin-top:4px;color:#374151}</style></head>
<body><h1>${escapeHtml(base.name)} (${base.width}×${base.height}) – a módosított másolatok és a dHash-távolság</h1><main>${cards}</main></body></html>`;
}

interface ReportInput {
  bases: BaseImage[];
  measurements: Measurement[];
  comparisons: Comparison[];
  fragile: Map<string, number>;
  timings: TimingClass[];
  stamp: string;
}

function markdown({
  bases,
  measurements,
  comparisons,
  fragile,
  timings,
  stamp,
}: ReportInput): string {
  const T = DEFAULT_DHASH_THRESHOLD;
  const main = measurements.filter((m) => m.table === 'main' && m.variantId !== 'identity');
  const byCategory = (category: Category) => main.filter((m) => m.category === category);
  const recognised = (items: Measurement[]) => items.filter((m) => m.duplicateAtDefault).length;
  const maxOf = (items: Measurement[]) =>
    items.length > 0 ? Math.max(...items.map((m) => m.distance)) : 0;
  const rangeOf = (items: Measurement[]) =>
    items.length > 0 ? `${Math.min(...items.map((m) => m.distance))}–${maxOf(items)}` : '–';
  const categoryA = byCategory('A');
  const categoryB = byCategory('B');
  const categoryC = byCategory('C');
  const categoryD = byCategory('D');
  const categoryE = byCategory('E');
  const mustRecognise = main.filter((m) => m.mustRecognise);
  const missed = mustRecognise.filter((m) => !m.duplicateAtDefault);
  const missedList = missed.map((m) => `${m.photo} – ${m.variant} (${m.distance})`).join('; ');
  const originalPairs: string[] = [];
  for (let i = 0; i < bases.length; i += 1) {
    for (let j = i + 1; j < bases.length; j += 1) {
      originalPairs.push(
        `| ${bases[i]!.name} | ${bases[j]!.name} | ${hammingDistance(bases[i]!.dHash, bases[j]!.dHash)} |`,
      );
    }
  }
  const minPair = Math.min(
    ...bases.flatMap((a, i) => bases.slice(i + 1).map((b) => hammingDistance(a.dHash, b.dHash))),
  );
  const minForeign = Math.min(...comparisons.map((c) => c.distance));
  const closest = comparisons.find((c) => c.distance === minForeign)!;
  const maxMust = maxOf(mustRecognise);
  const safeThreshold = minForeign - 1;
  const allVariantRows = [
    ...new Map(
      measurements.filter((m) => m.variantId !== 'identity').map((m) => [m.variantId, m]),
    ).values(),
  ];
  const foreignRows = allVariantRows.map((v) => {
    const distances = comparisons.filter((c) => c.variantId === v.variantId).map((c) => c.distance);
    return `| ${v.variant} | ${Math.min(...distances)} | ${Math.max(...distances)} |`;
  });
  const curveRow = (id: string) => {
    const label = measurements.find((m) => m.variantId === id)?.variant ?? id;
    return `| ${label} | ${bases.map((base) => cell(find(measurements, base.name, id))).join(' | ')} |`;
  };
  const curveHeader = `| Módosítás | ${bases.map((b) => b.name).join(' | ')} |\n| --- | ${bases.map(() => '---').join(' | ')} |`;
  const watermarkIds = [
    'preview_nowm',
    ...WATERMARK_OPACITIES.map((o) => `preview_wm${Math.round(o * 100)}`),
    ...(bases.some((b) => b.original) ? ['preview_original'] : []),
  ];
  const fragileRow = `| törékeny rácspárok száma a ${DHASH_BITS}-ből (a két szomszéd eltérése legfeljebb ${FRAGILE_BIT_DELTA}) | ${bases.map((b) => fragile.get(b.name) ?? '–').join(' | ')} |`;
  const belowUploadMinimum = main.filter(
    (m) => m.variantId === 'resize50' || m.variantId === 'resize25',
  );
  const oversized = bases
    .filter((b) => b.original && b.original.bytes.length > UPLOAD_MAX_BYTES)
    .map((b) => b.original!.name);
  const photos = bases.map((b) => `${b.name} (${b.width}×${b.height})`).join(', ');
  const cpu = cpus()[0]?.model.trim() ?? 'ismeretlen CPU';
  return `# A hitelesítés robusztussága (L29)

Mérés ideje: ${stamp} (\`npm run experiment:hash\`, \`server/scripts/hash-experiment.ts\`; sharp
${SHARP_VERSION}, libvips ${sharp.versions.vips}, Node ${process.version}, ${process.platform}). Fotók: ${photos} – a
szerző saját felvételei${
    bases.some((b) => b.original)
      ? `, a teljes felbontású eredetikkel (${bases
          .filter((b) => b.original)
          .map((b) => b.original!.name)
          .join(', ')} – az \`originals/\` mappa nincs a repóban)`
      : ''
  }.
A módosított másolatokat a script állítja elő (JPEG q${SAVE_JPEG_QUALITY}-tel mentve, ahol a módosítás mást nem mond); a
hash ugyanazzal a modullal készül, mint a szerveren. A ✗ jel: a ${T}-es küszöbnél a rendszer nem ismerné fel
másolatnak. Kategóriák: A – formátum, minőség, tónus; B – vágás; C – a platform előnézete; D – ismert korlát
(tükrözés, forgatás); E – valós módosítási lánc.

**A táblázat a hash robusztusságát méri, nem a feltöltés viselkedését:** a feltöltés a ${MIN_IMAGE_EDGE_PX} képpontnál
kisebb oldalú képet (itt a ${belowUploadMinimum
    .map((m) => m.variant)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(
      ' és ',
    )}) és a ${UPLOAD_MAX_BYTES / 1024 / 1024} MiB-nál nagyobb fájlt${oversized.length > 0 ? ` (${oversized.join(', ')})` : ''}
mérete miatt eleve elutasítja; az ellenőrző oldal a kisebb képet is elfogadja.

## dHash-távolság az eredetitől (bit a 64-ből)

${distanceTable(bases, measurements, mainRows(measurements), true)}

Az SHA-256 minden módosításnál megváltozik (bájtpontos ujjlenyomat) – csak a változatlan fájlt
ismeri fel. Kategóriánként a ${T}-es küszöbnél:

| Kategória | Felismert | Távolság |
| --- | --- | --- |
| A – ${CATEGORY_LABEL.A} | ${recognised(categoryA)} / ${categoryA.length} | ${rangeOf(categoryA)} |
| B – ${CATEGORY_LABEL.B} (5 és 10 % minden oldalról) | ${recognised(categoryB)} / ${categoryB.length} | ${rangeOf(categoryB)} |
| C – ${CATEGORY_LABEL.C} | ${recognised(categoryC)} / ${categoryC.length} | ${rangeOf(categoryC)} |
| E – ${CATEGORY_LABEL.E} | ${recognised(categoryE)} / ${categoryE.length} | ${rangeOf(categoryE)} |
| D – ${CATEGORY_LABEL.D} (nem várt felismerés) | ${recognised(categoryD)} / ${categoryD.length} | ${rangeOf(categoryD)} |

A küszöb fölé került tartalommegőrző másolatok: ${missed.length > 0 ? missedList : 'nincs'}.

**A küszöb indoklása.** A dHash-küszöb alapértékét (${T} bit) Krawetz ajánlása alapján választottuk [S40]; a saját
mérés ezzel összhangban van, de – a kis minta miatt – nem jelöli ki. A három fotón a formátum-, minőség- és
tónusmódosítások (A) legfeljebb ${maxOf(categoryA)} bittel tértek el az eredetitől, a három különböző fotó pedig
egymástól ${minPair}–${Math.max(...bases.flatMap((a, i) => bases.slice(i + 1).map((b) => hammingDistance(a.dHash, b.dHash))))} bitre esett. A vágás és a platform vízjeles előnézete a küszöb körül szóródott (B: ${rangeOf(categoryB)},
C: ${rangeOf(categoryC)} bit), a tükrözés és a 90°-os forgatás (${rangeOf(categoryD)} bit) a várakozásnak megfelelően kívül esik.
A legtávolabbi felismerendő másolat (${maxMust} bit) ${maxMust >= minForeign ? 'messzebb volt, mint' : 'közelebb volt, mint'} a legközelebbi idegen kép valamelyik
változata (${minForeign} bit: ${closest.first} – ${closest.variant} → ${closest.second})${maxMust >= minForeign ? ', így egyetlen küszöb sem választja el őket hibátlanul' : ''}.
A mintán a ${T} és ${safeThreshold} közötti küszöbök mind téves egyezés nélkül működtek; a ${T}-et azért tartjuk meg, mert a
jóhiszemű fotós téves elutasítása ellen a rendszerben nincs jogorvoslat, a hasonló, de különböző felvételek
távolságát pedig nem mértük.

**Fenntartás.** A minta három független idegen képpár; a ${comparisons.length} összevetés ezek változataiból adódik (minden
kép minden változata a másik két kép eredetijével). A téves egyezés valószínűségére ezért nem adható
számszerű becslés; a sorozatfelvételek, az azonos témájú különböző fotók és az egyszínű képek nem
szerepeltek. Mivel minden feltöltést az összes regisztrált képpel összevetünk, a téves egyezés esélye a
katalógus méretével nő. Minden változatot ugyanaz a libvips készítette, amely a hash-t is számolja (más
eszközzel készült másolat nincs a mintában).

## A vágás és a kis forgatás törési görbéje (bit, B kategória)

${curveHeader}
${CROP_CURVE_IDS.map(curveRow).join('\n')}
${ROTATION_CURVE_IDS.map(curveRow).join('\n')}

## A vízjel hatása (C kategória)

${curveHeader}
${watermarkIds.map(curveRow).join('\n')}
${fragileRow}

A vízjel fehér, félig átlátszó rétege a sötét képpontokat arányosan jobban világosítja, és a csempéi nem
illeszkednek a dHash 9×8-as rácsához: ahol sok a szomszédos, majdnem egyforma fényességű rácspár
(„törékeny bit”), ott a vízjel több bitet billent át. Az SHA-256 az előnézetnél is más; az eltérést a
dHash-távolság mutatja.

## Idegen képek

A három fotó eredetije egymástól:

| Első kép | Második kép | dHash-távolság |
| --- | --- | --- |
${originalPairs.join('\n')}

A változatok a másik két kép eredetijétől (a legkisebb érték mutatja, mennyire tolja el a módosítás a
képet egy idegen felé):

| Módosítás | legkisebb | legnagyobb |
| --- | --- | --- |
${foreignRows.join('\n')}

## A küszöb kimérése

Felismert másolatok kategóriánként (a fő táblázat tartalommegőrző változatai) és a téves egyezések száma
a lehetséges küszöbértékeknél:

${thresholdTable(measurements, comparisons)}

## Futásidő

A dHash kiszámítása (a fájl beolvasása nélkül, képenként ${TIMING_REPEATS} futás mediánja, bemelegítés után; ${cpu}):

| Méretosztály | Képek | Medián (ms) | Tartomány (ms) |
| --- | --- | --- | --- |
${timings.map((t) => `| ${t.label} | ${t.count} | ${hu(t.medianMs)} | ${hu(t.minMs)}–${hu(t.maxMs)} |`).join('\n')}

## Megjegyzések

- Az L09-es naplóban mért értékektől (tükrözés 11/30/30, szürkeárnyalat 1–2) néhány eset 1 bittel eltér:
  ott a változatok tömörítetlen képpontokból, itt JPEG q${SAVE_JPEG_QUALITY}-tel mentett fájlból számoltak.
- A felirat és a vízjel SVG-szövegét a rendszer betűkészlete rajzolja; más rendszeren 1–2 bites eltérés
  lehetséges.
`;
}

async function main(): Promise<void> {
  const [imagesArg, outputArg] = process.argv.slice(2);
  const imagesDir = resolve(imagesArg ?? DEFAULT_IMAGES_DIR);
  const outputDir = resolve(outputArg ?? DEFAULT_OUTPUT_DIR);
  const files = readdirSync(imagesDir).filter(isImageFile).sort();
  if (files.length < 2) throw new Error(`Legalább két kép kell a(z) ${imagesDir} mappában`);
  const stamp = new Date().toISOString();
  console.log(
    `Robusztussági kísérlet: ${files.length} fotó × ${VARIANTS.length + 2 + WATERMARK_OPACITIES.length + 1} változat`,
  );

  const bases: BaseImage[] = [];
  for (const file of files) bases.push(await loadBase(join(imagesDir, file)));
  await attachOriginals(imagesDir, bases);

  const measurements: Measurement[] = [];
  const fragile = new Map<string, number>();
  for (const base of bases) {
    const results = await measurePhoto(base);
    measurements.push(...results);
    fragile.set(base.name, await fragileBits(base.bytes));
    for (const m of results.filter((row) => row.table === 'main')) {
      console.log(
        `  ${m.photo} – ${m.variant}: SHA-256 ${m.sha256Matches ? 'egyezik' : 'más'}, dHash-távolság ${m.distance}${m.duplicateAtDefault ? '' : ' (nem másolat)'}`,
      );
    }
  }
  const comparisons = compare(bases, measurements);
  const timings = await timing(bases, measurements);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'hash-experiment.csv'),
    csvFile(
      [
        'photo',
        'variant_id',
        'variant',
        'category',
        'table',
        'must_recognise',
        'bytes',
        'sha256_matches',
        'dhash',
        'distance',
        `duplicate_at_threshold_${DEFAULT_DHASH_THRESHOLD}`,
      ],
      measurements.map((m) => [
        m.photo,
        m.variantId,
        m.variant,
        m.category,
        m.table,
        m.mustRecognise,
        m.bytes,
        m.sha256Matches,
        m.dHash,
        m.distance,
        m.duplicateAtDefault,
      ]),
    ),
  );
  writeFileSync(
    join(outputDir, 'hash-experiment-comparisons.csv'),
    csvFile(
      ['first_photo', 'variant_id', 'variant', 'second_photo', 'distance'],
      comparisons.map((c) => [c.first, c.variantId, c.variant, c.second, c.distance]),
    ),
  );
  const report = markdown({ bases, measurements, comparisons, fragile, timings, stamp });
  writeFileSync(join(outputDir, 'hash-experiment.md'), report);
  writeFileSync(join(outputDir, 'hash-experiment.html'), renderReportHtml(report));
  writeFileSync(
    join(outputDir, 'hash-experiment-chart.html'),
    chartHtml(bases, measurements, comparisons),
  );
  const [firstBase] = bases;
  if (firstBase)
    writeFileSync(
      join(outputDir, 'hash-experiment-sheet.html'),
      sheetHtml(firstBase, measurements),
    );
  const mustRecognise = measurements.filter(
    (m) => m.table === 'main' && m.mustRecognise && m.variantId !== 'identity',
  );
  console.log(
    `  Felismert tartalommegőrző másolatok a ${DEFAULT_DHASH_THRESHOLD}-es küszöbnél: ${mustRecognise.filter((m) => m.duplicateAtDefault).length} / ${mustRecognise.length}; legkisebb távolság idegen képtől: ${Math.min(...comparisons.map((c) => c.distance))} (${comparisons.length} összevetés)`,
  );
  console.log(`  Kész: ${outputDir}`);
}

await main();
