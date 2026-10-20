// PhotoChain – képernyőkép-generátor a szakdolgozathoz.
// Valódi parancskimenetről (terminal) vagy forrásfájlról (code) készít PNG-képet a
// docs/screenshots mappába, fej nélküli (headless) Microsoft Edge / Google Chrome böngészővel.
//
// Használat (a repó gyökeréből):
//   node tools/screenshot/render.mjs terminal --cwd blockchain --run "npm test" --out L04_03_tesztek_zold.png
//   node tools/screenshot/render.mjs terminal --run "node -v" --run "npm -v" --out L01_01_verziok.png
//   node tools/screenshot/render.mjs code --file blockchain/contracts/PhotoRegistry.sol --lines 1-40 --out L04_01.png
//   node tools/screenshot/render.mjs code --file blockchain/contracts/PhotoRegistry.sol --symbol "function registerPhoto" --out L04_06.png
// A --symbol a megadott szöveget tartalmazó kódblokkot (függvény, teszt, struktúra) a fölötte álló
// megjegyzésekkel együtt vágja ki, így a kép a kód változásakor sem csúszik el.
// Egyszeri (nem megismételhető) parancs, pl. éles telepítés kimenetéről elmentett naplóból:
//   node tools/screenshot/render.mjs terminal --input naplo.log --cmd "npm run deploy:sepolia" --out L05_01.png
// Mermaid-diagram (pl. ER-diagram), a kép méretével:
//   node tools/screenshot/render.mjs mermaid --file docs/diagramok/adatmodell.mmd --width 1800 --height 1270 --out L07_17_er_diagram.png
// Kész HTML-oldal (pl. a server/scripts/dhash-figure.ts ábrája), a kép méretével:
//   node tools/screenshot/render.mjs html --file <oldal.html> --width 1500 --height 640 --out L09_04_dhash_lepesek.png
// Futó alkalmazás oldala (csak helyi cím, pl. a kliens Vite-szervere; az L18-tól):
//   node tools/screenshot/render.mjs url --url http://localhost:5173/ --width 1280 --height 800 --out L18_10_kezdolap.png
// További kapcsolók: --title "Ablakcím", --max-lines 40 (a terminálkimenet rövidítése).
//
// Források: Chromium headless mód (--screenshot), https://developer.chrome.com/docs/chromium/headless;
// Prism.js kódkiemelő (MIT), https://prismjs.com/; VS Code Dark+ színséma a prism-themes csomagból
// (MIT), https://github.com/PrismJS/prism-themes; Mermaid diagramkészítő (MIT),
// https://mermaid.js.org/ – CDN-ről betöltve.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'screenshots');
const LINE_HEIGHT_PX = 20;
const CHAR_WIDTH_PX = 8.6;
const MIN_WIDTH_PX = 760;
const MAX_WIDTH_PX = 1600;
const SCALE_FACTOR = 2;
const PRISM_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0';
const THEME_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/prism-themes/1.9.0/prism-vsc-dark-plus.min.css';
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js';
const LANGUAGES = {
  '.sol': 'solidity',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.css': 'css',
  '.html': 'markup',
  '.md': 'markdown',
  '.sql': 'sql',
};
// A kiterjesztés nélküli fájlok nyelve a fájlnév szerint (L31) – a C-szerű alapértelmezés a
// Dockerfile „/var/lib/apt/lists/*” sorát megjegyzés kezdetének venné
const FILE_NAME_LANGUAGES = {
  Dockerfile: 'docker',
  '.dockerignore': 'ignore',
  '.gitignore': 'ignore',
  '.prettierignore': 'ignore',
};
// A VS Code integrált termináljának alapértelmezett ANSI-színei
const ANSI_COLORS = {
  30: '#000000',
  31: '#cd3131',
  32: '#0dbc79',
  33: '#e5e510',
  34: '#2472c8',
  35: '#bc3fbc',
  36: '#11a8cd',
  37: '#e5e5e5',
  90: '#666666',
  91: '#f14c4c',
  92: '#23d18b',
  93: '#f5f543',
  94: '#3b8eea',
  95: '#d670d6',
  96: '#29b8db',
  97: '#e5e5e5',
};

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const args = { mode, run: [] };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, '');
    if (key === 'run') args.run.push(rest[i + 1]);
    else args[key] = rest[i + 1];
  }
  if (!['terminal', 'code', 'mermaid', 'html', 'url'].includes(mode) || !args.out) {
    throw new Error(
      'Használat: render.mjs <terminal|code|mermaid|html|url> [kapcsolók] --out <fájlnév.png>',
    );
  }
  return args;
}

const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** A terminálkimenet ANSI-színkódjait HTML-re alakítja; a többi vezérlőkódot eldobja. */
function ansiToHtml(text) {
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, '')
    .split('\n')
    .map((line) => line.split('\r').pop())
    .join('\n');
  let style = PLAIN_STYLE;
  let html = '';
  for (const [index, part] of cleaned.split(/\x1b\[([0-9;]*)m/).entries()) {
    if (index % 2 === 1) {
      style = applySgr(style, part);
    } else if (part) {
      const css = [
        style.color && `color:${style.color}`,
        style.background && `background:${style.background}`,
        style.bold && 'font-weight:bold',
      ];
      const cssText = css.filter(Boolean).join(';');
      html += cssText ? `<span style="${cssText}">${escapeHtml(part)}</span>` : escapeHtml(part);
    }
  }
  return html;
}

const PLAIN_STYLE = { color: null, background: null, bold: false };

/** Az ANSI SGR-kódok (betűszín 30–37/90–97, háttér 40–47/100–107, félkövér) alkalmazása. */
function applySgr(style, params) {
  let next = { ...style };
  for (const code of (params || '0').split(';').map(Number)) {
    if (code === 0) next = PLAIN_STYLE;
    else if (code === 1) next = { ...next, bold: true };
    else if (code === 22) next = { ...next, bold: false };
    else if (code === 39) next = { ...next, color: null };
    else if (code === 49) next = { ...next, background: null };
    else if (ANSI_COLORS[code]) next = { ...next, color: ANSI_COLORS[code] };
    else if (ANSI_COLORS[code - 10]) next = { ...next, background: ANSI_COLORS[code - 10] };
  }
  return next;
}

/**
 * A futtatott parancsok környezete: egy átlagos, színes terminálé; a NO_COLOR kimarad, mert
 * a FORCE_COLOR mellett a Node figyelmeztetést írna ki.
 */
function terminalEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NO_COLOR'));
  return {
    ...env,
    FORCE_COLOR: '1', // Node-eszközök (chalk, mocha) színei
    GIT_CONFIG_COUNT: '1', // git: color.ui=always
    GIT_CONFIG_KEY_0: 'color.ui',
    GIT_CONFIG_VALUE_0: 'always',
    GH_FORCE_TTY: '1', // GitHub CLI: terminálos (tagolt, színes) megjelenítés
    GH_PAGER: '',
  };
}

function runCommand(command, cwd) {
  try {
    return execSync(`${command} 2>&1`, {
      cwd,
      encoding: 'utf8',
      env: terminalEnv(),
      maxBuffer: 20 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });
  } catch (error) {
    // Hibás kilépési kódnál (pl. bukó tesztek) is a kimenet kell
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

function truncate(text, maxLines) {
  const lines = text.replace(/\s+$/, '').split('\n');
  if (!maxLines || lines.length <= maxLines) return lines.join('\n');
  const omitted = lines.length - maxLines;
  return `${lines.slice(0, maxLines).join('\n')}\n\x1b[90m[… a kimenet további ${omitted} sora kihagyva …]\x1b[0m`;
}

function frameHtml({ title, body, head = '', width, bodyClass = '' }) {
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8">${head}<style>
  html,body{margin:0;background:#1e1e1e}
  .window{width:${width}px;background:#1e1e1e;font-family:'Cascadia Mono','Consolas',monospace}
  .titlebar{height:36px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#2d2d2d;
    color:#cccccc;font:13px 'Segoe UI',sans-serif;border-bottom:1px solid #3c3c3c}
  .dot{width:12px;height:12px;border-radius:50%}
  pre{margin:0;padding:14px 18px;font-size:14px;line-height:${LINE_HEIGHT_PX}px;color:#cccccc;
    white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit}
  </style></head><body><div class="window ${bodyClass}"><div class="titlebar">
  <span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span>
  <span class="dot" style="background:#28c840"></span><span style="margin-left:8px">${escapeHtml(title)}</span>
  </div>${body}</div></body></html>`;
}

function renderTerminal(args) {
  const cwd = resolve(REPO_ROOT, args.cwd ?? '.');
  const maxLines = Number(args['max-lines']) || 0;
  // Elmentett kimenet (--input + --cmd), vagy most futtatott parancsok (--run)
  const sources = args.input
    ? [
        {
          command: args.cmd ?? '(elmentett kimenet)',
          output: readFileSync(resolve(REPO_ROOT, args.input), 'utf8'),
        },
      ]
    : args.run.map((command) => ({ command, output: runCommand(command, cwd) }));
  const blocks = sources.map(
    ({ command, output }) =>
      `\x1b[32m❯\x1b[0m \x1b[1m${command}\x1b[0m\n${truncate(output, maxLines)}`,
  );
  const text = blocks.join('\n\n');
  const lines = text.split('\n');
  const width = measureWidth(lines, 36);
  const title = args.title ?? `Terminál – ${cwd}`;
  const html = frameHtml({ title, width, body: `<pre>${ansiToHtml(text)}</pre>` });
  const visualLines = countVisualLines(lines, width, 36);
  return { html, width, height: visualLines * LINE_HEIGHT_PX + 36 + 28 + 8 };
}

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

/**
 * Egy kódblokk (függvény, teszt, struktúra) sortartománya: az első olyan sortól, amely a keresett
 * szöveget tartalmazza, a hozzá tartozó záró kapcsos zárójelig; a közvetlenül fölötte álló
 * megjegyzéssorok (NatSpec, JSDoc) is bekerülnek. Egyszerű zárójelszámlálás: a karakterláncokban
 * vagy megjegyzésekben álló kapcsos zárójeleket nem szűri ki.
 */
function findSymbolRange(allLines, symbol) {
  const startIndex = allLines.findIndex((line) => line.includes(symbol));
  if (startIndex === -1) throw new Error(`A keresett szöveg nem található: "${symbol}"`);
  let firstIndex = startIndex;
  while (firstIndex > 0 && COMMENT_LINE.test(allLines[firstIndex - 1])) firstIndex -= 1;
  let depth = 0;
  let opened = false;
  for (let i = startIndex; i < allLines.length; i += 1) {
    for (const char of allLines[i]) {
      if (char === '{') {
        depth += 1;
        opened = true;
      } else if (char === '}') {
        depth -= 1;
      }
    }
    if (opened && depth === 0) return [firstIndex + 1, i + 1];
  }
  throw new Error(`Nem található a blokk vége: "${symbol}"`);
}

function renderCode(args) {
  const filePath = resolve(REPO_ROOT, args.file);
  const allLines = readFileSync(filePath, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '')
    .split('\n');
  const [from, to] = args.symbol
    ? findSymbolRange(allLines, args.symbol)
    : (args.lines ?? `1-${allLines.length}`).split('-').map(Number);
  const lines = allLines.slice(from - 1, to);
  const language =
    FILE_NAME_LANGUAGES[basename(filePath)] ?? LANGUAGES[extname(filePath)] ?? 'clike';
  const width = measureWidth(lines, 60);
  const head = `<link rel="stylesheet" href="${THEME_CDN}">
    <link rel="stylesheet" href="${PRISM_CDN}/plugins/line-numbers/prism-line-numbers.min.css">
    <style>pre[class*=language-]{margin:0;border-radius:0;font-size:14px;line-height:${LINE_HEIGHT_PX}px;
    font-family:'Cascadia Mono','Consolas',monospace;background:#1e1e1e}
    code[class*=language-]{font-family:inherit;font-size:14px;line-height:${LINE_HEIGHT_PX}px}</style>`;
  const scripts = [
    'prism.min.js',
    'components/prism-typescript.min.js',
    // A React-komponensekhez (L18-tól): a tsx a jsx-re és a typescriptre épül, ezért utánuk töltődik
    'components/prism-jsx.min.js',
    'components/prism-tsx.min.js',
    'components/prism-solidity.min.js',
    'components/prism-json.min.js',
    'components/prism-yaml.min.js',
    'components/prism-sql.min.js',
    'components/prism-docker.min.js',
    'components/prism-ignore.min.js',
    'plugins/line-numbers/prism-line-numbers.min.js',
  ]
    .map((src) => `<script src="${PRISM_CDN}/${src}"></script>`)
    .join('');
  const body = `<pre class="line-numbers" data-start="${from}"><code class="language-${language}">${escapeHtml(lines.join('\n'))}</code></pre>${scripts}`;
  const title =
    args.title ??
    `${relative(REPO_ROOT, filePath).replaceAll('\\', '/')} (${from}–${from + lines.length - 1}. sor)`;
  // címsor (36) + a kódblokk függőleges párnázása (2 × 14) + ráhagyás (16)
  return {
    html: frameHtml({ title, width, head, body }),
    width,
    height: lines.length * LINE_HEIGHT_PX + 36 + 28 + 16,
    source: `${relative(REPO_ROOT, filePath).replaceAll('\\', '/')}, ${from}–${from + lines.length - 1}. sor`,
  };
}

/**
 * Mermaid-diagram (pl. ER-diagram) fehér háttéren. A kép méretét a --width és a --height adja (a
 * diagram a szélességhez igazodik), mert a fej nélküli böngésző a képet az ablak méretében készíti.
 */
function renderMermaid(args) {
  const filePath = resolve(REPO_ROOT, args.file);
  const width = Number(args.width) || 1400;
  const height = Number(args.height) || 1000;
  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8">
    <script src="${MERMAID_CDN}"></script>
    <style>html,body{margin:0;background:#ffffff}.mermaid{padding:16px}</style></head><body>
    <pre class="mermaid">${escapeHtml(readFileSync(filePath, 'utf8'))}</pre>
    <script>mermaid.initialize({ startOnLoad: true, theme: 'neutral',
      themeVariables: { fontFamily: 'Segoe UI, sans-serif' } });</script></body></html>`;
  return { html, width, height, source: relative(REPO_ROOT, filePath).replaceAll('\\', '/') };
}

const visibleLength = (line) => line.replace(/\x1b\[[0-9;]*m/g, '').length;

function measureWidth(lines, extraPx) {
  const longest = Math.max(...lines.map(visibleLength));
  return Math.round(
    Math.min(MAX_WIDTH_PX, Math.max(MIN_WIDTH_PX, longest * CHAR_WIDTH_PX + extraPx + 40)),
  );
}

/**
 * A megjelenített sorok száma: a legszélesebb képnél hosszabb terminálsorok tördelődnek
 * (white-space: pre-wrap), ezért egy sor több képernyősort is elfoglalhat.
 */
function countVisualLines(lines, width, extraPx) {
  const charsPerLine = Math.max(1, Math.floor((width - extraPx - 40) / CHAR_WIDTH_PX));
  return lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(visibleLength(line) / charsPerLine)),
    0,
  );
}

function findBrowser() {
  const candidates = [
    process.env.SCREENSHOT_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found)
    throw new Error(
      'Nem található Edge vagy Chrome (SCREENSHOT_BROWSER környezeti változóval megadható).',
    );
  return found;
}

/**
 * Az ideiglenes mappa törlése. Windows alatt a böngésző a kilépése után még rövid ideig foghatja a
 * profilmappát (EPERM/EBUSY); a kép ilyenkor már elkészült, ezért ez csak figyelmeztetés – a
 * rendszer ideiglenes mappáját az operációs rendszer takarítja.
 */
function removeWorkDir(workDir) {
  try {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.warn(`Figyelmeztetés: az ideiglenes mappa nem törölhető (${error.code}): ${workDir}`);
  }
}

const SCREENSHOT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

/** Szinkron várakozás (a program többi része is szinkron). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Megvárja, amíg a böngésző kiírja a képet: a fájl létezik, újabb az előzőnél, és a mérete két
 * egymást követő ellenőrzésnél azonos (vagyis az írás befejeződött). Erre azért van szükség, mert
 * Windows alatt a böngésző indítóprogramja – főleg, ha már futnak más Edge-/Chrome-ablakok – a
 * képet ténylegesen elkészítő háttérfolyamat előtt kiléphet.
 */
function waitForScreenshot(outFile, previousMtime) {
  const deadline = Date.now() + SCREENSHOT_TIMEOUT_MS;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(outFile)) {
      const { mtimeMs, size } = statSync(outFile);
      if (mtimeMs > previousMtime && size > 0 && size === lastSize) return true;
      lastSize = size;
    }
    sleepSync(POLL_INTERVAL_MS);
  }
  return false;
}

function screenshot({ html, url, width, height, reducedMotion = false }, outFile) {
  const workDir = mkdtempSync(join(tmpdir(), 'photochain-shot-'));
  const htmlPath = join(workDir, 'page.html');
  const previousMtime = existsSync(outFile) ? statSync(outFile).mtimeMs : 0;
  if (!url) writeFileSync(htmlPath, html, 'utf8');
  try {
    execFileSync(
      findBrowser(),
      [
        '--headless=new',
        // Csökkentett mozgás: a (motion-safe) átmenetek nem futnak, a kép a végállapotot mutatja
        ...(reducedMotion ? ['--force-prefers-reduced-motion'] : []),
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${join(workDir, 'profile')}`,
        `--force-device-scale-factor=${SCALE_FACTOR}`,
        `--window-size=${width},${height}`,
        '--virtual-time-budget=5000',
        `--screenshot=${outFile}`,
        url ?? pathToFileURL(htmlPath).href,
      ],
      { stdio: 'ignore', timeout: 120000 },
    );
    if (!waitForScreenshot(outFile, previousMtime)) {
      throw new Error(`A kép nem készült el ${SCREENSHOT_TIMEOUT_MS / 1000} mp alatt: ${outFile}`);
    }
  } finally {
    removeWorkDir(workDir);
  }
}

/**
 * A böngészőablak legkisebb szélessége: ennél keskenyebb --window-size esetén a kép a kért
 * szélességű, de az oldal elrendezése szélesebb ablakhoz készül (a tartalom jobbra kilóg).
 */
const MIN_WINDOW_WIDTH_PX = 500;

/**
 * Kész HTML-oldal (pl. egy script által előállított magyarázó ábra) képe. A kép méretét a --width
 * és a --height adja, mert a fej nélküli böngésző a képet az ablak méretében készíti. Keskeny
 * (mobil) nézetnél az oldal egy ekkora iframe-be kerül, így a médialekérdezések a kért szélességhez
 * igazodnak.
 */
function renderHtml(args) {
  if (!args.file) throw new Error('A html módhoz --file <oldal.html> kell');
  const filePath = resolve(REPO_ROOT, args.file);
  const html = readFileSync(filePath, 'utf8');
  const width = Number(args.width) || 1200;
  const height = Number(args.height) || 800;
  return {
    html: width < MIN_WINDOW_WIDTH_PX ? inNarrowFrame(html, width, height) : html,
    width,
    height,
    source: relative(REPO_ROOT, filePath).replaceAll('\\', '/'),
  };
}

/** HTML-attribútumérték escape-elése (& és "). */
const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

/** Az oldal egy width × height méretű iframe-ben (srcdoc), a bal felső sarokban. */
function inNarrowFrame(html, width, height) {
  return narrowFrame(`srcdoc="${escapeAttribute(html)}"`, width, height);
}

function narrowFrame(source, width, height) {
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>html,body{margin:0;background:#fff}iframe{display:block;border:0;width:${width}px;height:${height}px}</style>
</head><body><iframe ${source}></iframe></body></html>`;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Futó alkalmazás oldalának képe (pl. a kliens Vite-szervere a proxyval). Csak helyi címet fogad el:
 * bejelentkezést igénylő vagy külső oldalról a szerző készít képet. Keskeny (mobil) nézetnél az
 * oldal iframe-be kerül, mint a html módban.
 */
function renderUrl(args) {
  if (!args.url) throw new Error('Az url módhoz --url <cím> kell');
  const url = new URL(args.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Az url mód csak http(s) címet fogad el, nem ezt: ${url.protocol}`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Az url mód csak helyi címet fogad el (localhost), nem ezt: ${url.hostname}`);
  }
  const width = Number(args.width) || 1280;
  const height = Number(args.height) || 800;
  const narrow = width < MIN_WINDOW_WIDTH_PX;
  return {
    url: narrow ? undefined : url.href,
    html: narrow ? narrowFrame(`src="${escapeAttribute(url.href)}"`, width, height) : undefined,
    width,
    height,
    source: url.href,
    // A fej nélküli böngésző animációs órája nem mindig halad: egy éppen induló színátmenet a
    // kezdőállapotában maradna a képen
    reducedMotion: true,
  };
}

const args = parseArgs(process.argv.slice(2));
const RENDERERS = {
  terminal: renderTerminal,
  code: renderCode,
  mermaid: renderMermaid,
  html: renderHtml,
  url: renderUrl,
};
const page = RENDERERS[args.mode](args);
const outFile = resolve(OUT_DIR, args.out);
screenshot(page, outFile);
console.log(
  `Elkészült: ${relative(REPO_ROOT, outFile)} (${page.width}×${page.height} px, ${SCALE_FACTOR}× felbontás)` +
    (page.source ? ` – forrás: ${page.source}` : ''),
);
