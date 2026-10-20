# PhotoChain – kliens (`client/`)

A PhotoChain webes felülete: React 19 + TypeScript + Vite 8 egyoldalas alkalmazás (SPA). A
projekt indítását és a gyökérszintű scripteket a [részletes leírás](../docs/RESZLETES_LEIRAS.md) írja le; a felületi
tervet (tokenek, drótvázak, akadálymentességi szabályok) a [docs/design/README.md](../docs/design/README.md).

## Technológiák

| Csomag                                   | Szerep                                                            |
| ---------------------------------------- | ----------------------------------------------------------------- |
| React 19, React DOM                      | felület                                                           |
| Vite 8 (+ `@vitejs/plugin-react`)        | fejlesztői szerver proxyval, build                                |
| Tailwind CSS v4 (`@tailwindcss/vite`)    | stílusok a design tokenekből (`src/styles/theme.css`, L17)        |
| React Router 8 (adat-mód)                | útvonalak, `ErrorBoundary`, lusta betöltés                        |
| TanStack Query 5                         | szerverállapot: gyorsítótár, újrapróbálás, megszakítás            |
| lucide-react                             | ikonok (ugyanazok a nevek, mint a drótvázakon)                    |
| `@fontsource-variable/*`                 | Inter és JetBrains Mono saját hosztolással (nem Google CDN)       |
| Vitest, Testing Library, jsdom, axe-core | komponens- és útvonaltesztek, automatikus akadálymentességi teszt |

## Felépítés

```text
src/
├── api/            # http.ts (fetch-burkoló, ApiError, a válasz értelmezése), guards.ts
│                   # (válaszellenőrzés), *.api.ts végpontonként: auth, photos (+ saját képek,
│                   # módosítás, levétel – L22), categories, reviews (+ írás, törlés – L23), users
│                   # (fotósprofil, saját profil módosítása – L23), upload (feltöltés – L21), verify
│                   # (hitelesség-ellenőrzés fájllal és hash-sel – L24), multipart (a többrészes küldés
│                   # közös XMLHttpRequest-je haladással), orders (fizetés, rendelés, vásárlásaim – L22),
│                   # admin (statisztika, felhasználók tiltása, képek moderálása, újrapróbálás – L25)
├── admin/          # adminParams – az adminfelület nézete az URL-ben (L25)
├── auth/           # munkamenet: AuthProvider/useAuth, sessionCache, useAuthActions (belépés,
│                   # regisztráció, kijelentkezés), ProtectedRoute/AdminRoute, validation,
│                   # session (visszairányítás célja, monogram), useSessionRecheck
├── components/
│   ├── layout/     # Layout (ugrólink, fejléc, fő tartalom, lábléc), Header, AccountMenu, Footer
│   ├── admin/      # StatCards, UsersSection (+ BlockUserDialog), PhotosSection
│   │               # (+ HideAdminPhotoDialog, adminPhotoStatus), FilterGroup, DataTable, adminCache,
│   │               # useRowFocus (adminfelület – L25)
│   ├── dashboard/  # OwnPhotosTab (+ OwnPhotoRow, ownPhotoStatus, EditPhotoDialog, HidePhotoDialog),
│   │               # PurchasesTab, ListSummary (L22)
│   ├── photos/     # PhotoCard, PhotoImage, Thumbnail, RatingStars, GalleryFilters (+ GalleryFilterFields,
│   │               # useGalleryDrafts), ChainCertificate (+ certificatePanels, ExplorerLink, proofRows –
│   │               # a bizonyíték sorai az ellenőrzéssel közösek, L24),
│   │               # PurchaseBox (fizetés indítása – L22), PhotoReviews (+ ReviewForm, RatingInput,
│   │               # RatingSummary, DeleteReviewDialog – L20, L23), PhotoFormFields (a kép adatainak
│   │               # mezői – feltöltés és szerkesztés)
│   ├── upload/     # FileDropZone, SelectedFile, UploadProgress, DuplicateNotice,
│   │               # RegistrationStatus (L21)
│   ├── users/      # EditProfileDialog (a saját profil szerkesztése – L23)
│   ├── verify/     # VerifyFileForm, VerifyHashForm, VerificationResult (+ resultStates), HowItWorks
│   │               # (hitelesség-ellenőrzés – L24)
│   └── ui/         # Button, TextField, TextAreaField, SelectField, PasswordField, StatusBadge, Alert,
│                   # Card, PageHeading, Spinner, LiveRegion, Pagination, EmptyState, CopyButton,
│                   # LoadError, Dialog (natív <dialog>, L22), DefinitionRow, panelTones (a bizalom
│                   # vizuális nyelvének hangnemei – L24)
├── dashboard/      # dashboardParams (a vezérlőpult nézete az URL-ben), listSummary (összesítés,
│                   # bemondás) (L22)
├── hooks/          # usePageTitle (böngészőfül címe), useRouteFocus (fókusz oldalváltáskor),
│                   # useFocusAfterRecovery (fókusz a sikeres újrapróbálás után), useForm (űrlapállapot,
│                   # mezőhibák, fókusz – belépés, regisztráció, feltöltés, szerkesztés, értékelés,
│                   # profil), useHeadingFocusWhenShown (fókusz az oldal címére a betöltés végén – L23),
│                   # useFileDropGuard (a fogadóterületen kívüli dobás tiltása – L21, L24)
├── lib/            # queryClient (újrapróbálás, megszűnt munkamenet), focus, text (hibaszöveg,
│                   # szövegszabályok), format (ár, dátum, értékelés, hash, fájlméret), loadState, cx,
│                   # redirect (átirányítás a Stripe-ra – L22)
├── pages/          # GalleryPage (kezdőlap), PhotoDetailPage, ProfilePage (fotósprofil – L23),
│                   # UploadPage (L21), DashboardPage, CheckoutSuccessPage, CheckoutCancelPage (L22),
│                   # VerifyPage (hitelesség-ellenőrzés – L24), AdminPage (adminfelület – L25),
│                   # LoginPage, RegisterPage,
│                   # ForbiddenPage, NotFoundPage, RouteErrorPage; dev/ComponentsPage,
│                   # dev/SessionDemoPages (csak fejlesztéskor)
├── photos/         # galleryParams – a galéria nézete az URL-ben (L20)
├── reviews/        # reviewValidation – az értékelés szabályai a kliensen (L23)
├── upload/         # uploadValidation (a szerver szabályai a kliensen), useImageSelection (a
│                   # kiválasztott kép, előnézet, hibák), useImagePicker (a kiválasztás közös folyamata:
│                   # bemondás, rejtett riasztás – L21, L24), imageErrors (a szerver képhibái),
│                   # pollInterval (a függő állapot lekérdezési üteme – regisztráció és rendelés) (L21, L22)
├── users/          # profileValidation – a saját profil szabályai a kliensen (L23)
├── verify/         # verifyValidation (a kép és a hash szabályai), verificationGate (egyszerre egy
│                   # ellenőrzés, a szerver kérte várakozás), anchors (a magyarázat célrészlete) (L24)
├── routes/         # router.ts – az útvonalfa
├── styles/         # index.css (Tailwind + alapstílusok), theme.css (design tokenek)
└── test/           # tesztsegédek: setup, fetch-csonk, xhr (hamis XMLHttpRequest), dialog (a <dialog>
                    # showModal/close mása a jsdomhoz), axe, renderRoute, users, photos, orders, verify,
                    # admin, liveRegion
```

## Az API elérése

- Minden kérés az `src/api/http.ts` `apiRequest` függvényén megy át, **relatív** `/api/...` címre,
  `credentials: 'same-origin'` beállítással. Fejlesztéskor a Vite proxyja továbbítja a 4000-es portra
  (`vite.config.ts`), később (L31) az Express szolgálja ki a buildet – a felület és az API így mindig
  azonos originen van, ezért nincs szükség CORS-ra, és a szerver CSRF-védelme (`Sec-Fetch-Site`)
  változtatás nélkül működik.
- A szerver hibaborítékából (`{ error: { code, message, details? } }`) `ApiError` lesz (státusz, kód,
  magyar üzenet, `Retry-After`). Hálózati hiba: 0-s státusz, `NETWORK_ERROR`; a proxy boríték nélküli
  502/503/504-e: `SERVER_UNAVAILABLE`; minden más váratlan válasz: `UNEXPECTED_RESPONSE`.
- A TanStack Query csak a hálózati hibát és az 5xx-et próbálja újra (legfeljebb kétszer, a szerver
  `Retry-After` értéke szerint, különben 1 s, 2 s …); a 4xx (pl. validációs hiba, 429) újrapróbálása
  nem segítene. A böngésző offline jelzése nem szünetelteti a kéréseket (`networkMode: 'always'`): az
  API azonos originen van, valódi kapcsolathiánynál pedig a kérés azonnal érthető hibával végződik.
- A külső adat típusa csak ígéret: a végpontonkénti `*.api.ts` futás közben is ellenőrzi a választ
  (`api/guards.ts`). A képcím csak saját, `/media/…` útvonal lehet, a blokklánc-böngésző linkje
  pedig csak a kiírt hash, illetve cím Etherscan-oldala – így egy hibás válasz sem tehet az oldalra
  idegen forrást vagy `javascript:`-linket. A GET-kérés típusszinten sem kaphat törzset.
- A lapozott listák a `data` mellett `meta`-t is küldenek (`apiRequestEnvelope`). A dinamikus
  útvonalszakasz (pl. a kép azonosítója) a `pathSegment` függvényen megy át: kódolva, a `.` és a `..`
  szakaszt elutasítva – így egy URL-ből jött érték sem viheti a kérést másik API-címre (L20). Az
  azonosítók (kép, fotós, értékelés) formáját a szerver Zod-mintája szerint ellenőrzi (`isUuid`), a
  galéria lekérdezése pedig csak „?…” alakú lehet.

## Munkamenet (L19)

- A munkamenetet a szerver `HttpOnly` sütije hordozza; a kliens a bejelentkezett felhasználót a
  TanStack Query gyorsítótárából (`['auth', 'me']`) ismeri – ez az egyetlen forrás. Induláskor és
  minden ablakváltáskor `GET /api/auth/me` (így a másik lapon történt ki- vagy bejelentkezést is
  észreveszi); a belépés, a regisztráció és a kijelentkezés közvetlenül oda írja az új állapotot, és
  előbb megszakítja a még futó ellenőrzést (különben a késve érkező válasza felülírná).
- Bármely kérésre érkező `401 UNAUTHORIZED` vagy `403 ACCOUNT_BLOCKED` kijelentkezett állapotot jelent
  (`lib/queryClient.ts`). Ha a munkamenet gazdája megváltozik, a többi lekérdezés alapállapotba kerül:
  az előző felhasználó adata nem marad meg, a látható oldal adata az új munkamenettel töltődik újra.
  Kivétel a mindenkinek azonos, nyilvános adat (`PUBLIC_QUERY_META` – a galéria listája, a
  kategóriák): azt a váltás nem tölti újra (L20).
- A belépés és a regisztráció mutációja nem marad a gyorsítótárban (a beküldött jelszó sem).
- Védett oldal: a `ProtectedRoute` / `AdminRoute` layout-útvonal alá kerül. Bejelentkezés nélkül a
  belépésre irányít, és a célt megjegyzi (visszairányítani csak az alkalmazás saját, relatív útvonalára
  lehet – `auth/session.ts`); nem adminisztrátornak „Nincs jogosultság” oldalt mutat; ha az ellenőrzés
  nem sikerül, újrapróbálást kínál. A jogosultságot a szerver dönti el, ez csak a felület.

## Galéria és adatlap (L20)

- **A nézet az URL-ben:** a galéria (`/`) keresőszava, kategóriája, ár-tartománya, rendezése és oldala
  a lekérdezésben van (`photos/galleryParams.ts`) – megosztható, és a vissza gomb is működik. Az URL
  kézzel is szerkeszthető, ezért a beolvasás a szerver szabályait követi: az érvénytelen értéket
  elhagyja (a szerver 400-at adna rá). Az URL-be csak az alapértéktől eltérő paraméter kerül.
- **Gépelés és szűrés:** a kereső- és az ármezők gépelés után 400 ms-mal frissítenek (Enterre azonnal,
  az előzményekben a gépelés nem hagy minden betűnél új bejegyzést), a választók azonnal. Szűrés közben
  a régi találatok látszanak, foglaltként jelölve (`aria-busy`), amíg az újak meg nem érkeznek; a
  frissült találatszámot az élő régió mondja be. Lapozáskor a fókusz a találatszámra kerül.
- **Előzmények:** egy szerkesztési sorozat (gépelés egy mezőben, lépkedés egy választóban) egyetlen
  bejegyzés – az első alkalmazás új bejegyzés, a folytatás annak helyére lép; új sorozatot egy másik
  vezérlő fókusza, az Enter, egy címke törlése és az URL külső változása (vissza gomb) kezd. Ha az URL
  kívülről változik, a mezők követik; a saját frissítés megérkezése viszont nem írja felül a közben
  gépelt szöveget (a navigáció a hívás után, külön lépésben fut le; a `flushSync` csak a renderelését
  teszi szinkronná). A „…törlése” gomb neve azt mondja meg, amit töröl (keresés, szűrők), és a
  félbehagyott gépelést, a hibaüzenetet is törli (a mobil szűrőpanel nyitva marad).
- **Árhiba:** a formátumhiba megnevezi a hibás mezőt; a fordított tartomány gépelés közben még nem hiba
  (pl. 50 000 írása közben az 5), csak Enterre vagy a mezők elhagyásakor; a mezők elhagyása csak a hibát
  mutatja, nem alkalmaz (az oldal nem rendeződik át a következő kattintás alatt); ha a hiba a bezárt
  mobil panelen van, Enterre a panel kinyílik.
- **Fókusz:** címke törlése után a sor következő gombjára, ha a sor eltűnt, a találatszámra kerül (a
  keresőmezőre nem – érintőképernyőn az a billentyűzetet nyitná fel); lapozáskor az új oldal
  megérkezése után a találatszámra („30 találat, 2. oldal”). A késleltetett fókuszáthelyezés csak akkor
  történik meg, ha a fókusz még a kiváltó elemen (vagy az eltűnése után a body-n) van – ha a felhasználó
  közben máshová lépett, ott marad, és az élő régió mondja be az eredményt.
- **Hiba és újrapróbálás:** a hibaüzenet riasztás, az Újrapróbálás gomb az újrapróbálás közben is a
  helyén marad (foglalt), az újrapróbálást az élő régió bejelenti, siker után a fókusz a tartalom elejére
  kerül (`lib/loadState.ts`, `LoadError`, `useFocusAfterRecovery`). A már betöltött adat egy sikertelen
  háttérfrissítés után is megmarad; a sikertelen szűrés vagy lapozás újrapróbálásakor a régi találatok
  nem térnek vissza a hibanézet alá. A kategóriák hibája a választó leírásában jelenik meg, újratölthető
  (az ismételt hibát bejelenti, siker után a fókusz a választóra kerül).
- **Másolás:** a „Másolva” legalább 5 másodpercig látszik, amíg a gombon a mutató vagy a fókusz van,
  tovább (L17: 2.2.1); ha a vágólap nem érhető el, a teljes érték a gomb utáni mezőből másolható ki.
- **Kérések:** a lista 30 másodpercig (a közös alapérték), a kategóriák 5 percig frissek, és
  ablakváltáskor nem töltődnek újra; az adatlap értékelései sem.
- **Adatlap:** az azonosító csak UUID formában indít kérést; a nem létező vagy nem nyilvános kép saját
  oldalt kap („A kép nem található”). Betöltés után a fókusz a kép címére kerül, ha az útvonalváltás a
  fő tartalomra tette, vagy egy újratöltés (újrapróbálás, felhasználóváltás) a body-ra ejtette. Az
  olvasási sorrend mobilon is a drótváz szerinti (kép → ár és vásárlás → tanúsítvány → leírás). A
  vásárlás doboza a néző helyzetéhez igazodik (vendég, vevő, tulajdonos); a fizetés az L22-ben készül
  el. Ha a szerver vendégnek látja a bejelentkezettnek hitt nézőt (lejárt munkamenet), a kliens
  újraellenőrzi a munkamenetet (`useSessionRecheck`). A „További értékelések” után a fókusz az első új
  értékelésre kerül; az eltolásos lapozás miatt ismétlődő értékelés csak egyszer látszik.

## Feltöltés (L21)

- **Védett oldal:** `/upload` csak bejelentkezve (`ProtectedRoute`); a fejlécben a „Feltöltés” gomb
  (keskeny képernyőn a fiókmenü „Kép feltöltése” hivatkozása). Felhasználóváltáskor az oldal
  újraindul (`<Outlet key={user.id}>`): az előző felhasználó félbehagyott űrlapja, kiválasztott képe
  nem marad a következőnek.
- **Fájl kiválasztása:** fogadóterület húzással vagy a natív fájlválasztóval („Tallózás…”, a
  billentyűzetről is); a típus (JPEG/PNG/WebP – MIME, enélkül a kiterjesztés) és a méret (15 MB) a
  küldés előtt, az előnézet betöltése után a felbontás is (a rövidebb oldal ≥ 600 képpont, ≤ 50
  megapixel – a felső határ a build idején a `VITE_IMAGE_MAX_MEGAPIXELS` változóval szűkíthető, az
  éles Render-buildben 25, L32) ellenőrzött (`upload/uploadValidation.ts`, `useImageSelection.ts`). A kliens ítélete
  blokkol, a szerveré (pl. sérült, egyszínű kép) látszik, de újra lehet küldeni – a szerver dönt. Az
  előnézet objektum-URL-je az eseménykezelőben készül, és csere, törlés, az oldal elhagyása után
  felszabadul. A fogadóterületen kívülre dobott fájlt a böngésző nem nyitja meg (az űrlap nem vész el).
- **Mezők:** cím, leírás, kategória, ár a szerver szabályaival (`validateUploadFields`; a mezők közös
  hookja a `useForm` – a belépés és a regisztráció is ezt használja); az ár tagoltan is beírható
  (`12 500`). A kategóriák hibája a választó leírásában, „Kategóriák újratöltése” gombbal.
- **Feltöltés:** `XMLHttpRequest` (`api/upload.api.ts`) a haladás miatt, a fetch-burkolóval közös
  borítékkezeléssel; haladásjelző (`progressbar`, egész százaléknál frissül, az első esemény előtt
  határozatlan), „Mégse” – amíg a törzs el nem ment (`onSent`); utána „a szerver feldolgozza” állapot
  megszakítás nélkül (a szerver a megkezdett feldolgozást úgysem állítaná le, a kép elkészülne).
  Elnavigáláskor megerősítés (`useBlocker`: Maradok / Mégis elhagyom), bezárás előtt a böngésző kérdez
  (`useBeforeUnload`); az elhagyott oldal feltöltése a háttérben befejeződik.
- **Hibák a helyükön:** 409 (azonos vagy hasonló kép) kártya a szerver üzenetével, a dHash-távolsággal
  és – ha a meglévő kép nyilvános vagy a sajátja – annak adataival (`DuplicateNotice`); a kép hibája
  (`IMAGE_TOO_SMALL`, `IMAGE_TOO_LARGE`, `LOW_DETAIL_IMAGE`, `UNSUPPORTED_IMAGE`, `PAYLOAD_TOO_LARGE`)
  a fogadóterületnél; a mezőhiba a mezőnél; más hiba riasztás a küldő gomb mellett (`RATE_LIMITED`,
  `SERVER_BUSY`: a várakozás idejével; `INVALID_UPLOAD`: „próbáld újra”); a lejárt munkamenet (401)
  kijelentkezett állapotba visz.
- **Állapotkövetés:** a 201 után állapotkártya (`RegistrationStatus`): a lépések (feltöltve →
  ujjlenyomat, nincs egyezés → rögzítés a láncon → hitelesítve), a függő tranzakció hivatkozása
  (`pendingTransaction`), majd a tanúsítvány tranzakciója ugyanabban a sorban; a lekérdezés
  3 másodpercenként (`pollInterval.ts`: két perc után 30 másodperc, tíz perc után leáll, 404-re leáll,
  429-nél a `Retry-After` szerint vár). A gyorsítótárat a 201 válasza tölti fel régi keltezéssel (az
  adatlap nem tekinti frissnek; kijelentkezéskor kiürül). Hitelesítéskor a galéria listái
  érvénytelenednek.
- **Fókusz és bemondás:** az űrlap helyére lépő kártya címe kapja a fókuszt; Mégse után a küldő gomb;
  elutasított fájlnál a fájlválasztó (ha a „Kép cseréje” gombon volt a fókusz), különben rejtett
  riasztás; a kiválasztást, az indulást, a sikert, a megszakítást, a hitelesítést az élő régió mondja
  be; a sikertelen regisztráció és a 409 riasztás.

## Vásárlás és vezérlőpult (L22)

- **Fizetés indítása:** az adatlapon a bejelentkezett, nem vásárló néző „Megveszem” gombja
  (`PurchaseBox`) a `POST /api/orders/checkout` végpontot hívja (`api/orders.api.ts`), és a válasz
  `checkoutUrl` címére irányít (`lib/redirect.ts`) – de csak akkor, ha az pontosan a Stripe hosztolt
  fizetési oldalának eredete (`https://checkout.stripe.com`, port és belépési adat nélkül –
  `isStripeCheckoutUrl`); bármi más váratlan válasz (riasztás, nincs átirányítás). A gomb az
  átirányításig foglalt (a dupla kattintás nem indít második fizetést); a hiba a gomb leírásaként
  elhangzó riasztás. Ha a szerver szerint már megvette (`409 ALREADY_PURCHASED`) vagy a kép eltűnt
  előle (404), az adatlap újratöltődik, és az mondja el a helyzetet. A kártyaadat a Stripe oldalán
  marad; a tesztfizetés a Stripe tesztkártyájával történik.
- **Visszatérési oldalak:** `/checkout/success?session_id=…` (`CheckoutSuccessPage`) csak a szerver
  formájú munkamenet-azonosítóval (`cs_test_…`) indít kérést; a rendelést 3 másodpercenként kérdezi
  (`GET /api/orders/by-session/:id`, `pollInterval.ts`: két perc után ritkábban, tíz perc után
  leáll), amíg `PENDING`; `PAID` után a rendelés adatai és az eredeti letöltése (vagy magyarázat, ha a
  képet a moderátor közben levette), bemondással – az adatlap (`viewer.purchased`) és a vásárlásaim
  gyorsítótára érvénytelenedik. A lejárt/sikertelen fizetés, a más fiók rendelése (404) és a betöltési
  hiba saját nézetet kap. `/checkout/cancel?photoId=…` (`CheckoutCancelPage`): nem történt terhelés,
  vissza a képhez (csak UUID azonosítóval) vagy a galériába. Mindkettő védett útvonal.
- **Vezérlőpult (`/dashboard`):** a fül és az oldal az URL-ben (`dashboard/dashboardParams.ts`:
  `?tab=kepeim|vasarlasaim`, `?page=`), ezért a fülek hivatkozások (`nav` + `aria-current`), nem
  ARIA-fülsor; a fülön a darabszám. Mindkét listát a `DashboardPage` kérdezi (a nem aktív fülét az
  első oldalon), a fül- és oldalváltást az élő régió mondja be (`dashboard/listSummary.ts`).
- **Saját képeim (`OwnPhotosTab`):** `GET /api/me/photos` lapozva; soronként bélyegkép (`Thumbnail`),
  a cím hivatkozás az adatlapra, dátum, állapotjelvény a magyarázattal (`ownPhotoStatus.ts`:
  Hitelesítve · Regisztrálás folyamatban a függő tranzakció linkjével · Sikertelen regisztráció
  „Az adminisztrátor újrapróbálja” · Elrejtve „Te vetted le” · Moderátor eltávolította „Miért?”
  feltáró magyarázattal), ár (rejtett „Ár:” címkével), műveletek a kép nevével („Szerkesztés: …”,
  „Levétel: …”). Amíg van regisztrációra váró kép, a lista 3 másodpercenként frissül; a hitelesítést
  bemondja, és a galéria listái érvénytelenednek. Mobilon kártyák, szélesebb képernyőn táblázatszerű
  sorok (az oszlopfejléc csak vizuális).
- **Szerkesztés és levétel párbeszédablakban** (`ui/Dialog.tsx` – natív `<dialog>`, `showModal()`: a
  háttér nem érhető el, az Escape bezárja, a fókusz a megnyitó gombra tér vissza): a szerkesztő a
  feltöltés mezőit és szabályait használja (`PhotoFormFields`, `useForm` kiinduló értékekkel), a
  mentés `PATCH /api/photos/:id` a szerver formájában; a levétel megerősítése a következményt mondja
  el (végleges; a vevők továbbra is letölthetik; a láncon a rekord megmarad), a fókusz a „Mégse”
  gombon indul, siker után a sor „Elrejtve” lesz, és a fókusz a kép címére kerül (a műveletek
  eltűntek). Siker után a lista gyorsítótára azonnal frissül (`setQueriesData`), majd a lista, az
  adatlap és a galéria érvénytelenedik; a hiba az ablakban marad. A tesztekhez a jsdomnak a `<dialog>`
  nyitását/zárását a `test/dialog.ts` pótolja.
- **Vásárlásaim (`PurchasesTab`):** `GET /api/me/purchases` lapozva; soronként a kép, a fotós neve, a
  fizetés napja és az ár, a letöltés a szerver védett címén (`downloadable`), a saját értékelés
  („Értékelted: 4 / 5”) vagy az „Értékelés írása” hivatkozás az adatlapra (`reviewable`; az űrlap az
  L23-ban készül el); a moderátor által levett kép sora megmarad, de nem tölthető le.
- **Navigáció:** bejelentkezve a fő navigációban és a fiókmenüben „Vezérlőpult”.

## Fotósprofil és értékelések (L23)

- **Fotósprofil (`/users/:id`, `ProfilePage`):** `GET /api/users/:id` – a név monogrammal, a
  csatlakozás ideje, a hitelesített képek száma, az átlagos értékelés (`RatingSummary`, csak a
  nyilvános képek értékeléseiből) és a bemutatkozás szövegként (a sortörései megmaradnak, HTML soha);
  a képek rácsa a galéria végpontjával (`GET /api/photos?ownerId=…`, lapozva, az oldal az URL-ben – a
  lapozás után a fókusz az összesítésre kerül). Az azonosító csak UUID-ként indít kérést; a nem
  létező vagy letiltott felhasználó (404) saját oldalt kap. A fotós neve az adatlapon a profiljára
  mutat; a fiókmenüben „Profilom”.
- **Saját profil:** „Profil szerkesztése” párbeszédablak (`users/EditProfileDialog`; a szabályok a
  regisztrációéi és a szerveréi – `users/profileValidation.ts`): `PATCH /api/me`, siker után a
  munkamenet (fejléc), a profil (csak ha a válasz ugyanaz a fiók), a galéria kártyái és az adatlapok
  frissülnek, a fókusz a gombra tér vissza. A profil kártyáinak címe h3 (a „Képek” h2 alatt).
- **Értékelés írása (`photos/ReviewForm`):** csak a kép vásárlójának (`viewer.canReview` – a szerver
  ugyanezt ellenőrzi a `POST /api/photos/:id/reviews` kérésnél), az értékelések elején (`#ertekeles`
  – a vásárlásaim hivatkozásának célja). A csillag natív rádiócsoport (`RatingInput`: „1 csillag” …
  „5 csillag”, nyilakkal is választható), a vélemény nem kötelező (`reviews/reviewValidation.ts`:
  legfeljebb 1000 kódpont, vezérlőkarakter nélkül, látható karakterrel). Siker után a lista és az
  adatlap frissül, az űrlap eltűnik, a fókusz az új értékelésre kerül, a köszönet elhangzik; a
  galéria, a vásárlásaim és a profil gyorsítótára érvénytelenedik. A szerver 403/409 válaszára az
  adatlap (409-nél a lista is) frissül, az eltűnő űrlapról a fókusz a saját értékelésre vagy a
  szakasz címére kerül, és az üzenet elhangzik; 404-re (a kép közben eltűnt) az oldal „nem
  található” lesz; a mezőhiba a mezőnél, más hiba riasztás a gomb leírásaként. A vásárlásaim
  hivatkozása (`#ertekeles`) az űrlap címére görget és fókuszál – aki nem értékelhet, annál az
  értékelések címére. A fókuszkérések egyszeriek, és a lista gyorsítótárának frissítési idejéhez
  kötöttek: a megfigyelő állapota csak később követi a gyorsítótárat.
- **Saját értékelés törlése:** a néző értékelése jelölve („A te értékelésed”), a törlés megerősítő
  ablakban (`DeleteReviewDialog`, `DELETE /api/reviews/:id`); siker után – és akkor is, ha a szerver
  szerint az értékelés már nincs meg (404) – a lista és az adatlap frissül, a fókusz az értékelések
  címére kerül, és a kép újra értékelhető (a szervernek nincs módosítása: törlés, majd új értékelés).

## Hitelesség-ellenőrzés (L24)

- **Oldal (`/verify`, `VerifyPage`):** nyilvános, bejelentkezés nélkül; a fejlécben „Ellenőrzés”
  menüpont. Két űrlap: a kép (`verify/VerifyFileForm` – a feltöltés fogadóterülete és
  kiválasztott-fájl doboza, a rövidebb oldal már 100 képponttól: `verify/verifyValidation.ts`;
  `POST /api/verify` XMLHttpRequest-tel, haladással és megszakítással – `api/multipart.ts`, a
  feltöltéssel közös; a fájl saját neve nem megy el) és a SHA-256 hash (`verify/VerifyHashForm` –
  `useForm`, a szerver sémáját tükröző ellenőrzés, `GET /api/verify/:sha256` `useMutation`-nel; a
  válasznak a kért hash-ről kell szólnia, különben váratlan válasz).
- **Eredmény (`verify/VerificationResult`):** a három eset a bizalom vizuális nyelvén
  (`resultStates.ts`, a hangnemek `ui/panelTones.ts`-ből – a zöld csak az igazolt hitelességé):
  VERIFIED a kép és a fotós hivatkozásával (ha a kép nyilvános) és a regisztráció adataival
  (`photos/proofRows.tsx` – a tanúsítvánnyal közös sorok; „A tranzakció adatai nem érhetők el”, ha nem
  ismertek), SIMILAR az eltérés bitjeivel (számmal, sávval és a képernyőolvasónak szöveggel) és az
  eredeti adatlapjával, NOT_FOUND a kiszámolt hash-sel (másolható). A kártya az űrlapok helyére lép:
  ha a fókusz elveszett (a megnyomott gomb eltűnt), a címére kerül – a cím leírása a magyarázat –,
  különben az élő régió mondja be. „Másik kép / hash ellenőrzése” üres űrlapot ad, a fókusz az indító
  vezérlőn. Az adatlista sorai (`ui/DefinitionRow`) 320 képpontos szélességen is tördelődnek.
- **Egyszerre egy ellenőrzés (`verify/verificationGate.ts`):** amíg az egyik űrlap kérése fut, a
  másik riasztással áll; a szerver kérte várakozás (`Retry-After` – 429, 503) alatt egyik sem indít
  kérést, a hátralévő idő a riasztásban. A képhiba (400, 413, 415) a fogadóterülethez kerül – a fókusz
  csak az űrlapból megy a fájlválasztóra, máshonnan rejtett riasztás szól –, a többi hiba riasztás a
  gomb mellett (a gomb leírásaként); az oldal elhagyása a futó kérést megszakítja.
- **Magyarázat (`verify/HowItWorks`):** három rövid kártya (SHA-256, dHash, blokklánc). Az adatlap
  tanúsítványának „Mit jelent ez?” hivatkozása a `/verify#hogyan-mukodik` címre visz
  (`verify/anchors.ts`); útvonalváltáskor a layout a cím célrészletére teszi a fókuszt, ha az a fő
  tartalomban van (`useRouteFocus` – ha az oldal maga már oda tette, nem viszi el; vissza-navigációnál
  az oldal címe kapja).

## Adminfelület (L25)

- **Oldal (`/admin`, `AdminPage`):** az `AdminRoute` alatt – bejelentkezés nélkül a belépésre visz,
  nem adminisztrátornak „Nincs jogosultság” oldal; a fejlécben „Admin” menüpont csak adminnak. Három
  független lekérdezés (`api/admin.api.ts`): a statisztika (`GET /api/admin/stats`), a felhasználók
  (`GET /api/admin/users`) és a képek (`GET /api/admin/photos`) oldala. A nézet az URL-ben van
  (`admin/adminParams.ts`: `q`, `blocked`, `usersPage`, `status`, `photosPage` – a két lista
  paraméterei függetlenek, a hibás érték az alapértelmezés, a szerver lekérdezése ebből készül). A
  válaszok futásidejű ellenőrzése: a rejtett kép és a `hiddenBy` összhangja, a tranzakció-hash alakja,
  a statisztika minden állapota egész számmal és az összegek egyezése; a módosító kérés válasza csak a
  kért elemé lehet.
- **Statisztika (`admin/StatCards`):** öt kártya leíró listában (felhasználók – tiltott, admin; képek
  és rendelések állapotonként; bevétel; hash a láncon), mobilon két oszlopban; hibánál újrapróbálás,
  siker után a fókusz a szakaszra.
- **Felhasználók (`admin/UsersSection`):** keresés névre és e-mailre (Enterre, a nézetet az URL-ben
  váltja), tiltási szűrő kapcsológombokkal (`admin/FilterGroup` – `aria-pressed`), táblázat
  (`admin/DataTable` – keskeny képernyőn vízszintesen görgethető, névvel ellátott, fókuszálható régió):
  név (a saját fiók „(te)”), e-mail, regisztráció, képek száma, állapot, művelet. Letiltás
  megerősítéssel (`admin/BlockUserDialog` – a következmények felsorolva, a tiltás feloldható),
  feloldás egy gombbal; adminisztrátor nem tiltható (szöveg a gomb helyett). A sor gombja ugyanaz az
  elem mindkét művelethez, így a fókusz rajta marad; az eredményt az élő régió mondja be – ha a sor a
  szűrt listából kikerül, azt is –, a feloldás hibája riasztás a táblázat fölött, a sor gombjának
  leírásaként. A futó kérések sorait a mutációs gyorsítótár adja (`admin/actionState.ts` –
  `useMutationState`), így egyszerre több sor művelete is pontosan foglalt és hibát jelez.
- **Képek (`admin/PhotosSection`):** állapotszűrő címkékkel és darabszámmal (a statisztikából),
  táblázat: bélyegkép és cím (az adatlapra), tulajdonos („(tiltva)”, ha az), állapot a bizalom
  vizuális nyelvén (`admin/adminPhotoStatus.ts`), feltöltés napja, művelet az állapot szerint: Elrejtés
  megerősítéssel (`admin/HideAdminPhotoDialog`), Visszaállítás (ha a tulajdonos is elrejtette, a kép
  rejtett marad – a bemondás ezt mondja), Újrapróbálás (csak sikertelen regisztrációnál; a kép újra
  várakozik; a korlátozás 429-e a várakozás idejével, és addig az újrapróbálás gombjai foglaltak); a
  függő képnél „várakozás a láncra”, a tulajdonos elrejtésénél „a tulajdonos döntése”. Amíg van
  várakozó kép, a lista 3 másodpercenként frissül (`upload/pollInterval.ts`; az újrapróbálás az
  időkeretet újraindítja), és amikor egy várakozó kép hitelesítve lett vagy sikertelen – vagy a szűrt
  listából emiatt kikerült –, az élő régió bemondja, a statisztika, a galéria és az adatlap frissül
  (`admin/registrationOutcome.ts`).
- **Gyorsítótár (`admin/adminCache.ts`):** a művelet után a sor azonnal a szerver válaszából frissül
  minden betöltött oldalon, aztán az admin lekérdezései, a galéria, az adatlapok és a fotósprofil
  érvénytelenednek; a szerver hibája után (a módosítás meg is történhetett) a lista újratöltődik – a
  kliens hibájánál (400) és a korlátozásnál (429) nem. A szűrés és a lapozás után, az új lista
  megérkezésekor a fókusz a találatszámra kerül (`dashboard/listSummary.ts` – a vezérlőpulttal
  közös), és a lapozás nem görgeti az oldal tetejére; ha a művelet gombja eltűnt a sorból, a fókusz a
  sor elejére, ha pedig a frissített sor a szűrt listából kikerült a fókusszal együtt, a helyére lépő
  sor elejére vagy a lista elejére (`admin/useRowFocus.ts`); a megerősítő ablak bezárásakor eltűnt
  megnyitó gomb helyett a sor eleje kapja a fókuszt (`ui/Dialog` `fallbackFocus`).

## Akadálymentesség (WCAG 2.2 AA)

Ugrólink a fő tartalomra; tájékozódási pontok (fejléc, „Fő navigáció”, fő tartalom, lábléc); minden
oldalnak egyedi címe van („Oldal · PhotoChain”); oldalváltáskor a fókusz görgetés nélkül az új oldal
címére kerül (`lib/focus.ts`, `hooks/useRouteFocus.ts`); egyetlen, végig jelen lévő élő régió a nem
hibajellegű bejelentéseknek (néhány másodperc után kiürül), a hibák `role="alert"` dobozban; a
foglalt gomb `aria-disabled`, és állapotváltáskor is ugyanaz az elem marad (a fókusz nem vész el);
jól látható fókuszkeret; az átmenetek és animációk csak `motion-safe`; az ikonok dekoratívak
(`aria-hidden`), az állapotot mindig szöveg is kifejezi. A tesztek StrictMode-ban futnak, és
axe-core-ral is ellenőrzik az oldalakat – teljes oldalnál a best-practice szabályokkal (tájékozódási
pontok, címsorrend) együtt; a színkontrasztot a `tools/design/contrast.mjs` ellenőrzi, mert a jsdom
nem számol elrendezést. A fetch-csonk (`test/fetch.ts`) az egyszerre induló kérések válaszát
útvonalhoz köti (a sorrendjük nem számít), és a teszt végén fel nem használt válasz a tesztet buktatja
– így sem fölösleges, sem elmaradt kérés nem marad észrevétlen; a köztes állapotot (betöltés, foglalt
gomb, fókusz) késleltetett válasz teszi láthatóvá.

Űrlapok (L19): látható címkék, jelszókezelőhöz illő `autocomplete`, engedélyezett beillesztés (3.3.8);
a hiba a mező mellett, ikonnal és szöveggel, a fókusz az első hibás mezőre kerül – ha már ott van
(Enterrel küldte be), rejtett riasztás mondja el a mező nevével; gépelés közben csak a már látható hiba
frissül. A kliensoldali ellenőrzés (`auth/validation.ts`) a szerver Zod-sémájának szabályait követi – a
hosszt is, mint a Zod 4, kódpontban méri –, a végső döntés a szerveré. A jelszó megjeleníthető (váltógomb a mező után, `aria-pressed`), beküldéskor újra rejtett. A
fiókmenü disclosure-minta (Escape, kívülre kattintás – Safariban is); a sikerüzenet az új oldalon, a
fókusz áthelyezése után hangzik el.

Csiszolás (L26): a műveletek eredménye (mentés, levétel, értékelés, másolás, be- és kijelentkezés,
a lánc-regisztráció kimenete, az admin műveletei) látható értesítés is – ugyanaz az élő régió rövid
fekete dobozként a képernyő alján (`announce(…, { visible: true, tone })`): egyszer hangzik el, a
sikeré a pipa, a sikertelen kimeneté (a regisztráció nem sikerült, a szerver elutasította a kérést)
a figyelmeztető ikon, a semleges változásé (egy kép kikerült a szűrt listából) az „i”. Az értesítés
kiegészítő visszajelzés – az eredmény az oldalon is látszik –, ezért az eltűnése nem időkorlát
(2.2.1); mégis legalább 5 másodpercig látszik, rámutatáskor nem tűnik el, az Escape eltünteti (ha
eltakarna valamit – 2.4.11, a görgetés alul `scroll-padding`-gal is kerüli), nincs benne kezelőelem,
és érintőképernyőn nem fogja el a koppintást. Egy üzenethely van: az újabb bejelentés a korábbit
váltja. Amíg modális párbeszédablak van nyitva, a bejelentések várnak (a háttér inert), és az ablak
bezárása után egybefűzve hangzanak el; a folyamat közbeni állapotok rejtett bejelentések maradnak.
Elrendezés-ugrás (CLS) ellen: a munkamenet ellenőrzése alatt a fejléc fiókrészének helyét a
belépési hivatkozások rejtett mása foglalja; az egész oldalas betöltésjelző (`LoadingView`: adatlap,
profil, a munkamenet ellenőrzése) a hajtásig ér, így a lábléc nem ugrik; az admin statisztikájának
kártyái és a listák táblázata helyén a betöltés alatt ugyanakkora váz áll; az adatlap előnézetének
kerete a kép méretarányát előre foglalja; a görgetősáv helye állandó (`scrollbar-gutter: stable`).
A galéria hosszú helykitöltője keskeny mezőben három ponttal rövidül; a vendég induló
munkamenet-ellenőrzése a szerver `user: null` válaszával nem hiba (nem kerül a böngésző
konzoljába), a használhatatlan sütit a szerver törli. Az értékelés rádiócsoportján a kötelezőség és
a hiba a `radiogroup`-é (ARIA). A JSX statikus akadálymentességi hibáit az `eslint-plugin-jsx-a11y`
fogja meg (`npm run lint:a11y`, külön `eslint.a11y.config.js`; a szándékos `role="list"`, a
görgethető táblázat-régió és a párbeszédablakok `autoFocus`-a beállítással engedett; a bővítmény
peer-függősége még ESLint 9-et nevez meg, ezért a `package.json` `overrides` mezője erre az egy
függőségre a projekt ESLint-jét írja elő). A Lighthouse-audit eredménye és a mobilnézetek a
fejlesztési naplóban.

## Parancsok

```bash
npm run dev        # http://localhost:5173 (kötött port; a szerver a 4000-esen fusson)
npm test           # tesztek
npm run coverage   # lefedettség (küszöb: 80%)
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run build      # produkciós build (dist/)
npm run preview    # a build kipróbálása (4173-as port, ugyanazzal a proxyval)
```

Megjegyzés: az ESLint-konfiguráció a create-vite sablonja; a JSX akadálymentességét az
`eslint-plugin-jsx-a11y` (`npm run lint:a11y`, a `lint` része) és az axe-core tesztek ellenőrzik.
