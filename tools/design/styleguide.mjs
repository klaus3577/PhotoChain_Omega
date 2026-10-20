// A stílusútmutató generálása (L17): a docs/design/stilusutmutato.html a design tokenekből
// (client/src/styles/theme.css) készül. A színminták és a kontraszttáblázat a tokenekből, a komponensek
// bemutatója a styleguide.components.mjs-ből. A téma szó szerint kerül a lapba, és a Tailwind CSS v4
// böngészős buildje abból állítja elő az osztályokat – így a lap pontosan azokat a tokeneket mutatja,
// amelyeket a kliens (L18) is használ. A lap önálló (a betűk, a Tailwind és az ikonok CDN-ről jönnek),
// ezért fájlként megnyitható, és a képernyőkép-generátor is lefényképezheti. A téma módosítása után:
//   node tools/design/styleguide.mjs   (npm run design:styleguide)
// Forrás: Tailwind CSS v4 – Play CDN (@tailwindcss/browser),
// https://tailwindcss.com/docs/installation/play-cdn; Lucide – createIcons,
// https://lucide.dev/guide/lucide/getting-started (adaptálva)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  checkContrast,
  parseThemeColors,
  readColorTokens,
  REQUIRED_PAIRS,
  THEME_FILE,
} from './contrast.mjs';
import { FOCUS, icon, scrollRegion, section, STATIC_SECTIONS } from './styleguide.components.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A generált stílusútmutató – a repóban is benne van, a teszt ellenőrzi, hogy friss-e. */
export const STYLEGUIDE_FILE = resolve(REPO_ROOT, 'docs/design/stilusutmutato.html');

/** A téma útvonala a repó gyökeréhez képest (a lapon és a fejkommentben). */
const THEME_PATH = relative(REPO_ROOT, THEME_FILE).replaceAll('\\', '/');

/** Rögzített verziójú CDN-csomagok (a lap mindig ugyanúgy jelenik meg). */
const HEAD_ASSETS = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.3.0/index.css" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.3.0/index.css" />
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
    <script src="https://cdn.jsdelivr.net/npm/lucide@1.53.0/dist/umd/lucide.min.js"></script>`;

/** A színskálák (a tokennév végi fokozat nélkül) megjelenített neve. */
const SCALE_LABELS = {
  white: 'Alap',
  black: 'Alap',
  neutral: 'Semleges szürkeskála',
  accent: 'Kiemelőszín – piros',
  trust: 'Állapot: hitelesítve – zöld',
  caution: 'Állapot: figyelem – borostyán',
};
const ROLE_LABEL = 'Szerepalapú nevek – a komponensek ezeket használják';

const TOC = [
  ['szinek', 'Színek'],
  ['kontraszt', 'Kontraszt'],
  ['tipografia', 'Tipográfia'],
  ['formak', 'Formák'],
  ['bizalom', 'Bizalom'],
  ['komponensek', 'Komponensek'],
];

/** Szöveg HTML-be (a tokennevek és a leírások szövegként, nem jelölőként jelennek meg). */
export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** A színtokenek csoportjai a deklaráció sorrendjében: skálák, majd a szerepalapú nevek. */
function groupTokens(tokens) {
  const groups = new Map();
  for (const token of tokens) {
    const scale = token.name.replace(/-\d+$/, '');
    const label = token.alias ? ROLE_LABEL : (SCALE_LABELS[scale] ?? scale);
    groups.set(label, [...(groups.get(label) ?? []), token]);
  }
  return groups;
}

function swatch({ name, value, alias }) {
  return `
        <figure data-token="${escapeHtml(name)}">
          <div class="h-14 rounded-md border border-line" style="background-color: ${value}"></div>
          <figcaption class="mt-2 text-sm">
            <span class="block font-medium">${escapeHtml(name)}</span>
            <span class="block font-mono text-xs text-fg-muted">${value}${alias ? ` · ${escapeHtml(alias)}` : ''}</span>
          </figcaption>
        </figure>`;
}

function colorsSection(tokens) {
  const groups = [...groupTokens(tokens)].map(
    ([label, members]) => `
    <div>
      <h3 class="text-sm font-semibold text-fg-muted">${escapeHtml(label)}</h3>
      <div class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">${members.map(swatch).join('')}
      </div>
    </div>`,
  );
  return section(
    'szinek',
    'Színek',
    'Fekete-fehér, minimalista paletta egyetlen piros kiemelőszínnel: piros az elsődleges művelet, az aktív elem és a hiba. A zöld és a borostyán nem díszítés, hanem állapot – a zöld kizárólag a blokkláncon igazolt hitelességet jelzi. A komponensek a szerepalapú neveket használják (pl. <code class="font-mono text-sm">bg-canvas</code>, <code class="font-mono text-sm">text-fg</code>, <code class="font-mono text-sm">bg-primary</code>).',
    `<div class="space-y-8">${groups.join('')}
    </div>`,
  );
}

/** A páros mintája: szövegnél „Aa” a háttéren, felületi elemnél keret a háttéren. */
function contrastSample({ fgValue, bgValue, min }) {
  const box = 'inline-flex h-9 w-14 items-center justify-center rounded-md border border-line';
  return min >= 4.5
    ? `<span class="${box} font-semibold" style="color: ${fgValue}; background-color: ${bgValue}">Aa</span>`
    : `<span class="${box}" style="background-color: ${bgValue}"><span class="block size-5 rounded-sm border-2" style="border-color: ${fgValue}"></span></span>`;
}

function contrastRow(result) {
  const verdict = result.ok
    ? `<span class="inline-flex items-center gap-1 font-medium">${icon('check')}megfelel</span>`
    : `<span class="inline-flex items-center gap-1 font-medium text-danger">${icon('x')}nem felel meg</span>`;
  return `
        <tr>
          <td class="px-4 py-2.5">${escapeHtml(result.use)}</td>
          <td class="px-4 py-2.5"><code class="font-mono text-xs">${escapeHtml(result.fg)}</code> / <code class="font-mono text-xs">${escapeHtml(result.bg)}</code></td>
          <td class="px-4 py-2">${contrastSample(result)}</td>
          <td class="px-4 py-2.5 text-right font-mono tabular-nums">${result.ratio.toFixed(2)}:1</td>
          <td class="px-4 py-2.5 text-right font-mono tabular-nums text-fg-muted">${result.min}:1</td>
          <td class="px-4 py-2.5">${verdict}</td>
        </tr>`;
}

function contrastSection(results) {
  return section(
    'kontraszt',
    'Kontraszt (WCAG 2.2 AA)',
    'Szövegnél legalább 4.5:1 (1.4.3), felületi elemnél – mezőkeret, fókuszjelző, az aktív elem vonala – legalább 3:1 (1.4.11). Az állapotikonok a mellettük álló szöveg színét öröklik, így rájuk is a szöveg aránya érvényes. A táblázatot a <code class="font-mono text-sm">tools/design/contrast.mjs</code> számolja a tokenekből; a teszt elbukik, ha egy páros nem felel meg.',
    scrollRegion(
      'Kontraszttáblázat',
      `
      <table class="w-full min-w-[44rem] text-left text-sm">
        <thead class="bg-surface text-fg-muted">
          <tr>
            <th scope="col" class="px-4 py-2.5 font-medium">Felhasználás</th>
            <th scope="col" class="px-4 py-2.5 font-medium">Előtér / háttér</th>
            <th scope="col" class="px-4 py-2.5 font-medium">Minta</th>
            <th scope="col" class="px-4 py-2.5 text-right font-medium">Arány</th>
            <th scope="col" class="px-4 py-2.5 text-right font-medium">Minimum</th>
            <th scope="col" class="px-4 py-2.5 font-medium">Eredmény</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">${results.map(contrastRow).join('')}
        </tbody>
      </table>`,
    ),
  );
}

/** A teljes stílusútmutató-lap a téma szövegéből és az ellenőrizendő szín-párosokból. */
export function buildStyleguide(themeCss, pairs = REQUIRED_PAIRS) {
  const tokens = readColorTokens(themeCss);
  const results = checkContrast(parseThemeColors(themeCss), pairs);
  const toc = TOC.map(
    ([id, label]) =>
      `<a href="#${id}" class="rounded-sm text-fg-muted hover:text-fg ${FOCUS}">${label}</a>`,
  ).join('\n        ');
  const page = `<!doctype html>
<!-- GENERÁLT FÁJL – ne szerkeszd kézzel. Forrás: ${THEME_PATH}; újragenerálás: npm run design:styleguide -->
<html lang="hu">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>PhotoChain – stílusútmutató</title>
    ${HEAD_ASSETS}
    <style type="text/tailwindcss">
${themeCss}
</style>
  </head>
  <body class="bg-canvas font-sans text-fg antialiased">
    <header class="border-b border-line">
      <div class="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <p class="text-lg font-semibold tracking-tight">Photo<span class="text-primary">Chain</span></p>
          <h1 class="mt-1 text-3xl font-semibold tracking-tight">Stílusútmutató</h1>
        </div>
        <p class="text-sm text-fg-muted">L17 · design tokenek: <code class="font-mono">${THEME_PATH}</code></p>
      </div>
      <nav aria-label="Tartalom" class="border-t border-line bg-surface">
        <div class="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-2 px-4 py-3 text-sm sm:px-6 lg:px-8">
        ${toc}
        </div>
      </nav>
    </header>
    <main class="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-6 lg:px-8">
${colorsSection(tokens)}
${contrastSection(results)}
${STATIC_SECTIONS}
    </main>
    <footer class="border-t border-line">
      <p class="mx-auto max-w-7xl px-4 py-6 text-sm text-fg-muted sm:px-6 lg:px-8">Inter és JetBrains Mono (SIL OFL) · Lucide ikonok (ISC) · Tailwind CSS v4 (MIT)</p>
    </footer>
    <script>
      lucide.createIcons();
    </script>
  </body>
</html>
`;
  // A sablonok behúzásából maradt sorvégi szóközök nélkül: az .editorconfig mentéskor levágná őket,
  // és a lap már nem egyezne a generált változattal
  return page.replace(/[ \t]+$/gm, '');
}

function main() {
  writeFileSync(STYLEGUIDE_FILE, buildStyleguide(readFileSync(THEME_FILE, 'utf8')));
  console.log(`Elkészült: docs/design/${STYLEGUIDE_FILE.split(/[\\/]/).at(-1)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
