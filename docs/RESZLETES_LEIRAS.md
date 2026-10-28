# PhotoChain – részletes leírás

A [README](../README.md) kiegészítése: előfeltételek, telepítés és beállítás, a szerver és a webes
felület működése (API, korlátok, hibakódok), a gyökérszintű scriptek, a konténer, az élesítés, a CI,
a tesztek, a kiértékelés és a biztonsági átvizsgálás. A kódmegjegyzések, a fejlesztési napló és a
forrásjegyzék „README – …” hivatkozásai ennek a dokumentumnak a fejezeteire vonatkoznak.

## Előfeltételek

- [Node.js 24 LTS](https://nodejs.org/) (npm-mel együtt)
- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (WSL 2 háttérrel)
- [Stripe CLI](https://docs.stripe.com/stripe-cli)
- [Visual Studio Code](https://code.visualstudio.com/) – a mappa megnyitásakor felajánlja az ajánlott
  bővítményeket (`.vscode/extensions.json`)

## Első lépések

```bash
git clone https://github.com/klaus3577/PhotoChain_Omega.git
cd PhotoChain_Omega
npm run install:all   # a gyökér és mind a négy alprojekt (blockchain, server, client, e2e) függőségei
```

A kipróbálás külső fiókok nélkül: [docs/KIPROBALAS.md](KIPROBALAS.md).

### Környezeti változók

A titkos kulcsok alprojektenként egy-egy `.env` fájlban vannak, amelyek **nem kerülnek a repóba**.
Másold le a sablonokat, és töltsd ki őket (a gyökérben lévő a Docker Compose adatbázisáé):

```bash
cp .env.example .env
cp blockchain/.env.example blockchain/.env
cp server/.env.example server/.env
```

| Változó                                                  | Honnan                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `SEPOLIA_RPC_URL`, `RPC_URL`                             | [Alchemy](https://www.alchemy.com/) → app → Endpoints (Sepolia)               |
| `SEPOLIA_PRIVATE_KEY`, `PLATFORM_PRIVATE_KEY` (ugyanaz)  | külön, csak erre a célra létrehozott teszttárca (pl. MetaMask)                |
| `ETHERSCAN_API_KEY`                                      | [Etherscan](https://etherscan.io/) → API Keys                                 |
| `STRIPE_SECRET_KEY`                                      | [Stripe](https://dashboard.stripe.com/) → Developers → API keys (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET`                                  | a `stripe listen` parancs írja ki (`whsec_…`), lásd: Vásárlás és letöltés     |
| `JWT_SECRET`                                             | véletlen, legalább 32 karakter (a parancsa a `server/.env.example`-ben)       |
| `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL` | saját, véletlen jelszó (lásd a `.env.example` fájlokat)                       |
| `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD`              | saját jelszavak az admin és a demó felhasználók számára (min. 8 karakter)     |

A platform-tárcába Sepolia teszt-ETH kell (pl. [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)).
Részletek: [fejlesztési terv, L03](FEJLESZTESI_TERV.md).

### Okosszerződés (`blockchain/`)

A `PhotoRegistry` szerződés a Sepolia teszthálózaton, verifikált forráskóddal:
[`0x6eF681b51da3c7E7E5d59ac96b7d80e9A59e97C7`](https://sepolia.etherscan.io/address/0x6eF681b51da3c7E7E5d59ac96b7d80e9A59e97C7#code).

| Parancs (a `blockchain/` mappában) | Leírás                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| `npm test`                         | a szerződés és az export tesztjei                                     |
| `npm run node`                     | lokális fejlesztői hálózat (`http://127.0.0.1:8545`)                  |
| `npm run deploy:local`             | telepítés a lokális hálózatra (a `npm run node` mellett)              |
| `npm run deploy:sepolia`           | telepítés a Sepoliára + verifikáció (megerősítést kér)                |
| `npm run export-abi`               | ABI + címek exportálása a szervernek (`server/src/contracts/`)        |
| `npm run check:sepolia`            | a telepített szerződés ellenőrzése (lokálisan: `npm run check:local`) |

### Adatbázis (PostgreSQL 17, Docker)

A fejlesztői adatbázis egy Docker-konténerben fut (a Docker Desktopnak futnia kell). A repó
gyökeréből:

```bash
docker compose up -d
```

Állapot: `docker compose ps` (`healthy`) · leállítás: `docker compose down` – az adatok a
`pgdata` volume-ban megmaradnak (a `docker compose down -v` az adatbázist is törli). Az adatbázis
csak a saját gépről érhető el (`127.0.0.1:5432`).

Első indítás után a `server/` mappában: `npm run db:deploy` (táblák létrehozása a migrációkból),
majd `npm run db:seed` (8 kategória, egy admin és két demó felhasználó). Az adatmodell:
`server/prisma/schema.prisma` ([fejlesztési terv, 4. fejezet](FEJLESZTESI_TERV.md)).

### Szerver (`server/`)

REST API: Node.js 24, Express 5, TypeScript, Prisma 7. A konfigurációt a `server/.env` adja (lásd
`server/.env.example`); hibás vagy hiányzó értéknél, illetve elérhetetlen adatbázisnál a szerver el
sem indul.

| Parancs (a `server/` mappában)                       | Leírás                                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                        | fejlesztői szerver újraindítással (`http://localhost:4000/api`)                                                                  |
| `npm test`                                           | az összes teszt (az adatbázis-tesztekhez futnia kell a konténernek)                                                              |
| `npm run test:unit`                                  | csak az adatbázis nélküli unit- és végponttesztek                                                                                |
| `npm run test:db`                                    | csak az adatbázis-tesztek (a `TEST_DATABASE_URL` adatbázison)                                                                    |
| `npm run test:chain`                                 | csak a blokklánc-tesztek (saját, lokális Hardhat-hálózaton)                                                                      |
| `npm run coverage`                                   | tesztlefedettség (küszöb: 80%)                                                                                                   |
| `npm run lint`                                       | kódellenőrzés (ESLint)                                                                                                           |
| `npm run typecheck`                                  | típusellenőrzés                                                                                                                  |
| `npm run build` / `npm start`                        | produkciós build a `dist/`-be, majd indítás                                                                                      |
| `npm run db:migrate`                                 | a séma módosítása után új migráció (`prisma migrate dev`)                                                                        |
| `npm run db:deploy`                                  | a meglévő migrációk alkalmazása (`prisma migrate deploy`)                                                                        |
| `npm run db:seed`                                    | kezdeti adatok (idempotens, többször is futtatható)                                                                              |
| `npm run db:reset-test`                              | a tesztadatbázis kiürítése (csak `_test` végű névvel; a `DATABASE_URL` adja meg, L28)                                            |
| `npm run production:migrate`                         | az éles (Supabase) adatbázis migrációi a saját gépről, a `server/.env.production` értékeivel, ellenőrzött TLS-sel (L32)          |
| `npm run production:seed -- --allow-remote-database` | az éles adatbázis kezdő adatai (kategóriák, admin, két demó fiók); a kapcsoló nélkül távoli adatbázison el sem indul (L32)       |
| `npm run experiment:hash`                            | a hitelesítés robusztussági kísérlete: a tesztfotók módosított másolatainak SHA-256- és dHash-mérése → `docs/kiertekeles/` (L29) |
| `npm run experiment:gas`                             | a lánc-regisztráció költségbecslése az aktuális gázárral (főhálózat, Base, OP Mainnet) → `docs/kiertekeles/` (L29)               |
| `npm run db:studio`                                  | Prisma Studio – az adatbázis böngészése (`http://localhost:5555`)                                                                |
| `npm run db:generate`                                | a Prisma-kliens újragenerálása (az `npm install` is lefuttatja)                                                                  |

Állapotellenőrzés: `GET /api/health` → `{"data":{"status":"ok"}}` (REST Client-kérések:
`server/http/`).

#### Hitelesítés (`/api/auth`)

| Végpont               | Leírás                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| `POST /auth/register` | regisztráció (`email`, `password` ≥ 8 karakter, `displayName`); be is léptet  |
| `POST /auth/login`    | bejelentkezés; a JWT `HttpOnly; SameSite=Lax` sütibe kerül (élesben `Secure`) |
| `POST /auth/logout`   | kijelentkezés (a süti törlése)                                                |
| `GET /auth/me`        | a bejelentkezett felhasználó adatai (süti nélkül 200, `user: null` – L26)     |

A munkamenet 7 napig él. A tokeneket a `JWT_SECRET` írja alá: legalább 32 karakter hosszú véletlen
érték a `server/.env`-ben (előállítása: `server/.env.example`). A bejelentkezés és a regisztráció
együtt IP-címenként 20 kérést fogad 15 percenként (`AUTH_RATE_LIMIT_MAX`); ezen felül egy fiókba
(e-mail-címre) 15 percenként legfeljebb 10 sikertelen belépés engedélyezett, utána a helyes jelszó
is 429-et kap az időablak végéig (`LOGIN_ACCOUNT_RATE_LIMIT_MAX`, L30). A platformra vagy a
moderátorokra emlékeztető név (pl. „Adminisztrátor”, „PhotoChain …”) nem választható (L30). A
folyamat kipróbálható a `server/http/auth.http` kéréseivel (VS Code REST Client).

#### Ujjlenyomatok (hash-modul)

A `src/services/hashing.service.ts` adja a hitelesítés két ujjlenyomatát: a fájl **SHA-256**
hash-ét (bájtra azonos másolat) és a kép **dHash**-ét (64 bites különbség-hash – kicsinyített,
újratömörített, más formátumba mentett másolat). Két dHash hasonlóságát a Hamming-távolságuk méri;
legfeljebb `DHASH_THRESHOLD` (alapból 10) eltérő bitnél a két kép másolatnak számít. A tesztekhez a
`tests/fixtures/images/` mappába **saját fotók** kellenek (lásd az ottani README-t).

Magyarázó ábra egy képről (9×8-as szürkeárnyalatos kép, 64 bit, hash), a `server/` mappából:

```bash
npx tsx scripts/dhash-figure.ts <kép> <kimenet.html>
```

#### Képfeltöltés (`POST /api/photos`)

Bejelentkezés után, `multipart/form-data` űrlappal: `image` (a képfájl), `title` (3–120 karakter),
`priceHuf` (175–9 999 999 Ft – a Stripe legkisebb terhelhető összege, L14), `categoryId`, elhagyható
`description`. A szerver lépései:

1. **Ellenőrzés a fájl tartalma alapján** (nem a neve vagy a kliens által küldött típus szerint):
   csak ép, egyetlen képkockás JPEG, PNG vagy WebP (animált WebP és PNG nem); legfeljebb 15 MB
   (`UPLOAD_MAX_BYTES`) és 50 megapixel, mindkét oldala legalább 600 képpont; a túl kevés
   részletű képet elutasítja (egyszínű, vagy csak egy irányban változó – fényességátmenet, sávok:
   az ilyen kép dHash-ének sorai csupa 0 vagy csupa 1 bitből állnának, és minden hasonló képpel
   ütköznének; a szabály: a 9 × 8-as rács legalább 3 sorában legyen legalább 16-os
   fényességkülönbség úgy, hogy a sor bitjei nem mind egyformák).
2. **Ujjlenyomatok és duplikáció-szűrés:** azonos SHA-256 → `409 DUPLICATE_EXACT`; legfeljebb
   `DHASH_THRESHOLD` bitnyi dHash-távolság → `409 DUPLICATE_SIMILAR`. A láncot is megkérdezi
   (`isRegistered`, ingyenes olvasás, legfeljebb 5 s): ha a kép ott már szerepel, szintén
   `409 DUPLICATE_EXACT`; ha a lánc nem érhető el, a feltöltés ettől még folytatódik. A válasz a
   talált kép adatait (cím, feltöltő, időpont) csak akkor adja meg, ha az nyilvános (`REGISTERED`),
   vagy ha a feltöltő a saját képét töltené fel újra; egyébként csak a távolságot.
3. **Tárolás** a `StorageService` felületen át (fejlesztéskor helyi lemez, `UPLOAD_DIR`, alapból
   `server/uploads`): az eredeti fájl bájtra változatlanul a privát `originals/` mappába, a
   **vízjeles előnézet** (legfeljebb 1200 képpont) és a **bélyegkép** (400 képpont) a `public/`
   alá kerül – mindkettő metaadatok (EXIF, GPS) nélkül. Csak a `public/` érhető el URL-en
   (`/media/previews/…`, `/media/thumbnails/…`), és a szerver a fájl kiadása előtt az
   adatbázisból ellenőrzi a kép láthatóságát: a nyilvános képet bárki, a nem nyilvánosat (még
   regisztrációra váró, sikertelen vagy letiltott fotósé) csak a tulajdonosa és az admin kapja
   meg, a rejtett képét – amelyet az elrejtés töröl – senki; másnak 404, ugyanúgy, mint az
   adatlapnál.
4. **Adatbázis:** `Photo` rekord `PENDING_CHAIN` állapotban; a válasz (201) ezután azonnal megy,
   a blokklánc-regisztráció a háttérben fut (lásd lent).

A feltöltések feldolgozása egymás után, sorban történik (így két egyszerre érkező hasonló kép közül
a második már látja az elsőt). A terhelést korlátok fogják vissza: egyszerre legfeljebb
`UPLOAD_MAX_CONCURRENT` (4) feltöltést fogad a szerver, ebből felhasználónként egyet (a kliens
ezért a képeket egymás után tölti fel); felhasználónként `UPLOAD_RATE_LIMIT_MAX` (30) kísérlet
engedélyezett 15 percenként; egy kép feldolgozása legfeljebb 20 másodpercig, a fájl beérkezése
legfeljebb 150 másodpercig (`UPLOAD_BODY_TIMEOUT_MS`, L30), egy kérés legfeljebb 3 percig tarthat
(az üresjárati kapcsolatot a szerver 125 másodpercig tartja nyitva – tovább, mint a fordított proxy,
így az nem kap lezárt kapcsolatot, `server/src/lib/httpTimeouts.ts`). Mivel
minden feltöltés egy, a platform által fizetett lánc-tranzakció, napi keret is van (az elmúlt 24
óra feltöltései az adatbázisból): fiókonként `UPLOAD_DAILY_LIMIT` (30), a platformon összesen
`UPLOAD_GLOBAL_DAILY_LIMIT` (500); fölötte 429 `DAILY_LIMIT_REACHED` (L30).

| Válasz | Hibakód                                 | Mikor                                                             |
| ------ | --------------------------------------- | ----------------------------------------------------------------- |
| 201    | –                                       | sikeres feltöltés; a válaszban a kép adatai és az URL-ek          |
| 400    | `VALIDATION_ERROR`                      | hiányzó fájl, hibás mező, ismeretlen kategória                    |
| 400    | `IMAGE_TOO_SMALL` / `IMAGE_TOO_LARGE`   | 600 képpontnál kisebb oldal, illetve 50 megapixel fölött          |
| 400    | `LOW_DETAIL_IMAGE`                      | túl kevés részletű (egyszínű, vagy csak egy irányban változó) kép |
| 400    | `INVALID_UPLOAD`                        | sérült űrlap, több fájl, más mezőnévben küldött fájl              |
| 401    | `UNAUTHORIZED`                          | nincs bejelentkezve                                               |
| 403    | `FORBIDDEN`                             | nem a saját oldalról indított kérés (`Sec-Fetch-Site`)            |
| 409    | `DUPLICATE_EXACT` / `DUPLICATE_SIMILAR` | a kép (vagy módosított másolata) már fel van töltve               |
| 413    | `PAYLOAD_TOO_LARGE`                     | a fájl nagyobb a megengedettnél                                   |
| 415    | `UNSUPPORTED_IMAGE`                     | nem kép, sérült kép, nem támogatott vagy animált formátum         |
| 415    | `UNSUPPORTED_MEDIA_TYPE`                | a kérés nem `multipart/form-data`                                 |
| 429    | `RATE_LIMITED`                          | túl sok kísérlet, vagy már folyamatban van egy feltöltés          |
| 503    | `SERVER_BUSY`                           | túl sok egyidejű feltöltés (`Retry-After` fejléccel)              |

A módosító kéréseket a szerver csak a saját eredetéről fogadja el (`Sec-Fetch-Site: same-origin`;
fejléc nélkül – pl. curl, REST Client – szintén): a kliens ezért az API-t és a képeket (`/api`,
`/media`) ugyanarról a címről éri el, fejlesztéskor a Vite proxyján keresztül.

Kipróbálható a `server/http/photos.http` kéréseivel (VS Code REST Client).

#### Blokklánc-regisztráció (a háttérben)

A feltöltés után a szerver a platform-tárcával (`PLATFORM_PRIVATE_KEY`) elküldi a `PhotoRegistry`
szerződésnek a `registerPhoto(sha256, dHash, ownerRef)` tranzakciót; `ownerRef` a feltöltő
azonosítójának keccak256-hash-e (a láncra személyes adat nem kerül). Ha a tranzakció blokkba került,
a kép `REGISTERED` lesz, a tranzakció hash-ével, blokkszámával, gázfelhasználásával és a lánc
szerinti regisztrációs idővel. A tranzakciók egymás után mennek ki (egyszerre egy, így nincs
nonce-ütközés); a tranzakció hash-e már a küldés előtt az adatbázisba kerül.

- **Lánchiba** (elérhetetlen RPC, elfogyott teszt-ETH, visszautasított tranzakció, a díjplafon
  fölötti hálózati díj, 3 perces időtúllépés): a kép `CHAIN_FAILED` lesz, a szerver naplózza az okát,
  és tovább működik. A regisztráció újrapróbálható (adminisztrátori végpont: L16).
- **Újraindítás regisztráció közben:** induláskor (és utána 10 percenként) a szerver a
  `PENDING_CHAIN` képeket folytatja – a már elküldött tranzakciót nem küldi újra, hanem megvárja.
  Leállításkor a futó regisztrációt legfeljebb 10 másodpercig megvárja.
- **Induláskor** a szerver ellenőrzi a láncot (hálózat, szerződés, a platform-tárca a tulajdonos-e,
  van-e ETH-ja), és az eltérést figyelmeztetésként naplózza.
- **Titkok a naplóban:** a privát kulcsot, az RPC-URL-t (benne az API-kulccsal) és a többi titkot a
  napló minden sorból kitakarja (`[REJTETT]`), akkor is, ha egy hibaüzenet tartalmazná.

A hálózatot a `CHAIN_ID` választja ki (alapból `11155111`, Sepolia; más hálózat – pl. a valódi
pénzt mozgató főhálózat – nem engedélyezett); a szerződés címét a
`server/src/contracts/PhotoRegistry.json` adja (`npm run export-abi` a `blockchain/` mappában). A
`CHAIN_MAX_FEE_GWEI` (alapból 50) a tranzakciós díj plafonja: díjugráskor a regisztráció nem megy ki.
Lokális fejlesztéshez: `npm run node` és `npm run deploy:local` a `blockchain/` mappában, a
`server/.env`-ben pedig `RPC_URL=http://127.0.0.1:8545`, `CHAIN_ID=31337` és a telepítő Hardhat-fiók
kulcsa (`PLATFORM_PRIVATE_KEY`, a `npm run node` kiírja).

#### Hitelesség-ellenőrzés (`/api/verify`)

Bárki – bejelentkezés nélkül – ellenőrizheti, hogy egy kép regisztrált eredeti-e:

- `POST /api/verify` – `multipart/form-data`, a képfájl az `image` mezőben (JPEG, PNG vagy WebP,
  legfeljebb 15 MB és 50 megapixel; mindkét oldala legalább 100 képpont, hogy a bélyegkép és a
  kicsinyített másolatok is ellenőrizhetők legyenek). A fájl **sehol nem tárolódik** (se lemezre, se
  adatbázisba), és a naplóba sem kerül róla semmi.
- `GET /api/verify/:sha256` – a fájl SHA-256 hash-e alapján (64 hexadecimális karakter; a `0x`
  előtagú, Etherscanről másolt alak is jó). Csak pontos egyezést keres; a hash a kérésnaplóba sem
  kerül (`/api/verify/:sha256` áll a helyén).

A válasz mindig 200, ha az ellenőrzés lefutott; az eredményt a `result` mező adja, a többi mező
mindig jelen van (ami nem értelmezhető, az `null`):

```json
{
  "data": {
    "result": "VERIFIED",
    "sha256": "c9c68880…",
    "dHash": "f0e8f2f2b6f3f0f0",
    "distance": null,
    "registration": {
      "registeredAt": "2026-10-01T09:30:12.000Z",
      "blockNumber": 11820993,
      "txHash": "0x8c326b3c…",
      "txUrl": "https://sepolia.etherscan.io/tx/0x8c326b3c…"
    },
    "photo": {
      "id": "…",
      "title": "Tócsa tükröződéssel",
      "thumbnailUrl": "/media/thumbnails/….jpg",
      "photographer": { "id": "…", "displayName": "…" }
    }
  }
}
```

| `result`    | Mikor                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERIFIED`  | a hash **a láncon** regisztrálva van (a lánc az igazságforrás); a regisztráció ideje a lánc rekordjából                                                                                                                                                                                                       |
| `SIMILAR`   | csak `POST`: a legközelebbi olyan nyilvános (`REGISTERED`) kép, amelynek dHash-e legfeljebb `DHASH_THRESHOLD` bitben tér el, és a lánc is megerősíti (ugyanazzal a tulajdonossal) – a küszöbön belüli jelölteket távolság szerint sorban vizsgálja, kérésenként legfeljebb ötöt; `distance` = az eltérő bitek |
| `NOT_FOUND` | egyik sem (az adatbázis szerint regisztrált, de a láncon nem található képre is – ezt a szerver figyelmeztetésként naplózza)                                                                                                                                                                                  |

- A kép és a fotós adatai (`photo`) csak a nyilvános (`REGISTERED`) képnél, és csak ha a lánc
  ugyanazt a tulajdonost (`ownerRef`) rögzítette; az elrejtett vagy még nem regisztrált képnél csak a
  lánc adatai látszanak. A tranzakció (`blockNumber`, `txHash`) csak a blokkba került, lezárt
  regisztrációnál; a `txUrl` Sepolián Etherscan-link, a lokális Hardhat-hálózaton `null`.
- `dHash` csak a `POST`-nál (a hash alapú ellenőrzésnél a kép nem ismert); `distance` csak `SIMILAR`-nál.

| Válasz | Hibakód                                                    | Mikor                                                                    |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`                                         | hiányzó fájl, hibás (vagy hibásan %-kódolt) hash                         |
| 400    | `IMAGE_TOO_SMALL` / `IMAGE_TOO_LARGE` / `LOW_DETAIL_IMAGE` | 100 képpontnál kisebb oldal, 50 megapixel fölött, túl kevés részletű kép |
| 400    | `INVALID_UPLOAD`                                           | több fájl, más mezőnévben küldött fájl                                   |
| 403    | `FORBIDDEN`                                                | más webhelyről indított kérés (`Sec-Fetch-Site`) – a `GET` is            |
| 413    | `PAYLOAD_TOO_LARGE`                                        | a fájl nagyobb a megengedettnél                                          |
| 415    | `UNSUPPORTED_IMAGE` / `UNSUPPORTED_MEDIA_TYPE`             | nem (ép) kép, illetve nem `multipart/form-data` kérés                    |
| 429    | `RATE_LIMITED`                                             | túl sok ellenőrzés erről az IP-címről, vagy már folyamatban van egy      |
| 503    | `SERVER_BUSY`                                              | elfogyott a közös láncolvasási keret, vagy túl sok egyidejű fájl         |
| 503    | `CHAIN_UNAVAILABLE`                                        | a blokklánc nem érhető el; egy percig a szerver meg sem kérdezi a láncot |

A 503-as válasz `Retry-After` fejlécet is küld. Korlátok (a `RATE_LIMIT_WINDOW_MS` időablakában, alapból
15 perc): IP-címenként `VERIFY_RATE_LIMIT_MAX` (20) ellenőrzés – a `POST` és a `GET` együtt –;
minden kliensre együtt legfeljebb `VERIFY_CHAIN_READ_LIMIT` (200) láncolvasás (a hibás kérések nem
számítanak bele; ha elfogyott, vagy a lánc szünetel, a fájlt be sem olvassa); egyszerre
`VERIFY_MAX_CONCURRENT` (2) fájl-ellenőrzés, IP-címenként egy, és a fájlnak `VERIFY_BODY_TIMEOUT_MS`
(30 000 ms) alatt meg kell érkeznie – a lassan csepegtetett kérés nem foglalhatja sokáig a helyet. Az
ellenőrzés nem a feltöltések sorában fut, így nem tartja fel őket. Egy láncolvasás egy `eth_call`
(Alchemy: 26 CU): a közös keret havonta legfeljebb kb. 576 000 olvasást enged (≈ 15 millió CU), ami
az ingyenes csomag havi 30 millió CU-s keretének fele ([Alchemy árlista](https://www.alchemy.com/pricing),
[CU-költségek](https://www.alchemy.com/docs/reference/compute-unit-costs), 2026. októberi állapot). A
láncon már megtalált rekordot a szerver megjegyzi (legfeljebb 1000-et; a láncon ezek nem változnak):
ezekhez nem kell újra olvasni, a hash alapú ellenőrzésük a lánc szünetelése alatt is működik. A közös
keret szándékosan közös: néhány tucat IP-címről elfogyasztható, ilyenkor az ellenőrzés az időablak
végéig mindenkinek 503 – ez az RPC-kvóta védelmének ára (prototípus).

A képek feldolgozásakor a libvips (a sharp képkönyvtára) a nagy képet 100 MB fölött ideiglenes
fájlba bontaná ki a lemezen; a szerver ezért induláskor 256 MB-ra emeli ezt a küszöböt
(`VIPS_DISC_THRESHOLD` – ha a folyamat környezete, pl. a shell vagy a Docker, nem adja meg; a
`server/.env`-ben megadott érték erre nem hat), így a legnagyobb megengedett (50 megapixeles) kép
képpontjai is a memóriában maradnak – a feltöltött és az ellenőrzött képből semmi sem kerül
ideiglenes fájlba. Egy ilyen kép feldolgozása alatt a szerver memóriája kb. 360–390 MB-tal nő.

Kipróbálható a `server/http/verify.http` kéréseivel (VS Code REST Client).

#### Galéria, adatlap, profil (L13)

| Végpont                  | Jogosultság        | Leírás                                                                                                       |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `GET /api/photos`        | –                  | galéria: csak a nyilvános (`REGISTERED`) képek; keresés, szűrés, rendezés, lapozás                           |
| `GET /api/photos/:id`    | – (bejelentkezve)  | adatlap a regisztráció tanúsítványával; a nem nyilvános képet a tulajdonos/admin látja                       |
| `PATCH /api/photos/:id`  | tulajdonos         | cím, leírás, ár, kategória módosítása – a kép maga nem cserélhető                                            |
| `DELETE /api/photos/:id` | tulajdonos / admin | elrejtés (`HIDDEN`); a láncon a rekord megmarad                                                              |
| `GET /api/categories`    | –                  | a kategóriák név szerint (`id`, `name`, `slug`)                                                              |
| `GET /api/users/:id`     | –                  | publikus fotósprofil: név, bemutatkozás, regisztráció ideje, nyilvános képek száma, értékelések átlaga (L15) |
| `PATCH /api/me`          | bejelentkezett     | a saját megjelenített név és bemutatkozás módosítása                                                         |
| `GET /api/me/photos`     | bejelentkezett     | a saját képek minden állapotban (a rejtettek is), a legújabb elöl, lapozva                                   |

A galéria query-paraméterei – mind elhagyható; a hibás érték (pl. betű a szám helyén, ismételt
paraméter, túl hosszú keresőszó, üres érték) `400 VALIDATION_ERROR` – a kliens a be nem állított
szűrőt elhagyja, csak az üres `q` jelenti azt, hogy nincs keresés. Az ismeretlen paramétert (pl. egy
gyorsítótár-törlő `_=…`) a szerver figyelmen kívül hagyja. A galériát – mint a `/api/verify`-t –
csak a saját oldalunk kérdezheti le: más webhelyről indított kérésre `403` (a keresés költséges, egy
idegen oldal ne futtathassa a látogatói böngészőjéből).

| Paraméter               | Érték                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `q`                     | keresőszó (legfeljebb 100 karakter): kis- és nagybetűtől független részszöveg a címben, a leírásban és a fotós nevében       |
| `categoryId`, `ownerId` | kategória, illetve fotós (a profiloldal képei)                                                                               |
| `minPrice`, `maxPrice`  | ár forintban, 0–9 999 999 (a határok is beleszámítanak; a minimum nem lehet nagyobb a maximumnál)                            |
| `sort`                  | `newest` (alapértelmezés), `oldest`, `price_asc`, `price_desc` – egyenlő értéknél az azonosító dönt, így a lapozás is stabil |
| `page`, `pageSize`      | oldalszám (1–1000, alapból 1) és oldalméret (1–50, alapból 20)                                                               |

A lista-válasz (a `GET /api/me/photos`-é is) a képek mellett a lapozás adatait is megadja:

```json
{
  "data": {
    "photos": [
      {
        "id": "…",
        "title": "Tócsa tükröződéssel",
        "priceHuf": 2500,
        "status": "REGISTERED",
        "width": 1067,
        "height": 1600,
        "thumbnailUrl": "/media/thumbnails/….jpg",
        "category": { "id": 1, "name": "…", "slug": "…" },
        "owner": { "id": "…", "displayName": "…" },
        "createdAt": "2026-10-04T08:15:30.000Z",
        "rating": { "average": 4.67, "count": 3 }
      }
    ]
  },
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

- **Értékelések a listában (L20):** a listaelem a kép értékeléseinek átlagát (két tizedesre, értékelés
  nélkül `null`) és számát is megadja – egy oldalnyi képhez egyetlen, képenként csoportosító
  lekérdezéssel; a letiltott szerző értékelése (mint mindenhol) kimarad.
- **Saját képek (L22):** a `GET /api/me/photos` eleme a galéria mezőin túl a tulajdonosnak szóló
  adatokat is megadja: a leírást (`description` – a vezérlőpult szerkesztő űrlapjához), hogy ki
  rejtette el a képet (`hiddenBy`: `OWNER`, `ADMIN` vagy `OWNER_AND_ADMIN`; nem rejtett képnél
  `null` – így a tulajdonos látja, ha a moderátor vette le), és a regisztrációra váró kép már
  elküldött tranzakcióját (`pendingTransaction`, mint az adatlapon). A galéria eleme ezeket nem
  tartalmazza.
- **Adatlap:** a lista mezői (az értékelések nélkül – azokat a `GET /api/photos/:id/reviews` adja),
  valamint a leírás, a két ujjlenyomat (`sha256`, `dHash`), az előnézet URL-je és a tanúsítvány
  (`certificate`: `registeredAt`, `blockNumber`, `txHash`, `txUrl` – Sepolián Etherscan-link –,
  továbbá `chainId`, `contractAddress` és `contractUrl` – a PhotoRegistry címe és Etherscan-oldala,
  L20). A tanúsítvány csak a regisztrált képnél jelenik meg, egyébként `null`. A `GET` válaszában a
  `viewer` a bejelentkezett néző jelzője, bejelentkezés nélkül `null` (L20, L23): `purchased` (van
  kifizetett rendelése a képre – az eredetit letöltheti), `canReview` (írhat értékelést: vásárló,
  nyilvános kép, nem a sajátja, még nem értékelte – ugyanaz, amit a `POST …/reviews` ellenőriz) és
  `ownReviewId` (a saját értékelésének azonosítója, különben `null`). A `pendingTransaction` a
  regisztrációra váró kép már elküldött, de még meg nem erősített tranzakciója (`txHash`, `txUrl` –
  Sepolián Etherscan-link, a lokális láncon `null`); csak a kép kezelője (tulajdonos, admin) kapja
  meg, más állapotban és másnak `null` (L21 – a feltöltés oldalának állapotkövetéséhez). A feltöltés
  és a módosítás válasza ugyanilyen alakú, de `viewer` és `pendingTransaction` nélkül.
- **Láthatóság:** a regisztrált képet bárki látja; a regisztrációra váró, a sikertelen és az elrejtett
  képet csak a tulajdonosa és az admin – mások számára nem létezik (`404`). Az adatlap a bejelentkezést
  nem követeli meg, de az érvényes munkamenetet figyelembe veszi.
- **Módosítás, elrejtés:** idegen kép módosítására `403` a válasz, ha a kép nyilvános (a létezése úgyis
  ismert), egyébként `404`. Az admin bármelyik képet elrejtheti, de másét nem módosíthatja; az
  elrejtett kép nem módosítható (`409`). A `PATCH` csak a felsorolt mezőket fogadja el – más mező
  (pl. `sha256`, `status`, `ownerId`) `400`.
- **Elrejtés:** a kép `HIDDEN` lesz és eltűnik a galériából; a nyilvános előnézete és bélyegképe
  törlődik (URL-en sem érhető el), a privát eredeti megmarad. A láncon a rekord megmarad: a
  `/api/verify` a rejtett képre is `VERIFIED`, de a kép adatai nélkül. A még regisztrációra váró kép
  elrejtésekor a tranzakció ki sem megy. A visszaállítás adminisztrátori művelet (L16).
- **Adatvédelem:** a válaszokban nincs jelszó-hash és az eredeti fájl helye, e-mail-cím pedig csak a
  saját adatokban (`GET /api/auth/me`, `PATCH /api/me`); a bejelentkezéshez kötött válaszok
  `Cache-Control: no-store` fejlécet kapnak, az adatlap `Vary: Cookie`-t. A kérésnaplóba a
  keresőszó nem kerül be (`q=***`); az elrejtés és a jogosulatlan kísérlet a végrehajtó
  azonosítójával naplózódik.
- **Megjelenített név, cím:** nem jelenhet meg üresen – a láthatatlan karakterek (pl. nulla
  szélességű szóköz, hangul kitöltő) nem számítanak a hosszba, és kell legalább egy látható betű vagy
  szám (a regisztrációnál is).

| Válasz | Hibakód            | Mikor                                                                                |
| ------ | ------------------ | ------------------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR` | hibás query-paraméter, azonosító vagy törzs; ismeretlen mező vagy kategória          |
| 400    | `INVALID_JSON`     | a `PATCH` törzse nem érvényes JSON                                                   |
| 401    | `UNAUTHORIZED`     | módosítás, elrejtés vagy `/api/me` bejelentkezés nélkül                              |
| 403    | `FORBIDDEN`        | idegen nyilvános kép módosítása/elrejtése; más webhelyről indított kérés             |
| 404    | `NOT_FOUND`        | ismeretlen vagy a kérő számára nem látható kép; ismeretlen felhasználó               |
| 409    | `CONFLICT`         | az elrejtett (a módosítás közben elrejtett) kép módosítása                           |
| 500    | `INTERNAL_ERROR`   | a rejtett kép fájljait nem sikerült törölni (a kép már rejtett; a kérés ismételhető) |

Kipróbálható a `server/http/photos.http` (7–14. kérés) és a `server/http/users.http` kéréseivel.

#### Vásárlás és letöltés (L14)

| Végpont                                 | Jogosultság          | Leírás                                                                                                |
| --------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /api/orders/checkout`             | bejelentkezett       | fizetés indítása: `{ "photoId": "…" }` → `{ orderId, checkoutUrl }` (a Stripe fizetési oldala)        |
| `POST /api/webhooks/stripe`             | Stripe-aláírás       | a Stripe eseményei (fizetés, lejárat) – csak a Stripe hívja                                           |
| `GET /api/orders/by-session/:sessionId` | bejelentkezett       | a saját rendelés állapota a Stripe-munkamenet azonosítója alapján (a sikeres fizetés oldalához)       |
| `GET /api/me/purchases`                 | bejelentkezett       | vásárlásaim: a kifizetett (`PAID`) rendelések, a legutóbb fizetett elöl, lapozva (`page`, `pageSize`) |
| `GET /api/photos/:id/download`          | tulajdonos / vásárló | az eredeti fájl letöltése                                                                             |

A vásárlás menete (fejlesztési terv, 3.3):

1. **Indítás:** a szerver ellenőrzi, hogy a kép nyilvános (`REGISTERED`), nem a vevő sajátja, és még
   nem vette meg; létrehoz egy `PENDING` rendelést a **checkoutkori árral** (a kép árának későbbi
   módosítása nem hat rá), majd egy Stripe Checkout-munkamenetet: HUF-ban, az összeg fillérben
   (Ft × 100), a metaadatban a rendelés azonosítójával, csak kártyás fizetéssel, 31 perces
   lejárattal. A visszatérési címek (`APP_BASE_URL` + `/checkout/success?session_id=…`, illetve
   `/checkout/cancel`) a szerver konfigurációjából jönnek, a kliens nem adhatja meg őket.
2. **Fizetés** a Stripe saját oldalán – a kártyaadat a szerverhez el sem jut.
3. **Webhook:** a Stripe aláírt eseményt küld (`checkout.session.completed`); a szerver ellenőrzi az
   aláírást, és a rendelést `PAID`-re állítja – csak ha a munkamenet ki van fizetve, és az összeg és
   a pénznem egyezik a rendelésével. A lejárt munkamenet (`checkout.session.expired`) rendelése
   `EXPIRED` lesz.
4. **Visszairányítás** a sikeres fizetés oldalára, amely a `by-session` végponttal kérdezi a
   rendelés állapotát, majd `PAID` után letölthető az eredeti. A webhook késhet vagy elmaradhat,
   ezért a Stripe ajánlása szerint ez a végpont is lezárja a függő rendelést: lekérdezi a munkamenet
   állapotát a Stripe-tól, és ugyanazzal a szabállyal állítja `PAID`-re (vagy a lejártat
   `EXPIRED`-re), mint a webhook; ha a Stripe nem érhető el, a tárolt állapot jön vissza.

A rendelés (`OrderDto` – a `by-session` és a `purchases` válaszában) a vásárlásaim listához (L22) a
rendelés adatai (`id`, `status`, `amountHuf`, `createdAt`, `paidAt`) mellett megmondja a kép címét,
bélyegképét és fotósát (`photo.id`, `photo.title`, `photo.thumbnailUrl` – a rejtett képé `null` –,
`photo.ownerDisplayName`), hogy **letölthető-e** az eredeti (`downloadable`: kifizetett rendelés, és a
képet a moderátor nem vette le – ugyanaz a szabály, mint a letöltés végpontjáé), hogy **írhat-e még
értékelést** (`reviewable`: kifizetett rendelés, nyilvános kép, még nincs értékelése), és a vevő saját
értékelését (`review: { id, rating }` vagy `null`). A Stripe-munkamenet azonosítója és a kép eredetijének
helye továbbra sem kerül a válaszba.

- **Ár:** a feltöltésnél és a módosításnál is 175–9 999 999 Ft: a 175 Ft a Stripe legkisebb
  terhelhető forintösszege, a 9 999 999 Ft fillérben 9 számjegy (ennyit az American Express is
  elfogad). A korábban feltöltött, olcsóbb kép nem vásárolható (`409 NOT_PURCHASABLE`).
- **Egy élő rendelés:** egy vevőnek egy képre egyszerre legfeljebb egy függő vagy kifizetett
  rendelése lehet – ezt az adatbázis részleges egyedi indexe is kikényszeríti, így párhuzamos
  kérésekből sem lesz kettő. Az ismételt indítás a még nyitott munkamenetet adja vissza (`200`); a
  lejárt helyett új indul; a már kifizetett képre `409 ALREADY_PURCHASED`.
- **Webhook:** a nyers törzset kapja (a JSON-feldolgozó előtt fut), mert az aláírás a pontos
  bájtsorozatra szól. Hibás vagy hiányzó aláírás, 5 percnél régebbi időbélyeg vagy hibás törzs →
  `400`, feldolgozás nélkül. A feldolgozás idempotens: ugyanaz az esemény többször is megérkezhet,
  csak az első hat. Ismeretlen eseménytípusra is `200` a válasz.
- **Letöltés:** a tulajdonos (minden állapotban) és a kifizetett rendeléssel rendelkező vásárló
  töltheti le – a tulajdonos által később elrejtett képet is (a megvásárolt licenc nem vész el); a
  moderátor (admin) által elrejtettet a vásárló nem (L16). Másnak `403`, ha a
  kép nyilvános, egyébként `404`. A fájl streamként, `Content-Disposition: attachment` fejléccel megy:
  a neve a kép címe (RFC 6266 – ékezetesen, régi klienseknek ékezet nélküli tartalékkal), a tiltott
  és láthatatlan karakterek nélkül. A letöltés egy hivatkozásra kattintva indul: ha hibára fut (pl.
  lejárt munkamenet, levett kép, túl sok párhuzamos letöltés), a böngésző navigációja
  (`Sec-Fetch-Dest: document`) nyers JSON helyett egy rövid, olvasható hibaoldalt kap ugyanazzal a
  státusszal, a kép adatlapjára (és 401-nél a belépésre) mutató hivatkozással.
- **Adatvédelem, titkok:** a válaszokban nincs Stripe-munkamenet-azonosító és az eredeti fájl
  helye; a bejelentkezéshez kötött válaszok `Cache-Control: no-store` fejlécet kapnak. Csak teszt
  módú Stripe-kulcs fogadható el (`sk_test_…`); a kulcsok és a webhook-titok a naplóból is ki
  vannak takarva, a Stripe hibaüzenete nem jut a válaszba.

| Válasz | Hibakód                | Mikor                                                                                                                                         |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`     | hibás azonosító vagy törzs; a törzsben más mező is van (pl. összeg, visszatérési URL)                                                         |
| 400    | `INVALID_WEBHOOK`      | a webhook aláírása hiányzik, hibás vagy régi; a törzse nem érvényes JSON                                                                      |
| 401    | `UNAUTHORIZED`         | bejelentkezés nélkül                                                                                                                          |
| 403    | `FORBIDDEN`            | a saját kép megvásárlása; más eredetijének letöltése; az admin által elrejtett kép letöltése vásárlóként (L16); más webhelyről indított kérés |
| 404    | `NOT_FOUND`            | ismeretlen vagy nem látható kép; más felhasználó rendelése                                                                                    |
| 409    | `NOT_PURCHASABLE`      | a kép nem nyilvános, vagy az ára a Stripe minimuma alatt van                                                                                  |
| 409    | `ALREADY_PURCHASED`    | a vevő a képet már megvette                                                                                                                   |
| 409    | `CHECKOUT_IN_PROGRESS` | a fizetés indítása vagy feldolgozása éppen folyamatban – pár másodperc múlva újra                                                             |
| 413    | `PAYLOAD_TOO_LARGE`    | 256 kB-nál nagyobb webhook-törzs                                                                                                              |
| 429    | `RATE_LIMITED`         | túl sok fizetésindítás (`CHECKOUT_RATE_LIMIT_MAX`, felhasználónként)                                                                          |
| 503    | `PAYMENT_UNAVAILABLE`  | a Stripe nem érhető el (a rendelés `FAILED`, újrapróbálható)                                                                                  |

**Helyi kipróbálás a Stripe CLI-vel** ([Stripe CLI](https://docs.stripe.com/stripe-cli)): egy külön
terminálban a CLI a Stripe teszt eseményeit a helyi szerverre továbbítja, és kiírja a webhook-titkot
(`whsec_…`) – ezt kell a `server/.env` `STRIPE_WEBHOOK_SECRET` változójába írni. Az újabb CLI-nek meg
kell adni a továbbítandó eseményeket (`--events`), enélkül el sem indul:

```bash
stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:4000/api/webhooks/stripe
```

Ha a webhook mégsem érkezik meg (pl. a továbbító nem futott a fizetéskor), a vevő ismételt
fizetésindításakor a szerver lekérdezi a munkamenetet a Stripe-tól, és a kifizetett rendelést lezárja
(`409 ALREADY_PURCHASED`) – a kimaradt esemény a CLI-vel újraküldhető: `stripe events resend evt_…`.

A fizetéshez a Stripe teszt kártyája használható (`4242 4242 4242 4242`, bármely jövőbeli lejárat,
bármely CVC – [Stripe Testing](https://docs.stripe.com/testing)). Kipróbálható a
`server/http/orders.http` és a `server/http/photos.http` (15. kérés) kéréseivel.

#### Értékelések (L15)

| Végpont                        | Jogosultság       | Leírás                                                                                          |
| ------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/photos/:id/reviews`  | – (bejelentkezve) | a kép értékelései, a legújabb elöl, lapozva (`page`, `pageSize`), az átlaggal és a darabszámmal |
| `POST /api/photos/:id/reviews` | a kép vásárlója   | értékelés: `{ "rating": 1–5, "comment": "…" }` – a szöveg nem kötelező                          |
| `DELETE /api/reviews/:id`      | szerző / admin    | értékelés törlése                                                                               |

```json
{
  "data": {
    "reviews": [
      {
        "id": "…",
        "rating": 5,
        "comment": "Gyönyörű fények, köszönöm!",
        "createdAt": "2026-10-05T09:12:40.000Z",
        "author": { "id": "…", "displayName": "…" }
      }
    ],
    "rating": { "average": 4.33, "count": 3 }
  },
  "meta": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 }
}
```

- **Ki értékelhet:** csak a kép kifizetett (`PAID`) rendelésével rendelkező vásárló, csak nyilvános
  (`REGISTERED`) képet, képenként egyszer – ezt az adatbázis egyedi indexe a párhuzamos kérésekkel
  szemben is garantálja. A fotós a saját képét nem értékelheti. Módosítás nincs: a szerző törölheti az
  értékelését, és újat írhat.
- **Szöveg:** nem kötelező (a hiányzó, a `null` és az üres szöveg egyaránt „nincs szöveg”);
  legfeljebb 1000 karakter; vezérlő- és írásirány-váltó karakter nem lehet benne, és nem állhat csak
  láthatatlan karakterekből. A rejtett (a szövegben nem látszó, de géppel olvasható) karakterek
  kimaradnak – az emoji-sorozatok épek maradnak –, és két bekezdés között legfeljebb egy üres sor
  marad.
- **Láthatóság:** a nem nyilvános kép értékeléseit csak a tulajdonos és az admin látja – másnak
  `404`. A lista bejelentkezés nélkül is elérhető; a válasz `Vary: Cookie`, a bejelentkezett nézőnek
  `Cache-Control: no-store` is.
- **Törlés:** a szerző (a később elrejtett kép értékelését is) és az admin; másnak `403`, ha a kép
  nyilvános, egyébként `404`. A jogosulatlan kísérlet és a törlés (szerző vagy admin) a végrehajtó
  azonosítójával naplózódik.
- **Átlag:** a lista `rating` mezője a kép értékeléseiből, a profil (`GET /api/users/:id`) `rating`
  mezője a fotós nyilvános képeinek értékeléseiből készül – két tizedesre kerekítve, értékelés nélkül
  `average: null`.

| Válasz | Hibakód            | Mikor                                                                                                                        |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR` | hibás azonosító, lapozás vagy törzs (a csillag nem 1–5 egész szám; túl hosszú vagy csak láthatatlan szöveg; ismeretlen mező) |
| 401    | `UNAUTHORIZED`     | írás vagy törlés bejelentkezés nélkül                                                                                        |
| 403    | `FORBIDDEN`        | nem vásárló, illetve a saját kép értékelése; más értékelésének törlése; más webhelyről indított kérés                        |
| 404    | `NOT_FOUND`        | ismeretlen vagy nem látható kép; ismeretlen (törölt) értékelés                                                               |
| 409    | `CONFLICT`         | a nem nyilvános kép értékelése (a képet látó tulajdonos vagy admin)                                                          |
| 409    | `ALREADY_REVIEWED` | a felhasználó a képet már értékelte                                                                                          |

Kipróbálható a `server/http/reviews.http` kéréseivel.

#### Adminisztráció (L16)

Minden végpont csak bejelentkezett, nem letiltott **adminnak** érhető el: bejelentkezés nélkül
`401`, más felhasználónak `403`. A válaszok nem tárolhatók (`Cache-Control: no-store`); a módosító
kérést más webhely nem indíthatja. Az admin fiókot a seed hozza létre (`npm run db:seed`).

| Végpont                                         | Leírás                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /api/admin/users`                          | felhasználók, a legutóbb regisztrált elöl, lapozva; keresés e-mailre és névre (`q`), szűrő (`blocked`) |
| `PATCH /api/admin/users/:id`                    | tiltás / feloldás: `{ "isBlocked": true }`                                                             |
| `GET /api/admin/photos`                         | képek minden állapotban, a legújabb elöl, lapozva; szűrő: `status`                                     |
| `PATCH /api/admin/photos/:id`                   | elrejtés / visszaállítás: `{ "hidden": true }`                                                         |
| `POST /api/admin/photos/:id/retry-registration` | a sikertelen (`CHAIN_FAILED`) lánc-regisztráció újrapróbálása – `202`, a háttérben fut                 |
| `GET /api/admin/stats`                          | statisztika                                                                                            |

```json
{
  "data": {
    "stats": {
      "users": { "total": 4, "blocked": 1, "admins": 1 },
      "photos": {
        "total": 6,
        "byStatus": { "PENDING_CHAIN": 1, "REGISTERED": 2, "CHAIN_FAILED": 1, "HIDDEN": 2 }
      },
      "orders": { "total": 5, "byStatus": { "PENDING": 1, "PAID": 2, "EXPIRED": 1, "FAILED": 1 } },
      "revenueHuf": 4490,
      "registeredHashes": 3
    }
  }
}
```

- **Tiltás:** azonnal érvényes – a felhasználó következő kérése `403 ACCOUNT_BLOCKED`, bejelentkezni
  sem tud. A tiltás idejére a nyilvános tartalma eltűnik: a képei a galériából, az adatlapjuk, a
  profilja és az értékelései (az átlagokból is) – másnak `404`, mintha nem léteznének; a
  hitelesség-ellenőrző a lánc szerint továbbra is `VERIFIED`-et ad, de a kép adatai nélkül. A
  feloldás után minden visszajön. Semmi nem törlődik: a fájlok, a lánc rekordja és a vásárlók
  letöltési joga megmarad. A nyitott fizetései (vevőként és a képeire indítottak) lezárulnak, és az
  éppen induló fizetés sem jut fizetési oldalig. A még regisztrációra váró képeihez a tiltás idejére
  nem megy ki tranzakció (gázdíj), és az admin sem próbálhatja újra őket (`409`) – a feloldás után a
  függő regisztrációk a szerver időszakos folytatásakor (10 percenként) lezárulnak. Adminisztrátor –
  a saját fiók is – nem tiltható le (`409`).
- **Elrejtés és visszaállítás:** az elrejtés ugyanaz, mint a tulajdonosé (a nyilvános fájlok
  törlődnek, a lánc rekordja megmarad), de a kép azt is megjegyzi, ki rejtette el (`hiddenBy`:
  `OWNER`, `ADMIN`, vagy mindkettő: `OWNER_AND_ADMIN`). A két döntés független, egyik fél sem
  szüntetheti meg a másikét: a tulajdonos saját elrejtése nem oldja fel a moderátori levételt, az
  admin pedig a tulajdonos által elrejtett képen is rögzítheti a levételt. Visszaállítani csak az
  admin levételét lehet: ha a tulajdonos is elrejtette, a kép rejtett marad (csak a levétel szűnik
  meg); a csak a tulajdonos által elrejtett kép visszaállítása `409`. A visszaállításkor az előnézet
  és a bélyegkép az eredetiből újra elkészül (a képbontás a feltöltéssel és az ellenőrzéssel közös soron fut –
  `IMAGE_PROCESSING_CONCURRENCY`, a memóriakeret miatt, L32); a láncon regisztrált kép `REGISTERED`, a regisztráció nélküli `CHAIN_FAILED`
  lesz. Amíg a moderátori levétel érvényben van, a vásárlók sem tölthetik le az eredetit; a
  tulajdonos igen.
- **Nyitott fizetések:** a kép elrejtésekor (tulajdonos vagy admin) és a felhasználó tiltásakor a még
  fizetetlen Stripe Checkout-munkamenetek lejárnak (`EXPIRED`), így a levett kép nem vásárolható meg.
  Ha a Stripe nem érhető el, az elrejtés és a tiltás akkor is megtörténik, a hiba a naplóba kerül
  (a munkamenet ilyenkor legfeljebb a 31 perces élettartama végéig fizethető).
- **Újrapróbálás:** valódi tranzakciót küld (gázdíj) – adminonként legfeljebb
  `CHAIN_RETRY_RATE_LIMIT_MAX` (10) kérés `RATE_LIMIT_WINDOW_MS` alatt; csak a `CHAIN_FAILED` (vagy
  futó feladat nélkül beragadt `PENDING_CHAIN`) kép próbálható újra.
- **Statisztika:** a bevétel a kifizetett rendelések összege forintban; a láncon regisztrált hash-ek
  közé a később elrejtett regisztrált kép is beleszámít (a lánc rekordja megmarad).
- **Napló:** a tiltás, a feloldás, az elrejtés, a visszaállítás és az újrapróbálás a végrehajtó admin
  azonosítójával naplózódik (e-mail-cím nélkül).

| Válasz | Hibakód            | Mikor                                                                                                                                                                    |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR` | hibás azonosító, lapozás, szűrő vagy törzs (nem logikai érték, ismeretlen mező – pl. `role` vagy `status`)                                                               |
| 401    | `UNAUTHORIZED`     | bejelentkezés nélkül                                                                                                                                                     |
| 403    | `FORBIDDEN`        | nem admin felhasználó; más webhelyről indított kérés                                                                                                                     |
| 403    | `ACCOUNT_BLOCKED`  | letiltott admin                                                                                                                                                          |
| 404    | `NOT_FOUND`        | ismeretlen felhasználó vagy kép                                                                                                                                          |
| 409    | `CONFLICT`         | admin tiltása; a csak a tulajdonos által elrejtett kép visszaállítása; a nem újrapróbálható (pl. letiltott fotósú) kép újrapróbálása; a kép állapota közben megváltozott |
| 429    | `RATE_LIMITED`     | túl sok újrapróbálás (`CHAIN_RETRY_RATE_LIMIT_MAX`, adminonként)                                                                                                         |
| 500    | `INTERNAL_ERROR`   | a visszaállításkor az előnézet nem készült el (pl. hiányzó eredeti fájl) – a kép rejtett marad                                                                           |

Kipróbálható a `server/http/admin.http` kéréseivel.

**Leállítás:** abban a terminálban, ahol a szerver fut, **Ctrl+C**. Windows alatt ekkor megjelenhet
a „Terminate batch job (Y/N)?” kérdés – erre **Y**, majd Enter. Ha a 4000-es port ezután is foglalt
marad (új indításkor `EADDRINUSE` hiba), PowerShellben a portot foglaló folyamat leállítható:

```powershell
Get-NetTCPConnection -LocalPort 4000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }
```

### Webes felület (`client/`, L18-tól)

React 19 + TypeScript + Vite 8 egyoldalas alkalmazás (Tailwind CSS v4, React Router 8, TanStack
Query 5, lucide-react ikonok). A felület az API-t **azonos originen** éri el: fejlesztéskor a Vite
dev szervere a `/api` és a `/media` kéréseket a 4000-es portra továbbítja (proxy), így a
munkamenet-süti és a szerver CSRF-védelme (`Sec-Fetch-Site: same-origin`) változtatás nélkül működik.

```bash
cd client
npm install
npm run dev        # http://localhost:5173 (a szervernek is futnia kell: npm run dev a server/ mappában)
```

Vagy a gyökérből egyszerre a szerver és a kliens: `npm run dev`. Leállítás: **Ctrl+C** (Windows alatt
a „Terminate batch job (Y/N)?” kérdésre **Y**); ha az 5173-as port foglalt marad, a fenti PowerShell-
parancs `-LocalPort 5173` értékkel szabadítja fel.

| Parancs (a `client/` mappában)  | Leírás                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                   | Fejlesztői szerver (5173, kötött port) proxyval                         |
| `npm test` / `npm run coverage` | Vitest + Testing Library + axe-core tesztek / lefedettség (küszöb: 80%) |
| `npm run lint`                  | ESLint                                                                  |
| `npm run typecheck`             | TypeScript-ellenőrzés                                                   |
| `npm run build`                 | Produkciós build a `client/dist/` mappába                               |

A kezdőlap a galéria (L20): keresés a címben, a leírásban és a fotós nevében, kategória- és
árszűrő, rendezés, lapozás – a nézet az URL-ben van (`/?q=tó&categoryId=2&sort=price_asc&page=2`),
így megosztható, és a vissza gomb is működik. A kártyán a vízjeles bélyegkép, a cím, a fotós, az ár,
az átlagos értékelés és a „Hitelesítve” jelzés áll. A kép adatlapja (`/photos/:id`): vízjeles
előnézet, leírás és adatok, ár, a blokklánc-tanúsítvány (hálózat, a regisztráció ideje, SHA-256 –
másolható –, dHash, blokk, tranzakció és szerződés az Etherscanen) és az értékelések. A vásárlás
gombja vendégnek a belépésre visz, a vevőnek az eredeti letöltését kínálja. Fejlesztői módban a
`/_komponensek` oldal az UI-alapkomponenseket mutatja be; a produktív buildbe nem kerül be. A kliens
felépítését a [client/README.md](../client/README.md) írja le.

Vásárlás és vezérlőpult (L22): a bejelentkezett néző „Megveszem” gombja a `POST /api/orders/checkout`
végponttal rendelést indít, és a Stripe fizetési oldalára irányít – a kliens csak a
`https://checkout.stripe.com` eredetű címre irányít át, bármi mást hibának tekint. A fizetés után a
Stripe a `/checkout/success?session_id=…` oldalra irányít vissza, amely a rendelés állapotát
3 másodpercenként kérdezi (`GET /api/orders/by-session/:id`), amíg `PAID` nem lesz (a Stripe
webhookja vagy maga a lekérdezés zárja le), majd az eredeti letöltését kínálja; a megszakított fizetés a `/checkout/cancel?photoId=…`
oldalra tér vissza (nem történt terhelés). A vezérlőpult (`/dashboard`, két fül az URL-ben:
`?tab=kepeim|vasarlasaim`, `?page=`) a saját képeket minden állapotban mutatja – állapotjelvénnyel, a
függő regisztráció tranzakciójával, a levétel okával („Te vetted le” / „Moderátor eltávolította”) –,
szerkesztéssel (`PATCH /api/photos/:id`) és levétellel (`DELETE /api/photos/:id`, megerősítő
párbeszédablakkal); a Vásárlásaim fül a kifizetett rendeléseket a letöltés gombjával és a saját
értékeléssel (vagy az értékelés írásának hivatkozásával – L23).

Fotósprofil és értékelések (L23): a `/users/:id` oldal a fotós publikus profilja (`GET /api/users/:id`:
név, a csatlakozás ideje, a bemutatkozás szövegként, a nyilvános képek száma és értékeléseinek
átlaga) a hitelesített képeinek rácsával (`GET /api/photos?ownerId=…`, lapozva); a saját profil
párbeszédablakban szerkeszthető (`PATCH /api/me`), a név a fejlécben is frissül. Az adatlapon a kép
vásárlója értékelést írhat (`POST /api/photos/:id/reviews` – a csillag kötelező, a vélemény nem; az
űrlap csak akkor látszik, ha a `viewer.canReview` igaz), és a saját értékelését törölheti
(`DELETE /api/reviews/:id`, megerősítéssel); a fotós neve a profiljára mutat, a fiókmenüben „Profilom”.

Hitelesség-ellenőrző oldal (L24): a `/verify` oldal bejelentkezés nélkül használható – egy kép
behúzásával vagy tallózásával (`POST /api/verify`; a fájl a szerveren nem tárolódik, a neve el sem megy;
a rövidebb oldal már 100 képponttól ellenőrizhető), vagy a SHA-256 hash beírásával
(`GET /api/verify/:sha256` – a `0x` előtagú, nagybetűs alak is jó). Az eredmény kártyája a bizalom
vizuális nyelvén a három esetet mutatja: „Hiteles, regisztrált kép” (zöld – a kép és a fotós
hivatkozásával, a regisztráció idejével, a blokkal és a tranzakció Etherscan-linkjével; a nem nyilvános
képnél csak a lánc adatai), „Hasonló regisztrált kép” (borostyán – az eltérés a 64 bites vizuális
ujjlenyomatban és az eredeti adatlapja) és „Nincs a nyilvántartásban” (semleges – a kiszámolt hash
másolható; nem jelent hamisítást). Egyszerre egy ellenőrzés futhat, és a szerver kérte várakozás
(`Retry-After`) alatt a kliens nem indít újat. A „Hogyan működik?” magyarázat az adatlap
tanúsítványának „Mit jelent ez?” hivatkozásának célja; a fejlécben „Ellenőrzés” menüpont.

Admin felület (L25): az `/admin` oldal csak adminisztrátornak nyílik meg (a bejelentkezett, nem admin
felhasználó „Nincs jogosultság” oldalt kap; a szerver minden kérésnél maga is ellenőrzi a szerepkört).
Statisztikai kártyák (`GET /api/admin/stats`: felhasználók – tiltott, admin –, képek és rendelések
állapotonként, bevétel, a láncon regisztrált hash-ek száma); a felhasználók táblázata kereséssel (név,
e-mail), tiltási szűrővel és lapozással (`GET /api/admin/users`), letiltás megerősítéssel – a
következmények felsorolva – és feloldás (`PATCH /api/admin/users/:id`; adminisztrátor nem tiltható, a
felület gombot sem kínál rá); a képek táblázata minden állapotban, állapotszűrővel és darabszámmal
(`GET /api/admin/photos`): elrejtés megerősítéssel és visszaállítás (`PATCH /api/admin/photos/:id` – a
tulajdonos saját elrejtését az admin nem írja felül), a sikertelen regisztráció újrapróbálása
(`POST /api/admin/photos/:id/retry-registration`; amíg van várakozó kép, a lista 3 másodpercenként
frissül). A művelet után a sor azonnal a szerver válaszából frissül, majd a listák, a statisztika, a
galéria és az adatlapok gyorsítótára érvénytelenedik. A nézet (keresés, szűrők, a két lista oldala) az
URL-ben van; keskeny képernyőn a táblázatok vízszintesen görgethetők. A fejlécben „Admin” menüpont.

Belépés és regisztráció (L19): a `/login` és a `/register` oldal a szerver szabályai szerint, már
beküldés előtt ellenőriz; bejelentkezve a fejlécben a monogramos fiókmenü (név, e-mail-cím,
kijelentkezés) jelenik meg. A munkamenetet a szerver `HttpOnly` sütije hordozza – a kliens a tokent nem
látja, induláskor és ablakváltáskor a `GET /api/auth/me` válaszából tudja, ki van bejelentkezve. Védett
oldalról (a későbbi feltöltés, vezérlőpult, admin) bejelentkezés nélkül a belépésre irányít, és utána
oda tér vissza; fejlesztői módban ezt a `/_vedett` és az `/_admin` próbaoldal mutatja be. A
jogosultságot minden kérésnél a szerver dönti el – a felület csak követi.

## Gyökérszintű scriptek

| Parancs                     | Leírás                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run format`            | A teljes kódbázis formázása Prettierrel                                                    |
| `npm run format:check`      | Formázás ellenőrzése (nem módosít fájlt)                                                   |
| `npm run install:all`       | Függőségek telepítése minden alprojektben                                                  |
| `npm run dev`               | Szerver és kliens együttes indítása fejlesztői módban                                      |
| `npm run dev:server`        | Csak a szerver indítása                                                                    |
| `npm run dev:client`        | Csak a kliens indítása                                                                     |
| `npm run build`             | Szerver és kliens produkciós buildje                                                       |
| `npm test`                  | Design-, okosszerződés-, szerver- és klienstesztek                                         |
| `npm run design:test`       | A design tokenek és a stílusútmutató tesztjei                                              |
| `npm run design:check`      | A színpárosok WCAG 2.2 AA kontrasztja, táblázattal                                         |
| `npm run design:styleguide` | A stílusútmutató újragenerálása a témából                                                  |
| `npm run test:e2e`          | End-to-end tesztek (Playwright, lásd e2e/README.md)                                        |
| `npm run lint`              | Kódellenőrzés (ESLint) a szerveren és a kliensen                                           |
| `npm run typecheck`         | TypeScript-ellenőrzés a négy alprojektben (blockchain, server, client, e2e)                |
| `npm run coverage`          | Szerver- és klienstesztek lefedettséggel (80% küszöb)                                      |
| `npm run check`             | A CI ellenőrzései egyben (formázás, lint, típusok, tesztek lefedettséggel), a build nélkül |
| `npm run docker:up`         | A teljes rendszer konténerben (adatbázis + migráció + alkalmazás), lásd lent               |
| `npm run docker:down`       | A konténerek leállítása (az adatbázis adatai megmaradnak)                                  |
| `npm run docker:logs`       | Az alkalmazáskonténer naplója (követve)                                                    |

### Konténer (Docker, L31)

A teljes rendszer egy paranccsal indul konténerben, a http://localhost:4000 címen – a webes felületet
és az API-t ugyanaz a szerver szolgálja ki:

```bash
npm run docker:up
```

- **Kép** (`Dockerfile`, többlépcsős build):
  1. a kliens buildje (Vite);
  2. a szerver buildje (Prisma-kliens, TypeScript);
  3. a futtatókép `node:24-slim` alapon (L32-től pontos verzióra és digestre rögzítve, a frissítést a
     fejlesztői repóban a Dependabot javasolja): csak a futtatáshoz szükséges függőségek, nem root
     felhasználó (`node`), betűkészlet a vízjelhez, állapotellenőrzés (`/api/health`).
- **Compose** (`docker-compose.yml`, `app` profil):
  - a `migrate` szolgáltatás egyszer lefuttatja a `prisma migrate deploy`-t, utána indul az `app`;
  - a megszokott `docker compose up -d` továbbra is csak a fejlesztői adatbázist indítja (az `npm run
dev` mellé).
- **Beállítások:** az alkalmazás a `server/.env` változóit kapja. A Compose felülírja:
  - az adatbázis címét (a `db` szolgáltatás);
  - a kliens címét (`APP_BASE_URL=http://localhost:4000`);
  - az éles módot (`NODE_ENV=production`);
  - a proxyugrások számát (`TRUST_PROXY_HOPS=0`, mert nincs proxy előtte).

  A feltöltött képek a fejlesztéssel közös `server/uploads` mappába kerülnek.

- **Figyelem:** a `server/.env` lánc-beállításával a konténerből is valódi (Sepolia) tranzakció megy
  ki feltöltéskor. A helyi Hardhat-lánc (`http://127.0.0.1:8545`) a konténerből nem érhető el.
- **Titkok:** a teljes `server/.env` a konténer környezeti változói közé kerül (a képbe nem). A
  Docker Desktop „Inspect” nézete és a `docker inspect` megmutatja őket: erről képernyőkép ne
  készüljön.
- **Linuxon** az első indítás előtt hozd létre a feltöltési mappát a saját felhasználóddal
  (`mkdir -p server/uploads`): a konténer `node` felhasználója (uid 1000) ír bele. Ha hiányzik, a
  Docker root tulajdonnal hozza létre, és a feltöltés jogosultsági hibával áll meg. Windowson és
  macOS-en (Docker Desktop) ez nem kell.
- **Védelmek:**
  - nem root felhasználó, Linux-jogosultságok nélkül (`cap_drop: ALL`, `no-new-privileges`);
  - memóriakeret 2 GB, folyamatkorlát 256;
  - a portok csak a saját gépről érhetők el (`127.0.0.1`).
- **Leállítás:** `npm run docker:down`. A `down -v` az adatbázist is törli!

### Élesítés (Render + Supabase, L32)

Az élő rendszer: **https://photochain.onrender.com** – ingyenes csomagokon, a Sepolia teszthálózattal
és a Stripe teszt módjával. A telepítési ábra: `docs/diagramok/telepites.mmd`.

- **Felépítés:**
  - **Render** Web Service a `render.yaml` (Blueprint) alapján: a repó `Dockerfile`-jából épül (az
    L31-es kép), Frankfurtban, az ingyenes példányon (512 MB, 0,1 CPU). Az állapotát a
    `/api/health` végponton ellenőrzi, és csak a CI sikere után telepít újra. Előtte a Cloudflare
    és a Render terheléselosztója áll (TLS, http → https).
  - **Supabase:** PostgreSQL 17 a Session poolerén át (5432-es port, IPv4), a tanúsítvány
    ellenőrzésével; Storage két **privát** buckettel (`originals`, `previews`).
  - **A képek a szerveren át:** a `/media` útvonal a Supabase-ből adja tovább az előnézetet és a
    bélyegképet (az eredetit soha), a kép láthatóságának ellenőrzése után, `Cache-Control: private`
    fejléccel és IP-címenkénti korláttal. Így a kliens és a CSP változatlan, és az elrejtett vagy a
    letiltott fotóshoz tartozó kép azonnal eltűnik – az ingyenes Supabase-CDN egy órán át
    gyorsítótárazná.
  - **Sepolia:** ugyanaz a szerződés és platform-tárca, mint fejlesztéskor.
- **Az éles változók** (`server/.env.production.example`, értékek nélkül; a szabályok:
  `server/src/config/env.ts`):

  | Változó                                                                       | Jelentés                                                                                                                                                                          |
  | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`              | a tárhely: a projekt címe és a titkos kulcs (`sb_secret_…`, csak a szerveren)                                                                                                     |
  | `SUPABASE_ORIGINALS_BUCKET`, `SUPABASE_PREVIEWS_BUCKET`, `STORAGE_TIMEOUT_MS` | a két bucket neve (alapból `originals`, `previews`; nem lehet azonos), a tárhely-hívás időkorlátja (alapból 20 000 ms)                                                            |
  | `DATABASE_SSL_CA_FILE`                                                        | a Supabase CA-tanúsítványa (a konténerben `/app/server/certs/supabase-prod-ca-2021.crt`); élesben távoli adatbázishoz kötelező, mellette a `DATABASE_URL`-ben nem lehet `sslmode` |
  | `IMAGE_MAX_MEGAPIXELS`, `IMAGE_PROCESSING_CONCURRENCY`                        | képpontkorlát (1–50, alapból 50; Renderen 25 – a kliens buildje is megkapja) és a közös képfeldolgozási sor szélessége (1–8, alapból 4; Renderen 1)                               |
  | `VERIFY_MAX_CONCURRENT`, `UPLOAD_MAX_CONCURRENT`                              | Renderen 1 és 2 (a memóriakeret miatt)                                                                                                                                            |
  | `MEDIA_RATE_LIMIT_MAX`                                                        | a `/media` kérései IP-címenként időablakonként (alapból 600 / 15 perc; helyi tárhelynél is, mert minden kérés adatbázis-lekérdezés)                                               |
  | `TRUST_PROXY_HOPS`                                                            | a proxyk száma a kliens és a szerver között – mérve: 3 (lásd lent)                                                                                                                |
  | `APP_BASE_URL`                                                                | élesben kötelező (a nyilvános cím)                                                                                                                                                |

- **Telepítés lépésről lépésre** (egyszer kell):
  1. **Supabase:** új projekt (Free).
     - Storage: két bucket, `originals` és `previews`, mindkettő **Public kikapcsolva** (ajánlott:
       15 MB, `image/jpeg, image/png, image/webp`).
     - Project Settings → Data API: kikapcsolni (a táblákon RLS is védi, L32-es migráció).
     - Database → SSL Configuration: **Enforce SSL** bekapcsolása; a CA letöltése
       (`prod-ca-2021.crt`) `server/certs/supabase-prod-ca-2021.crt` néven (nyilvános tanúsítvány,
       a repóban van).
     - API Keys → új titkos kulcs (`sb_secret_…`).
     - Connect → Session pooler URI: a felhasználónév `postgres.<projekt-azonosító>`, `sslmode`
       nélkül.
  2. **`server/.env.production`** a mintából (`server/.env.production.example`) – a git és a
     Docker-build kizárja, a tartalma titkos.
  3. **Táblák és kezdő adatok** a `server/` mappából (a Render ingyenes csomagjában nincs
     migrációs lépés és parancssor, ezért a saját gépről):

     ```bash
     npm run production:migrate
     ```

     ```bash
     npm run production:seed -- --allow-remote-database
     ```

  4. **Render:** New + → Blueprint → a repó. A `render.yaml` titkait (`sync: false`) a Render
     bekéri – ugyanazok, mint a `.env.production`-ben. A `SEED_…` értékek nem kellenek, a
     `JWT_SECRET`-et a Render állítja elő. Az első build kb. 5–10 perc; a naplóban „Az
     adatbázis-kapcsolat rendben” és „A képek tárhelye: Supabase Storage” jelzi a sikert.
  5. **Stripe** (teszt mód): Workbench → Webhooks → Create an event destination:
     - Your account, Snapshot payload;
     - a négy esemény: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
       `checkout.session.async_payment_failed`, `checkout.session.expired`;
     - végpont: `https://<cím>/api/webhooks/stripe`.

     A végpont `whsec_…` titka kerül a Render `STRIPE_WEBHOOK_SECRET` változójába (a
     `stripe listen` titka itt nem jó).

  6. **A proxyugrások mérése:** egy `X-Forwarded-For` fejléc nélküli kérés a
     `https://<cím>/api/health?proxy_probe=1` címre. A Render naplójában a „Proxylánc: az
     X-Forwarded-For fejlécben N bejegyzés van” sor N értéke kerül a `TRUST_PROXY_HOPS`-ba
     (2026-10-13: 3 – Cloudflare és a Render két rétege). Ellenőrzés: a sebességkorlát kulcsa
     (a `RateLimit-Policy` fejléc `pk` lenyomata) hamis `X-Forwarded-For` mellett is a saját
     IP-címé maradjon.
- **Korlátok, figyelmeztetések:**
  - A Render 15 perc tétlenség után elalszik (az első kérés kb. 1 perc), a Supabase-projekt egy
    hét tétlenség után szünetel (Dashboard → Resume project). **A bemutató előtt mindkettőt
    ébreszd fel.**
  - Képfeldolgozás 0,1 CPU-n: egy 15 MP-es JPEG kb. 6 s, egy 25 MP-es WebP kb. 10 s; 25 MP fölött
    a kép elutasítva (a mérés: fejlesztési napló, L32).
  - Élesben csak olyan saját fotót tölts fel, amely még nincs regisztrálva a Sepolián – a
    fejlesztéskor regisztrált képeket a közös szerződés miatt „már regisztrált”-nak látja.
  - Ingyenes keretek: Supabase – 500 MB adatbázis, 1 GB tárhely, havi 5 GB kimenő forgalom;
    Render – havi 750 példányóra.
  - A `server/.env.production` és a Render Environment oldala titkos: erről képernyőkép ne
    készüljön.

### Folyamatos integráció (CI)

A GitHub Actions munkafolyamat (`.github/workflows/ci.yml`) a `main` ágra érkező minden push-ra és
minden pull requestre (kézzel is indítható) lefuttatja a `npm run check` ellenőrzéseit külön
lépésekben – formázás, lint, design-tesztek, okosszerződés-tesztek, típusellenőrzés, a szerver, majd
a kliens tesztjei lefedettséggel –, végül a produkciós buildet, Ubuntu-futtatón, Node.js 24-gyel. A
szerver adatbázis-tesztjeihez PostgreSQL 17 szolgáltatás-konténer fut (a `TEST_DATABASE_URL` a
munkafolyamatban van megadva, titkos kulcs nem kell), a lánctesztek saját lokális Hardhat-hálózatot
indítanak, a Stripe hamisított. A szerver és a kliens HTML-lefedettségi jelentése a futás
mellékleteként (`lefedettseg`) tölthető le (a kliensé akkor is, ha a szerveré bukott). Ugyanez
helyben: `docker compose up -d`, a `TEST_DATABASE_URL` a `server/.env`-ben, majd `npm run check` és
`npm run build`. Külön `e2e` feladatban (L28) a Playwright end-to-end tesztek futnak Chromiummal –
ugyanazzal a PostgreSQL-konténerrel, saját lokális Hardhat-lánccal; a vásárlás forgatókönyve ott
kimarad, mert Stripe-tesztkulcs nincs a CI-ban –, a HTML-riport (a bukott tesztek trace-eivel) és a
folyamatok naplói a `playwright-riport` melléklet.

### End-to-end tesztek (Playwright, L28)

Az `e2e/` alprojekt a teljes folyamatot a böngészőből próbálja ki: regisztráció → feltöltés →
„Hitelesítve” jelvény (lokális Hardhat-láncon); ugyanaz a kép másik fiókkal → elutasítás; vásárlás
a Stripe fizetési oldaláig, ahol a fizetést a Stripe SDK `generateTestHeaderString` segédjével
aláírt tesztwebhook igazolja → letöltés és értékelés; a nyilvános ellenőrző oldal (kép és SHA-256
hash alapján); valamint az adminfolyamat (elrejtés megerősítéssel, visszaállítás). A környezetet a
tesztfuttató építi fel és bontja le (`e2e/setup/global.ts`): lefordítja a szervert és a klienst,
lokális láncot indít és telepíti rá a szerződést, migrálja, kiüríti és seedeli a tesztadatbázist,
majd elindítja a lefordított szervert (eldobható titkokkal) és a kliens `vite preview`
kiszolgálóját. Minden futásról nyomkövetés készül, a HTML-riport a trace viewerrel nyitható
(`npm run report` az `e2e/` mappában). Előfeltételek és részletek: [e2e/README.md](../e2e/README.md).

### A hitelesítés kiértékelése (L29)

Két script méri ki a dolgozat „Eredmények / Értékelés” fejezetéhez, hogy mit ér a hitelesítés, és
mibe kerül (a `server/` mappából, az eredmények a `docs/kiertekeles/` mappába kerülnek):

- `npm run experiment:hash` – robusztusság: a `tests/fixtures/images/` saját tesztfotóiból a script
  módosított másolatokat állít elő (kicsinyítés, JPEG- és WebP-újratömörítés, vágás, fényerő,
  szürkeárnyalat, felirat, a platform saját vízjeles előnézete, valamint az ismert korlátok: tükrözés,
  forgatás; ha van `originals/` almappa, a teljes felbontású eredetit is), és megméri, egyezik-e még az
  SHA-256, mekkora a dHash-távolság, melyik küszöbnél hány másolatot ismer fel a rendszer, és hány
  különböző képpárt tekintene tévesen másolatnak. Kimenet: `hash-experiment.csv`,
  `hash-experiment-comparisons.csv`, `hash-experiment.md`/`.html` (táblázatok), `hash-experiment-chart.html`
  és `hash-experiment-sheet.html` (ábrák).
- `npm run experiment:gas` – költség: a regisztráció gázfelhasználása (az adatbázis regisztrált
  képeiből, illetve a Sepolia- és Hardhat-mérésből) szorozva az aktuális gázárral az Ethereum-
  főhálózaton és két L2-hálózaton (Base, OP Mainnet, az L1-adatdíjjal együtt), ETH-árfolyammal
  USD-ben és forintban; csak nyilvános, olvasó lekérdezések, titkos kulcs nem kell. Kimenet:
  `gas-cost.md`/`.html`/`.csv` (időbélyeggel – a gázár és az árfolyam pillanatnyi).

A mérések részletes értékelése a fejlesztési napló L29-es bejegyzésében olvasható.

### Biztonsági átvizsgálás (L30)

Az OWASP Top 10:2025 szerinti ellenőrzőlista a
[docs/biztonsag/owasp-ellenorzolista.md](biztonsag/owasp-ellenorzolista.md) dokumentumban
van: kategóriánként mit ellenőriztünk, hol a kódban (`fájl:sor`), mi az eredmény, mi maradt
elfogadott kockázat. A dokumentum tartalmazza még:

- az `npm audit` előtte–utána állapotát;
- az okosszerződés és a platform-kulcs kockázatát, a kompromittálódás esetére szóló eljárásrenddel;
- az L31–L32 lépésre tartozó éles beállításokat.

A függőségek ellenőrzése bármikor megismételhető (mind az öt csomagban):

```bash
npm audit && npm audit --prefix blockchain && npm audit --prefix server && npm audit --prefix client && npm audit --prefix e2e
```

## Konvenciók

- **Nyelv:** TypeScript az elsődleges nyelv, Solidity az okosszerződéshez.
- **Commitok:** [Conventional Commits](https://www.conventionalcommits.org/), a fejlesztési lépés
  azonosítójával, magyar leírással – például `feat(L10): képfeltöltés vízjeles előnézettel`.
- **Formázás:** Prettier (`.prettierrc`) és EditorConfig (`.editorconfig`); LF sorvégek
  (`.gitattributes`).
- **Titkos kulcsok:** kizárólag `.env` fájlokban, amelyek nem kerülnek a repóba; a szükséges
  változók nevét a `.env.example` fájlok tartalmazzák.
- **Forrásmegjelölés:** a dokumentációból vagy nyílt forrásból átvett minták a kódban kommenttel,
  a [docs/FORRASOK.md](FORRASOK.md) fájlban pedig listaszerűen szerepelnek.

## Dokumentáció

- [Fejlesztési terv](FEJLESZTESI_TERV.md) – követelmények, architektúra, lépések (L01–L33)
- [Fejlesztési napló](fejlesztesi-naplo.md) – lépésenkénti eredmények és döntések
- [Demó-forgatókönyv](DEMO_FORGATOKONYV.md) – az 5 perces védési bemutató menete, előkészítése
  és tartalékai (L33)
- [Kipróbálási útmutató](KIPROBALAS.md) – telepítés, ellenőrzések és helyi indítás külső fiókok
  nélkül, helyi Hardhat-lánccal (tiszta példányon végigpróbálva)
- [A szakdolgozat vázlata](SZAKDOLGOZAT_VAZLAT.md) – az írott rész fejezetei, fejezetenként az
  alapanyaggal, ábrákkal, mérésekkel és forrásokkal
- [Források](FORRASOK.md) – a felhasznált dokumentációk és szakirodalom
- [UI-terv](design/README.md) – design tokenek (`client/src/styles/theme.css`), a generált
  [stílusútmutató](design/stilusutmutato.html), hat drótváz (`docs/design/drotvazak/`),
  tervezési elvek (Nielsen) és akadálymentesség (WCAG 2.2 AA)
- `docs/screenshots/` – a dolgozathoz készült képernyőképek
- `docs/kiertekeles/` – a hitelesítés kiértékelésének mérési eredményei (L29): robusztusság (CSV,
  táblázatok, ábrák) és a lánc-regisztráció költségbecslése
- [Biztonsági ellenőrzőlista](biztonsag/owasp-ellenorzolista.md) – OWASP Top 10:2025 szerinti
  átvizsgálás, elfogadott kockázatok, a platform-kulcs kezelése (L30)
- `docs/diagramok/` – architektúra- és folyamatábrák
- `tools/screenshot/render.mjs` – képernyőkép-generátor terminálkimenethez és forráskódhoz, pl.
  `node tools/screenshot/render.mjs code --file blockchain/contracts/PhotoRegistry.sol --symbol "function registerPhoto" --out minta.png`;
  HTML-oldalról mobilnézetben is (500 px alatt iframe-be teszi az oldalt):
  `node tools/screenshot/render.mjs html --file docs/design/drotvazak/galeria.html --width 390 --height 1600 --out minta.png`;
  futó helyi alkalmazásról (csak localhost):
  `node tools/screenshot/render.mjs url --url http://localhost:5173/ --width 1280 --height 800 --out minta.png`
