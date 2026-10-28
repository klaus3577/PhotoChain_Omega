// A hash-modul tesztjei: SHA-256 (ismert tesztvektorok), dHash (programból előállított mintákon és
// saját tesztfotókon), Hamming-távolság, hasonlósági küszöb.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DHASH_THRESHOLD,
  dHash,
  dHashFromGrid,
  dHashRowBytes,
  findClosest,
  hammingDistance,
  InvalidImageError,
  isNearDuplicate,
  rankByDistance,
  rowBrightnessRanges,
  sha256,
  toDHashGrid,
} from './hashing.service.js';
import { MAX_IMAGE_PIXELS } from './imageDecoding.js';

const HEX_16 = /^[0-9a-f]{16}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
/** A scene(3) minta dHash-e a rögzített sharp-verzióval (lásd package.json). */
const GOLDEN_SCENE_3_HASH = '993366cccc993326';

/** Egycsatornás (szürke) kép a megadott képpontértékekből (soronként), veszteségmentes PNG-ként. */
function grayPng(rows: readonly (readonly number[])[]): Promise<Buffer> {
  const width = rows[0]?.length ?? 0;
  return sharp(Buffer.from(rows.flat()), { raw: { width, height: rows.length, channels: 1 } })
    .toColourspace('b-w')
    .png()
    .toBuffer();
}

/** Determinisztikus álvéletlenszám-generátor (mulberry32): ugyanarra a magra mindig ugyanaz a sorozat. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/**
 * Sima, „fotószerű” színes minta (néhány hullám összege) – a robusztussági tesztekhez, hogy azok
 * tesztfotók nélkül, bármely gépen ugyanúgy fussanak. Más mag más „képet” ad.
 */
function scene(seed: number, width = 320, height = 240): Sharp {
  const random = createRandom(seed);
  const waves = Array.from({ length: 4 }, () => ({
    frequencyX: 0.5 + random() * 2.5,
    frequencyY: 0.5 + random() * 2.5,
    phase: random() * Math.PI * 2,
    amplitude: 20 + random() * 40,
  }));
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const brightness = waves.reduce(
        (sum, wave) =>
          sum +
          wave.amplitude *
            Math.sin(
              2 * Math.PI * ((wave.frequencyX * x) / width + (wave.frequencyY * y) / height) +
                wave.phase,
            ),
        128,
      );
      const offset = (y * width + x) * 3;
      pixels[offset] = clampByte(brightness);
      pixels[offset + 1] = clampByte(brightness * 0.8 + 30);
      pixels[offset + 2] = clampByte(brightness * 0.6 + 60);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } });
}

/** Éles határú minta: 40×40 képpontos, véletlen fényességű négyzetekből álló 640×480-as kép. */
function blocks(seed: number): Sharp {
  const random = createRandom(seed);
  const [columns, rows, size] = [16, 12, 40];
  const shades = Array.from({ length: columns * rows }, () => Math.floor(random() * 256));
  const pixels = Buffer.alloc(columns * size * rows * size * 3);
  for (let y = 0; y < rows * size; y += 1) {
    for (let x = 0; x < columns * size; x += 1) {
      const shade = shades[Math.floor(y / size) * columns + Math.floor(x / size)] ?? 0;
      pixels.fill(shade, (y * columns * size + x) * 3, (y * columns * size + x) * 3 + 3);
    }
  }
  return sharp(pixels, { raw: { width: columns * size, height: rows * size, channels: 3 } });
}

/** Két kép dHash-ének Hamming-távolsága. */
async function distanceBetween(first: Buffer, second: Buffer): Promise<number> {
  return hammingDistance(await dHash(first), await dHash(second));
}

describe('sha256', () => {
  // Tesztvektorok: NIST FIPS 180-4 (Secure Hash Standard) példái
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('a szabvány tesztvektora: „%s”', (input, expected) => {
    expect(sha256(Buffer.from(input, 'ascii'))).toBe(expected);
  });

  it('64 jegyű, kisbetűs hexadecimális szöveget ad (az adatbázis CHECK megszorítása szerint)', () => {
    expect(sha256(Buffer.from([0, 1, 2, 255]))).toMatch(HEX_64);
  });

  it('ugyanazokra a bájtokra mindig ugyanazt adja', () => {
    const bytes = Buffer.from('ugyanaz a fájl');

    expect(sha256(bytes)).toBe(sha256(Buffer.from(bytes)));
  });

  it('egyetlen bit megváltozására a hash nagyjából fele megváltozik (lavinahatás)', () => {
    const original = Buffer.alloc(1024, 0xab);
    const modified = Buffer.from(original);
    modified[500] = 0xaa; // 0xab → 0xaa: egyetlen bit

    const changedBits = (BigInt(`0x${sha256(original)}`) ^ BigInt(`0x${sha256(modified)}`))
      .toString(2)
      .replaceAll('0', '').length;

    // 256 bitből várhatóan ~128 változik; a 80–176 tartomány bőven megengedő
    expect(changedBits).toBeGreaterThan(80);
    expect(changedBits).toBeLessThan(176);
  });
});

describe('dHash – a bitek képzése', () => {
  it('soronként a szomszédos képpontokat veti össze: 1, ha a bal oldali sötétebb a jobb oldalinál', async () => {
    // Pontosan 9×8 képpont: nincs átméretezés, így a várt bitek kézzel kiszámolhatók
    const image = await grayPng([
      [0, 30, 60, 90, 120, 150, 180, 210, 240], // végig világosodik       → 11111111 = ff
      [240, 210, 180, 150, 120, 90, 60, 30, 0], // végig sötétedik         → 00000000 = 00
      [0, 255, 0, 255, 0, 255, 0, 255, 0], // sötét–világos váltakozik     → 10101010 = aa
      [255, 0, 255, 0, 255, 0, 255, 0, 255], // világos–sötét váltakozik   → 01010101 = 55
      [0, 255, 255, 255, 255, 255, 255, 255, 255], // csak az első lépés   → 10000000 = 80
      [0, 0, 0, 0, 0, 0, 0, 0, 255], // csak az utolsó lépés               → 00000001 = 01
      [128, 128, 128, 128, 128, 128, 128, 128, 128], // egyenletes         → 00000000 = 00
      [10, 20, 20, 20, 30, 30, 30, 30, 40], // lépcsők                     → 10010001 = 91
    ]);

    await expect(dHash(image)).resolves.toBe('ff00aa5580010091');
  });

  it('balról jobbra világosodó képre csupa 1, sötétedőre csupa 0 bitet ad', async () => {
    const ascending = Array.from({ length: 64 }, (_, x) => x * 4);
    const brightening = await grayPng(Array.from({ length: 48 }, () => ascending));
    const darkening = await grayPng(Array.from({ length: 48 }, () => [...ascending].reverse()));

    await expect(dHash(brightening)).resolves.toBe('ffffffffffffffff');
    await expect(dHash(darkening)).resolves.toBe('0000000000000000');
  });

  it('egyszínű képre csupa 0 bitet ad (nincs sötétebb bal szomszéd)', async () => {
    const flat = await grayPng(Array.from({ length: 20 }, () => Array<number>(30).fill(200)));

    await expect(dHash(flat)).resolves.toBe('0000000000000000');
  });

  it('16 jegyű, kisbetűs hexadecimális szöveget ad JPEG-, PNG- és WebP-képre is', async () => {
    const hashes = await Promise.all([
      scene(1).jpeg().toBuffer().then(dHash),
      scene(1).png().toBuffer().then(dHash),
      scene(1).webp().toBuffer().then(dHash),
    ]);

    for (const hash of hashes) expect(hash).toMatch(HEX_16);
  });

  it('a 16 bites színmélységű képet is 8 bites fényességértékekre képezi le', async () => {
    const eightBit = await scene(1).png().toBuffer();
    const sixteenBit = await scene(1).toColourspace('rgb16').png().toBuffer();

    expect((await sharp(sixteenBit).metadata()).depth).toBe('ushort');
    expect(await dHash(sixteenBit)).toMatch(HEX_16);
    expect(await distanceBetween(eightBit, sixteenBit)).toBeLessThanOrEqual(1);
  });

  it('a számítás két lépése külön is elérhető: 72 fényességérték → 64 bit', async () => {
    const image = await scene(2).png().toBuffer();

    const grid = await toDHashGrid(image);

    expect(grid).toHaveLength(9 * 8);
    expect(dHashFromGrid(grid)).toBe(await dHash(image));
  });

  it('determinisztikus: ugyanarra a fájlra mindig ugyanazt adja', async () => {
    const image = await scene(2).png().toBuffer();

    expect(await dHash(image)).toBe(await dHash(Buffer.from(image)));
  });

  it('nem kép, üres vagy csonka bemenetre InvalidImageError-t dob, az eredeti okkal', async () => {
    const truncated = (await scene(1).jpeg().toBuffer()).subarray(0, 300);

    for (const input of [Buffer.from('ez nem kép, csak szöveg'), Buffer.alloc(0), truncated]) {
      const error = await dHash(input).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(InvalidImageError);
      expect((error as InvalidImageError).cause).toBeInstanceOf(Error);
    }
  });

  it('a képpontra azonos PNG és veszteségmentes WebP hash-e megegyezik', async () => {
    // A sharp a WebP-t (és a JPEG-et) már dekódoláskor kicsinyítheti („shrink-on-load”); ha ez a
    // gyorsított út be van kapcsolva, ugyanaz a kép formátumtól függően más hash-t kaphat
    for (const seed of [6, 7, 8]) {
      const png = await blocks(seed).png().toBuffer();
      const webp = await blocks(seed).webp({ lossless: true }).toBuffer();

      expect(await distanceBetween(png, webp)).toBe(0);
    }
  });

  it('rögzített mintára mindig ugyanazt a hash-t adja (a képfeldolgozó könyvtár frissítésekor is)', async () => {
    // A hash a blokkláncra kerül: ha egy sharp/libvips-frissítés miatt megváltozna, arról tudni kell
    await expect(scene(3).png().toBuffer().then(dHash)).resolves.toBe(GOLDEN_SCENE_3_HASH);
  });

  it('a rács → hash lépés csak pontosan 72 fényességértéket fogad el', () => {
    expect(() => dHashFromGrid(new Uint8Array(0))).toThrow(RangeError);
    expect(() => dHashFromGrid(new Uint8Array(64))).toThrow(RangeError);
    expect(() => dHashFromGrid(new Uint8Array(72 * 3))).toThrow(RangeError);
    expect(dHashFromGrid(new Uint8Array(72))).toBe('0000000000000000');
  });
});

describe('dHash – robusztusság (programból előállított „jeleneten”)', () => {
  it('a felére kicsinyített másolat a küszöbön belül marad', async () => {
    const original = await scene(3).png().toBuffer();
    const resized = await scene(3).resize(160, 120).png().toBuffer();

    expect(sha256(resized)).not.toBe(sha256(original));
    expect(await distanceBetween(original, resized)).toBeLessThanOrEqual(DEFAULT_DHASH_THRESHOLD);
  });

  it('az erősen újratömörített (JPEG, 40%) másolat a küszöbön belül marad', async () => {
    const original = await scene(3).png().toBuffer();
    const recompressed = await scene(3).jpeg({ quality: 40 }).toBuffer();

    expect(sha256(recompressed)).not.toBe(sha256(original));
    expect(await distanceBetween(original, recompressed)).toBeLessThanOrEqual(
      DEFAULT_DHASH_THRESHOLD,
    );
  });

  it('a más formátumba (WebP) mentett másolat a küszöbön belül marad', async () => {
    const original = await scene(3).png().toBuffer();
    const converted = await scene(3).webp({ quality: 80 }).toBuffer();

    expect(await distanceBetween(original, converted)).toBeLessThanOrEqual(DEFAULT_DHASH_THRESHOLD);
  });

  it('a szürkeárnyalatossá alakított másolat a küszöbön belül marad', async () => {
    const original = await scene(3).png().toBuffer();
    const gray = await scene(3).grayscale().png().toBuffer();

    expect(await distanceBetween(original, gray)).toBeLessThanOrEqual(DEFAULT_DHASH_THRESHOLD);
  });

  it('különböző képek távolsága a küszöb fölött van', async () => {
    const images = await Promise.all([3, 4, 5, 6].map((seed) => scene(seed).png().toBuffer()));
    const hashes = await Promise.all(images.map(dHash));

    for (const [index, hash] of hashes.entries()) {
      for (const other of hashes.slice(index + 1)) {
        expect(hammingDistance(hash, other)).toBeGreaterThan(DEFAULT_DHASH_THRESHOLD);
      }
    }
  });

  it('az EXIF szerint elforgatott képet a megjelenő (elforgatott) állásában hash-eli', async () => {
    const original = await scene(3).png().toBuffer();
    // 6-os EXIF-tájolás: a megjelenítő 90°-kal jobbra forgatja a képet
    const tagged = await scene(3).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
    const rotated = await scene(3).rotate(90).png().toBuffer();

    expect(await distanceBetween(tagged, rotated)).toBeLessThanOrEqual(4);
    expect(await distanceBetween(tagged, original)).toBeGreaterThan(DEFAULT_DHASH_THRESHOLD);
  });

  it('az átlátszó területet fehérnek veszi', async () => {
    // Fekete kép, amely balról jobbra egyre átlátszóbb: fehér háttér előtt balról jobbra világosodik
    // (csupa 1 bit); fekete háttér előtt egyszínű fekete lenne (csupa 0 bit)
    const fadingBlack = await sharp(
      Buffer.from(
        Array.from({ length: 48 }, () =>
          Array.from({ length: 64 }, (_, x) => [0, 0, 0, 255 - x * 4]).flat(),
        ).flat(),
      ),
      { raw: { width: 64, height: 48, channels: 4 } },
    )
      .png()
      .toBuffer();

    await expect(dHash(fadingBlack)).resolves.toBe('ffffffffffffffff');
  });

  it('ismert korlát: a tükrözött képet nem ismeri fel (a távolság a küszöb fölött van)', async () => {
    const original = await scene(3).png().toBuffer();
    const mirrored = await scene(3).flop().png().toBuffer();

    expect(await distanceBetween(original, mirrored)).toBeGreaterThan(DEFAULT_DHASH_THRESHOLD);
  });
});

describe('hammingDistance', () => {
  it('azonos hash-ek távolsága 0', () => {
    expect(hammingDistance('3a6c6565498da525', '3a6c6565498da525')).toBe(0);
  });

  it('az eltérő bitek számát adja', () => {
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
    expect(hammingDistance('8000000000000000', '0000000000000000')).toBe(1);
    expect(hammingDistance('00000000000000ff', '0000000000000000')).toBe(8);
    expect(hammingDistance('f0f0f0f0f0f0f0f0', '0f0f0f0f0f0f0f0f')).toBe(64);
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hammingDistance('3a6c6565498da525', '3a6c6565498da524')).toBe(1);
  });

  it('szimmetrikus', () => {
    expect(hammingDistance('ff00aa5580010091', '0123456789abcdef')).toBe(
      hammingDistance('0123456789abcdef', 'ff00aa5580010091'),
    );
  });

  it('érvénytelen hash-re (rossz hossz, nem hexadecimális, nagybetűs) hibát dob', () => {
    expect(() => hammingDistance('abc', '0000000000000000')).toThrow(RangeError);
    expect(() => hammingDistance('0000000000000000', 'g000000000000000')).toThrow(RangeError);
    expect(() => hammingDistance('FFFFFFFFFFFFFFFF', '0000000000000000')).toThrow(RangeError);
    expect(() => hammingDistance('0x00000000000000', '0000000000000000')).toThrow(RangeError);
  });
});

describe('dHash – képpontkorlát', () => {
  it('a korlátnál nagyobb felbontású képet nem dekódolja: InvalidImageError', async () => {
    // Egyszínű kép: a fájl kicsi, kibontva viszont több mint 150 MB volna („tömörített bomba”)
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 100;
    const huge = await sharp({
      create: { width: side, height: side, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();

    await expect(dHash(huge)).rejects.toBeInstanceOf(InvalidImageError);
  });
});

describe('findClosest', () => {
  const candidates = [
    { id: 'tavoli', dHash: 'ffffffffffffffff' },
    { id: 'kozeli', dHash: '0000000000000003' },
    { id: 'szinten-kozeli', dHash: '0000000000000030' },
  ];

  it('a legkisebb Hamming-távolságú jelöltet adja, a távolsággal', () => {
    expect(findClosest('0000000000000001', candidates)).toEqual({ id: 'kozeli', distance: 1 });
  });

  it('egyenlő távolságnál a lista korábbi elemét (a korábban feltöltött képet) adja', () => {
    expect(findClosest('0000000000000000', candidates)).toEqual({ id: 'kozeli', distance: 2 });
  });

  it('üres listára undefined', () => {
    expect(findClosest('0000000000000000', [])).toBeUndefined();
  });
});

describe('rankByDistance', () => {
  const candidates = [
    { id: 'tavoli', dHash: 'ffffffffffffffff' },
    { id: 'kozeli', dHash: '0000000000000003' },
    { id: 'szinten-kozeli', dHash: '0000000000000030' },
  ];

  it('minden jelöltet a Hamming-távolságával ad, növekvő távolság szerint', () => {
    expect(rankByDistance('0000000000000001', candidates)).toEqual([
      { id: 'kozeli', distance: 1 },
      { id: 'szinten-kozeli', distance: 3 },
      { id: 'tavoli', distance: 63 },
    ]);
  });

  it('egyenlő távolságnál a lista sorrendje marad (a korábban feltöltött kép elöl)', () => {
    const ranked = rankByDistance('0000000000000000', candidates);

    expect(ranked.map((candidate) => candidate.id)).toEqual(['kozeli', 'szinten-kozeli', 'tavoli']);
    expect(ranked.map((candidate) => candidate.distance)).toEqual([2, 2, 64]);
  });

  it('a jelöltek listáját nem módosítja; üres listára üres lista', () => {
    const before = [...candidates];

    rankByDistance('0000000000000001', candidates);

    expect(candidates).toEqual(before);
    expect(rankByDistance('0000000000000000', [])).toEqual([]);
  });
});

describe('rowBrightnessRanges', () => {
  it('soronként a legvilágosabb és a legsötétebb cella különbségét adja (8 érték)', async () => {
    const grid = await toDHashGrid(
      await grayPng([
        [0, 30, 60, 90, 120, 150, 180, 210, 240], // 240
        [240, 210, 180, 150, 120, 90, 60, 30, 0], // 240
        [0, 255, 0, 255, 0, 255, 0, 255, 0], // 255
        [100, 100, 100, 100, 100, 100, 100, 100, 100], // egyszínű sor: 0
        [0, 0, 0, 0, 0, 0, 0, 0, 16], // 16
        [10, 20, 20, 20, 30, 30, 30, 30, 40], // 30
        [200, 200, 200, 200, 200, 200, 200, 200, 200], // 0
        [5, 5, 5, 5, 5, 5, 5, 5, 5], // 0
      ]),
    );

    expect(rowBrightnessRanges(grid)).toEqual([240, 240, 255, 0, 16, 30, 0, 0]);
  });

  it('a soronként egyszínű (csak fentről lefelé változó) képre csupa 0, bár a kép nem egyszínű', async () => {
    const rows = Array.from({ length: 8 }, (_, row) => Array<number>(9).fill(row * 32));
    const grid = await toDHashGrid(await grayPng(rows));

    expect(Math.max(...grid) - Math.min(...grid)).toBeGreaterThanOrEqual(200);
    expect(rowBrightnessRanges(grid)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('csak pontosan 72 fényességértéket fogad el', () => {
    expect(() => rowBrightnessRanges(new Uint8Array(71))).toThrow(RangeError);
    expect(() => rowBrightnessRanges(new Uint8Array(73))).toThrow(RangeError);
  });
});

describe('dHashRowBytes', () => {
  it('soronként egy bájt: a sor 8 bitje a legnagyobb helyiértékkel kezdve – a dHash ezekből áll', async () => {
    const grid = await toDHashGrid(
      await grayPng([
        [0, 30, 60, 90, 120, 150, 180, 210, 240], // végig világosodik: 11111111
        [240, 210, 180, 150, 120, 90, 60, 30, 0], // végig sötétedik: 00000000
        [0, 255, 0, 255, 0, 255, 0, 255, 0], // 10101010
        [255, 0, 255, 0, 255, 0, 255, 0, 255], // 01010101
        [0, 255, 255, 255, 255, 255, 255, 255, 255], // 10000000
        [0, 0, 0, 0, 0, 0, 0, 0, 255], // 00000001
        [128, 128, 128, 128, 128, 128, 128, 128, 128], // egyszínű: 00000000
        [10, 20, 20, 20, 30, 30, 30, 30, 40], // 10010001
      ]),
    );

    expect(dHashRowBytes(grid)).toEqual([0xff, 0x00, 0xaa, 0x55, 0x80, 0x01, 0x00, 0x91]);
    expect(dHashFromGrid(grid)).toBe('ff00aa5580010091');
  });

  it('csak pontosan 72 fényességértéket fogad el', () => {
    expect(() => dHashRowBytes(new Uint8Array(71))).toThrow(RangeError);
  });
});

describe('isNearDuplicate', () => {
  it('az alapértelmezett küszöb 10: legfeljebb 10 bit eltérés számít hasonlónak', () => {
    expect(DEFAULT_DHASH_THRESHOLD).toBe(10);
    expect(isNearDuplicate(0)).toBe(true);
    expect(isNearDuplicate(10)).toBe(true);
    expect(isNearDuplicate(11)).toBe(false);
    expect(isNearDuplicate(64)).toBe(false);
  });

  it('a küszöb megadható', () => {
    expect(isNearDuplicate(5, 4)).toBe(false);
    expect(isNearDuplicate(4, 4)).toBe(true);
    expect(isNearDuplicate(0, 0)).toBe(true);
    expect(isNearDuplicate(1, 0)).toBe(false);
  });

  it('érvénytelen távolságra vagy küszöbre (nem egész, 0–64-en kívüli) hibát dob', () => {
    expect(() => isNearDuplicate(-1)).toThrow(RangeError);
    expect(() => isNearDuplicate(65)).toThrow(RangeError);
    expect(() => isNearDuplicate(1.5)).toThrow(RangeError);
    expect(() => isNearDuplicate(3, 65)).toThrow(RangeError);
    expect(() => isNearDuplicate(3, Number.NaN)).toThrow(RangeError);
  });
});

// --- Saját tesztfotók (server/tests/fixtures/images) -----------------------------------------------
// A módosított másolatokat (kicsinyítés, újratömörítés, formátumváltás) a teszt a sharp-pal maga
// állítja elő az eredetiből, így fotónként egyetlen fájl elég. Az autoOrient() azért kell, mert a
// sharp az újrakódoláskor eldobja az EXIF-tájolást: enélkül az álló (telefonos) képek másolata
// elforgatva készülne el, és a teszt hamisan bukna.

const FIXTURES_DIR = fileURLToPath(new URL('../../tests/fixtures/images/', import.meta.url));
const MIN_PHOTOS = 3;
const photoFiles = existsSync(FIXTURES_DIR)
  ? readdirSync(FIXTURES_DIR)
      .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
      .sort()
  : [];

describe('dHash – saját tesztfotókon', { timeout: 60_000 }, () => {
  const loadPhoto = (file: string): Buffer => readFileSync(join(FIXTURES_DIR, file));

  it(`legalább ${MIN_PHOTOS} saját tesztfotó van a tests/fixtures/images mappában`, () => {
    expect(
      photoFiles.length,
      'Másolj a server/tests/fixtures/images mappába legalább három, különböző témájú SAJÁT fotót ' +
        '(JPEG, PNG vagy WebP)',
    ).toBeGreaterThanOrEqual(MIN_PHOTOS);
  });

  describe.each(photoFiles)('%s', (file) => {
    it('ugyanaz a fájl: azonos SHA-256, a dHash távolsága 0', async () => {
      const photo = loadPhoto(file);
      const copy = Buffer.from(photo);

      expect(sha256(copy)).toBe(sha256(photo));
      expect(await distanceBetween(photo, copy)).toBe(0);
    });

    it('felére kicsinyítve: más SHA-256, a dHash a küszöbön belül', async () => {
      const photo = loadPhoto(file);
      const { width = 0, height = 0 } = await sharp(photo).metadata();
      const halfSize = Math.round(Math.max(width, height) / 2);
      const resized = await sharp(photo)
        .autoOrient()
        .resize({ width: halfSize, height: halfSize, fit: 'inside' })
        .toBuffer();

      expect(sha256(resized)).not.toBe(sha256(photo));
      expect(await distanceBetween(photo, resized)).toBeLessThanOrEqual(DEFAULT_DHASH_THRESHOLD);
    });

    it('újratömörítve (JPEG, 60%): más SHA-256, a dHash a küszöbön belül', async () => {
      const photo = loadPhoto(file);
      const recompressed = await sharp(photo).autoOrient().jpeg({ quality: 60 }).toBuffer();

      expect(sha256(recompressed)).not.toBe(sha256(photo));
      expect(await distanceBetween(photo, recompressed)).toBeLessThanOrEqual(
        DEFAULT_DHASH_THRESHOLD,
      );
    });

    it('más formátumban (WebP): más SHA-256, a dHash a küszöbön belül', async () => {
      const photo = loadPhoto(file);
      const converted = await sharp(photo).autoOrient().webp({ quality: 80 }).toBuffer();

      expect(sha256(converted)).not.toBe(sha256(photo));
      expect(await distanceBetween(photo, converted)).toBeLessThanOrEqual(DEFAULT_DHASH_THRESHOLD);
    });
  });

  it('a különböző fotók dHash-távolsága páronként a küszöb fölött van', async () => {
    const hashes = await Promise.all(photoFiles.map((file) => dHash(loadPhoto(file))));

    for (const [index, hash] of hashes.entries()) {
      for (const [offset, other] of hashes.slice(index + 1).entries()) {
        expect(
          hammingDistance(hash, other),
          `${photoFiles[index]} ↔ ${photoFiles[index + 1 + offset]}`,
        ).toBeGreaterThan(DEFAULT_DHASH_THRESHOLD);
      }
    }
  });
});
