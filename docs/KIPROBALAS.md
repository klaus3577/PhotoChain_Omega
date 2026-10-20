# A PhotoChain kipróbálása és ellenőrzése

Ez a leírás azt mutatja be, hogyan telepíthető, ellenőrizhető és próbálható ki a projekt egy tiszta
gépen, **külső fiókok nélkül** – az Alchemy, az Etherscan, a Stripe és a MetaMask nem kell. A Sepolia
teszthálózat helyett egy helyi Hardhat-fejlesztői lánc fut; a vásárlás (Stripe) és az arra épülő
funkciók – a megvett eredeti letöltése és az értékelés – kivételével minden funkció így is
kipróbálható. A Sepoliával és a Stripe teszt módjával működő változat élőben is
elérhető: **https://photochain.onrender.com** (az ingyenes szolgáltatás az első kérésre kb. egy perc
alatt ébred).

A lépéseket egy tiszta mappába kicsomagolt példányon végigpróbáltuk (Windows 11, Node.js 24.17,
Docker Desktop, 2026. október). A részletes leírás a [RESZLETES_LEIRAS.md](RESZLETES_LEIRAS.md)-ben, a lépésenkénti
fejlesztés a [fejlesztési naplóban](fejlesztesi-naplo.md) olvasható.

## Előfeltételek

- [Node.js 24 LTS](https://nodejs.org/) (npm-mel együtt) és [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) – fusson a parancsok előtt
- kb. 3 GB szabad hely a függőségeknek, internetkapcsolat a telepítéshez
- szabad portok: 5432 (adatbázis), 4000 (API), 5173 (webes felület), 8545 (helyi lánc), 4173 (e2e)

A parancsok a projekt gyökérmappájából indulnak, ha a leírás mást nem mond. A példák PowerShellre
szólnak; macOS-en és Linuxon a `Copy-Item` helyett `cp` kell.

## 1. Telepítés

```bash
git clone https://github.com/klaus3577/PhotoChain_Omega.git
cd PhotoChain_Omega
```

(Git nélkül a GitHub-oldal „Code → Download ZIP” gombjával is letölthető; ekkor a kicsomagolt
mappában kell folytatni.) A függőségek telepítése:

```bash
npm run install:all                    # a gyökér és a négy alprojekt függőségei
npm run install:browsers --prefix e2e  # a Chromium a böngészős (e2e) tesztekhez
```

## 2. Beállítások (`.env`)

A beállítások két `.env` fájlban vannak; ezek nem részei a projektnek, a sablonokból kell létrehozni
őket:

```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
```

Véletlen érték (jelszó, kulcs) előállítása:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
```

A gyökér `.env`-jében csak a `POSTGRES_PASSWORD`-ot kell kitölteni (egy véletlen érték a fenti
paranccsal). A `server/.env` értékei a helyi kipróbáláshoz:

| Változó                                     | Érték                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                | véletlen érték a fenti paranccsal (legalább 32 karakter)                                       |
| `DATABASE_URL`                              | `postgresql://photochain:<POSTGRES_PASSWORD>@localhost:5432/photochain`                        |
| `TEST_DATABASE_URL`                         | `postgresql://photochain:<POSTGRES_PASSWORD>@localhost:5432/photochain_test`                   |
| `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD` | szabadon választott jelszavak (legalább 8 karakter) az admin és a két demó felhasználó számára |
| `RPC_URL`                                   | `http://127.0.0.1:8545` (a helyi Hardhat-lánc)                                                 |
| `CHAIN_ID`                                  | `31337` – a sablonban megjegyzés, a sor elejéről a `#` jelet törölni kell                      |
| `PLATFORM_PRIVATE_KEY`                      | a Hardhat 0. fejlesztői fiókjának nyilvánosan ismert kulcsa (lásd alább)                       |
| `STRIPE_SECRET_KEY`                         | saját Stripe-teszt-kulcs híján egy helyettesítő érték, pl. `sk_test_helyettesito`              |
| `STRIPE_WEBHOOK_SECRET`                     | `whsec_` és legalább 24 betű vagy szám, pl. `whsec_helyettesito0helyettesito0`                 |

A `PLATFORM_PRIVATE_KEY`-hez indítsd el a helyi láncot (külön terminálban, futva maradhat – az 5.
pontban is kell):

```bash
cd blockchain
npm run node
```

A kiírt lista első eleme (`Account #0`) alatti `Private Key: 0x…` érték kell. Ez a Hardhat beépített,
mindenki által ismert fejlesztői kulcsa: csak a helyi láncon használható, valódi pénz nincs mögötte.

A helyettesítő Stripe-kulccsal a szerver elindul, csak a „Megveszem” gomb ad hibát (így a
vásárláshoz kötött letöltés és értékelés sem próbálható ki); a böngészős tesztek a vásárlás
forgatókönyvét ilyenkor kihagyják.

## 3. Adatbázis

```bash
docker compose up -d        # PostgreSQL 17 konténerben (csak a saját gépről érhető el)
cd server
npm run db:deploy           # a táblák létrehozása a migrációkból
npm run db:seed             # 8 kategória, egy admin és két demó felhasználó
cd ..
```

## 4. Automatikus ellenőrzések

```bash
npm run check       # formázás, lint, típusok, design-, szerződés-, szerver- és klienstesztek, lefedettség
npm run test:e2e    # böngészős tesztek a teljes folyamatra, saját helyi lánccal és tesztadatbázissal
npm run build       # a szerver és a kliens produkciós buildje
```

Az e2e-tesztek saját helyi láncot indítanak a 8545-ös porton, ezért előtte a 2. pontban indított
`npm run node`-ot le kell állítani (Ctrl+C), utána újraindítható.

A tiszta példányon mért eredmény:

- `npm run check` (kb. 15 perc): a formázás, a lint és a típusellenőrzés hibátlan; 22
  design-teszt, 21 szerződésteszt; a szerveren 78 tesztfájl, 1304 teszt (lefedettség: utasítás
  99,68%, ág 98,59%), a kliensen 61 tesztfájl, 725 teszt (98,69%, 95,17%) – a küszöb 80%;
- `npm run test:e2e` (kb. 6 perc): az előkészítés egységtesztjei (a tiszta példányon 5, az átnézés után
  kiegészítve 6), majd a Playwright-tesztek közül
  4 sikeres, 1 kihagyva – a vásárlás, mert a helyettesítő Stripe-kulcsot a Stripe nem fogadja el
  (saját Stripe-teszt-kulccsal ez is lefut);
- `npm run build`: hibátlan (a Vite a kliens fő csomagjának méretére figyelmeztet – ez ismert,
  nem hiba).

## 5. Kipróbálás a böngészőben

Három terminálban (a 2. pontban indított lánc maradhat):

```bash
# 1. terminál – a helyi lánc (ha nem fut)
cd blockchain
npm run node
```

```bash
# 2. terminál – a PhotoRegistry szerződés telepítése a helyi láncra (a lánc minden indítása után)
cd blockchain
npm run deploy:local
```

```bash
# 3. terminál – a szerver és a webes felület
npm run dev
```

A szerver kiírja, hogy az adatbázis és a blokklánc-kapcsolat rendben van; ezután a webes felület a
**http://localhost:5173** címen érhető el. Belépés a seedelt fiókokkal (a jelszó a `server/.env`
`SEED_DEMO_PASSWORD`-je, illetve az admin esetén `SEED_ADMIN_PASSWORD`-je):

- `fotos@photochain.test` – Demó Fotós (feltöltés), `vasarlo@photochain.test` – Demó Vásárló,
  `admin@photochain.test` – adminisztrátor.

Érdemes kipróbálni:

1. **Feltöltés** (Demó Fotós, „Feltöltés”): egy saját fotó (JPEG, PNG vagy WebP, legalább 600 ×
   600 képpont) címmel, árral, kategóriával. A kép néhány másodperc múlva „Hitelesítve a
   blokkláncon” lesz; az adatlapon a tanúsítvány a helyi láncot, a blokkot és a hash-eket mutatja.
2. **Másolat elutasítása:** ugyanazt a képet (vagy átméretezett, újramentett változatát) még egyszer
   feltöltve a szerver elutasítja.
3. **Ellenőrzés** (bejelentkezés nélkül is, „Ellenőrzés” menü): a feltöltött kép „Hiteles,
   regisztrált kép”, egy másik kép „Nincs a nyilvántartásban”.
4. **Admin felület** (admin fiók, „Admin”): statisztika, felhasználók és képek kezelése.

Leállítás: Ctrl+C mindhárom terminálban (Windows alatt a „Terminate batch job (Y/N)?” kérdésre
**Y**), majd `docker compose down` (az adatok megmaradnak).

## 6. Konténerben (nem kötelező)

A teljes rendszer (adatbázis, migráció, a szerver a webes felülettel) egy paranccsal konténerben is
elindul, a **http://localhost:4000** címen (előtte a `npm run dev`-et le kell állítani, mert az is a
4000-es portot használja):

```bash
npm run docker:up      # az első indításkor a kép elkészítése néhány perc
npm run docker:down    # leállítás (az adatok megmaradnak)
```

A konténer ugyanazt a `server/.env`-et használja. A helyi Hardhat-lánc (`127.0.0.1:8545`) a
konténerből nem érhető el: a szerver ezt induláskor figyelmeztetésként naplózza („A blokklánc most
nem érhető el …”), a felület és az API működik, de a konténerben feltöltött kép regisztrációja nem
sikerül. A teljes folyamat a helyi indítással (5. pont), illetve az élő demón próbálható ki; a
konténer Sepolia-beállítással a részletes leírás „Konténer (Docker, L31)” fejezete szerint működik.

## Sepoliával, saját fiókokkal (nem kötelező)

A projektben rögzített Sepolia-szerződés (`server/src/contracts/PhotoRegistry.json`) tulajdonosa a
szerző platform-tárcája: regisztrációt csak az ír alá. Saját Alchemy-, Etherscan- és Stripe-fiókkal,
saját teszttárcával a részletes leírás „Környezeti változók” és „Okosszerződés” fejezete szerint saját szerződés
telepíthető: előbb a szerző telepítési naplóját (`blockchain/ignition/deployments/chain-11155111`)
törölni kell – különben az Ignition a szerző korábbi telepítését próbálná folytatni, és a más
telepítő fiók miatt hibával leállna –, majd a `blockchain/`
mappában `npm run deploy:sepolia` és `npm run export-abi`; a szerver ezután az új címet használja.
Az `export-abi` csak a meglévő telepítési naplókból írja újra a `PhotoRegistry.json`-t: ha a helyi
lánc címe is kell (helyi indítás, e2e-tesztek), előtte legalább egyszer fusson le a `npm run node` és
a `npm run deploy:local` (5. pont).

## Ha valami nem indul

- **Foglalt port** (`EADDRINUSE`, illetve az e2e-tesztek „A …-es port foglalt” üzenete): egy
  korábban indított folyamat fut még – PowerShellben a `Get-NetTCPConnection -LocalPort 4000`
  mutatja a folyamat azonosítóját (`OwningProcess`), a `Stop-Process -Id <azonosító>` leállítja.
- **A szerver nem indul, és a hibás változót nevezi meg:** a `server/.env` értéke hiányzik vagy
  rossz formátumú (a 2. pont táblázata szerint).
- **„Az adatbázis nem érhető el”:** a Docker Desktop nem fut, vagy a `docker compose up -d` kimaradt.
- **A feltöltés „Sikertelen regisztráció” állapotú:** a helyi lánc nem fut, vagy a lánc újraindítása
  után a `npm run deploy:local` kimaradt.
- **Az adatbázis-tesztek és az e2e-tesztek** ugyanazt a tesztadatbázist ürítik: ne fussanak egyszerre.
