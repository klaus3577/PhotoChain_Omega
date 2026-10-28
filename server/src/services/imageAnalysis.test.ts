// A közös képelemzés tesztje: a nagy, nem soronként bontható kép (WebP) képpontjai sem kerülnek a
// lemezre. A libvips 100 MB fölött ideiglenes fájlba bontaná ki a képet (lásd config/imageMemory.ts –
// a tesztekben a Vitest setupFiles-a, a szerverben a server.ts első importja állítja be a küszöböt).
import { readFileSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

import { pino } from 'pino';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { dHashFromGrid, sha256, toDHashGrid } from './hashing.service.js';
import { analyseImage, type ImageRules } from './imageAnalysis.js';

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

// --- Degenerált dHash (a kép elemzése elutasítja) --------------------------------------------------

/** A tests/fixtures/images mappa egy fotója (a szerző saját képe). */
const fixture = (name: string): Buffer =>
  readFileSync(new URL(`../../tests/fixtures/images/${name}`, import.meta.url));
const UPLOAD_RULES: ImageRules = { minEdgePx: 600, action: 'tölthető fel' };
const VERIFY_RULES: ImageRules = { minEdgePx: 100, action: 'ellenőrizhető' };
const silent = pino({ level: 'silent' });
const IMAGE_SIDE_PX = 600;
const STRIPE_PX = 75;

/** Szürke, négyzet alakú PNG a képpont (x, y) → fényesség függvényből. */
function grayImage(
  brightness: (x: number, y: number) => number,
  side = IMAGE_SIDE_PX,
): Promise<Buffer> {
  const pixels = Buffer.alloc(side * side);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) pixels[y * side + x] = brightness(x, y);
  }
  return sharp(pixels, { raw: { width: side, height: side, channels: 1 } })
    .png()
    .toBuffer();
}

/** Függőleges fényességátmenet: fentről (fekete) lefelé (fehér) világosodik; soron belül állandó. */
const verticalGradient = () => grayImage((_x, y) => Math.round((y / (IMAGE_SIDE_PX - 1)) * 255));
/** Vízszintes sávok: felváltva sötét és világos sorok; soron belül állandó. */
const horizontalStripes = () =>
  grayImage((_x, y) => (Math.floor(y / STRIPE_PX) % 2 === 0 ? 25 : 230));
/** Függőleges sávok: soron belül váltakozik – a dHash soraiban van kontraszt. */
const verticalStripes = () => grayImage((x) => (Math.floor(x / STRIPE_PX) % 2 === 0 ? 25 : 230));
/** Vízszintes átmenet: balról jobbra végig világosodik – minden sor bájtja csupa 1 bit. */
const horizontalGradient = () => grayImage((x) => Math.round((x / (IMAGE_SIDE_PX - 1)) * 255));
/** Ugyanaz visszafelé: végig sötétedik – csupa 0 bit, mint a függőleges átmenetnél. */
const reversedGradient = () => grayImage((x) => 255 - Math.round((x / (IMAGE_SIDE_PX - 1)) * 255));
/** Átlós átmenet: soronként is végig világosodik. */
const diagonalGradient = () =>
  grayImage((x, y) => Math.round(((x + y) / (2 * (IMAGE_SIDE_PX - 1))) * 255));

/** 9 × 8 cellás minta 100 képpontos cellákkal (900 × 800): a kicsinyítés a cellák értékét adja vissza. */
function blockImage(cells: readonly (readonly number[])[]): Promise<Buffer> {
  const [columns, rows, cell] = [9, 8, 100];
  const width = columns * cell;
  const pixels = Buffer.alloc(width * rows * cell);
  for (let y = 0; y < rows * cell; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[y * width + x] = cells[Math.floor(y / cell)]?.[Math.floor(x / cell)] ?? 0;
    }
  }
  return sharp(pixels, { raw: { width, height: rows * cell, channels: 1 } })
    .png()
    .toBuffer();
}

/** Informatív sor: nagy kontraszt, váltakozó irány (a bájtja 01010101); az átlaga 120 */
const ALTERNATING = [40, 200, 40, 200, 40, 200, 40, 200, 40];
/** Nagy kontraszt, de végig világosodik: a bájtja csupa 1 bit */
const RAMP = [40, 60, 80, 100, 120, 140, 160, 180, 200];
/** Váltakozó, de csak 10-es fényességtartomány: zaj */
const FAINT = [120, 130, 120, 130, 120, 130, 120, 130, 120];
/** Egyszínű sor */
const FLAT = Array<number>(9).fill(120);

/** `informative` váltakozó sor, utána a megadott sorok, a többi egyszínű (összesen 8 sor). */
const pattern = (informative: number, extra: readonly (readonly number[])[] = []) =>
  [
    ...Array.from({ length: informative }, () => ALTERNATING),
    ...extra,
    ...Array.from({ length: 8 }, () => FLAT),
  ].slice(0, 8);

/** A várt 400-as hiba: a kódja és a kliensnek szóló üzenete (a művelet nevével). */
async function expectLowDetail(analysis: Promise<unknown>, action: string): Promise<void> {
  await expect(analysis).rejects.toMatchObject({ statusCode: 400, code: 'LOW_DETAIL_IMAGE' });
  await expect(analysis).rejects.toThrow(
    `A kép túl kevés részletet tartalmaz (egyszínű, vagy csak egy irányban változik) – nem ${action}`,
  );
}

describe('analyseImage – degenerált dHash (a soronként egyszínű kép)', () => {
  it('a két kép SHA-256-a eltér, a dHash-ük mégis azonos (csupa 0) – ezért kell a szűrő', async () => {
    const [gradient, stripes] = await Promise.all([verticalGradient(), horizontalStripes()]);

    expect(sha256(gradient)).not.toBe(sha256(stripes));
    expect(dHashFromGrid(await toDHashGrid(gradient))).toBe('0000000000000000');
    expect(dHashFromGrid(await toDHashGrid(stripes))).toBe('0000000000000000');
  });

  it('a függőleges fényességátmenetet elutasítja (LOW_DETAIL_IMAGE), bár a kép nem egyszínű', async () => {
    const gradient = await verticalGradient();

    await expectLowDetail(analyseImage(gradient, silent, UPLOAD_RULES), 'tölthető fel');
  });

  it('a vízszintes sávokból álló képet is elutasítja – a hitelesség-ellenőrzés szabályaival is', async () => {
    const stripes = await horizontalStripes();

    await expectLowDetail(analyseImage(stripes, silent, UPLOAD_RULES), 'tölthető fel');
    await expectLowDetail(analyseImage(stripes, silent, VERIFY_RULES), 'ellenőrizhető');
  });

  it('a kevés kontrasztos sorú képet (átmenet egyetlen folttal) és a képpontzajt is elutasítja', async () => {
    const spot = await grayImage((x, y) =>
      (x - 300) ** 2 + (y - 300) ** 2 < 60 ** 2 ? 255 : Math.round((y / (IMAGE_SIDE_PX - 1)) * 200),
    );
    // Képpontonként véletlenszerű: a 9×8-as kicsinyítés kiátlagolja, a hash bitjei esetlegesek
    const noise = await grayImage((x, y) => (x * 7919 + y * 104_729 + x * y) % 256);

    await expect(analyseImage(spot, silent, UPLOAD_RULES)).rejects.toMatchObject({
      code: 'LOW_DETAIL_IMAGE',
    });
    await expect(analyseImage(noise, silent, UPLOAD_RULES)).rejects.toMatchObject({
      code: 'LOW_DETAIL_IMAGE',
    });
  });

  it('a vízszintes és az átlós fényességátmenetet is elutasítja: a sorok bitjei csupa 1 vagy csupa 0', async () => {
    const images = await Promise.all([
      horizontalGradient(),
      reversedGradient(),
      diagonalGradient(),
    ]);

    for (const image of images) {
      await expectLowDetail(analyseImage(image, silent, UPLOAD_RULES), 'tölthető fel');
    }
  });

  it('a soron belül változó képet (függőleges sávok) elfogadja', async () => {
    const result = await analyseImage(await verticalStripes(), silent, UPLOAD_RULES);

    expect(result.dHash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.dHash).not.toBe('0000000000000000');
  });

  it.each([
    ['01_tocsa_tukrozodes.jpg', 'f0e8f2f2b6f3f0f0'],
    ['02_gyertyak.jpg', '989890b0e0d85820'],
    ['03_basszusgitar.jpg', '40d0e1301b57762e'],
  ])('a saját tesztfotót (%s) elfogadja, a dHash-e a rögzített érték', async (name, expected) => {
    await expect(analyseImage(fixture(name), silent, UPLOAD_RULES)).resolves.toMatchObject({
      dHash: expected,
    });
  });

  // A szabály határa 9 × 8 cellás mintákon
  describe('az informatív sorok száma', () => {
    it('pontosan 3 informatív sorral elfogadja, 2-vel elutasítja', async () => {
      await expect(
        analyseImage(await blockImage(pattern(3)), silent, UPLOAD_RULES),
      ).resolves.toMatchObject({
        // A váltakozó sorok bájtja 0xaa; a kicsinyítés a következő két egyszínű sorba is átszivárog
        // (0xaa és 0x55 bájt), de azok tartománya 6, illetve 2 – nem informatívak
        dHash: 'aaaaaaaa55000000',
      });
      await expectLowDetail(
        analyseImage(await blockImage(pattern(2)), silent, UPLOAD_RULES),
        'tölthető fel',
      );
    });

    it('a nagy kontrasztú, de végig egy irányba változó sor nem számít informatívnak', async () => {
      // 2 váltakozó sor + 1 végig világosodó sor (csupa 1 bit): csak 2 informatív
      await expectLowDetail(
        analyseImage(await blockImage(pattern(2, [RAMP])), silent, UPLOAD_RULES),
        'tölthető fel',
      );
    });

    it('a kis (16 alatti) fényességtartományú sor nem számít informatívnak, bár a bitjei váltakoznak', async () => {
      await expectLowDetail(
        analyseImage(await blockImage(pattern(2, [FAINT])), silent, UPLOAD_RULES),
        'tölthető fel',
      );
    });
  });
});
