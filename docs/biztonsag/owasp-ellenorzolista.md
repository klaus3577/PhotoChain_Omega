# Biztonsági átvizsgálás – OWASP Top 10:2025 ellenőrzőlista (L30)

A PhotoChain prototípus biztonsági átvizsgálása az OWASP Top 10 aktuális, 2025-ös kiadása [S51]
és az OWASP Cheat Sheet Series [S52] alapján. A dokumentum a dolgozat „Tesztelés és értékelés”
fejezetéhez készült: tételenként leírja, mit ellenőriztünk, hol van a kódban, mi lett az
eredmény, és mi maradt elfogadott kockázat.

## Módszer

- **Hatókör:** a szerver (`server/`, Express 5, Prisma, PostgreSQL), a kliens (`client/`, React),
  az okosszerződés (`blockchain/`, Solidity 0.8.34, OpenZeppelin 5.6.1), a CI-folyamat
  (`.github/workflows/ci.yml`) és mind az öt csomagjegyzék (gyökér, `blockchain/`, `server/`,
  `client/`, `e2e/`). Az éles üzemeltetés (konténer, reverse proxy, felhő) az L31–L32 lépés
  része; az ottani teendőket a 7. fejezet sorolja fel – az L32 (élesítés) után frissítve: mi
  teljesült, és mi maradt elfogadott korlát.
- **Kiinduló állapot:** az L29 utáni kód (`123a4ce` a fejlesztői repóban), 2026. október 12.
- **Eljárás:**
  1. Két független, csak olvasó kódátnézés (OWASP-lista szerinti biztonsági átnézés,
     illetve a szerződés és a platform-kulcs átnézése).
  2. Kiegészítő ellenőrzés és mérés.
  3. `npm audit` mind az öt helyen.
  4. A javítások teszt-elsővel készültek (előbb a bukó teszt), utána egy harmadik, független
     átnézés vizsgálta őket (eredmény: „javításokkal elfogadható”; az 1 közepes és 4 alacsony
     találat javítása is teszt-elsővel készült).
  5. Mutációs próba: 8 szándékos rontás a kritikus sorokban – mind a nyolcat elkapták a tesztek.
  6. A biztonsági fejléceket és a javításokat a futó szerveren is ellenőriztük (fekete dobozos próba).
- **Az elhalasztott tételek:** az L08–L29 lépések L30-ra halasztott tételeit egy listába gyűjtöttük;
  mindegyikről döntés született: kis kódjavítás most (5. fejezet), vagy elfogadott korlát indoklással
  (6. fejezet).

**Jelölések az Eredmény oszlopban:**

| Jelölés            | Jelentés                                                       |
| ------------------ | -------------------------------------------------------------- |
| Rendben            | A védelem megvan, és teszt igazolja.                           |
| Javítva, L30       | Ebben a lépésben készült, teszt-elsővel.                       |
| Elfogadott         | Ismert korlát, az indoklása a 6. fejezetben van.               |
| Teljesült, L31/L32 | Az éles üzemeltetés lépésében készült el (7. fejezet).         |
| Elfogadott (7.)    | Az éles üzemeltetés ismert korlátja, indoklással (7. fejezet). |

A hivatkozások `fájl:sor` alakúak, a `server/src/…`, `client/src/…`, `blockchain/…` útvonalak a
repó gyökeréhez képest.

## 1. Összefoglaló

| Kategória                                  | Eredmény                                                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control                  | Rendben – minden védett erőforrás szerveroldalon ellenőrzött; elfogadott korlátok: 2 apró tétel (a `/media` 2026-10-27-én javítva, 8.)                                                                                |
| A02 Security Misconfiguration              | Rendben – helmet-fejlécek; éles mód, `Permissions-Policy`, mért proxyugrások (L31–L32)                                                                                                                                |
| A03 Software Supply Chain Failures         | Javítva, L30 – `npm audit fix` után mind az öt helyen 0; 2026-10-28-án újra: négy helyen 0, a `blockchain/` fejlesztői eszközláncában 13 magas (egy zod-tanácsadás a Hardhat 3-on át, javítás nélkül) elfogadva (3.1) |
| A04 Cryptographic Failures                 | Rendben – bcrypt (12), HS256-ra rögzített JWT, TLS a külső kapcsolatokra (az adatbázishoz CA-ellenőrzéssel, L32)                                                                                                      |
| A05 Injection                              | Rendben – paraméterezett lekérdezések, React-escape; a rejtett karakterek kiszűrése javítva, L30                                                                                                                      |
| A06 Insecure Design                        | Javítva, L30 – napi feltöltési keret (tárca-kimerítés ellen), foglalt nevek, EXIF-figyelmeztetés                                                                                                                      |
| A07 Authentication Failures                | Javítva, L30 – fiókonkénti belépési korlát az IP-korlát mellett                                                                                                                                                       |
| A08 Software or Data Integrity Failures    | Rendben – webhook-aláírás, tartalom szerinti képellenőrzés, `onlyOwner` szerződés                                                                                                                                     |
| A09 Security Logging and Alerting Failures | Javítva, L30 – biztonsági eseménysorok (belépés, jogosultság, CSRF, lánc-állapot)                                                                                                                                     |
| A10 Mishandling of Exceptional Conditions  | Javítva, L30 – a kliens okozta 4xx hibák nem 500-ak; határidő a feltöltés törzsére                                                                                                                                    |

**Talált hibák súlyosság szerint:**

- Kritikus és magas: nem volt.
- Közepes:
  - **A06:** bábfiókokkal kimeríthető platform-tárca. Javítva.
  - **Szerződés:** a szerver egyetlen online kulcsa egyben a tulajdonos is. Elfogadott, kezelési
    eljárással (8. fejezet).
- Alacsony, javítva:
  - a kliens által kiváltható 500-as válasz;
  - a hiányzó biztonsági naplósorok;
  - az EXIF/GPS-figyelmeztetés hiánya;
  - a szerződés tulajdonosi tesztjei;
  - az időszakos tulajdonos- és egyenlegellenőrzés.
- Alacsony, elfogadott, indoklással:
  - e-mail-felsorolás a regisztrációnál;
  - gyakori jelszavak tiltólistája;
  - a CI-akciók rögzítése (SHA-pin).

## 2. Ellenőrzőlista kategóriánként

### A01:2025 – Broken Access Control (hozzáférés-szabályozás)

| Ellenőrzés                                                                                                                                                                                   | Hol                                                                                                                                                 | Eredmény                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Az eredeti fájl letöltése csak a tulajdonosnak és a kifizetett (PAID) rendelés vevőjének; nem látható képre 404, láthatóra 403 (naplózva); az admin levétele után a vevő sem tölthet le      | `server/src/modules/photos/photos.download.ts:53`, `:64`, `:84`, `:91`; útvonal: `photos.routes.ts` (`noStore`, `requireAuth`, egyidejűségi korlát) | Rendben (tests/db/photos.download.test.ts)       |
| Az eredeti fájl URL-en nem érhető el: a `/media` csak a nyilvános mappát szolgálja ki, mappalista és rejtett fájl nélkül (L32: távoli tárhelynél csak a két nyilvános mappát adja tovább)    | `server/src/app.ts:249-270` (`index: false`, `dotfiles: 'deny'`), `server/src/middleware/mediaProxy.ts:30`                                          | Rendben (tests/db/media.test.ts)                 |
| Az admin útvonalak: bejelentkezés + ADMIN szerepkör, minden válasz `no-store`                                                                                                                | `server/src/modules/admin/admin.routes.ts:74`                                                                                                       | Rendben (tests/db/admin.access.test.ts)          |
| Kép módosítása csak a tulajdonosnak; elrejtése a tulajdonosnak vagy az adminnak; idegen kérésre 404 (nem látható) vagy 403 (naplózva)                                                        | `server/src/modules/photos/photos.catalog.ts:351-358`, `:375-379`                                                                                   | Rendben                                          |
| Értékelés csak a kép kifizetett vásárlójától, saját képre nem; törlés a szerzőnek vagy az adminnak                                                                                           | `server/src/modules/reviews/reviews.service.ts:117-131`, `:147`                                                                                     | Rendben                                          |
| Saját kép nem vásárolható; a rendelés állapota csak a saját munkamenetre kérdezhető le                                                                                                       | `server/src/modules/orders/orders.service.ts:213-216`, `:533-537`                                                                                   | Rendben                                          |
| IDOR: minden `:id` UUID-sémán megy át, és objektumszintű láthatósági ellenőrzést kap; a `/api/me` a munkamenetből veszi a felhasználót                                                       | `server/src/lib/schemas.ts` (`idParamsSchema`), `server/src/modules/photos/photos.visibility.ts:31`, `:57`                                          | Rendben                                          |
| CSRF: SameSite=Lax süti + a `Sec-Fetch-Site` ellenőrzése a törzs feldolgozása előtt (a multipart feltöltést egy idegen űrlap is elküldhetné)                                                 | `server/src/lib/sessionCookie.ts:20`, `server/src/middleware/sameOrigin.ts:54-66`, `server/src/app.ts:143`                                          | Rendben                                          |
| Idegen oldalról indított költséges olvasás (keresés, hitelesség-ellenőrzés) tiltva; nincs CORS                                                                                               | `server/src/middleware/sameOrigin.ts:38-44`, `server/src/modules/photos/photos.routes.ts` (`rejectCrossSiteReads`)                                  | Rendben                                          |
| A kliens útvonal-védelme (ProtectedRoute, AdminRoute) csak kényelmi; minden döntést a szerver hoz                                                                                            | `client/src/routes/router.ts`                                                                                                                       | Rendben                                          |
| A `/media` a fájl kiadása előtt az adatbázisból ellenőrzi a kép láthatóságát (állapot, a fotós tiltása): a letiltott fotós és a nem nyilvános kép fájlja másnak 404 (témavezetői észrevétel) | `server/src/middleware/mediaAccess.ts:98-143`, `server/src/app.ts:249-270`                                                                          | Javítva, 2026-10-27 (8.; tests/db/media.test.ts) |

### A02:2025 – Security Misconfiguration (hibás beállítás)

| Ellenőrzés                                                                                                                                                                                                                                                                                                | Hol                                                                                                  | Eredmény           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ |
| Biztonsági fejlécek a helmet alapbeállításával: CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, COOP/CORP `same-origin`; az `X-Powered-By` eltávolítva                                                                                                                           | `server/src/app.ts:103-112`; a futó szerveren ellenőrizve (L30_06 kép)                               | Rendben            |
| Általános hibaválasz a váratlan hibára, a részletek csak a naplóba                                                                                                                                                                                                                                        | `server/src/middleware/errorHandler.ts:49`, `:178`                                                   | Rendben            |
| A JSON-törzs felső korlátja 100 kB; a webhook nyers törzse külön korláttal                                                                                                                                                                                                                                | `server/src/app.ts:60`, `server/src/modules/orders/stripe.webhook.ts:81`                             | Rendben            |
| A titkos kulcsok csak környezeti változóban; a repóban csak a `.env.example` (értékek nélkül); a szerver indításkor ellenőrzi a formátumukat                                                                                                                                                              | `server/src/config/env.ts:125`, `:201`, `:205`; `.gitignore`                                         | Rendben            |
| `trust proxy` és a süti `Secure` jelzője csak `NODE_ENV=production` mellett – ha élesben elmarad, a süti http-n is mehet, a korlátok a proxy IP-jét látják. Élesben (Render) `NODE_ENV=production`, a proxyugrások száma mérve (3): a korlát kulcsa a látogató címe, a hamis `X-Forwarded-For` hatástalan | `server/src/app.ts:78`, `server/src/lib/sessionCookie.ts:20`, `render.yaml:30-31`; mérés: L32_10 kép | Teljesült, L31/L32 |
| `Permissions-Policy` fejléc (OWASP HTTP Headers Cheat Sheet) és a kiszolgált kliens HTML-jének fejlécei (`frame-ancestors`)                                                                                                                                                                               | `server/src/app.ts:116`; az élő oldalon ellenőrizve (L32_09 kép)                                     | Teljesült, L31/L32 |

### A03:2025 – Software Supply Chain Failures (ellátási lánc)

| Ellenőrzés                                                                                                                                                                                   | Hol                                                                                          | Eredmény             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------- |
| `npm audit` mind az öt helyen: előtte 2 kritikus, 1 magas, 8 alacsony; utána 0 (3. fejezet); 2026-10-28-án újra (3.1)                                                                        | `package-lock.json` (gyökér, `server/`, `blockchain/`)                                       | Javítva, L30         |
| Lockfile minden csomagban (csak a registry.npmjs.org-ról, integritás-hash-sel); a CI `npm ci`-t futtat                                                                                       | `.github/workflows/ci.yml:78-82`                                                             | Rendben              |
| A CI tokenje csak olvasható, a checkout nem őrzi meg a hitelesítő adatot, `pull_request` (nem `_target`)                                                                                     | `.github/workflows/ci.yml:26-27`, `:60`                                                      | Rendben              |
| A biztonságkritikus csomagok pontos verzióra rögzítve (sharp 0.35.5, OpenZeppelin 5.6.1, solc 0.8.34)                                                                                        | `server/package.json`, `blockchain/package.json`, `blockchain/contracts/PhotoRegistry.sol:2` | Rendben              |
| A GitHub Actions főverzió-címkével rögzítve (nem commit-hash-sel)                                                                                                                            | `.github/workflows/ci.yml`                                                                   | Elfogadott (L27, 6.) |
| A Docker-alapkép pontos verzióra és tartalmi ujjlenyomatra (digest) rögzítve; a frissítéseket a Dependabot hetente javasolja (npm, Docker, GitHub Actions; a bemutatópéldányban kikapcsolva) | `Dockerfile:21`, `.github/dependabot.yml`                                                    | Teljesült, L32       |

### A04:2025 – Cryptographic Failures (kriptográfiai hibák)

| Ellenőrzés                                                                                                                                                                                                                                                                                  | Hol                                                                           | Eredmény       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------- |
| Jelszó: bcrypt, 12-es költség (mérve: kb. 0,29 s/hash ezen a gépen), legfeljebb 72 bájt, ismeretlen címre is lefut egy összevetés                                                                                                                                                           | `server/src/lib/password.ts:7`, `:16`, `:24`                                  | Rendben        |
| Munkamenet: HS256-ra rögzített JWT, 7 napos `maxAge`, legalább 32 karakteres titok                                                                                                                                                                                                          | `server/src/lib/jwt.ts:10`, `:13`, `:36-37`; `server/src/config/env.ts:125`   | Rendben        |
| Titkosított kapcsolat: az RPC- és a kliens-URL csak https (http csak a helyi gépre)                                                                                                                                                                                                         | `server/src/config/env.ts:182`, `:239`                                        | Rendben        |
| A Stripe-webhook HMAC-aláírása a hivatalos könyvtárral ellenőrizve                                                                                                                                                                                                                          | `server/src/modules/orders/stripe.webhook.ts:65`                              | Rendben        |
| A távoli adatbázis TLS-e: a kiszolgáló tanúsítványa a Supabase CA-jához ellenőrzött (`DATABASE_SSL_CA_FILE`, `rejectUnauthorized: true`); élesben enélkül a szerver el sem indul; a CA mellett az URL `ssl`-paramétere tiltva (felülírná). Rossz CA-val a kapcsolat megtagadva (L32_07 kép) | `server/src/config/env.ts:313-314`, `:320-329`; `server/src/lib/prisma.ts:54` | Teljesült, L32 |

### A05:2025 – Injection (befecskendezés, XSS)

| Ellenőrzés                                                                                                                                                  | Hol                                                                                                   | Eredmény      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| SQL: minden lekérdezés a Prisma paraméterezett API-ján; nyers SQL csak címkézett sablonnal, felhasználói adat nélkül; `*Unsafe` hívás nincs                 | `server/src/lib/prisma.ts:104`, `server/src/lib/truncateAll.ts:9` (csak teszt/szkript)                | Rendben       |
| A keresőszó LIKE-mintájának különleges karakterei (`%`, `_`, `\`) escape-elve                                                                               | `server/src/lib/search.ts:15`                                                                         | Rendben       |
| Szigorú bemeneti sémák (Zod): ismeretlen mező hiba, a szerepkör nem küldhető                                                                                | `server/src/lib/schemas.ts` (`strictBody`, `patchBody`), `server/src/modules/auth/auth.schemas.ts`    | Rendben       |
| Vezérlő- és írásirány-váltó karakterek tiltva minden szabad szöveges mezőben                                                                                | `server/src/lib/text.ts:14`, `:17-18`                                                                 | Rendben       |
| A rejtett (láthatatlan) karakterek kiszűrése a névből, a címből, a leírásból és a bemutatkozásból (eddig csak a véleményből)                                | `server/src/lib/schemas.ts:93`, `:101`; `auth.schemas.ts:59`, `photos.schemas.ts`, `users.schemas.ts` | Javítva, L30  |
| XSS: a kliens minden adatot React-szövegként jelenít meg (`dangerouslySetInnerHTML` és `innerHTML` nincs); külső hivatkozás `rel="noopener noreferrer"`-rel | `client/src/components/photos/ExplorerLink.tsx:20`                                                    | Rendben       |
| A Stripe-ra és a belépés után visszairányító cím ellenőrzése (nyílt átirányítás ellen)                                                                      | `client/src/api/orders.api.ts:102-104`, `client/src/auth/session.ts`                                  | Rendben       |
| A letöltött fájl neve (Content-Disposition) könyvtárral, tisztítás után                                                                                     | `server/src/lib/download.ts`                                                                          | Rendben       |
| CSP mint második védvonal: az API válaszain a helmet alap-CSP-je; a kiszolgált kliens HTML-jének CSP-je                                                     | `server/src/app.ts:103-112`                                                                           | Rendben / L31 |

### A06:2025 – Insecure Design (nem biztonságos tervezés)

| Ellenőrzés                                                                                                                                                                                                            | Hol                                                                                              | Eredmény        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| Az ár a szerveren rögzül a fizetés indításakor; a webhook az összeget és a pénznemet is ellenőrzi                                                                                                                     | `server/src/modules/orders/orders.service.ts:460-473`, `:287`                                    | Rendben         |
| A platform-tárca kimerítése (minden feltöltés egy, a platform által fizetett tranzakció): **napi feltöltési keret fiókonként (30) és a platformon összesen (500)**, az adatbázisból számolva, a fájl beolvasása előtt | `server/src/modules/photos/photos.quota.ts:31`, `server/src/modules/photos/photos.routes.ts:148` | Javítva, L30    |
| A tárca további védelmei: csak teszthálózat, díjplafon (50 gwei), feltöltési korlát felhasználónként, admin-újrapróbálás adminonként korlátozva                                                                       | `server/src/config/env.ts:28`, `:195`; `photos.routes.ts`; `admin.routes.ts`                     | Rendben         |
| Foglalt megjelenített nevek („Adminisztrátor”, „PhotoChain …”) – NFKC, rejtett karakter, ékezet, összetéveszthető cirill/görög betű és számjegy nélkül összevetve; a rövid szavak (admin, support) önálló szóként is  | `server/src/lib/reservedNames.ts:65`, `:112`; `auth.schemas.ts:66`, `users.service.ts`           | Javítva, L30    |
| Az eredeti fájl metaadatai (EXIF, GPS) a vevőhöz kerülnek – figyelmeztetés a feltöltő oldalon                                                                                                                         | `client/src/pages/UploadPage.tsx` (a beküldés gomb alatt)                                        | Javítva, L30    |
| A hitelesség-ellenőrzés közös láncolvasási kerete néhány IP-címről kimeríthető (a kvótavédelem ára)                                                                                                                   | `server/src/modules/verification/verification.service.ts`                                        | Elfogadott (6.) |
| Aki elsőként tölti fel egy harmadik fél képét, az lesz a láncon a „hiteles” tulajdonos                                                                                                                                | –                                                                                                | Elfogadott (6.) |

### A07:2025 – Authentication Failures (hitelesítés)

| Ellenőrzés                                                                                                                                                                               | Hol                                                                         | Eredmény        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------- |
| IP-címenkénti korlát a belépésre és a regisztrációra (20 / 15 perc)                                                                                                                      | `server/src/modules/auth/auth.routes.ts:35`                                 | Rendben         |
| **Fiókonkénti korlát** a sikertelen belépésekre (10 / 15 perc, e-mail-címenként, a bcrypt előtt): az elosztott jelszó-próbálgatás ellen; nem létező fiókra ugyanígy (nem árul el semmit) | `server/src/modules/auth/auth.routes.ts:26`, `:44`, `:58`                   | Javítva, L30    |
| Felhasználó-felsorolás a belépésnél: egységes hibaüzenet, ismeretlen címre is lefut egy bcrypt-összevetés; a tiltás ténye csak a helyes jelszó után derül ki                             | `server/src/modules/auth/auth.service.ts:41-65`                             | Rendben         |
| A regisztráció foglalt címre 409-et ad (felsorolható)                                                                                                                                    | `server/src/modules/auth/auth.service.ts:35`                                | Elfogadott (6.) |
| A munkamenet-süti `httpOnly`, `SameSite=Lax`, 7 napos; a tiltást minden kérés az adatbázisból ellenőrzi (azonnal érvényes)                                                               | `server/src/lib/sessionCookie.ts:20`, `server/src/middleware/auth.ts:55-68` | Rendben         |
| Jelszószabály: 8 karakter – 72 bájt; gyakori jelszavak tiltólistája nincs                                                                                                                | `server/src/modules/auth/auth.schemas.ts:34-39`                             | Elfogadott (6.) |

### A08:2025 – Software or Data Integrity Failures (integritás)

| Ellenőrzés                                                                                                                                                  | Hol                                                                                                    | Eredmény     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| Stripe-webhook: a nyers törzs a JSON-feldolgozó előtt, aláírás-ellenőrzés, csak a teszt módú (`livemode === false`) esemény hat, a borítékot séma ellenőrzi | `server/src/app.ts:155-160`, `server/src/modules/orders/stripe.webhook.ts:65`, `:86`                   | Rendben      |
| Feltöltés: a típus a tartalomból (bűvös bájtok + a dekóder szerinti formátum), egyoldalas kép, képpontkorlát, csak a három engedett dekóder él, időkorlát   | `server/src/services/image.service.ts:119`, `server/src/services/imageDecoding.ts:14`, `:59`, `:79-80` | Rendben      |
| multer-korlátok: egyetlen fájl, méretkorlát, mezőszám                                                                                                       | `server/src/middleware/upload.ts:36-39`                                                                | Rendben      |
| Az ujjlenyomat a láncon csak a platform kulcsával írható (`onlyOwner`), felülírás nincs                                                                     | `blockchain/contracts/PhotoRegistry.sol:53`, `:56`                                                     | Rendben (8.) |

### A09:2025 – Security Logging and Alerting Failures (naplózás)

| Ellenőrzés                                                                                                                                                                                                                                                                | Hol                                                                                                                                       | Eredmény        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| A titkos értékek (RPC-URL és kulcsa, privát kulcs, JWT- és Stripe-titkok, adatbázis-jelszó, L32-től a Supabase-kulcs) minden naplósorban kitakarva; a beolvasás után a folyamat környezetéből is törlődnek (L32-től a Supabase-kulcs, a JWT-kulcs és az adatbázis-URL is) | `server/src/lib/logger.ts:32-48`, `server/src/config/env.ts:394`, `server/src/server.ts:114-120`                                          | Rendben         |
| A kérésnaplóban fejléc, süti és törzs nincs; a keresőszó, a hash és a Stripe-munkamenet az URL-ben kitakarva                                                                                                                                                              | `server/src/app.ts:87-90`, `server/src/lib/requestLogging.ts:35`, `:44`                                                                   | Rendben         |
| **Biztonsági eseménysorok** (warn szint, `event` mezővel, e-mail-cím és jelszó nélkül): sikertelen és tiltott fiókba irányuló belépés, jogosultság nélküli admin-kérés, elutasított CSRF-kísérlet                                                                         | `server/src/modules/auth/auth.service.ts:55`, `:61`; `server/src/middleware/auth.ts:100-105`; `server/src/middleware/sameOrigin.ts:60`    | Javítva, L30    |
| A lánc beállításának (tulajdonos, egyenleg, hálózat) **időszakos** ellenőrzése, a hiba error szinten (riasztható); az alacsony egyenleg (0,05 ETH alatt) külön, figyelmeztető szinten                                                                                     | `server/src/services/chainHealth.ts:21`, `:29`, `:32`; `server/src/server.ts:163`; `server/src/services/blockchain.service.ts:46`, `:344` | Javítva, L30    |
| A 403-as kísérletek (kép, értékelés, letöltés) és az admin-műveletek a szereplő azonosítójával naplózva                                                                                                                                                                   | pl. `photos.download.ts:84`, `admin.users.ts`, `admin.photos.ts`                                                                          | Rendben         |
| Riasztó rendszer (a naplók gyűjtése, értesítés), a kliens IP-címe a naplóban                                                                                                                                                                                              | – (élesben a Render naplója)                                                                                                              | Elfogadott (7.) |

### A10:2025 – Mishandling of Exceptional Conditions (kivételes helyzetek)

| Ellenőrzés                                                                                                                                                                        | Hol                                                                                                                                                         | Eredmény        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Központi hibakezelő; az Express 5 aszinkron hibái is ide jutnak; a már megkezdett válasz kezelése                                                                                 | `server/src/middleware/errorHandler.ts`                                                                                                                     | Rendben         |
| **A könyvtárak kliens-hibái** (pl. sérült gzip-törzs, megszakított törzs) 400-at adnak, nem 500-at, és nem kerülnek hibaként a naplóba (a bukó teszt 500-at mutatott)             | `server/src/middleware/errorHandler.ts:60`                                                                                                                  | Javítva, L30    |
| **Határidő a feltöltés törzsére** (150 s): a lassan csepegtetett kérés nem foglalhatja a feltöltési helyet (az ellenőrzésnél már L12 óta)                                         | `server/src/modules/photos/photos.routes.ts:143`                                                                                                            | Javítva, L30    |
| Időkorlátok: kérés 180 s, Stripe 10 s, RPC 15 s (feltöltéskor 5 s), dekódolás, Supabase Storage 20 s (L32; folyamként olvasva a válasz fejlécéig)                                 | `server/src/lib/httpTimeouts.ts:13`, `server/src/services/payment.service.ts:96`, `server/src/services/imageDecoding.ts:59`, `server/src/config/env.ts:275` | Rendben         |
| Zárt hibás állapot: lánchibánál a hitelesség-ellenőrzés 503 (nem téves „nem regisztrált”), a regisztráció CHAIN_FAILED és újrapróbálható; a kezeletlen ígéret-elutasítás naplózva | `server/src/server.ts:124`                                                                                                                                  | Rendben         |
| Az adatbázis-utasítások időkorlátja (`statement_timeout`)                                                                                                                         | –                                                                                                                                                           | Elfogadott (7.) |

## 3. Függőségek – `npm audit`

| Csomag        | Előtte (L30 eleje)                                                                                           | Javítás (`npm audit fix`, nem major)                                | Utána |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----- |
| gyökér        | 2 kritikus: `shell-quote` (GHSA-pqg4-j6r4-53mv, parancsbefecskendezés a `quote()`-ban) a `concurrently`-n át | `concurrently` 10.0.5 → 10.0.6, `shell-quote` 1.9.0 → 1.12.0        | 0     |
| `server/`     | 1 magas: `source-map-js` (GHSA-68fv-2mgg-jv7q, eseményhurok-blokkolás) a Prisma függőségfájában              | `source-map-js` 1.2.1 → 1.2.2                                       | 0     |
| `blockchain/` | 8 alacsony: `elliptic` (GHSA-848j-6mx2-7j84) az ethers v5-ön át a `hardhat-verify`-ban                       | `@nomicfoundation/hardhat-verify` 3.1.1 → 3.1.2 (19 csomag kikerül) | 0     |
| `client/`     | 0                                                                                                            | –                                                                   | 0     |
| `e2e/`        | 0                                                                                                            | –                                                                   | 0     |

Mindhárom javítás a meglévő verziótartományon belül maradt (csak a lockfile változott). Egyik
sebezhetőség sem érintette a futó szervert: a `concurrently` csak a fejlesztői indítóparancs, a
`source-map-js` csak támadó által adott source map feldolgozásakor, az `elliptic` csak a Hardhat
ellenőrző bővítményében futott.

### 3.1 Újra a leadás előtt (2026-10-28)

A záró auditkor az `npm audit` az L30 óta megjelent tanácsadásokat jelezte (a commitolt
lockfile-okon újramérve):

| Csomag         | Előtte                                                                                                                                                                                                                                                                                                                     | Javítás                                                                                                                                                                            | Utána                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `server/`      | 10: 4 magas – `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5, memóriakimerítés), `body-parser` ≤ 2.3.0 (GHSA-27r3-jxmh-p828, DoS), `multer` ≤ 2.4.0 (GHSA-q7qp-rjg7-q26m, DoS), `vite` 8.3.0–8.3.2 (csak fejlesztői eszköz); 6 mérsékelt – `@vitest/mocker` (GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp), `fast-uri`, `ip-address`, `qs` | `npm audit fix` a verziótartományon belül (zod 4.6.7, body-parser 2.4.0, multer 2.5.0, vite 8.3.5, qs 6.17.0 …); a `vitest` és a `@vitest/coverage-v8` alsó határa ^5.0.2 → ^5.0.5 | 0                    |
| `client/`      | 2 magas: `undici` ≤ 8.12.1 (több DoS-tanácsadás), `zod` < 4.6.6                                                                                                                                                                                                                                                            | `npm audit fix`: undici 8.12.3, zod 4.6.7                                                                                                                                          | 0                    |
| `blockchain/`  | 15: 14 magas – `undici` ≤ 7.30.0, `zod` < 4.6.6 (13 úton, a Hardhat 3 bővítményein át); 1 alacsony – `serialize-javascript` < 7.1.3                                                                                                                                                                                        | `npm audit fix`: undici 7.30.1, serialize-javascript 7.1.4, hardhat 3.18.0 → 3.21.1 és bővítményei                                                                                 | 13 magas – elfogadva |
| gyökér, `e2e/` | 0                                                                                                                                                                                                                                                                                                                          | –                                                                                                                                                                                  | 0                    |

A `blockchain/` 13 tétele egyetlen tanácsadás: a `zod` 4.6.6 előtti verziói túlméretezett,
megszorításos gyűjtemények ellenőrzésekor kimeríthetik a memóriát (GHSA-mrhx-c7xc-m3w5). A Hardhat 3
és bővítményei (`@nomicfoundation/hardhat-zod-utils`) a `zod` régebbi sorához kötődnek, az
`npm audit` javítást nem ajánl. Csak a szerződés fordítását, tesztelését és telepítését végző
fejlesztői eszközről van szó: a futó szerverbe és a kliensbe nem kerül, azok saját `zod`-ja 4.6.7.
Elfogadva; újraellenőrzés a Hardhat következő kiadásánál. A futó szervert érintő két javítás
(`body-parser`, `multer` – a kérés törzsének és a feltöltésnek a feldolgozása) a teljes
tesztkészlettel és a böngészős tesztekkel ellenőrizve (a napló „Témavezetői észrevételek javítása”
bejegyzése).

## 4. Az okosszerződés és a platform-kulcs

### 4.1 A szerződés ellenőrzése

| Ellenőrzés                                                                                                                                                                                                            | Hol                                                           | Eredmény                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| Az egyetlen író függvény (`registerPhoto`) csak a tulajdonosé (`onlyOwner`); a telepítő a tulajdonos                                                                                                                  | `blockchain/contracts/PhotoRegistry.sol:43`, `:49-53`         | Rendben                   |
| Nincs ETH-kezelés: nincs `payable` függvény, `receive`/`fallback`, külső hívás, `selfdestruct`/`delegatecall`                                                                                                         | `blockchain/contracts/PhotoRegistry.sol` (teljes fájl)        | Rendben                   |
| Nulla tartalom-hash és nulla tulajdonos-azonosító elutasítva; ismételt regisztráció és felülírás nincs                                                                                                                | `blockchain/contracts/PhotoRegistry.sol:36-40`, `:56`         | Rendben                   |
| Nincs újrabelépés (reentrancy) lehetősége (külső hívás nincs), nincs proxy (a kód nem cserélhető)                                                                                                                     | –                                                             | Rendben                   |
| A tulajdonjog átruházása és feladása (öröklött `transferOwnership`, `renounceOwnership`): idegen nem hívhatja; átruházás után a régi tulajdonos nem regisztrálhat; feladás után senki, a rekordok olvashatók maradnak | `blockchain/test/PhotoRegistry.test.ts` („tulajdonjog” blokk) | Javítva, L30 (4 új teszt) |
| Egy regisztráció gázfelhasználása 100 000 alatt (Sepolián mérve 71 686)                                                                                                                                               | `blockchain/test/PhotoRegistry.test.ts` („gázfelhasználás”)   | Rendben                   |

### 4.2 A platform-kulcs kompromittálódásának kockázata

A szerver egyetlen online kulcsa (`PLATFORM_PRIVATE_KEY`) írja alá a regisztrációkat, és egyben a
szerződés tulajdonosa. Aki megszerzi, az:

- hamis rekordot írhat a láncra bármely hash-re (az ellenőrző oldal „Hitelesítve” eredményt adna,
  igaz, tranzakció- és képadat nélkül; visszadátumozni nem tud – az időbélyeg a blokké);
- egy általa ismert fájl hash-ét előre lefoglalhatja (a valódi feltöltés 409-et kap);
- átruházhatja vagy feladhatja a tulajdonjogot – a nyilvántartás véglegesen befagy vagy az övé
  lesz; helyreállítani csak új szerződéssel lehet (a lánctörténet ott újrakezdődik);
- elköltheti a tárca teszt-ETH-ját.

Nem tud: meglévő rekordot módosítani vagy törölni, a szerződés kódját cserélni, ETH-t kivenni a
szerződésből (nincs benne), az adatbázist vagy a Stripe-ot elérni (külön titkok).

**A meglévő védelmek:**

- a kulcs csak környezeti változóban van; formátumát a szerver indításkor ellenőrzi
  (`server/src/config/env.ts:201`);
- minden naplósorban kitakarva, és a beolvasás után a folyamat környezetéből is törlődik
  (`server/src/server.ts:114`);
- a lánchibák üzenetéből az RPC-URL nem szivárog ki (`server/src/services/blockchain.service.ts:270`);
- csak teszthálózat engedélyezett (`server/src/config/env.ts:28`);
- díjplafon (`blockchain.service.ts:509`);
- a tranzakciók egyenként, sorban mennek ki;
- az admin-újrapróbálás adminonként korlátozott;
- L30 óta:
  - napi feltöltési keret (a tárca költségkerete);
  - a tulajdonos és az egyenleg 10 percenkénti ellenőrzése, a hiba error szinten
    (`server/src/services/chainHealth.ts`).

**Eljárásrend kompromittálódás esetén** (OWASP Secrets Management Cheat Sheet: azonnali
visszavonás, új titok, a régi eltávolítása):

1. A szerver leállítása (új tranzakció ne menjen ki).
2. Ha a szerződés még a platformé: `transferOwnership` egy tiszta gépen előállított új kulcsra –
   versenyfutás a támadóval; különben új szerződés telepítése és ABI-export.
3. Az új kulcs beállítása (`PLATFORM_PRIVATE_KEY`), az RPC-kulcs (Alchemy) cseréje is.
4. A `PhotoRegistered` események összevetése az adatbázissal: a hamis rekordok listája.
5. Új szerződésnél a `REGISTERED` képek újraregisztrálása az adatbázisból (új időbélyeggel).

**Továbbfejlesztés (új telepítést igényel, ezért nem ennek a lépésnek a része):**

- szerepkörök szétválasztása (OpenZeppelin AccessControl): a szerver kulcsa csak regisztrálhat, a
  tulajdonos egy hideg kulcs vagy egy multisig (Safe) – így egy kiszivárgott szerverkulcs új
  szerződés nélkül visszavonható;
- a `renounceOwnership` letiltása, kétlépéses átruházás (`Ownable2Step` – ez csak a téves címre
  átruházás ellen véd, kompromittált kulcs ellen nem);
- KMS/HSM-ben tárolt aláírókulcs;
- a lánc eseményeinek figyelése és riasztás;
- a felhasználó saját tárcájával aláírt regisztráció (terv D5, MetaMask-változat).

**Üzemeltetési javaslat (kódváltozás nélkül, a fejlesztő végzi):**

- a tárcán csak kevés teszt-ETH legyen (költségkorlát);
- a telepítés után a `blockchain/.env`-ből a kulcs kivehető, a Hardhat titkosított kulcstárolója
  (`npx hardhat keystore set SEPOLIA_PRIVATE_KEY`) használható helyette;
- a tárca és a szerződés címére Etherscan-figyelő állítható be.

## 5. Az L30-ban javított tételek (teszt-elsővel)

| #   | Tétel (honnan)                                                             | Javítás                                                                                                               | Teszt                                                                                           |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Fiókonkénti belépési korlát (L08)                                          | `LOGIN_ACCOUNT_RATE_LIMIT_MAX` (10): a sikertelen belépések e-mail-címenként, a bcrypt előtt                          | `server/tests/db/auth.test.ts` – „a fiókonkénti sikertelen belépések korlátja” (4 teszt)        |
| 2   | Foglalt és összetéveszthető nevek (L08, L13)                               | `reservedNames.ts`; regisztrációnál séma, profilnál szolgáltatás (a meglévő név megtartható, az admin viselheti)      | `reservedNames.test.ts` (33), `auth.schemas.test.ts`, `tests/db/users.test.ts` (3)              |
| 3   | Rejtett karakterek a címben, leírásban, bemutatkozásban, névben (L15, L23) | `withoutHiddenCharacters`, `cleanMultilineText` (`lib/schemas.ts`)                                                    | `photos.schemas.test.ts`, `users.schemas.test.ts`, `auth.schemas.test.ts`                       |
| 4   | A feltöltés törzs-határideje (L12)                                         | `UPLOAD_BODY_TIMEOUT_MS` (150 s) – a meglévő `createBodyDeadline`                                                     | `tests/db/photos.test.ts` – „a lassan csepegtetett fájl…”                                       |
| 5   | Tárca-kimerítés elleni kvóta (L11; az átnézés szerint bábfiókokkal is)     | `UPLOAD_DAILY_LIMIT` (30) és `UPLOAD_GLOBAL_DAILY_LIMIT` (500), 429 `DAILY_LIMIT_REACHED`                             | `tests/db/photos.test.ts` – „napi feltöltési keret” (5 teszt)                                   |
| 6   | `CHECK (email = lower(email))` (L08)                                       | migráció `20261012120000_users_email_lowercase_check`                                                                 | `tests/db/schema.test.ts`                                                                       |
| 7   | `npm audit` (L20 és most)                                                  | `npm audit fix` a gyökérben, a `server/`-ben és a `blockchain/`-ben                                                   | `npm audit`: 0 / 0 / 0 / 0 / 0                                                                  |
| 8   | A szerződés tulajdonosi tesztjei (szerződés-átnézés)                       | 4 új Hardhat-teszt                                                                                                    | `blockchain/test/PhotoRegistry.test.ts`                                                         |
| 9   | A tulajdonos és az egyenleg időszakos ellenőrzése (szerződés-átnézés)      | `chainHealth.ts`, `lowBalanceWarning` (0,05 ETH alatt, warn szint)                                                    | `chainHealth.test.ts`, `blockchain.service.test.ts`                                             |
| 10  | Kliens okozta 500-as válasz (OWASP-átnézés)                                | `isExposedClientError` a hibakezelőben                                                                                | `errorHandler.test.ts` (gzip-törzs + 5 eset)                                                    |
| 11  | Biztonsági naplósorok (OWASP-átnézés)                                      | `login_failed`, `login_blocked`, `forbidden_role`, `cross_site_rejected`, `chain_config_problem`, `chain_low_balance` | `tests/db/auth.test.ts`, `middleware/auth.test.ts`, `sameOrigin.test.ts`, `chainHealth.test.ts` |
| 12  | Az eredeti fájl metaadatai (OWASP-átnézés)                                 | figyelmeztetés a feltöltő oldalon                                                                                     | `client/src/pages/UploadPage.test.tsx`                                                          |

## 6. Elfogadott kockázatok (a dolgozat korlátai)

| Tétel (honnan)                                                                        | Indoklás                                                                                                                                                                                                                                                                                                                                                                     | Továbbfejlesztés                                            |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A fiókonkénti belépési korlát egy fiókot ki is zárhat (L30)                           | A támadó a fiók gazdáját az időablak végéig (15 perc) kizárhatja; az OWASP is jelzi ezt az árat. Jelszó-visszaállítás nincs a rendszerben, a zárolás csak időzített.                                                                                                                                                                                                         | e-mailes feloldás, CAPTCHA                                  |
| bcrypt-terhelés (L08)                                                                 | Kb. 0,29 s processzoridő/hash; IP-címenként 15 percenként legfeljebb 20 → kb. 6 s; a fiókonkénti korlát a bcrypt előtt áll. Sok IP-címről (botháló) a processzor telíthető.                                                                                                                                                                                                  | bcrypt külön szálon / sorban, CAPTCHA, WAF (L32)            |
| Nincs `tokenVersion` (L08)                                                            | Jelszócsere-funkció nincs; a tiltás minden kérésnél az adatbázisból ellenőrzött, így azonnal hat. A 7 napos token kijelentkezés után is érvényes marad, ha valaki ellopta (httpOnly süti, XSS ellen védett).                                                                                                                                                                 | `tokenVersion` a jelszócserével együtt                      |
| E-mail-felsorolás a regisztrációnál (OWASP-átnézés)                                   | E-mail-küldés nélkül a felsorolás nem kerülhető el jó felhasználói élménnyel; a regisztráció IP-címenként korlátozott, a fiókonkénti belépési korlát a következő lépést (jelszópróbálgatás) fékezi.                                                                                                                                                                          | e-mailes megerősítés                                        |
| Nincs gyakori jelszavak tiltólistája (OWASP-átnézés; az OWASP ASVS 5.0 ajánlása)      | A minimális hossz (8) és a bcrypt megvan; a tiltólista (pl. 10 000 leggyakoribb jelszó) a kliensen és a szerveren is kellene.                                                                                                                                                                                                                                                | tiltólista vagy k-anonim „Pwned Passwords” ellenőrzés       |
| Nincs e-mail-ellenőrzés (L11)                                                         | Levelező szolgáltatás nincs a prototípusban; a bábfiókok költségét a platformszintű napi keret korlátozza.                                                                                                                                                                                                                                                                   | e-mail-megerősítés az első feltöltés előtt                  |
| A platformszintű napi keret elfogyhat (L30)                                           | A költségtámadásból elérhetőségi támadás lesz: a nap hátralévő részében senki nem tölthet fel. Ez a szándékos választás (mint a hitelesség-ellenőrzés közös keretnél): a tárca nem ürülhet ki. A keret fiókonként legfeljebb eggyel (ha a kliens a feldolgozás közben bontja a kapcsolatot), a platformon legfeljebb az egyszerre futó feltöltések számával (4) léphető túl. | fiókbizalmi szintek, e-mail-ellenőrzés                      |
| `ownerRef = keccak256(userId)` linkelhető (L11, L12)                                  | Álnevesítés, nem anonimizálás (EDPB 02/2025 [S49]): a fotós azonosítója nyilvános, a hash kiszámítható, és a láncról nem törölhető.                                                                                                                                                                                                                                          | HMAC titkos sóval (a meglévő rekordok átírásával)           |
| A hitelesség-ellenőrzés láncolvasási kerete kimeríthető (L12)                         | Szándékos kvótavédelem: kimerülésnél 503, az RPC-szolgáltató havi kerete nem fogy el. Az IPv6 /56-os összevonás miatt egy /48-as tartományból sok kulcs jöhet.                                                                                                                                                                                                               | felhasználónkénti keret, gyorsítótár, CDN (L32)             |
| `isAnimatedPng` processzorigénye (L12)                                                | A fájl legfeljebb 15 MiB, az egyidejűségi korlát 2–4; a vizsgálat lineáris.                                                                                                                                                                                                                                                                                                  | –                                                           |
| A pino-http 503-nál szintetikus hibát és hívásláncot naplóz (L12)                     | Zaj a naplóban, érzékeny adat nincs benne.                                                                                                                                                                                                                                                                                                                                   | `customErrorObject` a szándékos 503-ra                      |
| Nincs `pg_trgm` index; offset-lapozás (L13)                                           | A lapozás 1000 oldalig ér, a keresőszó legfeljebb 100 karakter, idegen oldalról nem indítható; a prototípus adatmennyiségénél a szekvenciális keresés elég.                                                                                                                                                                                                                  | trigram-index, kurzoros lapozás (L32)                       |
| `ownerId` a módosítás feltételében (L13)                                              | Tulajdonosváltás nincs a rendszerben.                                                                                                                                                                                                                                                                                                                                        | –                                                           |
| Bábfiókos önértékelés (L15)                                                           | A saját kép második fiókkal való megvétele pénzbe kerül; az admin törölheti az értékelést.                                                                                                                                                                                                                                                                                   | vásárlási minták figyelése                                  |
| Visszatérítés és vitatott terhelés kezelése nincs; a webhook az IP-korlát alatt (L14) | Teszt mód; 429-nél a Stripe később újraküldi az eseményt.                                                                                                                                                                                                                                                                                                                    | `charge.refunded` / `charge.dispute.created` kezelése (L32) |
| Nincs söprő a lezáratlan (PENDING) rendelésekhez (L16)                                | A Stripe-munkamenet 31 perc után lejár; a következő fizetésindítás lezárja a régit.                                                                                                                                                                                                                                                                                          | időszakos takarító                                          |
| Nincs globális gázkeret az admin-újrapróbálásokra (L16)                               | Adminonkénti korlát + díjplafon + teszthálózat; az admin megbízható szerep.                                                                                                                                                                                                                                                                                                  | közös napi tranzakciókeret                                  |
| A szerepkör nem része a tiltás feltételének (L16)                                     | Admin nem tiltható (409), szerepkörváltás nincs a rendszerben.                                                                                                                                                                                                                                                                                                               | –                                                           |
| Nincs felhasználónkénti korlát a lekérdezett és író végpontokra (L22, L23)            | Az általános IP-korlát (300 / 15 perc) és a vásárláshoz kötött értékelés korlátoz.                                                                                                                                                                                                                                                                                           | felhasználónkénti keret (L32)                               |
| A GitHub Actions főverzió-címkével (L27)                                              | A token csak olvasható, titkot a CI nem használ.                                                                                                                                                                                                                                                                                                                             | SHA-pin (a Dependabot L32 óta javasolja a frissítéseket)    |
| Aki elsőként tölti fel más képét, az a „hiteles” (OWASP-átnézés)                      | A rendszer a feltöltés tényét és idejét igazolja, nem a szerzőséget – a dolgozatban ez a módszer korlátja.                                                                                                                                                                                                                                                                   | aláírt eredetiség (C2PA), bejelentési folyamat              |
| A foglaltnév-szűrő csak az UTS #39 egy kis részét vizsgálja (L30)                     | A leggyakoribb cirill/görög hasonmások és számjegy-helyettesítések benne vannak; a felhasználók neveinek egymással való összetéveszthetősége nem.                                                                                                                                                                                                                            | teljes confusables-tábla                                    |

## 7. Az éles üzemeltetés (L31–L32)

Az L30-ban feljegyzett éles teendők állapota a két lépés után. Az élő rendszer:
https://photochain.onrender.com (Render ingyenes Web Service + Supabase PostgreSQL és Storage,
Sepolia, Stripe teszt mód; a telepítési ábra: `docs/diagramok/telepites.mmd`).

**Az L31-ben (Docker) teljesült:**

- a konténerben `NODE_ENV=production`;
- a proxyugrások száma beállítható (`TRUST_PROXY_HOPS`, a konténerben 0);
- a kiszolgált kliens CSP-je (`frame-ancestors 'self'`, `img-src … blob:`), `Referrer-Policy`,
  `Permissions-Policy`;
- `Cache-Control: no-cache` az API-ra és az `index.html`-re;
- nem root felhasználó, `cap_drop: ALL`, `no-new-privileges`, memória- és folyamatkorlát;
- verzióra rögzített alapkép.

**Az L32-ben (élesítés) teljesült** (teszt-elsővel; két független átnézés után):

- `APP_BASE_URL` kötelező élesben; figyelmeztetés, ha a cím https, de a mód nem éles
  (`server/src/config/env.ts`, `checkCrossFieldRules`, `configWarnings`).
- **Adatbázis-TLS:** a távoli adatbázis kapcsolata a Supabase CA-jához ellenőrzött
  (`DATABASE_SSL_CA_FILE`, `ssl: { ca, rejectUnauthorized: true }`). Élesben enélkül a szerver el
  sem indul; az URL `sslmode`-paramétere a CA mellett tiltva, mert a node-postgres-ben felülírná
  az `ssl` beállítást. Negatív próba: rossz CA-val a szerver kilép (`TlsConnectionError`). A saját
  gépről futó migráció a Prisma parancssori eszközével `sslmode=require&sslcert=…&sslaccept=strict`
  beállítással csatlakozik.
- **Proxyugrások mérve:** jelölt mérőkérés (`/api/health?proxy_probe`, legfeljebb 10 naplósor
  folyamatonként, IP-cím nélkül) → 3 bejegyzés (Cloudflare + a Render két rétege) →
  `TRUST_PROXY_HOPS=3`. Kívülről igazolva a sebességkorlát kulcsának lenyomatával: 1 mellett a
  kulcs egy proxy címe volt, 3 mellett a látogatóé, a hamis `X-Forwarded-For` hatástalan.
- **Képek:** két privát bucket; a nyilvános előnézetet és a bélyegképet a szerver adja tovább
  (`/media`), az eredetit soha. `Cache-Control: private, max-age=300`: köztes (CDN-)
  gyorsítótár nem tárolhatja, így a levett kép a szerveren azonnal eltűnik. IP-címenkénti korlát
  (`MEDIA_RATE_LIMIT_MAX`, alapból 600 / 15 perc) a kimenő forgalom kerete miatt. A tárhely-hívás
  időkorlátos, a fájl folyamként érkezik (a lassan olvasó kliens nem tartja a memóriában).
- **Sorszintű védelem (RLS)** minden táblán: a Supabase Data API a nyilvános kulccsal sem ér el
  sort (a szerver tulajdonosként kapcsolódik, rá nem vonatkozik). A Dashboardban ajánlott még: a
  Data API kikapcsolása és az „Enforce SSL” (README, Élesítés).
- **Titkok:** a Supabase-kulcs is kitakarva a naplóban; induláskor a Supabase-kulcs, a JWT-kulcs
  és az adatbázis-URL is törlődik a folyamat környezetéből; az éles értékek a git és a
  Docker-build által kizárt `server/.env.production`-ben, illetve a Render titkos változói
  között (`sync: false`).
- **Memória (elérhetőség):** közös képfeldolgozási sor (`IMAGE_PROCESSING_CONCURRENCY=1`),
  25 MP-es korlát (a kliensben is), sharp-gyorsítótár ki, `MALLOC_ARENA_MAX=2` – mérve 512 MB és
  0,1 CPU mellett: a 25 MP-es WebP csúcsa 274 MB.
- **Ellátási lánc:** az alapkép digesttel rögzítve; Dependabot (npm, Docker, GitHub Actions):
  a fejlesztői repóban hetente fut, a bemutatópéldányban kikapcsolva.
- A Stripe-webhook végpontja a Dashboardban az élő címre (saját aláírási titokkal).
- A `/api/health` kimarad az általános korlátból (a Render néhány másodpercenként hívja).

**Elfogadott korlátok az éles telepítésben** (a dolgozatban a korlátok között):

| Tétel                                                      | Indoklás                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__Host-` előtag a munkamenet-sütin                        | Az `onrender.com` a nyilvános utótagok listáján van, így más aldomain a sütit nem írhatja felül; a süti most is csak a saját gépnévre szól (nincs `Domain`), `Secure`, `HttpOnly`, `SameSite=Lax`.                                        |
| Pufferelő reverse proxy, a letöltés üresjárati korlátja    | A Render és a Cloudflare áll a szerver előtt; a kérés teljes időkorlátja 180 s, a feltöltés törzséé 150 s. A letöltés egyidejűsége korlátos (összesen 32, felhasználónként 2), a fájl folyamként megy át, nem kerül egészben a memóriába. |
| Több szerverpéldány (közös korlát- és zártár)              | Az ingyenes csomagban egy példány fut; a korlátok és a zárak példányonként élnek.                                                                                                                                                         |
| `statement_timeout`, index a `photos.createdAt`-re         | A prototípus adatmennyiségénél (néhány tucat sor) nincs hatása; a lekérdezések lapozottak.                                                                                                                                                |
| Naplógyűjtés és riasztás                                   | Élesben a Render naplója látszik (az L30 eseménysorai benne vannak); gyűjtés és értesítés nincs beállítva.                                                                                                                                |
| A migráció TLS-ellenőrzése nincs negatív próbával igazolva | A Prisma parancssori eszköze az `sslaccept=strict` beállítást kapja; rossz CA-val nem próbáltuk. A futó szerver kapcsolatáé igazolva (L32_07).                                                                                            |
| Közös Sepolia-szerződés a fejlesztéssel                    | Az éles telepítés ugyanazt a szerződést és platform-tárcát használja, mint a fejlesztés: a fejlesztéskor már regisztrált kép élesben „már regisztrált”. A hálózat és a szerződés képenkénti tárolása továbbfejlesztés.                    |
| Ingyenes szolgáltatások ébresztése                         | A Render 15 perc tétlenség után elalszik (az első kérés kb. 1 perc), a Supabase-projekt egy hét után szünetel – a bemutató előtt mindkettőt fel kell ébreszteni (README).                                                                 |

A 6. fejezet „(L32)” jelölésű továbbfejlesztései (WAF, gyorsítótár, trigram-index, Stripe-
visszatérítés, felhasználónkénti keret) az ingyenes élesítésnek nem részei; továbbfejlesztésként
maradnak.

## 8. Témavezetői észrevételek javítása (2026-10-27)

A témavezető a nyilvános példány átnézésekor három hibát jelzett; mindhárom teszt-elsővel javítva
(a fejlesztési napló azonos című bejegyzése). A leadás előtti záró audit (2026-10-28: tiszta
telepítés, fekete dobozos próba, mutációs próba) egy további apró hibát talált – javítva (1. tétel) –,
és a függőségek auditját frissítette (3.1).

| #   | Észrevétel                                                                                                                                                                                            | Javítás                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Teszt                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | A letiltott fotós előnézeti képei közvetlen URL-en elérhetők maradtak: a tiltás nem törli a fájlokat, a `/media` csak a fájl létét nézte (A01; a 6. fejezet korábban elfogadott tétele)               | `middleware/mediaAccess.ts`: a `/media` a fájl kiadása előtt az adatbázisból ellenőrzi a kép láthatóságát (állapot, a fotós tiltása) – a nyilvános képet bárki, a többit csak a tulajdonos és az admin kapja (a munkamenetet csak ekkor tölti be), másnak 404 (mint a nem létező képre); a nem nyilvános kép és a 404 válasza `no-store`; a szabálytalan útvonal (dupla perjel, nagybetűs azonosító) sem jut a fájlig; IP-korlát és `Cache-Control: private` helyi tárhelynél is; a rejtett kép fájlja senkinek nem jár (az elrejtés törli, a visszaállítás újra elkészíti), és a látható kép hiányzó fájljának 404-e is ugyanaz, `no-store` (`mediaFileMissing`; a záró auditban, 2026-10-28) | `tests/db/media.test.ts` (36 teszt), `middleware/mediaAccess.test.ts` (21 egységteszt)      |
| 2   | Két különböző, soronként egyszínű kép (függőleges fényességátmenet, vízszintes sávok) dHash-e csupa 0, ezért a második `DUPLICATE_SIMILAR` lett – az egyszínűség-szűrő csak a kép egészét nézte (A08) | `services/imageAnalysis.ts`: a kép egészének fényességtartománya helyett soronként – legalább 3 informatív sor kell: ≥ 16 a tartomány, és a sor bitjei nem mind egyformák (a balról jobbra végig világosodó vagy sötétedő – vízszintes, átlós – átmenet sora csupa 1 vagy csupa 0), különben `LOW_DETAIL_IMAGE` (`hashing.service.ts`: `rowBrightnessRanges`, `dHashRowBytes`)                                                                                                                                                                                                                                                                                                                 | `imageAnalysis.test.ts` (a „degenerált dHash” blokk 12 tesztje), `hashing.service.test.ts`  |
| 3   | A hitelesség-ellenőrző kihagyhatott érvényes hasonló találatot: a legközelebbi, láncon meg nem erősített jelöltnél megállt, és `NOT_FOUND`-ot adott                                                   | `modules/verification/verification.service.ts`: a küszöbön belüli jelöltek távolság szerint sorban, az első láncon megerősített a találat; kérésenként legfeljebb 5 láncolvasás (`hashing.service.ts`: `rankByDistance`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `tests/db/verification.test.ts` – „a jelöltek vizsgálata távolság szerint sorban” (6 teszt) |

## Források

- [S51] OWASP Top 10:2025 – https://top10.owasp.org/2025/ (A01–A10 kategóriaoldalak)
- [S52] OWASP Cheat Sheet Series – https://cheatsheetseries.owasp.org/ – Authentication, Logging,
  HTTP Headers, Secrets Management, Error Handling, Cross Site Scripting Prevention, File Upload,
  Password Storage, Session Management, Cross-Site Request Forgery Prevention
- OpenZeppelin Contracts 5.x – Access Control (Ownable, Ownable2Step, AccessControl) –
  https://docs.openzeppelin.com/contracts/5.x/access-control
- Unicode Technical Standard #39 – Unicode Security Mechanisms – https://www.unicode.org/reports/tr39/
- npm Docs – npm audit – https://docs.npmjs.com/cli/v11/commands/npm-audit

A részletes forráslista: `docs/FORRASOK.md` (238–251. sor; az éles üzemeltetéshez 252–270. és
271–299. sor).
