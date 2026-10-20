// A stílusútmutató statikus részei (L17): a tipográfia, a formák, a komponensek bemutatója és a bizalom
// vizuális nyelve (állapot → ikon → szín → szöveg). A styleguide.mjs fűzi be őket a lapba; a komponensek
// a theme.css szerepalapú tokenjeit használják Tailwind-osztályokkal – ugyanazokkal, amelyekkel a kliens
// (L18) is készül. Az ikonok a Lucide készletből valók (https://lucide.dev/icons/, ISC licenc).

/** Lucide-ikon helye; a lucide.createIcons() cseréli SVG-re. Dekoratív: a jelentést a szöveg adja. */
export const icon = (name, className = 'size-4') =>
  `<i data-lucide="${name}" class="${className}" aria-hidden="true"></i>`;

/** A billentyűzetfókusz jelölése: 2 px-es fekete keret 2 px távolsággal (WCAG 2.4.7). */
export const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * Vízszintesen görgethető táblázat burka: billentyűzettel is elérhető, megnevezett régió (a
 * görgetéshez fókuszálható elem kell, ha a táblázatban nincs más fókuszálható elem).
 */
export const scrollRegion = (label, content) =>
  `<div role="region" tabindex="0" aria-label="${label}" class="overflow-x-auto rounded-lg border border-line ${FOCUS}">${content}</div>`;

/** Egy fejezet a lapon: azonosító (a tartalomjegyzékhez), cím, bevezető és tartalom. */
export const section = (id, title, intro, body) => `
<section id="${id}" class="scroll-mt-6 border-t border-line pt-10">
  <h2 class="text-2xl font-semibold tracking-tight">${title}</h2>
  <p class="mt-2 max-w-3xl leading-7 text-fg-muted">${intro}</p>
  <div class="mt-6">${body}</div>
</section>`;

/** Egy komponens bemutatója kártyán: cím, minta és (ha van) a használati szabály. */
const demo = (title, body, rule = '') => `
<div class="rounded-lg border border-line p-5">
  <h3 class="text-sm font-semibold text-fg-muted">${title}</h3>
  <div class="mt-4">${body}</div>
  ${rule ? `<p class="mt-4 border-t border-line pt-3 text-sm leading-6 text-fg-muted">${rule}</p>` : ''}
</div>`;

/* ---------- Tipográfia ---------- */

const TYPE_SCALE = [
  ['Oldalcím', 'text-3xl font-semibold tracking-tight', '30 px · 600', 'Galéria'],
  ['Szakaszcím', 'text-xl font-semibold tracking-tight', '20 px · 600', 'Blokklánc-tanúsítvány'],
  ['Kártyacím', 'text-base font-medium', '16 px · 500', 'Őszi erdő ködben'],
  [
    'Törzsszöveg',
    'text-base leading-7',
    '16 px · 400 · sorköz 28 px',
    'A kép ujjlenyomata a blokkláncon rögzül, így a módosított másolata sem tölthető fel újra.',
  ],
  ['Másodlagos szöveg', 'text-sm text-fg-muted', '14 px · 400', 'Feltöltve: 2026. október 4.'],
  [
    'Ár',
    'text-lg font-semibold tabular-nums',
    '18 px · 600 · táblázatos számok',
    '12&nbsp;500&nbsp;Ft',
  ],
  ['Hash, azonosító', 'font-mono text-sm', 'JetBrains Mono · 14 px', '0x5a1f9c3e…8b20d47e'],
];

const typography = section(
  'tipografia',
  'Tipográfia',
  'Inter a felület minden szövegének (jól olvasható kis méretben is, teljes magyar ékezetkészlettel), JetBrains Mono a hash-eknek és a tranzakció-azonosítóknak – az egyenletes jelszélesség miatt a hosszú hexadecimális értékek könnyen összevethetők. A törzsszöveg legalább 16 px; a skála a Tailwind alapskálája.',
  `<div class="divide-y divide-line rounded-lg border border-line">
    ${TYPE_SCALE.map(
      ([role, classes, size, sample]) => `
    <div class="grid gap-2 p-4 md:grid-cols-[12rem_1fr_16rem] md:items-baseline md:gap-6">
      <p class="text-sm font-medium">${role}<span class="block text-fg-muted">${size}</span></p>
      <p class="${classes}">${sample}</p>
      <code class="font-mono text-xs text-fg-muted">${classes}</code>
    </div>`,
    ).join('')}
  </div>`,
);

/* ---------- Formák, térközök, elrendezés ---------- */

const shapes = section(
  'formak',
  'Sarkok, árnyék, elrendezés',
  'Visszafogott lekerekítés és egyetlen, halvány kártyaárnyék: a hangsúlyt a fotók kapják. A térközök a Tailwind 4 px-es skáláját követik; a tartalom legfeljebb 1280 px széles.',
  `<div class="grid gap-6 lg:grid-cols-2">
    <div class="flex flex-wrap items-end gap-4">
      ${[
        ['rounded-sm', '4 px – kis elemek'],
        ['rounded-md', '6 px – gomb, mező'],
        ['rounded-lg', '8 px – kártya, panel'],
        ['rounded-full', 'jelvény, avatar'],
      ]
        .map(
          ([radius, use]) => `
      <figure class="w-36">
        <div class="h-20 border-2 border-fg bg-surface ${radius}"></div>
        <figcaption class="mt-2 text-sm"><code class="font-mono text-xs">${radius}</code><span class="block text-fg-muted">${use}</span></figcaption>
      </figure>`,
        )
        .join('')}
      <figure class="w-36">
        <div class="h-20 rounded-lg border border-line bg-canvas shadow-card"></div>
        <figcaption class="mt-2 text-sm"><code class="font-mono text-xs">shadow-card</code><span class="block text-fg-muted">fotókártya</span></figcaption>
      </figure>
    </div>
    <table class="w-full text-left text-sm">
      <caption class="mb-2 text-left font-medium">Töréspontok és galériaoszlopok</caption>
      <thead class="text-fg-muted"><tr><th scope="col" class="py-1.5 font-medium">Töréspont</th><th scope="col" class="py-1.5 font-medium">Szélesség</th><th scope="col" class="py-1.5 font-medium">Galéria</th><th scope="col" class="py-1.5 font-medium">Oldalmargó</th></tr></thead>
      <tbody class="divide-y divide-line border-y border-line">
        <tr><td class="py-1.5">alap (mobil)</td><td>&lt; 640 px</td><td>1 oszlop</td><td>16 px</td></tr>
        <tr><td class="py-1.5"><code class="font-mono text-xs">sm</code></td><td>≥ 640 px</td><td>2 oszlop</td><td>24 px</td></tr>
        <tr><td class="py-1.5"><code class="font-mono text-xs">lg</code></td><td>≥ 1024 px</td><td>3 oszlop</td><td>32 px</td></tr>
        <tr><td class="py-1.5"><code class="font-mono text-xs">xl</code></td><td>≥ 1280 px</td><td>4 oszlop</td><td>32 px</td></tr>
      </tbody>
    </table>
  </div>`,
);

/* ---------- A bizalom vizuális nyelve ---------- */

const TONE_CLASSES = {
  trust: 'border-trust-200 bg-trust-50 text-trust-700',
  caution: 'border-caution-200 bg-caution-50 text-caution-700',
  danger: 'border-accent-200 bg-danger-surface text-danger',
  neutral: 'border-line bg-surface text-fg-muted',
};

const BADGE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-medium';

/** Állapotjelvény: mindig ikon + szöveg, a szín csak megerősít (WCAG 1.4.1). */
export const badge = ({ icon: name, tone, label }) =>
  `<span class="${BADGE} ${TONE_CLASSES[tone]}">${icon(name, 'size-4 shrink-0')}${label}</span>`;

/**
 * A felületen megjelenő állapotok egységes jelölése (a szerver állapotaihoz és hibakódjaihoz kötve).
 * A zöld pajzs kizárólag a blokkláncon igazolt hitelességet jelenti.
 */
export const TRUST_STATES = [
  {
    context: 'Kép állapota',
    state: 'REGISTERED',
    icon: 'shield-check',
    tone: 'trust',
    label: 'Hitelesítve',
    meaning: 'Az ujjlenyomat a blokkláncon rögzítve; a kép nyilvános és megvásárolható.',
  },
  {
    context: 'Kép állapota',
    state: 'PENDING_CHAIN',
    icon: 'clock',
    tone: 'caution',
    label: 'Regisztrálás folyamatban',
    meaning: 'A tranzakció elküldve, megerősítésre vár; a kép addig csak a tulajdonosának látszik.',
  },
  {
    context: 'Kép állapota',
    state: 'CHAIN_FAILED',
    icon: 'shield-alert',
    tone: 'danger',
    label: 'Sikertelen regisztráció',
    meaning: 'A tranzakció nem ment át; az adminisztrátor újrapróbálhatja (gázdíjba kerül).',
  },
  {
    context: 'Kép állapota',
    state: 'HIDDEN · OWNER',
    icon: 'eye-off',
    tone: 'neutral',
    label: 'Elrejtve',
    meaning:
      'A tulajdonos levette a galériából; a láncon a rekord megmarad, a korábbi vásárló letöltheti.',
  },
  {
    context: 'Kép állapota',
    state: 'HIDDEN · ADMIN, OWNER_AND_ADMIN',
    icon: 'ban',
    tone: 'danger',
    label: 'Moderátor eltávolította',
    meaning:
      'Moderátori levétel (akkor is ez látszik, ha a tulajdonos is elrejtette); amíg érvényben van, a vásárló sem töltheti le az eredetit.',
  },
  {
    context: 'Ellenőrzés',
    state: 'VERIFIED',
    icon: 'shield-check',
    tone: 'trust',
    label: 'Hiteles, regisztrált kép',
    meaning: 'A fájl bitre megegyezik egy regisztrált képpel (azonos SHA-256 ujjlenyomat).',
  },
  {
    context: 'Ellenőrzés',
    state: 'SIMILAR',
    icon: 'scan-search',
    tone: 'caution',
    label: 'Hasonló regisztrált kép',
    meaning:
      'Nem azonos, de a vizuális ujjlenyomat (dHash) szerint egy regisztrált kép módosított változata lehet.',
  },
  {
    context: 'Ellenőrzés',
    state: 'NOT_FOUND',
    icon: 'search-x',
    tone: 'neutral',
    label: 'Nincs a nyilvántartásban',
    meaning: 'Sem azonos, sem hasonló regisztrált kép – ez önmagában nem jelent hamisítást.',
  },
  {
    context: 'Feltöltés (409)',
    state: 'DUPLICATE_EXACT / DUPLICATE_SIMILAR',
    icon: 'copy-x',
    tone: 'danger',
    label: 'Már regisztrált kép',
    meaning: 'Azonos vagy hasonló kép már szerepel a láncon, ezért nem tölthető fel újra.',
  },
];

const trust = section(
  'bizalom',
  'A bizalom vizuális nyelve',
  'Minden állapot ugyanúgy jelenik meg a galériában, az adatlapon, a vezérlőpulton és az ellenőrzésnél: ikon + szöveg + szín. A zöld pajzs kizárólag a blokkláncon igazolt hitelességet jelenti – sikeres mentésre, fizetésre nem használjuk, hogy a jelentése ne kopjon el. A „nincs a nyilvántartásban” semleges, nem piros: nem vádol.',
  `${scrollRegion(
    'A bizalom vizuális nyelve – állapotok',
    `
    <table class="w-full min-w-[44rem] text-left text-sm">
      <thead class="bg-surface text-fg-muted">
        <tr><th scope="col" class="px-4 py-2.5 font-medium">Hol</th><th scope="col" class="px-4 py-2.5 font-medium">Állapot (API)</th><th scope="col" class="px-4 py-2.5 font-medium">Jelvény</th><th scope="col" class="px-4 py-2.5 font-medium">Jelentés</th></tr>
      </thead>
      <tbody class="divide-y divide-line">
        ${TRUST_STATES.map(
          (state) => `
        <tr>
          <td class="px-4 py-3 text-fg-muted">${state.context}</td>
          <td class="px-4 py-3"><code class="font-mono text-xs">${state.state}</code></td>
          <td class="px-4 py-3">${badge(state)}</td>
          <td class="px-4 py-3 leading-6">${state.meaning}</td>
        </tr>`,
        ).join('')}
      </tbody>
    </table>`,
  )}
  <ul class="mt-6 grid gap-3 text-sm leading-6 md:grid-cols-3">
    <li class="rounded-lg border border-line p-4"><span class="font-medium">Ellenőrizhető, nem csak állított.</span> A tanúsítvány a hash-t és a tranzakciót is megmutatja, a tranzakció az Etherscanen megnyitható.</li>
    <li class="rounded-lg border border-line p-4"><span class="font-medium">Rövidített, de teljes.</span> A hash eleje és vége látszik (<code class="font-mono text-xs">0x5a1f9c3e…8b20d47e</code>), a teljes érték egy kattintással másolható.</li>
    <li class="rounded-lg border border-line p-4"><span class="font-medium">Nem csak szín.</span> Színtévesztő felhasználó és képernyőolvasó is ugyanazt az információt kapja: az ikon és a szöveg önmagában is érthető.</li>
  </ul>`,
);

/* ---------- Komponensek ---------- */

const BUTTON = `inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium ${FOCUS}`;
const BUTTON_VARIANTS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-black text-white hover:bg-neutral-800',
  outline: 'border border-line-strong bg-canvas text-fg hover:bg-surface',
  danger: 'border border-danger bg-canvas text-danger hover:bg-danger-surface',
};
const button = (variant, label, iconName = '', extra = '') =>
  `<button type="button" class="${BUTTON} ${BUTTON_VARIANTS[variant]} ${extra}">${iconName ? icon(iconName) : ''}${label}</button>`;

const INPUT = `mt-1.5 block min-h-10 w-full rounded-md border bg-canvas px-3 text-sm text-fg placeholder:text-fg-muted ${FOCUS}`;

const buttons = demo(
  'Gombok',
  `<div class="flex flex-wrap items-center gap-3">
    ${button('primary', 'Megveszem', 'shopping-cart')}
    ${button('secondary', 'Feltöltés', 'upload')}
    ${button('outline', 'Mégse')}
    ${button('danger', 'Letiltás', 'ban')}
    <button type="button" aria-disabled="true" class="${BUTTON} cursor-progress border border-line bg-surface text-fg-muted">${icon('loader-circle', 'size-4 motion-safe:animate-spin')}Fizetés indítása…</button>
    ${button('outline', 'Fókuszban', '', 'outline-2 outline-offset-2 outline-focus')}
  </div>`,
  'Egy nézetben egyetlen piros gomb van: a fő művelet (vásárlás, feltöltés). A veszélyes művelet körvonalas és ikonos, így nem keveredik vele. A billentyűzetfókusz mindig látható fekete keret (2 px, 2 px távolsággal). Folyamatban lévő műveletnél aria-disabled (nem disabled, mert az a fókuszt elvenné), a felirat a folyamatot mondja („Fizetés indítása…”), a további kattintás hatástalan, az élő régió bejelenti az eredményt; a töltésjelző csak akkor forog, ha a felhasználó nem kért kevesebb mozgást. A gomb legalább 40 px magas (min-h, így nagyobb sor- és betűtávolságnál nő) – a WCAG 2.2 24 px-es minimumát bőven teljesíti.',
);

const fields = demo(
  'Űrlapmezők',
  `<div class="grid gap-5 sm:grid-cols-2">
    <div>
      <label for="sg-title" class="text-sm font-medium">Cím</label>
      <input id="sg-title" class="${INPUT} border-line-strong" value="Őszi erdő ködben" aria-describedby="sg-title-help" />
      <p id="sg-title-help" class="mt-1.5 text-sm text-fg-muted">Rövid, beszédes cím – a keresés is ebben keres.</p>
    </div>
    <div>
      <label for="sg-price" class="text-sm font-medium">Ár (Ft)</label>
      <input id="sg-price" class="${INPUT} border-danger" value="100" inputmode="numeric" aria-invalid="true" aria-describedby="sg-price-help sg-price-error" />
      <p id="sg-price-help" class="mt-1.5 text-sm text-fg-muted">Egész forint, 175 és 9&nbsp;999&nbsp;999 Ft között.</p>
      <p id="sg-price-error" class="mt-1 flex items-center gap-1.5 text-sm text-danger">${icon('circle-alert', 'size-4 shrink-0')}Az ár legalább 175 Ft legyen.</p>
    </div>
    <div>
      <label for="sg-category" class="text-sm font-medium">Kategória</label>
      <select id="sg-category" class="${INPUT} border-line-strong"><option>Tájkép</option><option>Portré</option><option>Város</option></select>
    </div>
    <div>
      <label for="sg-search" class="text-sm font-medium">Keresés</label>
      <div class="relative">
        ${icon('search', 'pointer-events-none absolute left-3 top-1/2 mt-0.75 size-4 -translate-y-1/2 text-fg-muted')}
        <input id="sg-search" type="search" class="${INPUT} border-line-strong pl-9" placeholder="Cím vagy leírás…" />
      </div>
    </div>
  </div>`,
  'A címke látható, nem csak helykitöltő szöveg (kivétel a galéria és az admin keresőmezője: ott a nagyító ikon és a helykitöltő jelzi a célt, a címke a képernyőolvasónak szól). A hiba a mező alatt jelenik meg, ikonnal és a javítás módjával; a mező aria-invalid, és az aria-describedby a súgót és a hibát is felsorolja. A szerver magyar hibaüzenetei (Zod) változtatás nélkül megjeleníthetők.',
);

const badges = demo(
  'Állapotjelvények',
  `<div class="space-y-4">
    <div class="flex flex-wrap gap-2">${TRUST_STATES.filter(
      ({ context }) => context === 'Kép állapota',
    )
      .map(badge)
      .join('')}</div>
    <div class="flex flex-wrap gap-2">
      ${badge({ icon: 'check', tone: 'neutral', label: 'Kifizetve' })}
      ${badge({ icon: 'clock', tone: 'caution', label: 'Fizetésre vár' })}
      ${badge({ icon: 'circle-x', tone: 'danger', label: 'Sikertelen fizetés' })}
      ${badge({ icon: 'timer-off', tone: 'neutral', label: 'Lejárt' })}
    </div>
  </div>`,
  'Felső sor: a kép állapotai; alsó sor: a rendelés állapotai. A sikeres fizetés semleges – a zöld a blokklánc-hitelességé.',
);

// A kártya címe a hivatkozás; a kattintható felület (::after) és a fókuszkeret a teljes kártya
const photoCard = (title, price, rating, thumb) => `
  <article class="relative overflow-hidden rounded-lg border border-line bg-canvas shadow-card has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus">
    ${thumb}
    <div class="p-3">
      <h4 class="truncate font-medium"><a href="#" class="outline-none after:absolute after:inset-0">${title}</a></h4>
      <p class="text-sm text-fg-muted">Fotós neve</p>
      <div class="mt-2 flex items-center justify-between">
        <span class="text-lg font-semibold tabular-nums">${price}</span>
        <span class="inline-flex items-center gap-1 text-sm">${icon('star', 'size-4 fill-current')}<span class="sr-only">Értékelés:</span>${rating}</span>
      </div>
      <p class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-trust-700">${icon('shield-check', 'size-4')}Hitelesítve</p>
    </div>
  </article>`;

const cards = demo(
  'Fotókártya (galéria)',
  `<div class="grid max-w-xl gap-4 sm:grid-cols-2">
    ${photoCard(
      'Őszi erdő ködben',
      '12&nbsp;500&nbsp;Ft',
      '4,6 <span class="text-fg-muted">(12<span class="sr-only"> értékelés</span>)</span>',
      `<div class="grid aspect-[4/3] place-items-center bg-neutral-200 text-neutral-600">${icon('image', 'size-8')}</div>`,
    )}
    ${photoCard(
      'Hajnal a tónál',
      '8&nbsp;900&nbsp;Ft',
      '<span class="text-fg-muted">nincs értékelés</span>',
      `<div class="grid aspect-[4/3] place-items-center bg-surface text-fg-muted"><span class="flex flex-col items-center gap-1 text-sm">${icon('image-off', 'size-6')}Előnézet nem érhető el</span></div>`,
    )}
  </div>`,
  'A galériában csak hitelesített kép szerepel, ezért a kártya egy kis pajzzsal emlékeztet erre. A hiányzó előnézet helyén semleges helykitöltő áll. A cím a hivatkozás (címsor), de a teljes kártya kattintható, és a fókuszkeret is a kártyán jelenik meg. A bélyegkép alt="" (a cím leírja), az adatlap nagy képe „&lt;cím&gt; – vízjeles előnézet”.',
);

const certificate = demo(
  'Blokklánc-tanúsítvány (adatlap)',
  `<section class="max-w-xl overflow-hidden rounded-lg border border-trust-200" aria-labelledby="sg-cert">
    <header class="flex items-center gap-2 border-b border-trust-200 bg-trust-50 px-4 py-3 text-trust-700">
      ${icon('shield-check', 'size-5')}
      <h4 id="sg-cert" class="font-semibold">Hitelesítve a blokkláncon</h4>
    </header>
    <dl class="divide-y divide-line px-4 text-sm">
      ${[
        ['Hálózat', 'Ethereum Sepolia (teszthálózat)'],
        ['Regisztrálva', '2026. 10. 04. 14:32'],
        [
          'SHA-256',
          `<span class="font-mono">0x5a1f9c3e…8b20d47e</span><button type="button" class="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface hover:text-fg ${FOCUS}" aria-label="A teljes SHA-256 másolása">${icon('copy')}</button>`,
        ],
        ['dHash', '<span class="font-mono">f0e4c8d0b0a09080</span>'],
        [
          'Tranzakció',
          `<a href="#" class="inline-flex items-center gap-1 font-mono text-fg underline underline-offset-2 hover:text-primary ${FOCUS}">0x9c4e…1b7a${icon('external-link', 'size-3.5')}<span class="sr-only">(megnyitás az Etherscanen)</span></a>`,
        ],
      ]
        .map(
          ([term, value]) => `
      <div class="flex items-center justify-between gap-4 py-2.5"><dt class="text-fg-muted">${term}</dt><dd class="flex items-center gap-1 text-right">${value}</dd></div>`,
        )
        .join('')}
    </dl>
    <p class="border-t border-line bg-surface px-4 py-3 text-xs leading-5 text-fg-muted">A láncra csak az ujjlenyomat kerül, maga a kép nem. A rekord nyilvános és utólag nem módosítható.</p>
  </section>`,
  'Függőben lévő regisztrációnál ugyanez a doboz borostyán „Regisztrálás folyamatban” fejléccel jelenik meg, sikertelennél piros „Sikertelen regisztráció” fejléccel és – az adminisztrátornak – „Újrapróbálás” gombbal. Ha a tranzakció adatai nem ismertek, a sorában „A tranzakció adatai nem érhetők el” áll; a függő (még meg nem erősített) tranzakció hivatkozása „függő tranzakció” címkét kap. A másolás sikerét az oldal élő régiója jelenti be („Másolva”).',
);

const stars = demo(
  'Értékelés',
  `<div class="flex flex-wrap items-center gap-8">
    <p class="inline-flex items-center gap-2">
      <span class="inline-flex text-fg" aria-hidden="true">${icon('star', 'size-5 fill-current').repeat(4)}${icon('star', 'size-5 text-line-strong')}</span>
      <span class="font-semibold">4,6<span class="sr-only"> az 5-ből</span></span><span class="text-sm text-fg-muted">· 12 értékelés</span>
    </p>
    <fieldset>
      <legend class="text-sm font-medium">Az értékelésed</legend>
      <div class="mt-1.5 flex gap-1">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<label class="cursor-pointer p-0.5"><input type="radio" name="sg-rating" value="${n}" class="peer sr-only"${n === 3 ? ' checked' : ''} /><span class="sr-only">${n} csillag</span>${icon('star', `size-6 rounded-sm ${n <= 3 ? 'fill-current text-fg' : 'text-line-strong'} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus`)}</label>`,
          )
          .join('')}
      </div>
    </fieldset>
  </div>`,
  'Fekete csillag, nem sárga: a minimalista palettában marad, és az üres csillag kerete is eléri a 3:1-et. Az átlag számmal is megjelenik („4,6 az 5-ből”), így a csillagok csak kiegészítik. A bevitel rádiócsoport (fieldset + legend, „1 csillag” … „5 csillag” címkével): nyilakkal is választható, és egyetlen értéket jelent be; a csillagok kitöltését (1-től a választottig) a kliens állapota adja. Értékelést csak a kép vásárlója írhat.',
);

const feedback = demo(
  'Visszajelzés',
  `<div class="grid items-start gap-3 md:grid-cols-2">
    <div role="status" class="flex items-start gap-3 rounded-lg bg-black px-4 py-3 text-sm text-white shadow-card">
      ${icon('check', 'mt-0.5 size-4 shrink-0')}<p><span class="font-medium">Mentve.</span> A kép adatai frissültek.</p>
    </div>
    <div role="alert" class="flex items-start gap-3 rounded-lg border border-accent-200 bg-danger-surface px-4 py-3 text-sm text-danger">
      ${icon('circle-alert', 'mt-0.5 size-4 shrink-0')}<p><span class="font-medium">Nem sikerült a feltöltés.</span> A fájl legfeljebb 15 MB lehet (JPEG, PNG vagy WebP).</p>
    </div>
  </div>`,
  'A sikeres művelet rövid, fekete értesítés, a hiba piros doboz ikonnal, címmel és teendővel. A bejelentéshez az oldal egyetlen, végig jelen lévő élő régiót használ (role="status"): ide kerül a mentés, a másolás, a találatszám és a lánc-regisztráció állapotváltása; a role="alert" csak a hibáé. Az értesítés kiegészítő visszajelzés – az eredmény az oldalon is látszik –, ezért az eltűnése nem időkorlát (2.2.1); mégis legalább 5 másodpercig látszik, rámutatáskor megáll, az Escape eltünteti, és nincs benne művelet. A sikeré a pipa, a sikertelen kimeneté (pl. a lánc-regisztráció nem sikerült) a figyelmeztető ikon, a semleges változásé az „i” (WCAG 4.1.3).',
);

const dialog = demo(
  'Megerősítő párbeszédablak',
  `<dialog open aria-labelledby="sg-dialog-title" aria-describedby="sg-dialog-text" class="static m-0 w-full max-w-md rounded-lg border border-line bg-canvas p-5 text-fg shadow-card">
    <h4 id="sg-dialog-title" class="text-lg font-semibold">Leveszed a képet a galériából?</h4>
    <p id="sg-dialog-text" class="mt-2 text-sm leading-6 text-fg-muted">Az „Őszi erdő ködben” nem lesz nyilvános, és ezt később nem tudod visszavonni. Akik már megvették, továbbra is letölthetik.</p>
    <div class="mt-4 flex justify-end gap-2">${button('outline', 'Mégse')}${button('danger', 'Levétel', 'eye-off')}</div>
  </dialog>`,
  'A kliensben natív &lt;dialog&gt; a showModal() hívással: a háttér közben nem érhető el, az Esc bezárja. Megnyitáskor a fókusz a „Mégse” gombra kerül (a biztonságos választásra), bezáráskor visszatér a megnyitó gombra. A kérdés a következményt mondja el (aria-describedby), a gomb felirata az igét ismétli – „Levétel”, nem „OK”.',
);

const navigation = demo(
  'Nézetváltó és lapozó',
  `<div class="space-y-6">
    <nav aria-label="Vezérlőpult nézetei (minta)" class="flex gap-6 border-b border-line text-sm">
      <a href="?tab=kepeim" aria-current="page" class="-mb-px border-b-2 border-primary pb-2.5 font-medium text-fg ${FOCUS}">Saját képeim</a>
      <a href="?tab=vasarlasaim" class="-mb-px border-b-2 border-transparent pb-2.5 text-fg-muted hover:text-fg ${FOCUS}">Vásárlásaim</a>
    </nav>
    <nav aria-label="Lapozás (minta)" class="flex items-center gap-1 text-sm">
      <a href="#" class="inline-flex h-9 items-center gap-1 rounded-md px-2.5 hover:bg-surface ${FOCUS}">${icon('chevron-left')}Előző</a>
      <a href="#" class="grid size-9 place-items-center rounded-md hover:bg-surface ${FOCUS}">1</a>
      <span class="px-1 text-fg-muted" aria-hidden="true">…</span>
      <a href="#" class="grid size-9 place-items-center rounded-md hover:bg-surface ${FOCUS}">6</a>
      <a href="#" class="grid size-9 place-items-center rounded-md hover:bg-surface ${FOCUS}">7</a>
      <a href="#" aria-current="page" class="grid size-9 place-items-center rounded-md bg-black font-medium text-white ${FOCUS}">8</a>
      <a role="link" aria-disabled="true" class="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-fg-muted">Következő${icon('chevron-right')}</a>
    </nav>
  </div>`,
  'Az URL-hez kötött nézetváltó hivatkozássor (nav + aria-current="page"), nem ARIA-fülsor – ilyen a vezérlőpult. Oldalon belüli váltáshoz (pl. ellenőrzés: kép vagy hash) a WAI-ARIA fülsor-minta kell: role="tablist" és "tab", aria-controls, role="tabpanel", nyílbillentyűk. Az aktív elemet piros vonal és vastagabb felirat jelöli. A lapozóban az aktuális oldalt fekete háttér és aria-current="page", az elérhetetlen irány href nélküli, aria-disabled hivatkozás (nem fókuszálható, de a képernyőolvasó elérhetetlenként mondja be).',
);

const header = demo(
  'Fejléc és üres állapot',
  `<div class="space-y-6">
    <div class="flex items-center justify-between gap-4 rounded-lg border border-line px-4 py-3">
      <span class="text-lg font-semibold tracking-tight">Photo<span class="text-primary">Chain</span></span>
      <nav aria-label="Fő navigáció (minta)" class="hidden items-center gap-6 text-sm md:flex">
        <a href="#" aria-current="page" class="border-b-2 border-primary py-1 font-medium text-fg ${FOCUS}">Galéria</a><a href="#" class="border-b-2 border-transparent py-1 text-fg-muted hover:text-fg ${FOCUS}">Ellenőrzés</a><a href="#" class="border-b-2 border-transparent py-1 text-fg-muted hover:text-fg ${FOCUS}">Vezérlőpult</a>
      </nav>
      <div class="flex items-center gap-2">
        <a href="#" class="${BUTTON} ${BUTTON_VARIANTS.secondary} min-h-9">${icon('upload')}Feltöltés</a>
        <button type="button" class="grid size-9 place-items-center rounded-full border border-line-strong text-sm font-medium ${FOCUS}" aria-label="FN – fiókmenü" aria-expanded="false">FN</button>
        <button type="button" class="grid size-9 place-items-center rounded-md border border-line-strong md:hidden ${FOCUS}" aria-label="Menü" aria-expanded="false">${icon('menu', 'size-5')}</button>
      </div>
    </div>
    <div class="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      ${icon('image-off', 'size-8 text-fg-muted')}
      <p class="mt-3 font-medium">Nincs találat</p>
      <p class="mt-1 text-sm text-fg-muted">Próbálj más keresőszót, vagy töröld a szűrőket.</p>
      <div class="mt-4">${button('outline', 'Szűrők törlése', 'x')}</div>
    </div>
  </div>`,
  'A logó szöveges: a „Chain” piros – ez az egyetlen díszítő piros elem. Az aktív menüpontot piros vonal és aria-current="page" jelöli, nem csak a színe. Mobilon a navigáció a „Menü” gomb mögé kerül; a menü- és a fiókgomb felfedő minta (aria-expanded, aria-controls). Útvonalváltáskor a kliens frissíti az oldal címét, és a fókuszt az új oldal h1-ére teszi (WCAG 2.4.2, 2.4.3). Üres listánál mindig van javaslat a továbblépésre.',
);

const components = section(
  'komponensek',
  'Komponensek',
  'A kliens (L18–L23) ezekből a mintákból épül. Mind a szerepalapú tokeneket használja; a rámutatás (hover) és a billentyűzetfókusz állapota is része a mintának.',
  `<div class="grid gap-6 xl:grid-cols-2">${[
    buttons,
    fields,
    badges,
    feedback,
    cards,
    certificate,
    stars,
    navigation,
    dialog,
  ].join('')}<div class="xl:col-span-2">${header}</div></div>`,
);

/** A lap statikus fejezetei a megjelenés sorrendjében (a színek és a kontraszt után). */
export const STATIC_SECTIONS = [typography, shapes, trust, components].join('\n');
