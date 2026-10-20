# PhotoChain – UI-terv (L17)

A kliens (L18–L23) felületi terve: design tokenek, stílusútmutató, a hat fő képernyő drótváza és a
tervezési elvek. Arculat (szerzői döntés, 2026-10-08): **fekete-fehér, minimalista felület
egyetlen piros kiemelőszínnel**, Inter és JetBrains Mono betűvel, egyelőre csak világos témával.

| Fájl                                             | Tartalom                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`theme.css`](../../client/src/styles/theme.css) | A design tokenek egyetlen forrása – Tailwind CSS v4 `@theme` (színek, betűk, sarkok, árnyék); az L18 óta a kliensben: `client/src/styles/theme.css` |
| [`stilusutmutato.html`](stilusutmutato.html)     | Stílusútmutató – **generált** (a `theme.css`-ből), kézzel nem szerkesztjük                                                                          |
| [`drotvazak/`](drotvazak/)                       | Hat drótváz (lo-fi, reszponzív): galéria, adatlap, feltöltés, ellenőrzés, vezérlőpult, admin                                                        |
| [`../../tools/design/`](../../tools/design/)     | Kontraszt-ellenőrző (WCAG 2.2), a stílusútmutató generátora és a tesztjeik                                                                          |

## Megnyitás, frissítés, ellenőrzés

A HTML-fájlok önállóak: böngészőben közvetlenül megnyithatók (a betűket, a Tailwind böngészős buildjét
és a Lucide ikonokat rögzített verzióval CDN-ről töltik, ezért internet kell hozzájuk).

```bash
npm run design:check        # a tokenek szín-párosainak kontrasztja (WCAG 2.2 AA), táblázattal
npm run design:styleguide   # a stílusútmutató újragenerálása a theme.css (client/src/styles/) módosítása után
npm run design:test         # a kontraszt-ellenőrző és a generátor tesztjei + a stílusútmutató frissessége
```

A `design:test` a gyökér `npm test` része: elbukik, ha egy előírt szín-páros nem éri el az AA szintet,
vagy ha a `theme.css` változott, de a stílusútmutatót nem generáltuk újra.

Képernyőkép a drótvázakról (asztali és mobil nézet – 500 px alatt a generátor a lapot egy ekkora
iframe-be teszi, így a médialekérdezések valóban a kért szélességre reagálnak):

```bash
node tools/screenshot/render.mjs html --file docs/design/drotvazak/galeria.html --width 1440 --height 1700 --out L17_galeria.png
node tools/screenshot/render.mjs html --file docs/design/drotvazak/galeria.html --width 390 --height 1500 --out L17_galeria_mobil.png
```

## Tervezési elvek – Nielsen tíz heurisztikája

A drótvázak jegyzetei szögletes zárójelben jelölik, melyik heurisztikát szolgálja egy-egy döntés.

| #   | Heurisztika                        | Hogyan jelenik meg                                                                                                      |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| H1  | A rendszer állapotának láthatósága | Állapotjelvény minden képen; feltöltési haladásjelző; a lánc-regisztráció lépései; a tranzakció az Etherscanen          |
| H2  | Egyezés a valós világgal           | Magyar, szakzsargon nélküli szöveg („ujjlenyomat”, „hasonló kép”); a hash mellett a jelentése                           |
| H3  | Felhasználói kontroll és szabadság | A keresés, a szűrők és a fül az URL-ben (vissza gomb); a feltöltés megszakítható; minden párbeszéd bezárható            |
| H4  | Következetesség és szabványok      | Ugyanaz az állapot mindenhol ugyanazzal az ikonnal, szöveggel és színnel; egy nézetben egyetlen piros gomb              |
| H5  | Hibamegelőzés                      | Formátum- és méretkorlát előre kiírva; megerősítés visszavonhatatlan művelet előtt; nem kínálunk nem elérhető műveletet |
| H6  | Felismerés felidézés helyett       | Aktív szűrők címkéi; darabszám a füleken és a szűrőkön; a kiválasztott fájl előnézete                                   |
| H7  | Rugalmasság és hatékonyság         | Ellenőrzés bejelentkezés nélkül, hash-sel is; mobilon alul rögzített vásárlássáv                                        |
| H8  | Esztétikus és minimalista dizájn   | Fekete-fehér felület, a hangsúly a fotókon; mobilon a táblázatból kártyalista                                           |
| H9  | Hibák felismerése és helyreállítás | A hiba a mező alatt, ikonnal és teendővel; a 409-es duplikátumnál a meglévő kép adatai, nem csak egy hibakód            |
| H10 | Súgó és dokumentáció               | „Mi történik a feltöltés után?”, „Hogyan működik?”, „Mit jelent ez?” – rövid, helyben elérhető magyarázatok             |

## Akadálymentesség – WCAG 2.2, AA szint

| Feltétel                                     | Megoldás                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Nem szöveges tartalom                  | A fotó szöveges helyettesítője a kártyán `alt=""` (a cím mellette áll), az adatlapon `<cím> – vízjeles előnézet`; a dekoratív ikonok `aria-hidden`                                                                                                                                                                |
| 1.3.1 Információ és kapcsolatok              | Látható `label` (a keresőmezőknél a nagyító ikon és a helykitöltő mellett rejtett címke), `fieldset`/`legend` a csoportokhoz (csillagos értékelés), `th scope` a táblázatokban; a vezérlőpult rácssoraiban rejtett cellacímkék                                                                                    |
| 1.4.1 A szín használata                      | Az állapot mindig ikon + szöveg; a hiba ikonnal és szöveggel; az aktív menüpontot vonal és `aria-current` is jelzi                                                                                                                                                                                                |
| 1.4.3 Kontraszt (minimum) – szöveg 4,5:1     | Gépi ellenőrzés: a `tools/design/contrast.mjs` minden előírt szín-párost kiszámol, a teszt elbukik, ha egy páros nem éri el; a helykitöltő szöveg színe is (`::placeholder` = `fg-muted`)                                                                                                                         |
| 1.4.10 Újratördelés (320 px)                 | Egyoszlopos mobil elrendezés; vízszintes görgetés csak az admin adattábláinál (adattáblánál a feltétel megengedi) – a tábla billentyűzettel elérhető régió                                                                                                                                                        |
| 1.4.11 Nem szöveges kontraszt – 3:1          | Mezőkeret és üres csillag (`line-strong`), fókuszjelző, az aktív elem piros vonala; az állapotikonok a szöveg színét öröklik (4,5:1 felett)                                                                                                                                                                       |
| 1.4.12 Szövegtávolság                        | A gombok és mezők magassága `min-h-*`, nem rögzített: nagyobb sor- és betűtávolságnál sem vágódik le a felirat                                                                                                                                                                                                    |
| 2.1.2 Nincs billentyűzetcsapda               | Natív `<dialog>` (`showModal()`): Esc bezárja, a fókusz visszakerül a nyitó gombra                                                                                                                                                                                                                                |
| 2.2.1 Állítható időzítés                     | Az értesítés kiegészítő visszajelzés (az eredmény az oldalon is látszik: a frissült lista, a jelvény), ezért az eltűnése nem időkorlát; mégis legalább 5 mp-ig látszik, rámutatáskor megáll, az Escape eltünteti, nincs benne művelet; modális ablak alatt vár, és annak bezárása után hangzik el                 |
| 2.3.3 Animáció (AAA, ajánlott)               | Csak a töltésjelző forog, az is csak `motion-safe:` (a `prefers-reduced-motion` beállítást követi)                                                                                                                                                                                                                |
| 2.4.2 / 2.4.3 Oldalcím, fókuszsorrend        | Útvonalváltáskor új `<title>`, a fókusz az új oldal `h1`-ére kerül; párbeszédnél a „Mégse” gombra                                                                                                                                                                                                                 |
| 2.4.7 / 2.4.11 Látható, nem takart fókusz    | 2 px-es fekete fókuszkeret 2 px távolsággal (a fotókártyán a teljes kártyán); a mobilon rögzített sávnak megfelelő görgetési ráhagyás                                                                                                                                                                             |
| 2.5.7 Húzó mozdulatok                        | A fogadóterület mellett mindig van „Tallózás…” gomb                                                                                                                                                                                                                                                               |
| 2.5.3 Felirat a névben                       | A hozzáférhető név a látható felirattal kezdődik: `FN – fiókmenü`, `Szerkesztés: <cím>`, `Tájkép – szűrő törlése`                                                                                                                                                                                                 |
| 2.5.8 Célterület mérete (minimum) – 24×24 px | A gombok és az ikongombok legalább 24×24 px-esek (gomb 40, táblázatsor gombja 32, ikongomb 36, csillag 28 px); a szövegközi hivatkozások (pl. „Törlés”, „Miért?”, morzsamenü) a feltétel szövegközi kivétele alá esnek                                                                                            |
| 3.3.1 / 3.3.3 Hiba azonosítása, javaslat     | `aria-invalid`, és az `aria-describedby` a súgót és a hibát is felsorolja; a szerver magyar Zod-üzenetei                                                                                                                                                                                                          |
| 3.3.8 Akadálymentes hitelesítés              | A bejelentkezésnél (L19) a beillesztés és a jelszókezelő engedélyezett, nincs kognitív teszt                                                                                                                                                                                                                      |
| 4.1.2 Név, szerep, érték                     | URL-hez kötött nézetváltó: hivatkozássor `aria-current`-tel; oldalon belüli váltás: WAI-ARIA fülsor (`tablist`, `tab`, `tabpanel`, nyilak); csillagos értékelés: rádiócsoport; szűrők: `aria-pressed`; menügombok: `aria-expanded`; az ikongombok és az ismétlődő gombok neve kontextussal (`Szerkesztés: <cím>`) |
| 4.1.3 Állapotüzenetek                        | Egyetlen, állandó élő régió (`role="status"`): találatszám, mentés, másolás, a lánc-regisztráció állapota; hiba: `role="alert"`; az ellenőrzés eredményénél a fókusz az eredmény címére kerül                                                                                                                     |

## Színek és tokenek

A komponensek a **szerepalapú** neveket használják (`bg-canvas`, `text-fg`, `bg-primary` …), nem a
skálák fokozatait – így egy későbbi sötét téma csak ezeket írja felül. A `--color-*: initial` törli a
Tailwind alappalettáját: csak a saját színeink használhatók.

| Token                       | Érték              | Szerep                                                                    |
| --------------------------- | ------------------ | ------------------------------------------------------------------------- |
| `canvas` / `surface`        | fehér / neutral-50 | Lap háttere / szürke felület (táblázatfej, jegyzet)                       |
| `fg` / `fg-muted`           | neutral-950 / -600 | Szöveg / másodlagos szöveg                                                |
| `line` / `line-strong`      | neutral-200 / -500 | Elválasztó vonal / mezőkeret (3:1 felett)                                 |
| `primary` / `primary-hover` | accent-600 / -700  | **Piros:** elsődleges gomb, aktív fül, hivatkozás rámutatáskor            |
| `on-primary`                | fehér              | Felirat a piros gombon                                                    |
| `danger` / `danger-surface` | accent-700 / -50   | Hibaüzenet, veszélyes művelet (körvonalas gomb)                           |
| `focus`                     | neutral-950        | Billentyűzetfókusz kerete                                                 |
| `trust-*`                   | zöld skála         | **Kizárólag** a blokkláncon igazolt hitelesség (pajzs, tanúsítvány)       |
| `caution-*`                 | borostyán skála    | Folyamatban (lánc-regisztráció, fizetés) vagy figyelmet kér (hasonló kép) |

A piros egyszerre kiemelő- és hibaszín. Ezért a hiba mindig ikonnal és szöveggel jelenik meg, a
veszélyes művelet gombja pedig körvonalas – így nem keveredik az elsődleges (teli piros) művelettel.

## Tipográfia

- **Inter** (változó betűvastagság) a felület minden szövegének; törzsszöveg 16 px, sorköz 28 px.
- **JetBrains Mono** a hash-eknek és a tranzakció-azonosítóknak (rövidítve: `0x5a1f9c3e…8b20d47e`,
  a teljes érték másolható).
- Skála: oldalcím 30 px / 600, szakaszcím 20 px / 600, kártyacím 16 px / 500, másodlagos 14 px; az
  árak táblázatos számjegyekkel (`tabular-nums`).

## Komponensek (L18–L23)

`AppHeader` · `Button` (elsődleges, fekete, körvonalas, veszélyes) · `TextField` / `Select` / `Textarea`
hibaállapottal · `StatusBadge` · `PhotoCard` · `ChainCertificate` · `StarRating` (megjelenítés és
bevitel) · `Toast` / `Alert` · `LiveRegion` · `ViewSwitcher` (URL-hez kötött nézetváltó) · `Tabs`
(oldalon belüli fülsor) · `Pagination` · `EmptyState` · `Dropzone` · `ProgressBar` ·
`ConfirmDialog` · `VerificationResult` · `StatCard` · `DataTable` (admin). A minták a
stílusútmutató „Komponensek” fejezetében láthatók.

## A bizalom vizuális nyelve

| Hol             | Állapot (API)                           | Ikon (Lucide)  | Szín      | Szöveg                   |
| --------------- | --------------------------------------- | -------------- | --------- | ------------------------ |
| Kép állapota    | `REGISTERED`                            | `shield-check` | zöld      | Hitelesítve              |
| Kép állapota    | `PENDING_CHAIN`                         | `clock`        | borostyán | Regisztrálás folyamatban |
| Kép állapota    | `CHAIN_FAILED`                          | `shield-alert` | piros     | Sikertelen regisztráció  |
| Kép állapota    | `HIDDEN` (tulajdonos)                   | `eye-off`      | semleges  | Elrejtve                 |
| Kép állapota    | `HIDDEN` (admin, `OWNER_AND_ADMIN`)     | `ban`          | piros     | Moderátor eltávolította  |
| Ellenőrzés      | `VERIFIED`                              | `shield-check` | zöld      | Hiteles, regisztrált kép |
| Ellenőrzés      | `SIMILAR`                               | `scan-search`  | borostyán | Hasonló regisztrált kép  |
| Ellenőrzés      | `NOT_FOUND`                             | `search-x`     | semleges  | Nincs a nyilvántartásban |
| Feltöltés (409) | `DUPLICATE_EXACT` / `DUPLICATE_SIMILAR` | `copy-x`       | piros     | Már regisztrált kép      |

A rendelés állapotai semlegesek (a sikeres fizetés sem zöld), a függő fizetés borostyán, a sikertelen
piros. A „nincs a nyilvántartásban” szándékosan semleges: nem jelent hamisítást.

## Képernyők

| Drótváz                                   | Javasolt útvonal (L18) | Fő API-hívások                                                                          |
| ----------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| [Galéria](drotvazak/galeria.html)         | `/`                    | `GET /api/photos` (q, categoryId, minPrice, maxPrice, sort, page, pageSize=24)          |
| [Adatlap](drotvazak/adatlap.html)         | `/photos/:id`          | `GET /api/photos/:id`, `GET/POST /api/photos/:id/reviews`, `POST /api/orders/checkout`  |
| [Feltöltés](drotvazak/feltoltes.html)     | `/upload`              | `POST /api/photos` (multipart), majd `GET /api/photos/:id` az állapotért                |
| [Ellenőrzés](drotvazak/ellenorzes.html)   | `/verify`              | `POST /api/verify` (fájl), `GET /api/verify/:sha256`                                    |
| [Vezérlőpult](drotvazak/vezerlopult.html) | `/dashboard`           | `GET /api/me/photos`, `GET /api/me/purchases`, `DELETE /api/photos/:id`, letöltés       |
| [Adminisztráció](drotvazak/admin.html)    | `/admin`               | `GET /api/admin/stats`, `/users`, `/photos`, `PATCH …/:id`, `POST …/retry-registration` |

A bejelentkezés, a regisztráció és a profil oldala a meglévő mintákból (űrlapmező, gomb, fotókártya)
épül, külön drótvázat nem igényel.

## A drótvázakhoz szükséges API-bővítések

A drótvázak néhány eleméhez a mostani (L10–L16) API nem ad adatot. Ezek a kliens lépéseiben bővülnek –
vagy, ha a bővítés nem éri meg, az elem elmarad.

| Képernyő – elem                                                               | Hiányzó adat                                                                                                 | Javasolt bővítés                                                                                   | Lépés    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| Galéria – átlagos értékelés és darabszám a kártyán                            | a listaelem (`PhotoSummaryDto`) nem tartalmazza                                                              | `rating: { average, count }` a listaelemben (egy lekérdezésben, nem képenként)                     | L20      |
| Adatlap – „Eredeti letöltése” a vevőnek, az értékelés űrlapja csak vásárlónak | a bejelentkezett nézőre vonatkozó jelzők                                                                     | `viewer: { purchased, canReview, ownReviewId }`                                                    | L20, L23 |
| Feltöltés, vezérlőpult – tranzakció-hivatkozás `PENDING_CHAIN` alatt          | a tulajdonos nem kapja meg a tranzakció hash-ét (a tanúsítvány csak `REGISTERED`-nél van)                    | `chainTxHash` a tulajdonos saját képeinek válaszában – megerősítetlen, „függő tranzakció” címkével | L21, L22 |
| Vezérlőpult – „Te vetted le” vagy „Moderátor eltávolította”                   | a tulajdonos csak a `HIDDEN` állapotot látja; a `hiddenBy` csak az admin válaszában van                      | `hiddenBy` a tulajdonos saját képeinek válaszában                                                  | L22      |
| Vásárlásaim – a fotós neve, a saját értékelés, letölthető-e                   | az `OrderDto` csak a kép azonosítóját, címét és bélyegképét adja                                             | `photo.ownerDisplayName`, `downloadable`, a vevő saját értékelése                                  | L22      |
| Ellenőrzés – tranzakció `VERIFIED`-nél                                        | `null` lehet: nincs hozzá blokkszámmal lezárt tranzakció, vagy a rekord nem ehhez a regisztrációhoz tartozik | nincs: a felület „A tranzakció adatai nem érhetők el” szöveget mutat                               | L24      |

## A tokenek használata a kliensben (L18)

```css
/* client/src/styles/index.css */
@import 'tailwindcss';
@import './theme.css'; /* a design tokenek egyetlen forrása */
```

```ts
// client/src/main.tsx – a betűk JavaScript-importtal (Fontsource)
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
```

- A téma az L18-ban a `docs/design/theme.css` helyéről a `client/src/styles/theme.css`-be költözött,
  hogy a kliens buildje (és később a Docker-build) a `docs/` mappa nélkül is működjön. A forrás
  továbbra is egy: a `tools/design` (`THEME_FILE`) ezt olvassa, a stílusútmutató ebből generálódik.
- A betűk saját hosztolással jönnek (`@fontsource-variable/*` csomagok), nem a Google CDN-ről – így a
  látogató IP-címe nem jut harmadik félhez.
- Az ikonok a `lucide-react` csomagból, ugyanazokkal a nevekkel, mint a drótvázakon.
- Az elkészült alapkomponensek (`Button`, `TextField`, `StatusBadge`, `Alert`, `Card`, `LiveRegion`)
  fejlesztői módban a `/_komponensek` oldalon láthatók.
