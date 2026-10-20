// A dHash lépéseit bemutató ábra egy képről – a dolgozat algoritmus-magyarázó ábrájához:
// eredeti kép → 9×8 képpont szürkeárnyalatban (fényességértékekkel) → 64 bit → 16 jegyű hash.
// Használat (a server/ mappából):
//   npx tsx scripts/dhash-figure.ts <kép> <kimenet.html>
// A HTML-ből a képgenerátor készít PNG-t (a repó gyökeréből):
//   node tools/screenshot/render.mjs html --file <kimenet.html> --width 1500 --height 640 --out L09_xx.png
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import sharp from 'sharp';

import {
  DHASH_COLUMNS,
  DHASH_ROWS,
  dHashFromGrid,
  sha256,
  toDHashGrid,
} from '../src/services/hashing.service.js';

const PREVIEW_SIZE_PX = 400;
/** E fényesség alatt a cellába írt szám fehér, hogy olvasható maradjon. */
const DARK_CELL_LIMIT = 128;

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('Használat: npx tsx scripts/dhash-figure.ts <kép> <kimenet.html>');
  process.exit(1);
}

const image = readFileSync(inputPath);
const grid = await toDHashGrid(image);
const hash = dHashFromGrid(grid);
// A megjelenő (EXIF szerint elforgatott) méret – álló képnél a nyers szélesség és magasság felcserélődik
const { autoOrient, format } = await sharp(image).metadata();
const { width, height } = autoOrient;
const fileName = escapeHtml(basename(inputPath));
const preview = await sharp(image)
  .autoOrient()
  .resize({ width: PREVIEW_SIZE_PX, height: PREVIEW_SIZE_PX, fit: 'inside' })
  .jpeg({ quality: 85 })
  .toBuffer();

const rowIndexes = Array.from({ length: DHASH_ROWS }, (_, row) => row);

const gridRows = rowIndexes
  .map((row) => {
    const cells = Array.from(grid.subarray(row * DHASH_COLUMNS, (row + 1) * DHASH_COLUMNS))
      .map((value) => {
        const color = value < DARK_CELL_LIMIT ? '#ffffff' : '#000000';
        return `<td style="background:rgb(${value},${value},${value});color:${color}">${value}</td>`;
      })
      .join('');
    return `<tr>${cells}</tr>`;
  })
  .join('');

// A biteket magából a kiszámított hash-ből olvassuk vissza: soronként egy bájt (két hex számjegy)
const bitRows = rowIndexes
  .map((row) => {
    const hexByte = hash.slice(row * 2, row * 2 + 2);
    const bits = Number.parseInt(hexByte, 16).toString(2).padStart(8, '0');
    const cells = [...bits].map((bit) => `<td class="bit${bit}">${bit}</td>`).join('');
    return `<tr>${cells}<td class="hex">= ${hexByte}</td></tr>`;
  })
  .join('');

const html = `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><title>dHash – ${fileName}</title><style>
  body { margin: 0; padding: 28px 36px; background: #ffffff; color: #1f2328; font: 15px 'Segoe UI', sans-serif; }
  h1 { margin: 0 0 18px; font-size: 22px; font-weight: 600; }
  .steps { display: flex; gap: 36px; align-items: flex-start; }
  h2 { margin: 0 0 10px; font-size: 15px; font-weight: 600; }
  .note { margin: 8px 0 0; font-size: 13px; color: #57606a; }
  img { display: block; max-width: ${PREVIEW_SIZE_PX}px; max-height: ${PREVIEW_SIZE_PX}px; border: 1px solid #d0d7de; }
  table { border-collapse: collapse; font: 14px 'Cascadia Mono', Consolas, monospace; }
  td { width: 48px; height: 48px; text-align: center; border: 1px solid #8c959f; }
  td.bit1 { background: #0969da; color: #ffffff; font-weight: 700; }
  td.bit0 { background: #f6f8fa; color: #57606a; }
  td.hex { width: 64px; border: none; text-align: left; padding-left: 10px; font-weight: 700; }
  .result { margin-top: 22px; font-size: 17px; }
  code { font: 17px 'Cascadia Mono', Consolas, monospace; font-weight: 700; }
</style></head><body>
<h1>A dHash (különbség-hash) kiszámítása lépésről lépésre</h1>
<div class="steps">
  <div><h2>1. Az eredeti kép</h2>
    <img src="data:image/jpeg;base64,${preview.toString('base64')}" alt="">
    <p class="note">${fileName} – ${width}×${height} képpont (${format})</p></div>
  <div><h2>2. Kicsinyítés ${DHASH_COLUMNS}×${DHASH_ROWS} képpontra, szürkeárnyalatban</h2>
    <table>${gridRows}</table>
    <p class="note">Fényességértékek: 0 = fekete … 255 = fehér</p></div>
  <div><h2>3. Szomszédok összehasonlítása soronként → 64 bit</h2>
    <table>${bitRows}</table>
    <p class="note">1, ha a bal oldali képpont sötétebb a jobb oldali szomszédjánál; soronként egy bájt</p></div>
</div>
<p class="result">4. A nyolc bájt egymás után: <code>dHash = ${hash}</code></p>
</body></html>
`;

writeFileSync(outputPath, html, 'utf8');
console.log(`Kép:     ${basename(inputPath)} (${width}×${height}, ${format})`);
console.log(`SHA-256: ${sha256(image)}`);
console.log(`dHash:   ${hash}`);
console.log(`Ábra:    ${outputPath}`);
