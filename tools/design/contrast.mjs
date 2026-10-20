// A design tokenek színkontrasztjának ellenőrzése (L17) a WCAG 2.2 szerint: a téma
// (client/src/styles/theme.css) színtokenjeiből az előírt szín-párosok (szöveg a hátterén, felületi elem a
// környezetén) kontrasztaránya, és hogy eléri-e az AA szintet. Parancssorból táblázatot ír, és
// hibakóddal lép ki, ha egy páros nem felel meg:
//   node tools/design/contrast.mjs
// Forrás: W3C – WCAG 2.2: Contrast (Minimum) 1.4.3, Non-text Contrast 1.4.11, és a „relative
// luminance” / „contrast ratio” fogalom-meghatározása, https://www.w3.org/TR/WCAG22/ (adaptálva)
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A téma: a design tokenek egyetlen forrása (Tailwind CSS v4 @theme) */
export const THEME_FILE = resolve(REPO_ROOT, 'client/src/styles/theme.css');

/** Szöveg a hátterén (WCAG 1.4.3, normál méretű szöveg) */
const TEXT = 4.5;
/** Felületi elem (mezőkeret, fókuszjelző, ikon) a környezetén (WCAG 1.4.11) */
const UI = 3;

/**
 * Az előírt szín-párosok: minden olyan előtér–háttér kombináció, amely a felületen szöveget vagy
 * értelmet hordozó elemet jelenít meg. A tokenek a theme.css nevei (a --color- előtag nélkül).
 */
export const REQUIRED_PAIRS = [
  { fg: 'fg', bg: 'canvas', min: TEXT, use: 'törzsszöveg' },
  { fg: 'fg', bg: 'surface', min: TEXT, use: 'szöveg szürke felületen' },
  { fg: 'fg-muted', bg: 'canvas', min: TEXT, use: 'másodlagos szöveg' },
  { fg: 'fg-muted', bg: 'surface', min: TEXT, use: 'másodlagos szöveg szürke felületen' },
  { fg: 'on-primary', bg: 'primary', min: TEXT, use: 'elsődleges gomb felirata' },
  { fg: 'on-primary', bg: 'primary-hover', min: TEXT, use: 'elsődleges gomb felirata (rámutatva)' },
  { fg: 'primary', bg: 'canvas', min: TEXT, use: 'piros szöveg, hivatkozás' },
  { fg: 'white', bg: 'black', min: TEXT, use: 'fekete gomb felirata' },
  { fg: 'danger', bg: 'canvas', min: TEXT, use: 'mezőhiba szövege' },
  { fg: 'danger', bg: 'danger-surface', min: TEXT, use: 'hibaüzenet doboza' },
  { fg: 'trust-700', bg: 'trust-50', min: TEXT, use: 'hitelesítve jelvény' },
  { fg: 'trust-700', bg: 'canvas', min: TEXT, use: 'hitelesítve felirat' },
  { fg: 'caution-700', bg: 'caution-50', min: TEXT, use: 'folyamatban / figyelem jelvény' },
  { fg: 'caution-700', bg: 'canvas', min: TEXT, use: 'figyelem felirat' },
  { fg: 'fg-muted', bg: 'canvas', min: TEXT, use: 'helykitöltő szöveg (placeholder)' },
  { fg: 'line-strong', bg: 'canvas', min: UI, use: 'űrlapmező kerete' },
  { fg: 'line-strong', bg: 'canvas', min: UI, use: 'üres csillag kerete' },
  { fg: 'primary', bg: 'canvas', min: UI, use: 'aktív fül, aktív menüpont jelzése' },
  { fg: 'focus', bg: 'canvas', min: UI, use: 'fókuszjelző' },
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Egy színtoken deklarációja; az érték a pontosvesszőig vagy a blokk végéig tart. */
const COLOR_DECLARATION = /--color-([a-z0-9-]+)\s*:\s*([^;}]+)[;}]/g;
const VAR_REFERENCE = /^var\(\s*--color-([a-z0-9-]+)\s*\)$/;

/** Hexadecimális szín (#rgb vagy #rrggbb) csatornái 0–255 között. */
export function parseHex(value) {
  const match = HEX.exec(value);
  if (!match) throw new Error(`Nem hexadecimális szín: ${value}`);
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join('') : match[1];
  const n = Number.parseInt(digits, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Egy sRGB csatorna lineáris értéke (0–1) a WCAG 2.2 képlete szerint. */
function linearChannel(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relatív fénysűrűség: 0 (fekete) és 1 (fehér) között. */
export function relativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/** Kontrasztarány 1 és 21 között; a két szín sorrendje nem számít. */
export function contrastRatio(hexA, hexB) {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** Kisbetűs, hatjegyű alak (#d7192d) – így a tokenek értéke egységesen összevethető. */
function normalizeHex(value) {
  const { r, g, b } = parseHex(value);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A téma színtokenjei a deklaráció sorrendjében: név, a feloldott hexadecimális érték, és ha egy
 * másik tokenre hivatkozik, annak a neve (alias). A megjegyzéseket figyelmen kívül hagyja.
 */
export function readColorTokens(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  // A kétszer deklarált token hiba: különben csendben az utolsó érvényesülne (pl. egy sötét téma
  // felülírása), és az ellenőrzés nem a világos téma színeit vizsgálná
  const raw = new Map();
  for (const [, name, value] of css.matchAll(COLOR_DECLARATION)) {
    if (raw.has(name)) throw new Error(`többször deklarált színtoken: ${name}`);
    raw.set(name, value.trim());
  }

  function resolveValue(name, path) {
    if (!raw.has(name)) throw new Error(`ismeretlen színtoken: ${name}`);
    if (path.includes(name)) throw new Error(`körkörös hivatkozás: ${[...path, name].join(' → ')}`);
    const value = raw.get(name);
    const reference = VAR_REFERENCE.exec(value);
    return reference ? resolveValue(reference[1], [...path, name]) : normalizeHex(value);
  }

  return [...raw.keys()].map((name) => ({
    name,
    value: resolveValue(name, []),
    alias: VAR_REFERENCE.exec(raw.get(name))?.[1] ?? null,
  }));
}

/** A téma színtokenjei: név → kisbetűs hexadecimális érték (a hivatkozások feloldva). */
export function parseThemeColors(cssText) {
  return new Map(readColorTokens(cssText).map(({ name, value }) => [name, value]));
}

/** A párosok kontrasztaránya, és hogy elérik-e a minimumot (kerekítés nélkül összevetve). */
export function checkContrast(colors, pairs) {
  const valueOf = (name) => {
    const value = colors.get(name);
    if (value === undefined) throw new Error(`ismeretlen színtoken: ${name}`);
    return value;
  };
  return pairs.map((pair) => {
    const ratio = contrastRatio(valueOf(pair.fg), valueOf(pair.bg));
    return {
      ...pair,
      fgValue: valueOf(pair.fg),
      bgValue: valueOf(pair.bg),
      ratio,
      ok: ratio >= pair.min,
    };
  });
}

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const RESET = '\u001b[0m';

/** A parancssori ellenőrzés: táblázat a párosokról; hibakód, ha valamelyik nem felel meg. */
function main() {
  const results = checkContrast(parseThemeColors(readFileSync(THEME_FILE, 'utf8')), REQUIRED_PAIRS);
  const source = relative(REPO_ROOT, THEME_FILE).replaceAll('\\', '/');
  console.log(`WCAG 2.2 kontrasztellenőrzés – ${source} (${results.length} páros)\n`);
  for (const { ok, ratio, min, use, fg, bg } of results) {
    const mark = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const value = `${ratio.toFixed(2)}:1`.padStart(8);
    console.log(`${mark} ${value}  (min. ${min}:1)  ${use} – ${fg} / ${bg}`);
  }
  const failed = results.filter(({ ok }) => !ok).length;
  console.log(
    failed === 0
      ? `\n${GREEN}Minden páros megfelel a WCAG AA szintnek.${RESET}`
      : `\n${RED}${failed} páros nem felel meg.${RESET}`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
