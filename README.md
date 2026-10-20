# PhotoChain

> Fotó-piactér blokklánc-alapú eredetigazolással – szakdolgozati prototípus.

A feltöltött képek ujjlenyomata (SHA-256 és perceptuális dHash) egy Ethereum-okosszerződésben
rögzül. Így ugyanaz a kép – vagy átméretezett, újratömörített másolata – nem tölthető fel újra, és
bárki ellenőrizheti, hogy egy kép regisztrált eredeti-e.

- **Élő demó:** https://photochain.onrender.com (Ethereum Sepolia teszthálózat, Stripe teszt mód; az
  ingyenes szolgáltatás az első kérésre kb. egy perc alatt ébred)
- **Kipróbálás külső fiókok nélkül:** [docs/KIPROBALAS.md](docs/KIPROBALAS.md)
- **Okosszerződés (Sepolia, verifikált forráskód):**
  [`0x6eF681b51da3c7E7E5d59ac96b7d80e9A59e97C7`](https://sepolia.etherscan.io/address/0x6eF681b51da3c7E7E5d59ac96b7d80e9A59e97C7#code)

## Fő funkciók

- Regisztráció, bejelentkezés, fotósprofil
- Képfeltöltés vízjeles előnézettel; az eredeti fájl csak a tulajdonosnak és a vásárlónak érhető el
- Feltöltéskori hitelesítés: duplikáció-szűrés (adatbázis + blokklánc), a hash rögzítése a Sepolia
  teszthálózaton
- Blokklánc-tanúsítvány a fotó adatlapján (tranzakció linkje az Etherscanen)
- Nyilvános hitelesség-ellenőrző: bárki megnézheti, hogy egy kép regisztrált eredeti-e
- Vásárlás Stripe Checkouttal (teszt módban), értékelések, admin felület

## Technológiák

| Réteg       | Technológia                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| Frontend    | React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query               |
| Backend     | Node.js 24 LTS, Express 5, TypeScript, Zod, sharp                                 |
| Adatbázis   | PostgreSQL 17, Prisma                                                             |
| Blokklánc   | Solidity 0.8.x, OpenZeppelin Contracts, Hardhat 3, ethers.js v6, Ethereum Sepolia |
| Fizetés     | Stripe Checkout (teszt mód)                                                       |
| Tesztelés   | Vitest, Supertest, React Testing Library, Playwright                              |
| Üzemeltetés | Docker, Docker Compose, GitHub Actions (CI), Render + Supabase (élesítés)         |

## Felépítés

```text
PhotoChain_Omega/
├── blockchain/   # PhotoRegistry okosszerződés (Hardhat), telepítés, ABI-export
├── server/       # Express + TypeScript REST API, Prisma-séma és migrációk
├── client/       # React + Vite webes felület
├── e2e/          # Playwright végponttól végpontig tesztek (helyi Hardhat-lánccal)
├── docs/         # terv, napló, kipróbálás, források, UI-terv, kiértékelés, biztonság, ábrák
├── tools/        # képernyőkép-generátor, design-token eszközök
├── Dockerfile    # többlépcsős kép: kliens + szerver egy konténerben
└── render.yaml   # élesítés (Render Blueprint)
```

## Gyors indítás

Előfeltételek: [Node.js 24 LTS](https://nodejs.org/), [Git](https://git-scm.com/),
[Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/klaus3577/PhotoChain_Omega.git
cd PhotoChain_Omega
npm run install:all
```

A beállítás (`.env` sablonok), az adatbázis és a helyi lánc indítása lépésenként, külső fiókok
nélkül: [docs/KIPROBALAS.md](docs/KIPROBALAS.md). Sepoliával, Stripe-pal és élesítéssel:
[docs/RESZLETES_LEIRAS.md](docs/RESZLETES_LEIRAS.md).

## Ellenőrzések

| Parancs            | Mit csinál                                                              |
| ------------------ | ----------------------------------------------------------------------- |
| `npm run check`    | formázás, lint, típusok, design-, szerződés-, szerver- és klienstesztek |
| `npm run test:e2e` | böngészős tesztek a teljes folyamatra (Playwright, helyi lánccal)       |
| `npm run build`    | a szerver és a kliens produkciós buildje                                |

Tiszta példányon mérve: a szerveren 1304 teszt (99,68% utasítás-lefedettség), a kliensen 725 teszt
(98,69%), 21 szerződés- és 22 design-teszt. A CI (GitHub Actions) minden push-ra lefuttatja az
ellenőrzéseket, a buildet és a böngészős teszteket.

## Dokumentáció

- [Részletes leírás](docs/RESZLETES_LEIRAS.md) – beállítás, környezeti változók, a szerver és a
  kliens működése (API, korlátok, hibakódok), scriptek, konténer, élesítés, CI. A kódmegjegyzések, a
  napló és a forrásjegyzék „README – …” hivatkozásai ennek a fejezeteire mutatnak.
- [Fejlesztési terv](docs/FEJLESZTESI_TERV.md) – követelmények, architektúra, a 33 fejlesztési lépés
- [Fejlesztési napló](docs/fejlesztesi-naplo.md) – lépésenkénti eredmények és döntések
- [Demó-forgatókönyv](docs/DEMO_FORGATOKONYV.md) – az 5 perces védési bemutató
- [Biztonsági ellenőrzőlista](docs/biztonsag/owasp-ellenorzolista.md) – OWASP Top 10:2025
- [Kiértékelés](docs/kiertekeles/) – a hitelesítés robusztussága és költsége
- [UI-terv](docs/design/README.md), [források](docs/FORRASOK.md),
  [a szakdolgozat vázlata](docs/SZAKDOLGOZAT_VAZLAT.md)

## A repóról

Ez a repó a projekt nyilvános bemutatópéldánya. A fejlesztés a szerző privát fejlesztői repójában
folyt, a terv lépéseit követve, 43 commitban (2026. szeptember 28. – október 19.); itt a végleges
állapot egyetlen commitban szerepel. A dokumentációban szereplő commit-azonosítók (fejlesztési
napló, a terv 13. fejezete, OWASP-ellenőrzőlista) és a `v1.0.0` címke a fejlesztői repóra
vonatkoznak; ennek git-előzménye kérésre megmutatható. Az élő demó is a fejlesztői repóból települ.
