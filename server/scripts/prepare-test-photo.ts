// Saját fotó előkészítése tesztfotónak (tests/fixtures/images): az EXIF szerinti állásba forgatja,
// a hosszabbik oldalát 1600 képpontra kicsinyíti, és sRGB JPEG-ként, MINDEN metaadat nélkül menti
// (EXIF, GPS-koordináta, a gép sorozatszáma) – így a repóba csak a kép tartalma kerül.
// Használat (a server/ mappából):
//   npx tsx scripts/prepare-test-photo.ts <forrásfájl> <célnév.jpg>
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const FIXTURES_DIR = fileURLToPath(new URL('../tests/fixtures/images/', import.meta.url));
const LONG_EDGE_PX = 1600;
const JPEG_QUALITY = 85;

const [sourcePath, targetName] = process.argv.slice(2);
if (!sourcePath || !targetName || !/^[a-z0-9_-]+\.jpg$/.test(targetName)) {
  console.error(
    'Használat: npx tsx scripts/prepare-test-photo.ts <forrásfájl> <célnév.jpg>\n' +
      'A célnév csak kisbetűt, számot, kötőjelet és aláhúzást tartalmazhat, pl. 01_tajkep.jpg',
  );
  process.exit(1);
}

const targetPath = `${FIXTURES_DIR}${targetName}`;
// A sharp alapból minden metaadatot eldob, és a színeket a beágyazott profil alapján sRGB-re alakítja
const { width, height } = await sharp(sourcePath)
  .autoOrient()
  .resize({ width: LONG_EDGE_PX, height: LONG_EDGE_PX, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: JPEG_QUALITY })
  .toFile(targetPath);

const { exif, icc, xmp, iptc } = await sharp(targetPath).metadata();
const kiloBytes = Math.round(statSync(targetPath).size / 1024);
const metadata = exif || icc || xmp || iptc ? 'MARADT METAADAT!' : 'metaadat nélkül';
console.log(`${targetName}: ${width}×${height} képpont, ${kiloBytes} kB, ${metadata}`);
