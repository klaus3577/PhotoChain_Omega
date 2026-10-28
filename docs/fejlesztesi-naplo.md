# Fejlesztési napló

Minden fejlesztési lépés (L01–L33) után egy rövid bejegyzés: mi készült el, milyen döntések
születtek, milyen problémák merültek fel, és mely képernyőképek tartoznak hozzá. A bejegyzések a
szakdolgozat „Megvalósítás” fejezetének alapanyagai.

## Sablon

```markdown
## Lxx – <a lépés címe> (ÉÉÉÉ-HH-NN)

- Elkészült: ...
- Döntések és indoklásuk: ...
- Problémák és megoldásuk: ...
- Képernyőképek: Lxx_01_....png, Lxx_02_....png
- Commit: <rövid hash>
```

---

## Tervezés – fejlesztési terv (2026-09-28)

- Elkészült: a fejlesztési terv (`docs/FEJLESZTESI_TERV.md`): követelmények, technológiai stack,
  architektúra, adatmodell, API, fájlstruktúra, 33 lépés, forrásjegyzék.
- Döntések és indoklásuk: a projekt rövid, szóköz nélküli útvonalra került
  (`D:\szakdolgozat\CodeBase`), mert a szóközös/zárójeles útvonal egyes eszközöknél (pl. Docker)
  hibát okozhat.
- Commit: 2cb3797

## L01 – Fejlesztői környezet telepítése (2026-09-28)

_Utólag pótolt bejegyzés (2026-09-30). A környezet a fejlesztés kezdetére (legkésőbb 2026-09-28-ra)
készen állt – ezt az `L01_01` kép igazolja; az alábbiak a terv 2.3–2.4 pontja szerint
2026-09-30-án újra ellenőrizve: a verziók megegyeznek a képen láthatókkal._

- Elkészült (Windows 11 alatt, a terv 2.3 táblázata szerint):
  - Node.js 24 LTS (`v24.17.0`) és npm (`11.13.0`);
  - Git (`2.54.0.windows.1`), globálisan beállított `user.name` és `user.email`;
  - Visual Studio Code (`1.124.2`) a terv 2.4 pontjának mind a 12 bővítményével (a 10 ajánlott és a
    2 opcionális) – a `.vscode/extensions.json` a mappa megnyitásakor felajánlja őket;
  - Docker Desktop WSL 2 háttérrel (Docker `29.5.3`, Compose `v5.1.4`);
  - Stripe CLI (`1.52.0`);
  - Google Chrome (tesztelés, DevTools).
- Kész, ha („a 2.3 táblázat minden ellenőrző parancsa verziószámot ír ki”): teljesül – `node -v`,
  `npm -v`, `git --version`, `docker --version`, `docker compose version`, `stripe --version`.
- Döntések és indoklásuk: a terv 2.3 pontja szerinti eszközök; egyetlen kiegészítés a GitHub CLI
  (`gh 2.101.0`) – a GitHub-repó adatainak terminálos lekérdezéséhez (lásd `L02_04`).
- Problémák és megoldásuk: a telepítésről nem készült feljegyzés.
- Képek:

  | Kép                  | Forrás                                                      | Tartalom                      |
  | -------------------- | ----------------------------------------------------------- | ----------------------------- |
  | `L01_01_verziok.png` | `node -v`, `npm -v`, `git`/`docker`/`stripe`/`gh --version` | a fejlesztői eszközök verziói |

- Kézzel készítendő: a VS Code bővítménylistája (Extensions panel) és a futó Docker Desktop.
- Commit: – (a telepítéshez nem tartozik forrásfájl; a verziókép a `d15f194` commitban került a
  repóba)

## L02 – Projektváz, verziókezelés, konvenciók (2026-09-28)

- Elkészült:
  - `.gitignore` bővítése (környezeti változók és kulcsok, függőségek, build- és tesztkimenetek,
    Hardhat- és Prisma-generált fájlok, feltöltések, naplók, szerkesztőfájlok);
  - `.gitattributes` (egységes LF sorvégek), `.editorconfig`, `.prettierrc`, `.prettierignore`;
  - gyökér `package.json` összefogó scriptekkel, Prettier és concurrently fejlesztői függőséggel;
  - `README.md`;
  - `docs/fejlesztesi-naplo.md`, `docs/FORRASOK.md`, `docs/screenshots/`, `docs/diagramok/`;
  - `.vscode/extensions.json` (ajánlott bővítmények), `.vscode/settings.json` (formázás mentéskor).
- Döntések és indoklásuk:
  - LF sorvég mindenhol (`.gitattributes`): a gépenkénti `core.autocrlf=true` beállítás miatt
    Windows alatt keveredhettek volna a sorvégek.
  - Nincs npm workspace: a három alprojekt (`client`, `server`, `blockchain`) független marad, a
    gyökér scriptek `--prefix` kapcsolóval hívják őket – egyszerűbb, és külön dokumentálható.
  - A Prettier pontos verzióval rögzítve (a Prettier dokumentációjának ajánlása), hogy a formázás
    minden gépen azonos legyen.
  - A fejlesztési terv kimarad a Prettier-formázásból (`.prettierignore`), hogy a tartalma ne
    változzon.
  - Azonosítók és fájlnevek angolul, kommentek és dokumentáció magyarul.
- Problémák és megoldásuk: a git a `core.autocrlf` miatt LF → CRLF figyelmeztetést adott; a
  `.gitattributes` rendezi.
- Képernyőképek (javaslat): `L02_01_vscode_explorer.png` (mappaszerkezet),
  `L02_02_ajanlott_bovitmenyek.png` (VS Code bővítményajánló), `L02_03_format_check.png`
  (`npm run format:check` kimenete), `L02_04_github_repo.png` (a GitHub-repó létrehozása után).
- Commit: `494912f` – `chore(L02): projektváz, verziókezelés és konvenciók`; továbbá `1cc28f0` (`chore(L02)`)

## Névváltás – PhotoChain (2026-09-28)

- Elkészült: a projekt egységes neve **PhotoChain** lett (korábbi munkanév: FotoLánc); a GitHub-repó
  `klaus3577/PhotoChain` (privát), a fő ág `main`.
- Döntések és indoklásuk: egy név a repóban, a dokumentációban és a csomagnévben (`photochain`), hogy
  a dolgozatban, a GitHubon és a kódban ne legyen eltérés.
- Commit: `chore(L02): projektnév egységesítése PhotoChain-re`

## L03 – Külső szolgáltatások és titkos kulcsok (2026-09-28)

- Elkészült:
  - Alchemy app a Sepolia teszthálózathoz (JSON-RPC végpont);
  - külön, csak erre a célra létrehozott platform-tárca (MetaMask), címe:
    `0xC00f5042C3774b2bbebf32125098EE558d4f707C`, egyenlege 0,0825 SepoliaETH (csapból);
  - Stripe fiók teszt módban, Etherscan API-kulcs;
  - `blockchain/.env.example` és `server/.env.example` (csak változónevek); a valódi értékek a
    git által kihagyott `blockchain/.env` és `server/.env` fájlokban;
  - README: „Környezeti változók” szakasz; `docs/FORRASOK.md`: az L03 forrásai.
- Ellenőrzés (titkos értékek kiírása nélkül, ethers.js v6-tal): a hálózat chainId-je 11155111
  (Sepolia) ✓, a két fájlban azonos a privát kulcs és az RPC-végpont ✓, a tárcában van teszt-ETH ✓,
  az Etherscan-kulcs érvényes ✓, a Stripe-kulcs érvényes és teszt módú (`livemode: false`) ✓.
- Döntések és indoklásuk:
  - A telepítő (deployer) és a platform-tárca ugyanaz: az `Ownable` szerződés tulajdonosa a
    telepítő lesz, és csak ő hívhatja a `registerPhoto()` függvényt, amit a szerver hív.
  - `.env.example` csak a `blockchain/` és a `server/` mappában van: a kliensnek nincs titkos
    adata, és a Vite `VITE_` változói a böngészőbe kerülő kódba fordulnak, tehát titok nem is
    lehet bennük. (A fejlesztési terv 6. fejezetének fájlstruktúrája is így szerepel.)
  - A Hardhat keystore-t a Hardhat telepítése után (L04–L05) vezetjük be; addig a kulcs a
    `blockchain/.env`-ben van.
  - A kulcsok csak a helyi `.env` fájlokba kerültek, parancskimenetbe és képernyőképre nem.
- Problémák és megoldásuk: az első másoláskor a privát kulcs 4 karakterrel hosszabb volt a
  helyesnél (68 hex a 64 helyett) – a MetaMaskból újramásolva rendben lett.
- Megjegyzés az L04-hez: a Hardhat-projektet a meglévő `blockchain/` mappába kell inicializálni, a
  `.env` és `.env.example` fájlok megtartásával.
- Képernyőképek (javaslat): `L03_01_alchemy_app.png`, `L03_02_metamask_sepolia.png`,
  `L03_03_etherscan_tarca.png`, `L03_04_stripe_test_mode.png`, `L03_05_ellenorzes.png` – a kulcsokat
  mindenhol ki kell takarni.
- Commit: `b509a8c` – `chore(L03): környezeti változók sablonjai és külső szolgáltatások`

## L04 – `PhotoRegistry` okosszerződés és tesztjei (2026-09-28)

- Elkészült:
  - Hardhat 3.18 projekt a `blockchain/` mappában a „mocha-ethers” sablon alapján (TypeScript,
    Mocha, ethers.js v6, Chai), OpenZeppelin Contracts 5.6.1;
  - `contracts/PhotoRegistry.sol` a fejlesztési terv 4.1 interfésze szerint: `registerPhoto`,
    `isRegistered`, `getRecord`, `PhotoRegistered` esemény, `AlreadyRegistered` hiba; kiegészítve a
    `ZeroContentHash` és `ZeroOwnerRef` bemenet-ellenőrzéssel;
  - `test/PhotoRegistry.test.ts`: 11 teszt (telepítés, regisztráció és esemény, rekord tartalma,
    duplikáció, azonos perceptuális hash eltérő tartalommal, nulla bemenetek, jogosultság,
    lekérdezések, gázkeret);
  - scriptek: `compile`, `test`, `test:gas`, `coverage`, `typecheck`, `clean`.
- Eredmények:
  - TDD: a tesztek előbb a szerződés nélkül futottak (11 hibás – „Artifact not found”), majd a
    szerződés megírása után mind a 11 sikeres;
  - lefedettség: 100% sor és utasítás (`npm run coverage`);
  - gázfelhasználás (`npm run test:gas`): egy regisztráció 72 820 gáz (optimalizált, produkciós
    fordítással 71 686), a telepítés 604 251 gáz (optimalizálva 325 903);
  - TypeScript-típusellenőrzés (`tsc --noEmit`) hibátlan.
- Döntések és indoklásuk:
  - A telepítő a tulajdonos (`Ownable(msg.sender)`): ugyanaz a platform-tárca telepít és regisztrál
    (lásd L03).
  - A lánc csak a pontos (SHA-256) egyezést zárja ki; az azonos perceptuális hash-t nem – a
    hasonlóság-szűrés (Hamming-távolság) a szerver feladata, mert a láncon drága és nem kereshető.
  - A `PhotoRecord` mezői két tárhelyszeletbe férnek (`bytes32` + `bytes8` + `uint64`), ami a gázt
    csökkenti; a `registeredAt == 0` jelzi a „nincs regisztrálva” állapotot, így nem kell külön
    logikai mező.
  - Custom errorok a `require`-szövegek helyett: olcsóbbak, és paraméterrel (pl. a hash) térnek
    vissza.
  - Rögzített fordítóverzió (`pragma solidity 0.8.34`, nem `^0.8.x`): a tesztelt és a telepített
    bájtkód ugyanazzal a fordítóval készül.
  - A sablonból kimaradt: a `Counter` mintaszerződés és -tesztek, a Solidity-tesztekhez kellő
    `forge-std`, az OP-hálózati mintaszkript és a `hardhatMainnet`/`hardhatOp` mintahálózatok. A
    `@types/node` a Node 24-hez illő verzió (a sablon 22-est ír).
- Problémák és megoldásuk:
  - A `npx hardhat --init` varázsló csak interaktív terminálban fut (HHE11); a sablon ezért a
    `hardhat@3.18.0` csomag `templates/02-mocha-ethers` mappájából származik, a függőségek a
    varázslóéval azonosak.
  - Ellenőrzés: a varázsló nem interaktív módját (`npx hardhat --init --template mocha-ethers`) egy
    ideiglenes mappában lefuttatva a kimenet a `blockchain/` mappával összevetve azonos (`tsconfig.json`,
    `.gitignore`, a függőségek telepített verziói), eltérés csak a fent dokumentált pontokon van. A
    `PhotoRegistry` szerződés és tesztjei a hivatalosan generált projektben is lefutottak: 16/16
    sikeres (a sablon 5 mintatesztjével együtt). Az `npm audit` ott is ugyanazt a 11 alacsony
    súlyosságú jelzést adta, vagyis ezek a Hardhat-sablon függőségeiből származnak.
  - `npm audit`: 11 alacsony súlyosságú jelzés, mind az `elliptic` csomagból, amelyet a
    `hardhat-verify` régi (v5) `@ethersproject` függősége húz be. Javítás nincs; az npm által javasolt
    visszalépés a Hardhat 3-at elrontaná. Vállalt kockázat: csak fejlesztői eszköz, nem kerül a
    szerverre vagy a böngészőbe, és a plugin ABI-kódolásra használja, nem kulcsos aláírásra.
- Képernyőképek (javaslat): `L04_01_photoregistry_sol.png` (a szerződés VS Code-ban),
  `L04_02_tesztek_piros.png` (a tesztek a szerződés nélkül), `L04_03_tesztek_zold.png`
  (11 sikeres teszt), `L04_04_lefedettseg.png` (`npm run coverage`), `L04_05_gazstatisztika.png`
  (`npm run test:gas`).
- Commit: `fc40cc5` – `feat(L04): PhotoRegistry okosszerződés és tesztjei`; továbbá `d15f194` (`docs(L04)`), `ebe8922` (`chore(L04)`)

## Képernyőkép-generátor és az L01–L04 képei (2026-09-28)

- Elkészült: `tools/screenshot/render.mjs` – valódi parancskimenetről (`terminal`) és forrásfájlról
  (`code`) készít PNG-képet fej nélküli (headless) Edge/Chrome böngészővel, 2× felbontásban, a VS
  Code sötét színeivel (kódnál Prism-kiemeléssel és sorszámokkal). A képek tartalma a tényleges
  parancskimenet, illetve a tényleges fájl; az ablakkeret csak megjelenítési elem, nem VS Code-ablakról
  készült fotó.
- A `--symbol` kapcsolóval egy függvény vagy teszt a nevéből vágható ki (a fölötte álló
  megjegyzésekkel együtt), így a kulcsrészletek képei a kód későbbi változásakor is egy paranccsal
  újragenerálhatók.
- Elkészült képek (`docs/screenshots/`) – a „Forrás” oszlop mutatja, melyik fájl melyik sorai, illetve
  melyik parancs kimenete látható rajtuk:

  | Kép                              | Forrás                                                      | Tartalom                                                   |
  | -------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
  | `L01_01_verziok.png`             | `node -v`, `npm -v`, `git`/`docker`/`stripe`/`gh --version` | a fejlesztői eszközök verziói                              |
  | `L02_03_format_check.png`        | `npm run format:check`                                      | a formázás-ellenőrzés                                      |
  | `L02_04_github_repo.png`         | `gh repo view klaus3577/PhotoChain --json …`                | a GitHub-repó adatai (privát, `main` ág)                   |
  | `L03_05_ellenorzes.png`          | ellenőrző szkript (titkos értékek nélkül)                   | a külső szolgáltatások ellenőrzése                         |
  | `L04_01_photoregistry_sol.png`   | `blockchain/contracts/PhotoRegistry.sol`, 1–81. sor         | a szerződés teljes forráskódja                             |
  | `L04_02_tesztek_piros.png`       | `npm test` (a szerződés nélkül, `blockchain/`)              | TDD piros fázis: 11 bukó teszt                             |
  | `L04_03_tesztek_zold.png`        | `npm test` (`blockchain/`)                                  | TDD zöld fázis: 11 sikeres teszt                           |
  | `L04_04_lefedettseg.png`         | `npm run coverage` (`blockchain/`)                          | 100%-os lefedettség                                        |
  | `L04_05_gazstatisztika.png`      | `npm run test:gas` (`blockchain/`)                          | gázstatisztika (függvények, telepítés, bájtkódméret)       |
  | `L04_06_registerphoto.png`       | `blockchain/contracts/PhotoRegistry.sol`, 45–66. sor        | a `registerPhoto` függvény: ellenőrzések, mentés, esemény  |
  | `L04_07_photorecord_tarolas.png` | `blockchain/contracts/PhotoRegistry.sol`, 15–25. sor        | a `PhotoRecord` struktúra és a tárolás (két tárhelyszelet) |
  | `L04_08_teszt_duplikacio.png`    | `blockchain/test/PhotoRegistry.test.ts`, 65–72. sor         | a duplikált hash elutasításának tesztje                    |
  | `L04_09_teszt_jogosultsag.png`   | `blockchain/test/PhotoRegistry.test.ts`, 100–111. sor       | a jogosultság tesztje (csak a tulajdonos regisztrálhat)    |

- Kézzel készítendő (bejelentkezés vagy robotvédelem miatt): VS Code Explorer (opcionális), a GitHub-repó
  weboldala, Alchemy dashboard, MetaMask, a tárca Etherscan-oldala (a Cloudflare robotellenőrzése
  blokkolja az automatikus böngészőt), Stripe dashboard.
- A piros fázis képéhez a szerződés ideiglenesen kikerült (biztonsági másolattal), majd
  visszakerült; a fájl bájtra azonos az eredetivel, a tesztek utána ismét 11/11 sikeresek.

## L05 – Telepítés a Sepolia teszthálózatra, ABI-export (2026-09-29)

- Elkészült:
  - `ignition/modules/PhotoRegistry.ts` – Hardhat Ignition telepítő modul;
  - `hardhat.config.ts`: a `blockchain/.env` betöltése (`process.loadEnvFile()`), Etherscan-verifikáció;
  - `scripts/export-abi.ts` + `scripts/contract-export.ts` – az ABI és a hálózatonkénti cím
    exportálása a szervernek (`server/src/contracts/PhotoRegistry.json`), 6 új teszttel
    (`test/ContractExport.test.ts`);
  - `scripts/check-deployment.ts` – a telepített szerződés ellenőrzése (kód, tulajdonos, lekérdezés);
  - scriptek: `node`, `deploy:local`, `deploy:sepolia`, `export-abi`, `check:local`, `check:sepolia`.
- Eredmények:
  - lokális telepítés (`npm run node` + `deploy:local`): `0x5FbDB2315678afecb367f032d93F642f64180aa3`,
    az exportált fájlból csatlakozva a tulajdonos a telepítő fiók;
  - **Sepolia**: `0x6eF681b51da3c7E7E5d59ac96b7d80e9A59e97C7`, tranzakció
    `0xa9798cbb337b2b4bc5a2395fefac912de999c6e95de1731df2db112369d639a8`, blokk 11 806 521
    (2026-09-29 08:38 UTC); gázfelhasználás 325 903 (azonos az L04-ben mért optimalizált értékkel),
    költség 0,00035 SepoliaETH (1,08 gwei gázáron); telepítő és tulajdonos a platform-tárca;
  - forráskód-verifikáció: Etherscan ✓, Blockscout ✓, Sourcify `exact_match` ✓; az Etherscan API
    szerint: fordító v0.8.34, optimalizálás 200 futással;
  - Etherscan: https://sepolia.etherscan.io/address/0x6eF681b51da3c7E7E5d59ac96b7d80e9A59e97C7#code
  - tesztek: 17/17 sikeres, a típusellenőrzés hibátlan.
- Döntések és indoklásuk:
  - A telepítő kulcs a `blockchain/.env`-ből jön (a Node beépített `process.loadEnvFile()`
    függvényével), nem a Hardhat keystore-ból, ahogy az L03-ban terveztük: a keystore minden
    telepítésnél interaktív jelszót kér (nem automatizálható), a kulcs pedig a szervernek futásidőben
    úgyis nyílt `.env`-ben kell, így valódi védelmet nem adna. A konfiguráció keystore-kompatibilis
    marad (a `configVariable()` előbb a keystore-t nézi).
  - Az export hálózatonként tárolja a címet (`networks["<chainId>"]`), így a szerver a lokális
    Hardhat-hálózaton és a Sepolián is ugyanabból a fájlból dolgozik. A lokális cím determinisztikus
    (friss hálózaton az első telepítés mindig ugyanide kerül).
  - Az Ignition telepítési naplója (`ignition/deployments/chain-11155111/`) verziókezelésbe kerül: ez
    igazolja és reprodukálhatóvá teszi a telepítést; a lokális (`chain-31337`) nem.
  - A Prettier kihagyja a generált telepítési naplókat és az exportfájlt (`.prettierignore`).
- Problémák és megoldásuk:
  - Az Ignition éles hálózatra telepítés előtt interaktív megerősítést kér; a hivatalos, nem
    interaktív jóváhagyás a `HARDHAT_IGNITION_CONFIRM_DEPLOYMENT` környezeti változó.
  - A Sourcify „already being verified” hibával zárult (kilépési kód 1): a Blockscout a sikeres
    verifikációt maga is továbbította a Sourcify-nak, a két beküldés összeakadt. A Sourcify szerint a
    szerződés verifikált (`exact_match`); a közvetlen Sourcify-beküldés kikapcsolva, az
    újrafuttatás 0-s kóddal zárult (új tranzakció nélkül).
  - A képgenerátor Windows alatt, futó Edge-/Chrome-ablakok mellett túl korán ellenőrizte a képet (a
    böngésző indítója a háttérfolyamat előtt kilép): most megvárja, amíg a kép elkészül. A futtatott
    parancsok környezetéből a `NO_COLOR` kimarad (különben a Node figyelmeztetést ír ki).
- Képek:

  | Kép                                 | Forrás                                                        | Tartalom                                            |
  | ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
  | `L05_01_telepites_sepolia.png`      | `npm run deploy:sepolia` (az éles telepítés mentett kimenete) | telepítés + verifikáció (a Sourcify-hibával együtt) |
  | `L05_02_telepites_ujrafuttatas.png` | `npm run deploy:sepolia` (mentett kimenet, a javítás után)    | nincs új telepítés, minden „already verified”       |
  | `L05_03_export_abi.png`             | `npm run export-abi` (`blockchain/`)                          | az ABI-export, hálózatonkénti címekkel              |
  | `L05_04_ellenorzes_sepolia.png`     | `npm run check:sepolia` (mentett kimenet)                     | a Sepolián élő szerződés ellenőrzése                |
  | `L05_05_ignition_modul.png`         | `blockchain/ignition/modules/PhotoRegistry.ts`, 1–12. sor     | a telepítő modul                                    |
  | `L05_06_hardhat_config.png`         | `blockchain/hardhat.config.ts`, 1–59. sor                     | a konfiguráció (`.env`, hálózat, verifikáció)       |
  | `L05_07_export_fuggveny.png`        | `blockchain/scripts/contract-export.ts`, 28–52. sor           | a `buildContractExport` függvény                    |

- Kézzel készítendő: az Etherscan szerződésoldala (zöld pipa a „Contract” fülön) és a „Read Contract”
  fül (Cloudflare-védelem miatt).
- Commit: `388b49c` – `feat(L05): telepítés a Sepolia teszthálózatra, ABI-export`

## L06 – Express + TypeScript szerverváz (2026-09-29)

- Elkészült (`server/`):
  - Node.js 24 + Express 5 + TypeScript 6.0 (ESM), `tsx watch` a fejlesztéshez, `tsc` build a `dist/`-be;
  - `config/env.ts` – Zod 4-gyel ellenőrzött környezeti változók: hibás/hiányzó értéknél a szerver
    el sem indul, a hibaüzenet csak a változó nevét tartalmazza, az értékét nem; éles (`sk_live_`)
    Stripe-kulcsot elutasít;
  - `app.ts` / `server.ts` szétválasztása (a tesztek port nélkül, Supertesttel hívják az alkalmazást);
  - middleware-ek: `pino-http` (tömör kérésnapló), `helmet`, `express.json` (100 kB-os korlát),
    `cookie-parser`, `express-rate-limit` (szabványos RateLimit-fejlécek);
  - `lib/errors.ts` (`AppError`) és `middleware/errorHandler.ts`: egységes
    `{ error: { code, message, details? } }` válasz; Zod-hiba → 400, hibás JSON → 400, túl nagy
    törzs → 413, ismeretlen útvonal → 404, váratlan hiba → 500 a belső részletek nélkül;
  - `GET /api/health` → `{"data":{"status":"ok"}}`; `http/health.http` a REST Client-hez;
  - ESLint (flat config, typescript-eslint), Vitest + Supertest, 80%-os lefedettségi küszöb.
- Eredmények: 23/23 teszt (TDD: előbb 3 bukó tesztfájl a modulok nélkül); lefedettség: utasítás
  97,1%, elágazás 91,9%, függvény 91,7%, sor 96,9%; ESLint, `tsc` és build hibátlan; `npm audit`:
  0 sebezhetőség; élő próba: a `/api/health` 200-as választ ad a biztonsági és RateLimit-fejlécekkel.
- Döntések és indoklásuk:
  - TypeScript 6.0 (nem 7.0): a `typescript-eslint` csak `<6.1` verziót támogat, és a `blockchain/`
    projekt is 6.0-t használ.
  - Nincs CORS: fejlesztéskor a Vite proxy, élesben az Express szolgálja ki a klienst (azonos
    origin, terv D2).
  - A kérésnapló kérésenként egy sor (`GET /api/nincs → 404 (1 ms)`), a fejlécek (süti,
    böngésző-azonosító, IP-cím) nélkül; 4xx → warn, 5xx → error; a sikeres `GET /api/health` nem
    kerül a naplóba (a tárhely-szolgáltató percenként hívja).
  - A `.env` betöltése a Node beépített `process.loadEnvFile()` függvényével (mint a `blockchain/`-ben).
  - Élesben `trust proxy = 1` (Render fordított proxy mögött), különben a sebességkorlát rossz IP-t
    látna.
- Problémák és megoldásuk:
  - Az első kérésnapló túl bőbeszédű volt (minden fejléc, IP-cím) – tömörítve, a szabályok külön,
    tesztelt modulban (`lib/requestLogging.ts`).
  - Windows alatt a háttérben futó `npm run dev` / `npm run node` leállítása árva Node-folyamatokat
    hagyott (a 4000-es és a 8545-ös port foglalt maradt, „EADDRINUSE”) – leállítva; azóta a leállítás
    után a portot is ellenőrizzük.
  - Képgenerátor: a hosszú terminálsorok tördelődnek (nem vágódnak le), és a háttérszínek (pl. a
    Vitest „RUN” címkéje) is megjelennek.
- Képek:

  | Kép                               | Forrás                                              | Tartalom                                         |
  | --------------------------------- | --------------------------------------------------- | ------------------------------------------------ |
  | `L06_01_tesztek.png`              | `npm test -- --reporter=verbose` (`server/`)        | 23 sikeres teszt, egyenként                      |
  | `L06_02_lefedettseg.png`          | `npm run coverage` (`server/`)                      | lefedettség fájlonként és összesítve             |
  | `L06_03_health_curl.png`          | `curl -s -i …/api/health`, 404 és hibás JSON        | élő válaszok, biztonsági és RateLimit-fejlécek   |
  | `L06_04_szervernaplo.png`         | `npm run dev` (a fejlesztői szerver naplója)        | indulás és tömör kérésnapló (404, 400)           |
  | `L06_05_lint_typecheck_build.png` | `npm run lint`, `typecheck`, `build`                | hibátlan kódellenőrzés és build                  |
  | `L06_06_env_schema.png`           | `server/src/config/env.ts`, 9–27. sor               | a környezeti változók Zod-sémája                 |
  | `L06_07_createapp.png`            | `server/src/app.ts`, 24–72. sor                     | az alkalmazás összeállítása (middleware-sorrend) |
  | `L06_08_hibakezeles.png`          | `server/src/middleware/errorHandler.ts`, 15–32. sor | hibák leképezése egységes válaszra               |
  | `L06_09_health_teszt.png`         | `server/tests/integration/app.test.ts`, 8–31. sor   | a `/api/health` végponttesztjei                  |

- Kézzel készítendő (javaslat): a `server/http/health.http` a VS Code REST Client bővítményével
  (kérés + válasz egy képen).
- Commit: `8b0ea32` – `feat(L06): Express + TypeScript szerverváz`

## L07 – Adatbázis: PostgreSQL, Prisma, migráció, seed (2026-09-29 – 2026-09-30)

- Elkészült:
  - `docker-compose.yml`: PostgreSQL 17 (`postgres:17`), `pgdata` volume, healthcheck, csak
    `127.0.0.1:5432`; a hozzáférési adatok a gyökér `.env`-ből (sablon: `.env.example`);
  - Prisma 7.10: `prisma.config.ts`, `prisma/schema.prisma` (a 4. fejezet 5 táblája, 3 enum,
    egyedi megszorítások, idegen kulcsok `onDelete: Restrict`-tel, indexek, `uuid`/`timestamptz`
    natív típusok);
  - két migráció: `…_init` (táblák, indexek, idegen kulcsok) és `…_nullable_session_and_checks`
    (nullázható `stripeSessionId` + kézzel írt CHECK megszorítások: értékelés 1–5, `sha256` és
    `dHash` csak kisbetűs hexadecimális, pontos hosszal, ár és összeg nem negatív);
  - `src/lib/prisma.ts`: kliens a `@prisma/adapter-pg` driver-adapterrel, 5 mp-es kapcsolódási
    időkorláttal; kapcsolatellenőrzés érthető, jelszómentes hibaüzenettel;
    `src/lib/password.ts` (bcrypt, költség 12);
  - seed: `src/db/seed.ts` (8 kategória, admin, 2 demó felhasználó; idempotens; jelszavak a
    `server/.env`-ből) + `prisma/seed.ts` belépési pont;
  - `config/env.ts`: kötelező `DATABASE_URL` (csak PostgreSQL-URL); a szerver induláskor ellenőrzi
    az adatbázist, és hiba esetén azonnal leáll;
  - Vitest két projekttel: `unit` (adatbázis nélkül) és `db` (külön `photochain_test` adatbázis,
    `globalSetup`-pal futtatott `prisma migrate deploy`, a név `_test` végét ellenőrzi; a tesztek
    előtt és a futás végén is kiürül);
  - `render.mjs`: `mermaid` mód (ER-diagram) és SQL-kiemelés; `docs/diagramok/adatmodell.mmd`.
- Eredmények: 58/58 teszt (38 `unit` + 20 `db`; TDD: előbb bukó tesztek, lásd `L07_02`);
  lefedettség: utasítás 98,2%, elágazás 94,6%, függvény 93,9%, sor 98,0%; ESLint, `tsc`, build
  hibátlan; `npm audit`: 0 sebezhetőség; a `blockchain/` 17 tesztje változatlanul zöld.
- Döntések és indoklásuk:
  - Prisma 7.10 (nem 8): az npm `latest` címkéje egy 8.0 RC-re mutatott.
  - `overrides` (`deepmerge-ts` ≥ 8.0.2, `mysql2` ≥ 3.24.4): a Prisma CLI függőségeinek ismert
    sebezhetőségei; az `npm audit fix` Prisma 6-ra butított volna vissza.
  - Törlés helyett tiltás/elrejtés, ezért `Restrict` idegen kulcsok (a láncon rögzített képek és a
    rendelések története megmarad).
  - `bcryptjs` (tiszta JS, [S17]): nincs natív fordítás Windows alatt és a Docker-képben sem.
  - CHECK megszorítások az adatbázisban is (nem csak az API-ban): a duplikáció-szűrés alapja a
    `sha256` egyedisége, amelyet nagybetűs vagy rövidebb értékkel meg lehetne kerülni. A Prisma-séma
    ezt nem tudja kifejezni, ezért a migráció kézzel írt SQL-t tartalmaz („customizing migrations”).
  - A javítások új migrációba kerültek (nem az `init` átírásával), így a fejlesztői adatbázist nem
    kellett törölni.
- Független kódátnézés: kritikus/súlyos hiba nem volt; a javított észrevételek:
  - a kapcsolatkészletnek nem volt kapcsolódási időkorlátja – nem válaszoló gépnél a szerver némán
    lógott (teszt: RFC 5737 szerinti, nem irányított címmel);
  - a `stripeSessionId` kötelező volt, pedig a terv (3.3, L14) szerint a rendelés a Stripe-munkamenet
    előtt jön létre;
  - a `globalSetup` hibás formátumú URL-nél a jelszót is tartalmazó hibát dobhatott;
  - hiányoztak a CHECK megszorítások.
  - Későbbre (L31): a `postinstall: prisma generate` miatt a produkciós Docker-szakaszban
    `--ignore-scripts` kell, a generálás a build-szakaszban történik.
- Problémák és megoldásuk:
  - A Prisma kapcsolódási hibaüzenete többsoros és semmitmondó volt – az ok a driver-adapter
    hibájából, a hibakódból vagy az egysoros üzenetből kerül ki (`AuthenticationFailed`,
    `ECONNREFUSED`, időtúllépés).
  - A második migráció a tesztadatbázisban elakadt: az előző (piros) futásból bent maradt, az új
    CHECK-et sértő sorokon, ráadásul félig lefutva (a Prisma a PostgreSQL-migrációt nem egy
    tranzakcióban futtatja). Megoldás: az eldobható tesztadatbázis újralétrehozása, és a tesztek a
    futás végén is ürítenek.
  - A lefedettségi riport elrejtette a 100%-os fájlokat (`skipFull: false`).
  - PowerShell 5.1 a képgenerátornak átadott parancsból elhagyta a belső idézőjeleket – a `psql`-kép
    egy Node-os indítóval (argumentumtömbbel) készült.
- Képek:

  | Kép                                   | Forrás                                                   | Tartalom                                    |
  | ------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
  | `L07_01_docker_compose.png`           | `docker compose up -d --wait`, `docker compose ps`       | a futó, egészséges adatbázis-konténer       |
  | `L07_02_tesztek_piros.png`            | `npx vitest run --project unit` (mentett kimenet)        | TDD piros fázis                             |
  | `L07_03_tesztek_zold.png`             | `npm test -- --reporter=verbose` (`server/`)             | 58 sikeres teszt (`unit` + `db`)            |
  | `L07_04_lefedettseg.png`              | `npm run coverage` (`server/`)                           | lefedettség fájlonként                      |
  | `L07_05_migracio_seed.png`            | `npx prisma migrate status`, `npm run db:seed`           | 2 migráció, a séma naprakész, a seed lefut  |
  | `L07_06_seed_adatok_psql.png`         | `docker compose exec db psql …` (mentett kimenet)        | a seed adatai, a jelszó helyett bcrypt-hash |
  | `L07_07_szerver_indulas.png`          | `npm run dev` (mentett kimenet)                          | indulás adatbázis-ellenőrzéssel             |
  | `L07_08_szerver_adatbazis_nelkul.png` | `npm start` hibás `DATABASE_URL`-lel                     | azonnali leállás érthető hibával            |
  | `L07_09_docker_compose_yml.png`       | `docker-compose.yml`, 14–37. sor                         | a PostgreSQL-szolgáltatás                   |
  | `L07_10_schema_photo.png`             | `server/prisma/schema.prisma`, 79–118. sor               | a `Photo` modell                            |
  | `L07_11_schema_review.png`            | `server/prisma/schema.prisma`, 142–158. sor              | a `Review` modell (összetett egyedi kulcs)  |
  | `L07_12_migration_sql.png`            | `…_init/migration.sql`, 84–136. sor                      | a generált indexek és idegen kulcsok        |
  | `L07_13_prisma_config.png`            | `server/prisma.config.ts`, 1–27. sor                     | a Prisma CLI konfigurációja                 |
  | `L07_14_lib_prisma.png`               | `server/src/lib/prisma.ts`, 7–73. sor                    | kliens, időkorlát, kapcsolatellenőrzés      |
  | `L07_15_seed_database.png`            | `server/src/db/seed.ts`, 89–126. sor                     | a `seedDatabase` függvény                   |
  | `L07_16_teszt_sha256_egyedi.png`      | `server/tests/db/schema.test.ts`, 92–98. sor             | a SHA-256 egyediségének tesztje             |
  | `L07_17_er_diagram.png`               | `docs/diagramok/adatmodell.mmd` (`mermaid` mód)          | az adatbázis ER-diagramja                   |
  | `L07_18_migration_checks.png`         | `…_nullable_session_and_checks/migration.sql`, 1–22. sor | a kézzel kiegészített második migráció      |
  | `L07_19_teszt_check.png`              | `server/tests/db/schema.test.ts`, 116–134. sor           | a hash-formátum CHECK-tesztje               |

- Kézzel készítendő (javaslat): Docker Desktop – a futó `photochain-db-1` konténer; Prisma Studio
  (`npm run db:studio`) a `users` és `categories` táblával.
- Commit: `4279e04` – `feat(L07): adatbázis – PostgreSQL, Prisma, migráció, seed`

## L08 – Regisztráció, bejelentkezés, jogosultságkezelés (2026-09-30)

- Elkészült (`server/`):
  - végpontok (terv 5.1): `POST /api/auth/register`, `POST /api/auth/login`,
    `POST /api/auth/logout`, `GET /api/auth/me`; rétegek a D3 döntés szerint: `auth.routes.ts` →
    `auth.controller.ts` → `auth.service.ts` → Prisma, a bemeneti sémák az `auth.schemas.ts`-ben;
  - regisztráció: Zod-séma (e-mail, jelszó 8 karaktertől 72 bájtig, megjelenítési név 2–50
    karakter), bcrypt-hash 12-es költséggel; a foglalt címet az adatbázis egyedi indexe utasítja el
    (→ 409 `EMAIL_TAKEN`), így két egyidejű regisztráció közül is csak az egyik sikerül;
  - bejelentkezés: a JWT (`jsonwebtoken`, HS256, 7 nap) `HttpOnly; SameSite=Lax` sütibe kerül,
    élesben `Secure` jelzővel (D4 döntés) – `lib/jwt.ts`, `lib/sessionCookie.ts`; a token csak a
    felhasználó azonosítóját tartalmazza;
  - `middleware/auth.ts`: `requireAuth` (a felhasználót minden kérésnél az adatbázisból olvassa,
    ezért a tiltás és a szerepkör változása azonnal érvényes), `requireRole('ADMIN')`,
    `getSessionUser(req)`; tiltott felhasználó: 403 `ACCOUNT_BLOCKED` bejelentkezéskor és minden
    védett kérésnél;
  - szigorúbb sebességkorlát a bejelentkezésre és a regisztrációra (együtt 20 kérés / 15 perc / IP,
    `AUTH_RATE_LIMIT_MAX`), az általános `/api` korláton felül – `middleware/rateLimit.ts`;
  - `middleware/validate.ts` (`withValidatedBody`): a kezelő a kérés törzsét csak a Zod-sémán
    keresztül kaphatja meg;
  - új környezeti változók: `JWT_SECRET` (kötelező, legalább 32 karakter), `AUTH_RATE_LIMIT_MAX`;
    új hibakódok: `INVALID_CREDENTIALS`, `ACCOUNT_BLOCKED`, `EMAIL_TAKEN`, `UNSUPPORTED_MEDIA_TYPE`;
  - `http/auth.http` a REST Client-hez; README és `.env.example` frissítve.
- Eredmények: 146/146 teszt (L07 végén: 58) – 85 `unit` + 61 `db`; TDD: előbb bukó tesztek
  (`L08_01`), az átnézések észrevételeire is előbb a hibát reprodukáló teszt készült; lefedettség:
  utasítás 99,5%, elágazás 96,7%, függvény 100%, sor 100%; ESLint, `tsc`, build hibátlan;
  `npm audit`: 0 sebezhetőség; élő próba `curl`-lel a teljes folyamatra (`L08_06`–`L08_09`).
- Döntések és indoklásuk:
  - **E-mail-címek normalizálása az API-ban** (szóközök levágása + kisbetűsítés, `emailSchema`): az
    adatbázisban a `users.email` egyedisége kis- és nagybetű-érzékeny (L07-ben a `citext` kiterjesztés
    helyett ez a megoldás lett választva), ezért regisztráció, bejelentkezés és a seed is ugyanazt a
    sémát használja. Teszt: a csak betűméretben eltérő cím is 409.
  - A regisztráció egyben be is jelentkeztet (sütit állít be): a kliensnek nem kell a jelszót
    megtartania egy második kéréshez.
  - A tokenben nincs szerepkör: a jogosultság forrása mindig az adatbázis. Ára kérésenként egy
    lekérdezés, cserébe a tiltás nem a token lejártakor (7 nap), hanem azonnal érvényesül.
  - Bejelentkezésnél ismeretlen címre és rossz jelszóra ugyanaz a válasz (401
    `INVALID_CREDENTIALS`), és ismeretlen címnél is lefut egy bcrypt-összevetés (rögzített „dummy”
    hash-sel), hogy a válaszidő se árulja el, létezik-e a fiók. A tiltás ténye csak helyes jelszó
    után derül ki. A regisztráció 409-es válasza viszont elárulja, hogy egy cím foglalt – ezt a terv
    írja elő, a gyakorlatban is szokásos kompromisszum.
  - A jelszó legfeljebb 72 bájt: a bcrypt ennél többet nem vesz figyelembe.
  - CSRF ellen: `SameSite=Lax` süti + a szerver csak `application/json` törzset dolgoz fel (ilyet
    más webhely űrlapja nem tud küldeni) + nincs CORS.
  - Kijelentkezés = a süti törlése; a token állapotmentes, nem vonható vissza (ismert korlát, lásd
    lent).
  - Az auth-válaszok `Cache-Control: no-store` fejlécet kapnak (személyes adat).
- Független átnézés (biztonság, TypeScript): kritikus hiba nem volt. A
  javított észrevételek:
  - **érvényes fejlécű, de nem JSON törzsű „token” 500-as hibát váltott ki** (mindkét átnézés
    megtalálta): a `jsonwebtoken` ilyenkor nem a saját hibáját, hanem `SyntaxError`-t dob. Most a
    token bármilyen hibája 401; a korábbi teszt ráadásul a hibás viselkedést rögzítette (`L08_25`);
  - a `verifySessionToken` csak UUID alakú azonosítót fogad el, és a `maxAge` miatt lejárat nélküli
    token sem élhet 7 napnál tovább;
  - a „dummy” hash eredetileg az első használatkor készült – újraindítás után az első ismeretlen
    címre adott válasz kétszer annyi ideig tartott; most rögzített konstans, teszt ellenőrzi, hogy
    a költsége megegyezik a valódi jelszavakéval, és hogy a service tényleg használja;
  - a `validateBody` middleware típusai nem garantálták, hogy az ellenőrzés le is futott (ha egy
    útvonalról lemarad, a kezelő nyers adatot lát „ellenőrzött” típussal) → `withValidatedBody`;
  - a `req.user` típusbővítése a `src/types/express.d.ts`-be került, a kezelők a
    `getSessionUser(req)` segéddel kérik le (a `requireAuth` nélkül bekötött útvonal 401-et ad);
  - a body-parser „nem támogatott karakterkészlet/tömörítés” hibája 500 helyett 415;
  - tesztek: egyidejű regisztráció, seedelt admin bejelentkezése, objektum típusú süti, nem szöveges
    mezők; az adatbázishiba tesztje valódi hálózati kapcsolat helyett hamis klienssel fut; a
    bejelentkezési tesztek előre kiszámolt hash-sel dolgoznak (kevesebb lassú bcrypt-művelet).
- Commit előtti audit (a korábbi eredményektől függetlenül, nulláról):
  - módszerek: tiszta telepítés a lockfile-ból (`npm ci`) + lint, típusellenőrzés, tiszta build,
    teljes tesztkészlet; **mutációs próba** – 28 kritikus sor szándékos elrontása egyenként (pl.
    `HttpOnly` kivétele, a tiltás vagy a jelszó ellenőrzésének kihagyása, az algoritmus rögzítésének
    törlése): a tesztek mind a 28-at megfogták; a **lefordított** szerver (`node dist/server.js`)
    éles módban, kívülről vizsgálva (43 ellenőrzés: sütik, hibakódok, sebességkorlát, válaszidők,
    a napló tartalma); a valódi fejlesztői konfiguráció a seedelt fiókok bejelentkezésével;
    **fuzz-próba** 147 szokatlan bemenettel (elvárás: soha nem 5xx); a seed futtatása;
  - **talált hiba 1 – NUL bájt a megjelenítési névben → 500:** a PostgreSQL szöveges oszlopa nem tud
    NUL karaktert tárolni, így a `"An\u0000na"` névvel küldött regisztráció az adatbázisnál bukott
    el, és „váratlan szerverhiba” lett belőle. Javítás: a séma a vezérlőkaraktereket (NUL, sortörés,
    escape…) elutasítja → 400 `VALIDATION_ERROR`;
  - **talált hiba 2 – a sebességkorlát a kéréstörzs feldolgozása után állt** (L06 óta): a hibás JSON-t,
    túl nagy vagy nem támogatott törzset küldő kérések a számláló előtt elbuktak, ezért korlátlanul
    küldhetők voltak. Javítás: a korlát a törzs feldolgozása elé került (`app.ts`);
  - megerősítve (nem hiba): rövid `JWT_SECRET`-tel a szerver érthető üzenettel, 1-es kóddal leáll;
    ismeretlen e-mail és rossz jelszó válaszideje azonos (221 / 227 ms); a naplóba nem kerül jelszó,
    süti, token vagy e-mail-cím.
- Későbbre (tudatosan elhalasztva):
  - L10: a multipart feltöltést más webhely űrlapja is el tudja küldeni – oda `Origin` /
    `Sec-Fetch-Site` ellenőrzés kell a `SameSite=Lax` mellé;
  - L13: a többi szabad szöveges mezőnél (bemutatkozás, képcím, leírás) is tiltani kell a NUL
    karaktert, különben ugyanaz az 500-as hiba jön elő;
  - L19, L28: fejlesztés és E2E-tesztek közben a 20-as auth-korlát hamar betelhet (429) – ilyenkor az
    `AUTH_RATE_LIMIT_MAX` a `server/.env`-ben megemelhető;
  - L30: fiókonkénti (nem csak IP-alapú) próbálkozáskorlát; a bcrypt processzorigénye terhelés alatt;
    megjelenítési nevek (láthatatlan és irányváltó karakterek, „Adminisztrátor” név foglalása); token
    visszavonása (pl. `tokenVersion`), ha lesz jelszócsere; `CHECK (email = lower(email))` az
    adatbázisban;
  - L31–L32: élesben a `NODE_ENV=production` kötelező (enélkül nincs `Secure` süti és `trust proxy`);
    a fordított proxyk száma legyen beállítható; a seed ne fusson éles adatbázison.
- Problémák és megoldásuk:
  - A kérésnapló a sikeres auth-kéréseknél rövidített útvonalat írt (`POST /register → 201`), a
    hibásaknál teljeset: az Express a router alatt átírja a `req.url`-t. Javítva (`originalUrl`),
    teszttel – a hibát a szervernapló képe buktatta le.
  - A `server/.env`-be bekerült a `JWT_SECRET` (generált, 64 karakteres érték); enélkül a szerver a
    konfiguráció ellenőrzésénél leáll.
  - Az élő próba és a képei a **tesztadatbázison**, eldobható JWT-kulccsal futó szerverről készültek,
    hogy a fejlesztői adatbázisba ne kerüljön próbafelhasználó, és a képeken látható token ne a
    valódi kulccsal készüljön.
  - A lefedettségi táblában megjelent a típusdeklarációs fájl 0%-kal – a `*.d.ts` kizárva.
- Képek:

  | Kép                               | Forrás                                                           | Tartalom                                              |
  | --------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
  | `L08_01_tesztek_piros.png`        | `npx vitest run` (mentett kimenet, a hiba- és összesítő sorok)   | TDD piros fázis: 7 bukó tesztfájl                     |
  | `L08_02_auth_tesztek_zold.png`    | `npx vitest run --project db tests/db/auth… --reporter=verbose`  | a 41 végpont- és jogosultságteszt egyenként           |
  | `L08_03_unit_tesztek_zold.png`    | `npx vitest run --project unit … --reporter=verbose`, `npm test` | JWT-, séma-, jelszó- és validálótesztek; 146/146      |
  | `L08_04_lefedettseg.png`          | `npm run coverage` (`server/`)                                   | lefedettség fájlonként                                |
  | `L08_05_lint_typecheck_build.png` | `npm run lint`, `typecheck`, `build`                             | hibátlan kódellenőrzés és build                       |
  | `L08_06_regisztracio_curl.png`    | `curl -i …/auth/register`, `/auth/me`, ismételt és hibás kérés   | 201 + `Set-Cookie`, RateLimit-fejlécek; 200, 409, 400 |
  | `L08_07_bejelentkezes_curl.png`   | `curl …/auth/logout`, `/auth/me`, `/auth/login`                  | 204, 401, rossz jelszó 401, bejelentkezés 200 + süti  |
  | `L08_08_jelszo_hash_psql.png`     | `docker compose exec db psql … SELECT … FROM users` (mentett)    | az adatbázisban a jelszó helyett bcrypt-hash          |
  | `L08_09_szervernaplo.png`         | `npm run dev` (mentett kimenet)                                  | a folyamat kérésnaplója (státusz, idő; adatok nélkül) |
  | `L08_10_jwt.png`                  | `server/src/lib/jwt.ts`, 9–49. sor                               | token aláírása és ellenőrzése                         |
  | `L08_11_session_cookie.png`       | `server/src/lib/sessionCookie.ts`, 10–33. sor                    | a süti beállításai (HttpOnly, SameSite, Secure)       |
  | `L08_12_auth_schemas.png`         | `server/src/modules/auth/auth.schemas.ts`, 14–61. sor            | a regisztráció és a bejelentkezés Zod-sémái           |
  | `L08_13_auth_service.png`         | `server/src/modules/auth/auth.service.ts`, 23–64. sor            | a regisztráció és a bejelentkezés üzleti logikája     |
  | `L08_14_auth_controller.png`      | `server/src/modules/auth/auth.controller.ts`, 21–54. sor         | a HTTP-réteg (süti, válaszok)                         |
  | `L08_15_auth_routes.png`          | `server/src/modules/auth/auth.routes.ts`, 17–38. sor             | útvonalak, szigorúbb sebességkorlát                   |
  | `L08_16_auth_middleware.png`      | `server/src/middleware/auth.ts`, 27–68. sor                      | `getSessionUser`, `requireAuth`, `requireRole`        |
  | `L08_17_validate.png`             | `server/src/middleware/validate.ts`, 9–23. sor                   | `withValidatedBody`                                   |
  | `L08_18_teszt_regisztracio.png`   | `server/tests/db/auth.test.ts`, 84–90. sor                       | teszt: sikeres regisztráció                           |
  | `L08_19_teszt_foglalt_email.png`  | `server/tests/db/auth.test.ts`, 121–130. sor                     | teszt: foglalt e-mail → 409                           |
  | `L08_20_teszt_rossz_jelszo.png`   | `server/tests/db/auth.test.ts`, 227–235. sor                     | teszt: rossz jelszó → 401                             |
  | `L08_21_teszt_suti_nelkul.png`    | `server/tests/db/auth.test.ts`, 301–306. sor                     | teszt: védett végpont süti nélkül → 401               |
  | `L08_22_teszt_suti.png`           | `server/tests/db/auth.test.ts`, 198–213. sor                     | teszt: a süti attribútumai                            |
  | `L08_23_teszt_tiltott.png`        | `server/tests/db/auth.test.ts`, 352–361. sor                     | teszt: letiltott felhasználó azonnali kizárása        |
  | `L08_24_teszt_require_role.png`   | `server/tests/db/authorization.test.ts`, 106–157. sor            | a `requireRole('ADMIN')` tesztjei                     |
  | `L08_25_teszt_hibas_token.png`    | `server/src/lib/jwt.test.ts`, 103–113. sor                       | az átnézés által talált hiba regressziós tesztje      |

- Kézzel készítendő (javaslat): a `server/http/auth.http` kérései a VS Code REST Client
  bővítményével (kérés + válasz egy képen, a fejlesztői adatbázison); Prisma Studio
  (`npm run db:studio`) a `users` táblával – a `passwordHash` oszlopban a hash látszik. A terv
  szerinti „`Set-Cookie` a Chrome DevToolsban” kép a frontend (L19) elkészültével készíthető el; addig
  a `L08_06` / `L08_07` mutatja a fejlécet.
- Commit: `8347d9d` – `feat(L08): regisztráció, bejelentkezés, jogosultságkezelés`

## L09 – Hash-modul: SHA-256, dHash, Hamming-távolság (2026-09-30)

- Elkészült (`server/`):
  - `src/services/hashing.service.ts` – tiszta, önállóan tesztelhető függvények:
    `sha256(buffer)` (Node `crypto`); `dHash(buffer)` – Krawetz leírásának saját megvalósítása két
    lépésben: `toDHashGrid` (sharp: EXIF szerinti állás → átlátszó terület fehérre → 9×8 képpont →
    szürkeárnyalat, 72 fényességérték) és `dHashFromGrid` (soronként a szomszédok összehasonlítása:
    1, ha a bal oldali képpont sötétebb → 64 bit → 16 jegyű hex); `hammingDistance(a, b)` (XOR +
    bitszámlálás BigInttel, Wegner módszerével); `isNearDuplicate(távolság, küszöb)`;
  - `DHASH_THRESHOLD` környezeti változó (0–64, alapérték 10);
  - saját tesztfotók: `tests/fixtures/images/` (3 kép, 1600 képpontos hosszabbik oldal, metaadatok
    nélkül) + `scripts/prepare-test-photo.ts` az előkészítésükhöz;
  - `scripts/dhash-figure.ts`: a dHash lépéseit bemutató ábra egy képről; a képgenerátor új `html`
    módja (`tools/screenshot/render.mjs`) készít belőle PNG-t.
- Eredmények: 193/193 teszt (L08 végén: 146) – 132 `unit` + 61 `db`; ebből 46 a hash-modulé; TDD:
  előbb bukó tesztek (`L09_01`); lefedettség: utasítás 99,2%, elágazás 94,5%, függvény 100%, sor
  99,6%; ESLint, `tsc`, build hibátlan; `npm audit`: 0 sebezhetőség.
- Mérés a saját fotókon (`L09_07`; a részletes kiértékelés az L29 feladata):

  | Módosítás                                 | dHash-távolság (bit a 64-ből) |
  | ----------------------------------------- | ----------------------------- |
  | ugyanaz a fájl                            | 0                             |
  | kicsinyítés 50%-ra, 25%-ra                | 0–2                           |
  | JPEG-újratömörítés (60%, 20%)             | 0–1                           |
  | WebP-be mentés (80%)                      | 1–6                           |
  | szürkeárnyalatossá alakítás               | 1–2                           |
  | különböző fotók páronként                 | 25, 29, 30                    |
  | tükrözés (ismert korlát – nem ismeri fel) | 11, 30, 30                    |

  A módosított másolatok tehát bőven a 10-es küszöbön belül, a különböző képek messze fölötte vannak
  (a véletlenszerű ~32 közelében); az SHA-256 minden módosításnál megváltozik.

- Döntések és indoklásuk:
  - A bitszabály és a bitsorrend Krawetz leírását követi (1, ha a bal képpont sötétebb; balról
    jobbra, fentről lefelé, a legnagyobb helyiértékkel kezdve); a kimenet formátuma megegyezik az
    adatbázis CHECK megszorításaival (64, illetve 16 kisbetűs hexadecimális számjegy).
  - A kép abban az állásban számít, ahogyan megjelenik (EXIF-tájolás alkalmazása), az átlátszó
    terület fehérnek.
  - **A `sharp` verziója pontosan rögzített (0.35.5):** a hash a blokkláncra kerül, ezért egy
    könyvtárfrissítés nem változtathatja meg észrevétlenül – ezt egy rögzített mintára adott hash
    tesztje is őrzi. A szürkeárnyalat súlyozása könyvtárfüggő, ezért a hash más
    dHash-megvalósításokéval nem vethető össze.
  - A küszöb alapértéke 10 (Krawetz: e fölött valószínűleg más kép); konfigurálható, az L29 méri ki.
  - A modul nem kép bemenetre saját hibatípust dob (`InvalidImageError`), hogy a feltöltés (L10)
    meg tudja különböztetni a hibás fájlt a szerverhibától.
- Független kódátnézés (TypeScript): az algoritmus magját hibátlannak találta; a
  javított észrevételek (mindegyik előbb bukó teszttel):
  - **a képpontra azonos PNG és WebP hash-e eltért (6 bit):** a sharp a WebP-t és a JPEG-et már
    dekódoláskor, gyorsított módon kicsinyíti. Kikapcsolva (`fastShrinkOnLoad: false`) az eltérés 0;
  - a fotós tesztek az álló (EXIF szerint elforgatott) képeken hamisan buktak volna, mert a
    másolatok készítésekor elveszett a tájolás;
  - az üresen hagyott `DHASH_THRESHOLD=` csendben 0-t jelentett (kikapcsolta volna a hasonlóság
    felismerését) – most a szerver ilyenkor el sem indul;
  - a `dHashFromGrid` csak pontosan 72 értéket fogad el; az átlátszósági teszt most valóban
    megkülönbözteti a fehér és a fekete hátteret.
- Commit előtti audit (nulláról, a korábbi eredményektől függetlenül) – hibát nem talált:
  - tiszta telepítés a lockfile-ból (`npm ci`), lint, típusellenőrzés, build, 193/193 teszt;
  - mutációs próba: 17 kritikus sor szándékos elrontása egyenként (fordított bitszabály, bit- és
    sorsorrend, a tájolás vagy a `fastShrinkOnLoad` kihagyása, XOR helyett OR, küszöb, SHA-512 stb.)
    – a tesztek mind a 17-et megfogták;
  - a lefordított modul (`dist/`) a három fotóra ugyanazt a hash-t adja, mint fejlesztői módban; 40
    párhuzamos számítás eredménye azonos; a 22 MB-os eredeti és az 1600 képpontos változat
    távolsága 1 bit (202 ms alatt);
  - egy független számítással (előbb kicsinyítés színesben, utána kézi fényességszámítás) az eltérés
    0, 1, illetve 4 bit. A 4 bit a sötét gyertyás képnél adódott, és mind olyan helyen, ahol a két
    szomszédos képpont fényessége pontosan azonos (25 és 25) – ott a kerekítés dönti el a bitet.
    Ez a dHash ismert tulajdonsága egyszínű képrészeken, nem hiba (a kép 64 összehasonlításából 19
    ilyen „döntetlen közeli”);
  - 200 sérült bemenetre (csonkított, véletlen bájthibás fájl, véletlen adat) az eredmény mindig
    vagy érvényes hash, vagy `InvalidImageError` – más hiba, lefagyás nem fordult elő;
  - a repóba kerülő fotókban nincs metaadat (EXIF, ICC, XMP, IPTC, gyártó, sorozatszám);
  - hibás `DHASH_THRESHOLD` értékkel a szerver érthető üzenettel, 1-es kóddal leáll;
  - **nem ellenőrzött:** a hash egyezése Linuxon (az éles környezet Docker-konténer lesz). A
    rögzített mintára adott hash tesztje az L31-ben ezt automatikusan kimutatja.
- Későbbre (L10, feltöltés): csak JPEG/PNG/WebP és egyetlen képkocka engedhető meg (a dHash csak az
  első képkockát nézi – egy animált kép megkerülné a szűrést; az SVG-t a sharp szó nélkül
  raszterizálná); az egyszínű képek mind `0000000000000000` hash-t kapnak, tehát egymás
  „másolatai”; képpontszám-korlát; a HEIC nem dekódolható. L29: a sötét, kis kontrasztú kép
  (`02_gyertyak.jpg`) bitjeit 1–3 egységnyi fényességkülönbségek döntik el; a közel szimmetrikus
  kép tükrözve csak 11 bitre van az eredetitől.
- Problémák és megoldásuk:
  - A bemásolt fotók eredetiben 9–22 MB-osak (15–22 megapixel) voltak, EXIF-adatokkal (az egyikben
    GPS-bejegyzés, mindben a gép sorozatszáma). A repóba a kicsinyített, metaadat nélküli változat
    került (145–284 kB); az eredetik a git által figyelmen kívül hagyott `originals/` almappában
    maradtak.
  - A sharp az üres bemenetre már a feldolgozási lánc felépítésekor (szinkron) hibát dob – a
    hibakezelés ezt is `InvalidImageError`-rá alakítja.
- Képek:

  | Kép                                 | Forrás                                                          | Tartalom                                           |
  | ----------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
  | `L09_01_tesztek_piros.png`          | `npx vitest run …` (mentett kimenet, hiba- és összesítő sorok)  | TDD piros fázis                                    |
  | `L09_02_tesztek_zold.png`           | `npx vitest run --project unit src/services --reporter=verbose` | a hash-modul 46 tesztje egyenként                  |
  | `L09_03_lefedettseg.png`            | `npm run coverage` (`server/`)                                  | 193 teszt, lefedettség fájlonként                  |
  | `L09_04_lint_typecheck_build.png`   | `npm run lint`, `typecheck`, `build`                            | hibátlan kódellenőrzés és build                    |
  | `L09_05_dhash_lepesek_gitar.png`    | `scripts/dhash-figure.ts` + `render.mjs html`                   | a dHash lépései: eredeti → 9×8 szürke kép → 64 bit |
  | `L09_06_dhash_lepesek_gyertyak.png` | `scripts/dhash-figure.ts` + `render.mjs html`                   | ugyanez egy sötét, kis kontrasztú képen            |
  | `L09_07_tavolsagok.png`             | eseti mérőscript (mentett kimenet)                              | a tesztfotók hash-ei és dHash-távolságai           |
  | `L09_08_konstansok_sha256.png`      | `server/src/services/hashing.service.ts`, 17–45. sor            | konstansok, `InvalidImageError`, `sha256`          |
  | `L09_09_kicsinyites_sharp.png`      | `server/src/services/hashing.service.ts`, 47–87. sor            | kicsinyítés 9×8 képpontra (`toDHashGrid`)          |
  | `L09_10_dhash_bitek.png`            | `server/src/services/hashing.service.ts`, 89–115. sor           | a 64 bit képzése (`dHashFromGrid`), `dHash`        |
  | `L09_11_hamming_kuszob.png`         | `server/src/services/hashing.service.ts`, 117–155. sor          | `hammingDistance`, `isNearDuplicate`               |
  | `L09_12_teszt_bitminta.png`         | `server/src/services/hashing.service.test.ts`, 141–155. sor     | kézzel kiszámolható 9×8-as minta tesztje           |
  | `L09_13_teszt_png_webp.png`         | `server/src/services/hashing.service.test.ts`, 216–225. sor     | az átnézés által talált hiba regressziós tesztje   |
  | `L09_14_teszt_sajat_fotok.png`      | `server/src/services/hashing.service.test.ts`, 397–436. sor     | a saját fotókon futó tesztek                       |

- Commit: `ac2f54c` – `feat(L09): hash-modul – SHA-256, dHash, Hamming-távolság`

## L10 – Képfeltöltés, feldolgozás, tárolás, duplikáció-szűrés (2026-09-30)

- Elkészült (`server/`): a `POST /api/photos` végpont (bejelentkezés után, `multipart/form-data`):
  - `middleware/upload.ts` – a multer egyetlen `image` fájlt fogad a memóriába (15 MB,
    `UPLOAD_MAX_BYTES`), korlátozott számú és hosszú szöveges mezővel; a nem multipart kérés 415;
  - `services/image.service.ts` – a típus a fájl **tartalmából** dől el (a fájl eleji azonosító +
    a sharp fejlécolvasása): csak egy képkockás JPEG, PNG vagy WebP (animált WebP és APNG nem),
    legfeljebb 50 megapixel, mindkét oldal legalább 600 képpont; **vízjeles előnézet** (≤ 1200
    képpont, átlósan ismétlődő SVG-minta a sharp `composite` műveletével) és **bélyegkép** (400
    képpont), mindkettő metaadatok (EXIF, GPS) nélkül; `services/imageDecoding.ts` – közös
    képpont- és időkorlát (20 s), a szerver indulásakor a nem használt képdekóderek letiltása;
  - `services/storage/` – `StorageService` felület (terv D11) és helyi megvalósítása: az eredeti
    bájtra változatlanul a privát `originals/` mappába, az előnézet és a bélyegkép a `public/` alá;
    a kulcsot mindig a szerver állítja elő (`<mappa>/<UUID>.<kiterjesztés>`), meglévő fájlt nem ír
    felül; a szerver csak a `public/` mappát szolgálja ki, a `/media` úton (terv L16);
  - `modules/photos/` – séma (Zod), controller, service, útvonal: ellenőrzés → ujjlenyomatok (L09)
    → duplikáció-szűrés (azonos SHA-256 → `409 DUPLICATE_EXACT`, dHash-távolság ≤
    `DHASH_THRESHOLD` → `409 DUPLICATE_SIMILAR`, a talált kép adataival) → tárolás → `Photo` rekord
    `PENDING_CHAIN` állapotban; a feltöltések feldolgozása sorban, egyenként fut (`p-queue`);
  - `middleware/sameOrigin.ts` – CSRF elleni második védvonal: a módosító kérés csak a saját
    eredetről (`Sec-Fetch-Site: same-origin`, vagy fejléc nélkül) fogadható el;
  - `middleware/concurrency.ts` – egyszerre legfeljebb 4 feltöltés (`UPLOAD_MAX_CONCURRENT`, a
    többi 503 `Retry-After` fejléccel), felhasználónként egy (429); felhasználónkénti kísérletszám-
    korlát (`UPLOAD_RATE_LIMIT_MAX`, 30 / 15 perc); `lib/text.ts` – a szabad szöveges mezők közös
    karakterszabályai (a regisztráció megjelenített nevére is);
  - dokumentáció: `README.md` (végpont, hibakódok, korlátok), `server/.env.example` (4 új
    változó), `server/http/photos.http` (REST Client multipart kérések), `docs/FORRASOK.md` (77–91).
- Eredmények: 326/326 teszt (L09 végén: 193) – 230 `unit` + 96 `db`; TDD: előbb bukó tesztek
  (`L10_01`, az átnézési körökben `L10_32`, `L10_33`); lefedettség: utasítás 99,46%, elágazás
  96,74%, függvény 100%, sor 99,8%; ESLint, `tsc`, build hibátlan; `npm audit`: 0 sebezhetőség. A
  versenyhelyzeteket vizsgáló tesztek ötszöri ismétlésben is stabilak.
- Élő próba a **tesztadatbázison**, eldobható JWT-kulccsal, ideiglenes tárhelymappával
  (`L10_06`–`L10_12`): feltöltés 201; ugyanaz a fájl egy másik felhasználótól 409
  `DUPLICATE_EXACT`; a 700 képpontos, 60%-os WebP-másolat 409 `DUPLICATE_SIMILAR` (3 bit); másik
  fotó 201; bejelentkezés nélkül 401, átnevezett szövegfájl 415, túl kicsi kép 400, hibás mezők
  400, idegen oldalról 403; az előnézet és a bélyegkép letölthető, az eredeti URL-en 404.
- Döntések és indoklásuk:
  - **Az eredeti fájl bájtra változatlanul** kerül a tárhelyre: az SHA-256 (és később a lánc)
    ezt azonosítja. Ezért nyilvános URL-je sincs; a nyilvános előnézetek újrakódolt képek, így
    sem metaadat, sem a fájlba rejtett tartalom nem jut át beléjük (terv D10).
  - A típusellenőrzés nem bízik a fájlnévben és a kliens által küldött típusban (OWASP): a fájl
    eleji azonosító dönti el, melyik dekóder kaphatja meg, a sharp fejléce pedig megerősíti.
  - Az animált képet azért tiltjuk, mert a dHash csak az első képkockát látja – egy „álca”
    képkockával a másolatszűrés megkerülhető volna. Az egyszínű képek mind `0000…` hash-t
    kapnának (egymás „másolatai” lennének), ezért `LOW_DETAIL_IMAGE`.
  - **Sorban, egyenként** dolgozza fel a szerver a feltöltéseket: két egyszerre érkező, egymáshoz
    _hasonló_ kép közül a második így már látja az elsőt (ezt az adatbázis egyedi indexe nem tudná
    kizárni), és a képfeldolgozás memóriaigénye sem sokszorozódik. Két szerverpéldány között a
    pontos egyezést a `photos.sha256` egyedi indexe zárja ki (tesztelve).
  - A nyilvános képek útja `/media` (a terv L16 lépésének Vite-proxyja ezt továbbítja).
- Független kódátnézés három körben (TypeScript, biztonság, majd
  ismét TypeScript a javításokra) – kritikus hibát egyik sem talált; a javított
  észrevételek (mindegyik előbb bukó teszttel):
  - **memória:** a feltöltési sor korlátlan volt (egy felhasználó sok 15 MB-os fájllal kimeríthette
    volna a memóriát) → egyidejűségi korlát (összesen és felhasználónként), felhasználónkénti
    kísérletkorlát, a kliens által megszakított, még sorban álló feltöltés kikerül a sorból;
  - **a korlát helye „elszivároghatott”:** ha a kliens még a korlát előtt (a bejelentkezés
    ellenőrzése közben) bontotta a kapcsolatot, a hely soha nem szabadult fel, és végül minden
    feltöltés 503-at kapott → `stream.finished` a `close` esemény helyett;
  - **APNG:** a sharp az animált PNG-t egy képkockásnak látja → a fájl blokkjainak átnézése
    (`acTL`);
  - „tömörített bomba”: képpontkorlát 100 helyett 50 megapixel, a hash-modulban is; időkorlát a
    képfeldolgozásra; a nem használt dekóderek letiltása;
  - a sor időkorlátja a lejárt feladatot nem állította le, csak elindította mellette a következőt
    (sérült volna a sorrendiség) → a sornak nincs időkorlátja, a képfeldolgozás lépéseinek van;
  - CSRF: a `same-site` (másik port vagy aldomain) kérés is átment → csak `same-origin`/`none`;
  - naplózás: a szándékos 503 nem „váratlan szerverhiba”; a képdekóder hibájának oka a naplóba
    kerül (a kliens 415-öt kap); a sikertelen takarítás naplózva, az eredeti hibát nem takarja el;
  - mezők: a sortörések egységesítése a hosszellenőrzés előtt (különben a böngésző CRLF-je miatt
    az 1983 karakteres leírás is „túl hosszú” lett volna); láthatatlan és írásirányt megfordító
    karakterek tiltása; a többször elküldött mezőre és a túl hosszú számra érthető üzenet;
  - kisebbek: egyenlő távolságnál a korábbi kép számít eredetinek; a hibakezelő a már elkezdett
    válasz után nem próbál újat küldeni; felesleges multer-beállítások törlése; kérés-időkorlát
    (3 perc) a lassan csordogáló feltöltések ellen.
- Commit előtti audit (nulláról, a korábbi eredményektől függetlenül):
  - tiszta telepítés a lockfile-ból (`npm ci`), lint, típusellenőrzés, build, minden teszt;
    `npm audit`: 0 sebezhetőség; az új függőségek (multer, p-queue) MIT licencűek;
  - **mutációs próba** (`L10_34`): 52 kritikus sor szándékos elrontása egyenként (pl. a
    vízjel, az APNG-szűrés, a pontos és a hasonló másolat keresése, a takarítás, a sor, a
    korlátok, a CSRF-ellenőrzés, a hibakezelő) – a tesztek 50-et megfogtak. A két átcsúszott
    rontás valódi tesztrést mutatott: a _futó_ feldolgozás megszakítását és a tárhelykulcs
    mintájának rögzített elejét nem ellenőrizte teszt – a pótolt tesztekkel mind az 52 megfogva;
  - **fekete dobozos próba** a lefordított, éles módú szerveren (`L10_36`): 13 útvonal-trükk
    (`..`, kódolt `%2e%2e`, `%2f`, `%5c`, rejtett fájl, mappalista) – az eredeti egyiken sem
    érhető el; GPS-es fotó: az előnézetben és a bélyegképben nincs metaadat; szkriptes SVG, HTML,
    GIF, TIFF, BMP, üres fájl, APNG, animált WebP → 415; 51 megapixeles „bomba” és hamis
    30000×30000-es fejléc → 400; 16 MB → 413; `__proto__[…]` és `constructor[prototype]…` mezők
    → 400; `same-site`/`cross-site` → 403; 6 egyidejű felhasználó → 4×201 + 2×503
    (`Retry-After`); ugyanaz a felhasználó kétszer egyszerre → 201 + 429; a bejelentkezés nélküli
    3 MB-os feltöltés 401-et kap (nem kapcsolatbontást); nincs árva fájl;
  - **fuzz-próba** (`L10_35`): 300 sérült „kép” (átírt bájtok, csonkítás, kivágás, véletlen adat
    hiteles fájlfejléccel) – **17 esetben 500-as szerverhiba**: ha egy JPEG közepéből hiányzik egy
    darab, a fejléc-ellenőrzés és a kicsinyítve (8× lekicsinyítve dekódolva) olvasó dHash még
    átengedi, a teljes felbontású előnézet viszont hibára fut, és ezt a hibát a feltöltés nem
    kezelte képhibaként. Javítás (előbb bukó tesztekkel): az előnézet és a bélyegkép a mentés előtt
    készül el, a dekóderhibájuk is 415 (`UNSUPPORTED_IMAGE`), az ok a naplóba kerül. Ugyanazzal a
    véletlenmaggal megismételve mind a 17 eset 415, egy új maggal további 500 fájlnál sincs 5xx;
    a javítás mutációs próbája is 2/2;
  - a tárhely és az adatbázis összhangban: 148 rekordhoz pontosan 148 × 3 fájl, azonos
    azonosítókkal; a szervernaplóban nincs váratlan hiba és nincs titkos adat;
  - a változásokban nincs titkos kulcs, `.env`, feltöltött kép vagy a fotók eredetije; nincs
    `console.log`, és nincs szó szerinti vezérlő- vagy irányjelző karakter a forrásban;
  - a három fájlt mutató ábra (`L10_11`) 1× felbontásban készült (4,3 MB → 0,5 MB), mert fotót
    tartalmaz;
  - további megfigyelések az L29-hez: a PNG-be mentett másolat 6 bitre, a kb. 10%-ban vágott 10
    bitre (éppen a küszöbre) volt az eredetitől; a tükrözött másolatot a dHash nem ismeri fel.
- Az ellenőrzés közben talált hibák:
  - bejelentkezés nélküli feltöltésnél a `Connection: close` fejléccel küldő kliens (pl. egy
    proxy) a 401 helyett megszakadt kapcsolatot kapott, mert a szerver a még érkező fájl közben
    bontotta a kapcsolatot → a hibakezelő előbb beolvassa (legfeljebb 32 MB-ig) a törzs maradékát;
  - a három fájl párhuzamos mentésénél egy hiba után árva fájl maradt → egymás utáni mentés;
  - a forrásfájlba néhány Unicode-escape helyett a láthatatlan karakter került
    szó szerint (a tesztek ettől még zöldek maradtak) → ellenőrző szkripttel megtalálva és
    visszacserélve; a teljes `server/` mentes a szó szerinti vezérlő- és irányjelző karakterektől.
- Későbbre (tudatosan nem most):
  - a 409-es válasz a még nem regisztrált vagy elrejtett kép adatait is megmutatja – L11/L13-ban
    eldöntendő, hogy ilyenkor legyen-e részlet; az elrejtett kép előnézetének törlése (L13, admin);
  - több szerverpéldánynál adatbázis-szintű zár a hasonló képekre; nagy adatmennyiségnél
    indexelt dHash-keresés (BK-fa); árva fájlok takarítása; tárhelykvóta; a fordított proxy
    törzsméret- és időkorlátja, a képek gyorsítótárazása és `Cross-Origin-Resource-Policy`
    fejléce (L32);
  - a vízjel felirata betűkészletet igényel – egy karcsú Docker-képben csak a vonalak
    maradnának (L31); a kliens a feltöltéseket egymás után küldje (L20);
  - a hiányzó fájl és a hibás mezők hibája nem egy válaszban jön (előbb a mezőké).
- Képek:

  | Kép                                    | Forrás                                                                             | Tartalom                                                   |
  | -------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
  | `L10_01_tesztek_piros.png`             | `npx vitest run` (mentett kimenet: tesztlista, hiba- és összesítő sorok)           | TDD piros fázis                                            |
  | `L10_02_feltoltes_tesztek_zold.png`    | `npx vitest run --project db tests/db/photos.test.ts --reporter=verbose`           | a végpont 25 tesztje                                       |
  | `L10_03_unit_tesztek_zold.png`         | `npx vitest run --project unit src/services/… src/middleware/… --reporter=verbose` | képfeldolgozás, tárhely, feltöltés, korlát, CSRF           |
  | `L10_04_lefedettseg.png`               | `npm run coverage` (`server/`)                                                     | 326 teszt, lefedettség fájlonként                          |
  | `L10_05_lint_typecheck_build.png`      | `npm run lint`, `typecheck`, `build`                                               | hibátlan kódellenőrzés és build                            |
  | `L10_06_feltoltes_curl.png`            | `curl` (regisztráció, feltöltés) a tesztadatbázison futó szerverre                 | 201: a kép adatai, ujjlenyomatai, URL-jei                  |
  | `L10_07_duplikacio_409.png`            | `curl` – ugyanaz a fájl, kicsinyített WebP-másolat, másik fotó                     | 409 `DUPLICATE_EXACT` / `DUPLICATE_SIMILAR`, majd 201      |
  | `L10_08_elutasitott_feltoltesek.png`   | `curl` – hibás kérések                                                             | 401, 415, 400, 400, 403                                    |
  | `L10_09_tarhely_fajlok.png`            | `tree /F`, `curl -w …` a `/media` útra                                             | a három mappa fájljai; előnézet 200, eredeti 404           |
  | `L10_10_photo_rekord_psql.png`         | `docker compose exec db psql … SELECT … FROM photos`                               | a két `Photo` rekord `PENDING_CHAIN` állapotban            |
  | `L10_11_vizjeles_elonezet.png`         | a próbafeltöltés három fájlja (HTML-oldal + `render.mjs html`)                     | eredeti, vízjeles előnézet, bélyegkép                      |
  | `L10_12_szervernaplo.png`              | a próbaszerver naplója (mentett kimenet)                                           | a kérések egysoros naplója                                 |
  | `L10_13_upload_middleware.png`         | `server/src/middleware/upload.ts`, 33–72. sor                                      | multer-beállítás, 415, hibák átalakítása                   |
  | `L10_14_inspect_image.png`             | `server/src/services/image.service.ts`, 105–121. sor                               | a fájl ellenőrzése (`inspectImage`)                        |
  | `L10_15_vizjel_svg.png`                | `server/src/services/image.service.ts`, 123–148. sor                               | az SVG-vízjel (`watermarkSvg`)                             |
  | `L10_16_elonezet_belyegkep.png`        | `server/src/services/image.service.ts`, 150–191. sor                               | előnézet és bélyegkép, a dekóderhiba átalakítása           |
  | `L10_17_storage_interface.png`         | `server/src/services/storage/storage.types.ts`, 4–12. sor                          | a `StorageService` felület                                 |
  | `L10_18_local_storage.png`             | `server/src/services/storage/local.storage.ts`, 23–56. sor                         | helyi tárhely (privát és nyilvános mappa)                  |
  | `L10_19_analyse_image.png`             | `server/src/modules/photos/photos.service.ts`, 173–207. sor                        | ellenőrzés, ujjlenyomatok, előnézet-készítés               |
  | `L10_20_duplikacio_szures.png`         | `server/src/modules/photos/photos.service.ts`, 272–296. sor                        | pontos és hasonló másolat keresése                         |
  | `L10_21_mentes_es_rekord.png`          | `server/src/modules/photos/photos.service.ts`, 328–370. sor                        | mentés, rekord, takarítás, a feldolgozás lépései           |
  | `L10_22_feldolgozasi_sor.png`          | `server/src/modules/photos/photos.service.ts`, 372–401. sor                        | a sor és a várakozó feltöltés megszakítása                 |
  | `L10_23_same_origin.png`               | `server/src/middleware/sameOrigin.ts`, 23–34. sor                                  | CSRF-ellenőrzés (`Sec-Fetch-Site`)                         |
  | `L10_24_hibakezelo_torzs.png`          | `server/src/middleware/errorHandler.ts`, 72–109. sor                               | a hibakezelő a be nem olvasott törzzsel                    |
  | `L10_25_teszt_duplikacio.png`          | `server/tests/db/photos.test.ts`, 196–212. sor                                     | a módosított másolat tesztje                               |
  | `L10_26_teszt_versenyhelyzet.png`      | `server/tests/db/photos.test.ts`, 260–289. sor                                     | két szerverpéldány egyidejű feltöltése (sorompóval)        |
  | `L10_27_szolgaltatas_tesztek_zold.png` | `npx vitest run … photos.service.test.ts`, majd séma-, szöveg-, hibakezelő-tesztek | a szolgáltatás, a séma és a hibakezelő tesztjei            |
  | `L10_28_apng_szures.png`               | `server/src/services/image.service.ts`, 77–94. sor                                 | az animált PNG felismerése                                 |
  | `L10_29_dekoderek_szukitese.png`       | `server/src/services/imageDecoding.ts`, 35–43. sor                                 | a képdekóderek letiltása                                   |
  | `L10_30_utvonal_korlatok.png`          | `server/src/modules/photos/photos.routes.ts`, 41–67. sor                           | a feltöltés útvonala és korlátai                           |
  | `L10_31_egyideju_korlat.png`           | `server/src/middleware/concurrency.ts`, 19–58. sor                                 | egyidejűségi korlát                                        |
  | `L10_32_atnezes1_tesztek_piros.png`    | `npx vitest run` (mentett kimenet: FAIL- és összesítő sorok)                       | az 1. átnézési kör új tesztjei a javítás előtt             |
  | `L10_33_atnezes2_tesztek_piros.png`    | `npx vitest run …` (mentett kimenet: FAIL- és összesítő sorok)                     | a 2. átnézési kör új tesztjei a javítás előtt              |
  | `L10_34_audit_mutacios_proba.png`      | `node mutation-check.mjs upload` (mentett kimenet, jegyzetmappa)                   | 52 szándékos rontás, a pótolt tesztek, a javítás próbája   |
  | `L10_35_audit_fuzz.png`                | `node audit-l10-fuzz.mjs …` (mentett kimenet, jegyzetmappa)                        | a 17 hiba a javítás előtt, majd 300 + 500 fájl hiba nélkül |
  | `L10_36_audit_fekete_doboz.png`        | `node audit-l10-live.mjs` (mentett kimenet, jegyzetmappa)                          | támadó kérések a lefordított, éles módú szerverre          |

- Commit: `f725dfe` – `feat(L10): képfeltöltés – ellenőrzés, vízjeles előnézet, tárolás, duplikáció-szűrés`

## L11 – Blokklánc-szolgáltatás és regisztrációs folyamat (2026-10-01)

- Elkészült (`server/`):
  - `services/blockchain.service.ts` – a `PhotoRegistry` elérése ethers v6-tal: ingyenes
    lekérdezések (`isRegistered` 5 másodperces korláttal, `getRecord`), a regisztrációs tranzakció
    (`registerPhoto`), egy korábban elküldött tranzakció lezárása (`waitForRegistration`) és az
    indításkori ellenőrzés (`checkConnection`: hálózat, szerződéskód, tulajdonos, egyenleg). A
    tranzakciók egy sorban, egyenként mennek ki (`p-queue`); a tranzakció hash-e (az aláírt
    tranzakció keccak256-hash-e) **még a küldés előtt** az adatbázisba kerül; díjplafon
    (`CHAIN_MAX_FEE_GWEI`); minden lánchiba saját `ChainError`-rá alakul (`ALREADY_REGISTERED`,
    `REVERTED`, `INSUFFICIENT_FUNDS`, `FEE_TOO_HIGH`, `NONCE_CONFLICT`, `TIMEOUT`, `UNAVAILABLE`,
    `UNKNOWN`) – az ethers eredeti hibaüzenete nélkül;
  - `modules/photos/photos.registration.ts` – a háttérben futó regisztráció: `PENDING_CHAIN` →
    `REGISTERED` (tranzakció-hash, blokkszám, gázfelhasználás, a blokk időbélyege), lánchibánál
    `CHAIN_FAILED` és hibanapló; újrapróbálás (`retryRegistration` – az L16 adminisztrátori
    végpontja hívja majd), a félbemaradtak folytatása induláskor és 10 percenként
    (`resumePending`), leállítás (`close`); a regisztrációk egyenként futnak;
  - `modules/photos/photos.service.ts` – feltöltéskor a láncot is megkérdezi (ha ott már szerepel:
    `409 DUPLICATE_EXACT`; ha a lánc nem érhető el, a feltöltés folytatódik, és a lánc-ellenőrzés
    egy percig szünetel); a sikeres feltöltés után ütemezi a regisztrációt; a 409-es válasz új
    szabálya (lásd lent);
  - `config/env.ts`, `lib/logger.ts` – új változók: `CHAIN_ID` (csak 11155111 = Sepolia vagy
    31337 = lokális Hardhat), `CHAIN_MAX_FEE_GWEI` (alapból 50); az `RPC_URL` csak `https` lehet
    (`http` csak a helyi gépre); a napló minden sorból kitakarja a titkokat (`sensitiveValues`:
    RPC-URL és benne a kulcs, privát kulcs, JWT-titok, Stripe-kulcs, adatbázis-jelszó);
  - `server.ts` – a szolgáltatások összeállítása, a lánc ellenőrzése és a félbemaradt
    regisztrációk folytatása a háttérben, időszakos utánkövetés, leálláskor legfeljebb 10 s
    várakozás a futó regisztrációra, `unhandledRejection`-védőháló (naplóz, nem állítja le a
    szervert); a lánc titkai a beolvasás után a környezetből is törlődnek;
  - adatbázis: új, kézzel írt migráció (`20261001080000_chain_registration_checks`) – CHECK: a
    tranzakció-hash alakja, blokkszám ≥ 0, gázfelhasználás > 0, `REGISTERED` ⇒ van
    regisztrációs idő;
  - tesztek: új `chain` Vitest-projekt (`tests/chain/`) – a globalSetup egy valódi
    `hardhat node`-ot indít szabad porton (csak `127.0.0.1`-en, a `blockchain/.env` titkai helyett
    ártalmatlan értékekkel), minden teszt friss szerződést telepít egy véletlen, feltöltött
    tárcával; a többi teszt a blokklánc-szolgáltatás memóriabeli utánzatát
    (`tests/helpers/fakeBlockchain.ts`) használja; `npm run test:chain`;
  - dokumentáció: `README.md` (a regisztráció, a hibák kezelése, a változók), `server/.env.example`
    (`CHAIN_ID`, `CHAIN_MAX_FEE_GWEI`), `docs/FORRASOK.md` (92–99, T6).
- Eredmények: 441/441 teszt (L10 végén: 326) – unit, adatbázis és 19 teszt a lokális
  Hardhat-hálózaton; TDD: előbb bukó tesztek (`L11_01`: 51 bukó teszt; az átnézési körök új
  tesztjei: `L11_29`, `L11_30`, `L11_35`); lefedettség: utasítás 99,65%, elágazás 97,75%, függvény
  100%, sor 99,87% (L10: 99,46 / 96,74 / 100 / 99,8), a három új vagy átírt üzleti fájl 100%;
  ESLint, `tsc`, build hibátlan; `npm audit`: 0 sebezhetőség; az időzítésre érzékeny lánc- és
  regisztrációs tesztek háromszori ismétlésben is stabilak.
- Élő próba a **lokális Hardhat-hálózaton** (8545-ös port; a szerződés címe megegyezik az export
  31337-es címével) és a **tesztadatbázison**, a lefordított szerverrel (`L11_08`–`L11_15`):
  feltöltés → 201 `PENDING_CHAIN` → a háttérben `REGISTERED` (2. blokk, 72 820 gáz); a láncon a
  nyugta, a `PhotoRegistered` esemény és a `getRecord` rekordja egyezik az adatbázissal; a
  platform-tárca kiürítése után a feltöltés 201, a regisztráció `CHAIN_FAILED`
  (`INSUFFICIENT_FUNDS`), a szerver él; a 409-es szabály mindhárom esete; leállított lánc mellett
  a feltöltés 201, figyelmeztetés + `CHAIN_FAILED` (`UNAVAILABLE`), az állapotellenőrzés 200. A
  próba után a 4000-es és a 8545-ös port szabad. A platform-tárca a Hardhat nyilvános 0-s
  tesztfiókja volt (a kulcsa a dokumentált teszt-mnemonicból, csak a memóriában).
- **Valódi Sepolia-regisztráció** (a szerző jóváhagyásával, `L11_36`–`L11_39`): a lefordított
  szerver a valódi `server/.env`-vel (Sepolia, platform-tárca) és a fejlesztői adatbázissal; a
  láncellenőrzés rendben (chainId 11155111, a szerződés az L05-ben telepített
  `0x6eF6…97C7`, a platform-tárca a tulajdonos, 0,082 SepoliaETH). A tócsás fotó feltöltése 201
  `PENDING_CHAIN`, majd **kb. 12 másodperc múlva `REGISTERED`**: tranzakció
  `0x8c326b3c235c856da07010a62db266e92a09e871784e6ecea4dae82fc938e926`, blokk 11 820 993,
  gázfelhasználás 71 686 (a Sepolián az optimalizált bájtkód fut, ezért kevesebb a lokális 72 820-nál),
  regisztrációs idő 2026-10-01 09:41:48 UTC. A láncon a nyugta, a `PhotoRegistered` esemény és a
  `getRecord` rekordja egyezik az adatbázis sorával; a naplókban nincs RPC-URL. Etherscan:
  https://sepolia.etherscan.io/tx/0x8c326b3c235c856da07010a62db266e92a09e871784e6ecea4dae82fc938e926
  – a „Kész, ha” feltétel teljesült. (A fejlesztői adatbázisban ezzel egy próbafelhasználó és egy
  regisztrált kép maradt.)
- Döntések és indoklásuk:
  - **A tranzakció hash-e a küldés előtt mentődik** (a hash az aláírt tranzakcióból kiszámítható):
    ha a szerver a küldés után leáll, újraindításkor ebből tudja, hogy van már elküldött
    tranzakció, és nem küld másodikat; ha a mentés nem sikerül, a tranzakció el sem megy.
  - **Saját nyugtavárás az ethers `TransactionResponse.wait()` helyett**: annak blokkonkénti
    háttér-lekérdezése (`subscriber-polling.js`, `L11_28`) nem kezeli a saját hibáját – egy
    átmeneti RPC-hiba (pl. az Alchemy 429/503-as válasza) kezeletlen ígéret-elutasítást okoz,
    amitől a Node.js alapból leállítja a folyamatot. A `wait()`-es változattal a „hibázó proxy”
    teszt bukott (`L11_29`), a saját ciklussal átmegy.
  - **Az ethers gyorsítótára kikapcsolva** (`cacheTimeout: -1`): egy előzetes kísérletben a 250
    ms-os gyorsítótár elavult nonce-ot adott vissza („Nonce too low”) – épp a kerülendő
    nonce-ütközés. `staticNetwork`: elérhetetlen RPC mellett nincs a konzolra író, végtelen
    újrapróbálkozás.
  - **Nonce-ütközés ellen** egyszerre egy tranzakció megy ki; ha a küldés hibájából nem dönthető
    el, megkapta-e a csomópont a tranzakciót (pl. csak a válasza veszett el), a sor a nyugtára
    vár, és addig nem enged újat (`L11_18`, `L11_33`).
  - **A hibaüzenetben nincs titok**: az ethers HTTP-hibájának üzenete a kérés URL-jét – benne az
    Alchemy API-kulcsát – is tartalmazza, ezért a `ChainError` csak saját szöveget és a hiba
    fajtáját viszi tovább; utolsó védvonalként a napló is kitakarja a titkokat.
  - **409-es válasz** (döntés: a lépés elején): a talált kép adatai csak akkor látszanak, ha
    nyilvános (`REGISTERED`), vagy ha a feltöltő a saját képét töltené fel újra; egyébként csak
    `{ distance }` (a még nem regisztrált vagy elrejtett kép címe, gazdája, ideje nem szivárog ki).
  - **Díjplafon** (döntés: az átnézés után): `CHAIN_MAX_FEE_GWEI` = 50 – díjugráskor a
    regisztráció nem megy ki (`FEE_TOO_HIGH`, újrapróbálható). A tárca kimerítése elleni további
    védelem (fiók- és napi keret, e-mail-ellenőrzés) az L30 feladata.
  - **Csak teszthálózat** (`CHAIN_ID` 11155111 vagy 31337 – mint a Stripe teszt módú kulcsa), az
    RPC-kapcsolat titkosított.
  - **`ownerRef = keccak256(userId)`** (terv 4.1): ez álnevesítés, nem anonimizálás – a
    felhasználó azonosítója az API-ban nyilvános, így aki ismeri, a láncon összekötheti a
    regisztrációit. Teszthálózati prototípusnál elfogadható; a dolgozatban korlátként tárgyalandó
    (EDPB 02/2025, T6); továbbfejlesztés: felhasználónkénti véletlen „só”.
  - A feltöltéskori lánc-ellenőrzés elérhetetlen láncnál átenged („fail open”): a lánc a
    regisztrációkor úgyis visszautasítja a már regisztrált hash-t (a kép ekkor `CHAIN_FAILED`).
- Független kódátnézés négy körben (TypeScript és biztonság, majd
  kétszer TypeScript a javításokra) – CRITICAL vagy HIGH hibát egyik sem talált; a
  javított észrevételek (mindegyik előbb bukó teszttel):
  - adatbázishibánál a kép futó feladat nélkül `PENDING_CHAIN`-ben ragadhatott → újrapróbálható,
    és a szerver 10 percenként utánanéz; a lánchiba oka akkor is a naplóba kerül, ha az állapot
    mentése nem sikerül;
  - elérhetetlen RPC mellett minden feltöltés 5 s-ot várt a soros feldolgozásban → egy perces
    szünet az első hiba után;
  - elveszett küldési válasz után a következő tranzakció ugyanazt a nonce-ot kaphatta → a sor a
    nyugtára vár; a `NONCE_EXPIRED` / `REPLACEMENT_UNDERPRICED` biztos elutasítás (nem várunk
    rá 3 percig); a bizonytalan küldés valódi oka a hibaüzenetben marad;
  - a küldés előtt elrejtett kép is a láncra került volna → a hash csak `PENDING_CHAIN` képhez
    menthető, különben a tranzakció el sem megy; a közben `CHAIN_FAILED`-nek jelölt, de mégis
    blokkba került kép `REGISTERED` lesz; futás közbeni újrakérés nem vész el;
  - indításkor sok félbemaradt kép egyszerre terhelte volna az adatbázist → egyenkénti feldolgozás;
    leálláskor új regisztráció nem indul, a futót megvárja;
  - díjplafon; `https`-kényszer; csak teszthálózat; a nyugta értelmezése is a hibaátalakításon
    belül; a szerződés hibájának neve csak azonosító lehet;
  - a titokszűrés hiányai: a nagybetűs privát kulcs kisbetűs alakja, a lekérdezési paraméterben
    lévő kulcs, a hibás %-kódolású jelszó (indításkor kivételt dobott), a perjelre végződő titok
    (érvénytelen JSON-sort adott);
  - a tesztben indított Hardhat-folyamat megkapta volna a `blockchain/.env` titkait → ártalmatlan
    helyettesítő értékek, csak `127.0.0.1`.
- Az ellenőrzés közben talált hibák:
  - az ethers gyorsítótára miatti elavult nonce és a `wait()` kezeletlen elutasítása (lásd fent);
  - a Hardhat automatikus bányászás mellett a küldéskor visszadobja a hibás tranzakciót, így a
    „blokkba került, de visszautasított” eset tesztje rosszul volt előkészítve → kézi bányászással;
  - a Zod 4 a `.refine()`-t érvénytelen URL-nél is lefuttatja (a `new URL()` kivételt dobott
    volna) → védőfeltétel;
  - az élő próbában az elfogyott ETH miatt visszautasított tranzakció hash-e megmaradt a
    `CHAIN_FAILED` sorban → biztos elutasításnál a hash törlődik (`L11_11`).
- Ismert korlátok, későbbre (tudatosan nem most):
  - L13: a kép adatlapja csak `REGISTERED` állapotban mutassa a lánc adatait; L16: az
    újrapróbálás adminisztrátori végpontja (csak adminnak, sebességkorláttal – minden újrapróbálás
    gázba kerül); a `CHAIN_FAILED` képet a rendszer magától nem próbálja újra;
  - L30: a platform-tárca kimerítése elleni védelem (fiók- és napi keret, e-mail-ellenőrzés);
  - L32: több szerverpéldánynál adatbázis-szintű zár a regisztrációs feladatra; a képhez nincs
    tárolva a hálózat azonosítója (a `CHAIN_ID` váltásakor a régi `REGISTERED` sorok a másik láncon
    vannak); a beragadt, alacsony díjú tranzakció cseréje (díjemelés) nincs megoldva; a telepítő és
    a platform-tárca kulcsa közös – futó szerver mellett ne telepítsünk;
  - ritka eset: egy lemaradó RPC-replika miatt a tranzakció metaadata (hash, blokk, gáz) elveszhet
    – a regisztráció újrapróbáláskor ekkor is helyreáll (`REGISTERED`, hash nélkül).
- Kézzel készítendő (a szerző): az Etherscan tranzakcióoldala és „Logs” füle (a
  `PhotoRegistered` esemény) a fenti tranzakcióhoz.
- Képek:

  | Kép                                       | Forrás                                                                                                                                   | Tartalom                                                                                           |
  | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
  | `L11_01_tesztek_piros.png`                | `npx vitest run … --reporter=verbose` (mentett kimenet: bukó tesztek és összesítő)                                                       | TDD piros fázis: 51 bukó teszt                                                                     |
  | `L11_02_unit_tesztek_zold.png`            | `npx vitest run --project unit src/services/blockchain.service.test.ts src/config/env.test.ts src/lib/logger.test.ts --reporter=verbose` | hibabesorolás, konfiguráció, titokszűrés, hibás RPC (63 teszt)                                     |
  | `L11_03_lanc_integracio_zold.png`         | `npx vitest run --project chain --reporter=verbose`                                                                                      | 19 teszt a valódi, lokális Hardhat-hálózaton                                                       |
  | `L11_04_regisztracio_tesztek_zold.png`    | `npx vitest run --project db tests/db/photos.registration.test.ts --reporter=verbose`                                                    | a háttér-regisztráció 33 tesztje                                                                   |
  | `L11_05_feltoltes_lanc_tesztek_zold.png`  | `npx vitest run --project db … -t "409\|regisztr\|lánc"` (mentett kimenet, a kihagyott tesztek sorai nélkül)                             | a feltöltés lánccal kapcsolatos tesztjei, a 409-es szabály, a CHECK-ek                             |
  | `L11_06_lefedettseg.png`                  | `npm run coverage` (`server/`)                                                                                                           | 441 teszt, lefedettség fájlonként                                                                  |
  | `L11_07_lint_typecheck_build.png`         | `npm run lint`, `typecheck`, `build`                                                                                                     | hibátlan kódellenőrzés és build                                                                    |
  | `L11_08_lokalis_lanc.png`                 | `node live-chain-l11.mjs` (mentett kimenet, jegyzetmappa)                                                                                | lokális lánc, a szerződés címe egyezik az exporttal                                                |
  | `L11_09_feltoltes_201.png`                | `curl` (regisztráció, feltöltés) a lokális láncra kötött szerverre                                                                       | 201 `PENDING_CHAIN`                                                                                |
  | `L11_10_szervernaplo.png`                 | a próbaszerver naplója (mentett kimenet)                                                                                                 | láncellenőrzés, regisztráció tx-hash-sel, a két lánchiba                                           |
  | `L11_11_photo_rekord_psql.png`            | `docker compose exec db psql … SELECT … FROM photos`                                                                                     | `REGISTERED` a lánc adataival, `CHAIN_FAILED` hash nélkül                                          |
  | `L11_12_lanc_ellenorzes.png`              | `node check-chain-l11.mjs <tx-hash>` (mentett kimenet)                                                                                   | nyugta, `PhotoRegistered` esemény, `getRecord` (az Etherscan helyi megfelelője)                    |
  | `L11_13_duplikacio_409.png`               | `curl` – egy másik felhasználó és a feltöltő                                                                                             | 409 adatokkal (regisztrált), csak távolsággal (más `CHAIN_FAILED` képe), adatokkal (saját kép)     |
  | `L11_14_lanchiba_nincs_eth.png`           | `curl` – `hardhat_setBalance` 0, feltöltés, állapotellenőrzés                                                                            | a feltöltés 201, a szerver él                                                                      |
  | `L11_15_lanc_nem_erheto_el.png`           | `curl` – feltöltés leállított lánc mellett, állapotellenőrzés                                                                            | 201 és 200                                                                                         |
  | `L11_16_tranzakcio_kuldese.png`           | `server/src/services/blockchain.service.ts`, 548–564. sor                                                                                | aláírás → hash mentése → küldés → nyugta                                                           |
  | `L11_17_alairas_dijplafon.png`            | `server/src/services/blockchain.service.ts`, 499–510. sor                                                                                | gázbecslés, díjplafon, aláírás                                                                     |
  | `L11_18_kuldes_bizonytalan_valasz.png`    | `server/src/services/blockchain.service.ts`, 512–527. sor                                                                                | a bizonytalan küldési hiba kezelése                                                                |
  | `L11_19_nyugta_varas.png`                 | `server/src/services/blockchain.service.ts`, 432–458. sor                                                                                | saját nyugtavárás a `wait()` helyett                                                               |
  | `L11_20_hibak_besorolasa.png`             | `server/src/services/blockchain.service.ts`, 260–306. sor                                                                                | `toChainError`: hibafajták, titok nélkül                                                           |
  | `L11_21_szolgaltatas_letrehozasa.png`     | `server/src/services/blockchain.service.ts`, 386–410. sor                                                                                | szolgáltató-beállítások, tárca, tranzakció-sor                                                     |
  | `L11_22_regisztracio_folyamata.png`       | `server/src/modules/photos/photos.registration.ts`, 195–217. sor                                                                         | egy kép regisztrációja                                                                             |
  | `L11_23_lanc_hiba_kezelese.png`           | `server/src/modules/photos/photos.registration.ts`, 132–150. sor                                                                         | „már regisztrált” – a lánc rekordja szerinti lezárás                                               |
  | `L11_24_utemezes_sor.png`                 | `server/src/modules/photos/photos.registration.ts`, 219–240. sor                                                                         | ütemezés, újrafuttatás, hibanapló                                                                  |
  | `L11_25_409_szabaly.png`                  | `server/src/modules/photos/photos.service.ts`, 135–165. sor                                                                              | a 409-es válasz szabálya                                                                           |
  | `L11_26_lanc_ellenorzes_feltolteskor.png` | `server/src/modules/photos/photos.service.ts`, 333–356. sor                                                                              | lánc-ellenőrzés feltöltéskor, szünet hiba után                                                     |
  | `L11_27_naplo_titokszures.png`            | `server/src/lib/logger.ts`, 27–37. sor                                                                                                   | a titkok kitakarása a naplósorból                                                                  |
  | `L11_28_ethers_wait_hiba.png`             | `server/node_modules/ethers/lib.esm/providers/subscriber-polling.js`, 113–136. sor                                                       | az ethers kezeletlen `_poll` hívása                                                                |
  | `L11_29_wait_piros.png`                   | `npx vitest run --project chain --project unit …` (mentett kimenet)                                                                      | a `wait()`-es változat bukása a hibázó proxyval (a második bukás a teszt előkészítési hibája volt) |
  | `L11_30_atnezes_piros.png`                | `npx vitest run … --reporter=verbose` (mentett kimenet)                                                                                  | az első átnézési kör új tesztjei a javítás előtt (20)                                              |
  | `L11_31_migracio_check.png`               | `server/prisma/migrations/20261001080000_chain_registration_checks/migration.sql`, 1–15. sor                                             | az új CHECK megszorítások                                                                          |
  | `L11_32_teszt_nonce_sor.png`              | `server/tests/chain/blockchain.service.test.ts`, 262–283. sor                                                                            | öt egyidejű regisztráció egymást követő nonce-okkal                                                |
  | `L11_33_teszt_elveszett_valasz.png`       | `server/tests/chain/blockchain.service.test.ts`, 385–410. sor                                                                            | elveszett küldési válasz – nincs nonce-ütközés                                                     |
  | `L11_34_teszt_ujrainditas.png`            | `server/tests/db/photos.registration.test.ts`, 311–337. sor                                                                              | sikertelen adatbázis-írás után a folytatás lezárja                                                 |
  | `L11_35_atnezes2_piros.png`               | `npx vitest run … --reporter=verbose` (mentett kimenet)                                                                                  | a második átnézés új tesztjei a javítás előtt (10)                                                 |
  | `L11_36_sepolia_feltoltes.png`            | `curl` (regisztráció, feltöltés) a Sepoliára kötött szerverre                                                                            | 201 `PENDING_CHAIN`                                                                                |
  | `L11_37_sepolia_szervernaplo.png`         | a szerver naplója a valódi `server/.env`-vel (mentett kimenet)                                                                           | Sepolia-ellenőrzés, regisztráció tx-hash-sel, blokkszámmal                                         |
  | `L11_38_sepolia_db_sor.png`               | `docker compose exec db psql … -d photochain … FROM photos`                                                                              | a kép sora `REGISTERED` állapotban a lánc adataival                                                |
  | `L11_39_sepolia_lanc_ellenorzes.png`      | `node check-chain-l11.mjs <tx-hash> --sepolia` (mentett kimenet)                                                                         | a Sepolián: nyugta, `PhotoRegistered` esemény, `getRecord`                                         |

- Commit: `65d8749` – `feat(L11): blokklánc-szolgáltatás és háttér-regisztráció (PENDING_CHAIN → REGISTERED)`

## L12 – Nyilvános hitelesség-ellenőrző API (2026-10-03 – 2026-10-04)

- Elkészült (`server/`):
  - `modules/verification/` – `POST /api/verify` (multipart, a kép az `image` mezőben) és
    `GET /api/verify/:sha256` (a `0x` előtagú, nagybetűs alak is jó), bejelentkezés nélkül. Az
    eredmény `VERIFIED` (a hash a láncon), `SIMILAR` (a legközelebbi nyilvános kép dHash-e a küszöbön
    belül, és a lánc is megerősíti), illetve `NOT_FOUND`; a válasz mindig teljes alakú
    (`result`, `sha256`, `dHash`, `distance`, `registration`, `photo` – a nem értelmezhető `null`),
    az L24-es ellenőrző oldal erre épül. A vizsgált fájl sehol nem tárolódik, a naplóba sem kerül;
  - `services/imageAnalysis.ts` – a feltöltés képelemzése (formátum, méret, egyszínűség, a két
    ujjlenyomat, a 4xx hibák) közös modulba került; az ellenőrzésnél a legkisebb oldal 100 képpont
    (a feltöltésnél 600), így a 400 képpontos bélyegkép és a kicsinyített másolat is ellenőrizhető;
    `hashing.service.ts`: `findClosest` (a feltöltésből áthelyezve); `image.service.ts`: az
    `inspectImage` legkisebb oldalhossza paraméter;
  - `services/chainExplorer.ts` – a tranzakció Etherscan-linkje a `CHAIN_ID`-ből (Sepolia), a
    lokális Hardhat-hálózaton `null`;
  - terheléskorlátok: IP-címenként `VERIFY_RATE_LIMIT_MAX` (20) ellenőrzés; minden kliensre együtt
    legfeljebb `VERIFY_CHAIN_READ_LIMIT` (200) **láncolvasás** – a hibás kérések nem számítanak, és
    ha elfogyott vagy a lánc szünetel, a fájlt be sem olvassa; egyszerre `VERIFY_MAX_CONCURRENT`
    (2) fájl-ellenőrzés, IP-címenként egy (IPv6-nál /56-os alhálózatonként); a fájlnak
    `VERIFY_BODY_TIMEOUT_MS` (30 s) alatt meg kell érkeznie (`middleware/bodyDeadline.ts`); más
    webhelyről indított `GET` is 403 (`rejectCrossSiteReads`); az ellenőrzés nem a feltöltések
    sorában fut. A láncon megtalált rekordokat (legfeljebb 1000) a szerver megjegyzi – a láncon
    ezek nem változnak;
  - lánchiba: 503 `CHAIN_UNAVAILABLE` `Retry-After` fejléccel, utána egy percig a láncot meg sem
    kérdezi (`AppError` új `retryAfterSeconds` beállítása; a hibakezelő a sebességkorlát saját
    `Retry-After`-ét megtartja);
  - `config/imageMemory.ts` – `VIPS_DISC_THRESHOLD=256m` a sharp betöltése előtt (a `server.ts`
    első importja, a tesztekben a Vitest `setupFiles`-a; lásd lent);
  - napló: a kérésnapló a hash-t kitakarja (`/api/verify/:sha256`, kis- és nagybetűtől
    függetlenül, a teljes URL-es kérésnél is; bármely 64 jegyű hexadecimális szakaszt);
    hibakezelés: az Express hibás %-kódolású útvonal-paramétere (`URIError`, 400) 400-as válasz;
  - dokumentáció: `README.md` (új szakasz a válaszformával, a hibakódokkal, a korlátokkal és az
    RPC-kvóta számításával), `server/.env.example` (4 új változó), `server/http/verify.http`,
    `docs/FORRASOK.md` (100–107; T2, T4 és a 81. sor bővítve).
- Eredmények: 533/533 teszt (L11 végén: 441); TDD: előbb bukó tesztek (`L12_01`: 54; az átnézési
  körök új tesztjei: `L12_29`: 19, `L12_36`: 7); lefedettség: utasítás 99,69%, elágazás 98,07%,
  függvény 100%, sor 99,89% (L11: 99,65 / 97,75 / 100 / 99,87), a `verification` modul és az új
  köztes rétegek 100%; ESLint, `tsc`, build, Prettier hibátlan; az időzítésre érzékeny tesztek
  háromszori ismétlésben is stabilak.
- Élő próba a **lokális Hardhat-hálózaton** és a **tesztadatbázison**, a lefordított szerverrel
  (`L12_06`–`L12_13`, `L12_15`): a feltöltött és regisztrált tócsás fotóra `VERIFIED`; a 800 képpontos
  JPEG-másolatára `SIMILAR` 1 bit eltéréssel, a 400 képpontos WebP-másolatára 3 bittel; a gitáros
  képre `NOT_FOUND`; a hash alapú ellenőrzés (`0x` + nagybetűs alak is), a hibás hash 400; a nem
  kép 415, a 80 képpontos kép 400, a nem multipart kérés 415; leállított lánc mellett 503
  `Retry-After: 60`, a szerver él. A kérésnaplóban a hash nem szerepel. A próba után a 4000-es és a
  8545-ös port szabad.
- **Valódi Sepolia** (a szerző jóváhagyásával, csak olvasás – tranzakció nem ment ki,
  `L12_14`): a valódi `server/.env`-vel és a fejlesztői adatbázissal a tócsás képre (fájl és hash
  alapján is) `VERIFIED`, a 2026-10-01 09:41:48 UTC-s regisztrációval, a 11 820 993. blokkal és a
  tranzakció Etherscan-linkjével (ugyanaz, mint az L11-ben). A fájl alapú kérés 147 ms (láncolvasás
  az Alchemyn át), a rá következő hash alapú 4 ms (a megjegyzett rekordból). A naplóban nincs titok
  (programmal ellenőrizve, az értékek kiírása nélkül).
- **Ideiglenes fájlok** (a biztonsági átnézés találta, `L12_30`, `L12_31`): a libvips a nagy, nem
  soronként bontható képet (pl. 49 megapixeles WebP) 100 MB fölött ideiglenes fájlba bontotta ki a
  lemezen – az ellenőrzött (és a feltöltött) kép képpontjai így a lemezre kerültek. A futó szerveren
  mérve: előtte egy `vips-*.v` fájl, a javítás után egy sem.
- A szerző döntései (a lépés elején):
  - **VERIFIED:** a lánc dönt – ha a hash a láncon van, `VERIFIED`; a kép címe, fotósa, linkje
    csak nyilvános (`REGISTERED`) képnél, és csak ha a lánc ugyanazt a tulajdonost (`ownerRef`)
    rögzítette; az elrejtett vagy még nem regisztrált képnél csak a lánc adatai. Ha az adatbázis
    szerint regisztrált kép a láncon nincs meg: `NOT_FOUND` és figyelmeztetés a naplóban.
  - **Lánchiba:** 503 és egy perces szünet („a lánc az igazságforrás” – adatbázis-alapú,
    „nem megerősített” válasz nincs).
  - **SIMILAR:** csak a nyilvános képek közt, ugyanazzal a küszöbbel (`DHASH_THRESHOLD`), mint a
    feltöltés; legkisebb oldal 100 képpont. (Az átnézés után: a lánc is megerősíti.)
  - **Terhelés:** külön korlátok, nem a feltöltés sorában; a közös keret alapértéke az Alchemy
    hivatalos adataiból: az ingyenes csomag havi 30 millió CU, egy `eth_call` 26 CU – a 200 / 15
    perc legfeljebb kb. 576 000 olvasás (≈ 15 millió CU), a keret fele.
- Független kódátnézés három körben (TypeScript és biztonság, majd
  mindkettő a javításokra, végül TypeScript) – CRITICAL hibát egyik sem talált; a
  javított észrevételek (mindegyik előbb bukó teszttel):
  - HIGH: a hibás %-kódolású hash (`GET /api/verify/%zz`) 500-as hibát és hibanaplót adott → 400;
  - a nagy WebP-kép ideiglenes fájlja (lásd fent) → `VIPS_DISC_THRESHOLD` a sharp betöltése előtt;
  - a lassan csepegtetett törzs a kérés teljes időkorlátjáig (3 perc) foglalta az egyidejűségi
    korlát helyét → beérkezési határidő, már a korlátok előtt;
  - a közös keretet a hibás kérések és a más webhelyről indított `GET`-ek is fogyasztották →
    csak a láncolvasások számítanak, a `GET` is csak a saját oldalról; szünetnél és kimerült
    keretnél a fájlt be sem olvassa;
  - a `SIMILAR` eredményt a lánc nem erősítette meg → a hasonló kép rekordját is olvassa
    (tulajdonos-egyezéssel), a regisztráció ideje a láncból; a már látott rekordok megjegyzése
    (így a hasonló kép újraolvasása sem fogyaszt);
  - a naplómaszkolás kis- és nagybetűs, illetve teljes URL-es útvonallal megkerülhető volt;
  - az üres `VIPS_DISC_THRESHOLD=` 0-nak számított volna; a `VERIFY_BODY_TIMEOUT_MS` felső korlátja
    (2^31 ms fölött a Node 1 ms-ra állítaná az időzítőt); csak az Express `URIError`-ja kliens-hiba;
  - teszthiányok: az időablak újraindulása, a határidő végpontszintű próbája, a megjegyzés és a
    kiesés, a nem talált hash meg nem jegyzése, a sérült JPEG tesztje a pontos hash helyett a
    küszöböt vizsgálja (a dekódertől függ).
- Az ellenőrzés közben talált hibák:
  - az `inspectImage` új paramétere a függvénytörzsben még a régi konstanst használta (a teszt
    bukott);
  - a tesztsegéd (`createPhoto`) véletlen hexa tárhelykulcsot adott – a nyilvános URL csak UUID-hoz
    készül (500-at okozott a tesztben) → UUID;
  - a középen sérült JPEG-re `NOT_FOUND` jött a várt `SIMILAR` helyett: a kép alsó fele elromlik, a
    dHash 25 bitben tér el (mérve) – a teszt elvárása hibás volt, a viselkedés helyes;
  - a csepegtetési teszt elsőre versenyhelyzet miatt bukott (az első próbakérés előbb foglalta el a
    helyet); egy kísérlettel igazolva, hogy a hely foglalása helyes, a teszt determinisztikus lett.
- Ismert korlátok, későbbre (tudatosan nem most):
  - a közös láncolvasási keret néhány tucat IP-címről elfogyasztható – ilyenkor az időablak végéig
    mindenkinek 503 (a kvótavédelem ára); egy hirtelen kéréscsomó az RPC-szolgáltató másodperces
    korlátját is elérheti (ekkor egy perc szünet); a feltöltés lánc-ellenőrzése ezen a kereten
    kívül van (L30);
  - a feltöltés útvonalán nincs törzs-határidő; a `photographer.id`-ből az `ownerRef` kiszámítható
    (az L11-ben rögzített álnevesítési korlát) – L30;
  - egy 50 megapixeles kép feldolgozása alatt a memória kb. 360–390 MB-tal nő → a konténer
    memóriakerete legalább 2 GB (L31); a pino-http az 503-as válaszhoz mesterséges hibát és
    veremlistát naplóz (az L10 óta így van);
  - több szerverpéldánynál a korlátok és a megjegyzett rekordok példányonként külön élnek; élesben
    a törzset pufferelő fordított proxy adja a teljes védelmet a lassú kérések ellen (L32);
  - a megjegyzett rekordokat csak újraindítás üríti: ha fejlesztéskor a Hardhat-lánc a szerver
    nélkül indul újra, a már látott hash-ekre a szerver `VERIFIED`-et ad.
- Commit előtti audit (nulláról, a korábbi eredményektől függetlenül; 2026-10-04):
  - tiszta telepítés a lockfile-ból (`npm ci`), lint, típusellenőrzés, build, Prettier, minden
    teszt (533/533, a lefedettség változatlan); `npm audit`: 0 sebezhetőség; új függőség nincs;
  - **mutációs próba** (`L12_37`): 43 kritikus sor szándékos elrontása egyenként (a VERIFIED és
    a SIMILAR szabályai, a lánc-megerősítés, a szünet, a közös keret, a megjegyzés, a korlátok és
    a köztes rétegek sorrendje, a hash-séma, a naplómaszkolás, a hibakezelő, a határidő, a CSRF,
    a libvips-küszöb, a közös képelemzés) – a tesztek 40-et megfogtak. A három átcsúszott rontás
    teszthiányt mutatott (a működés helyes volt): egy közelebbi rejtett kép mellett a nyilvános
    hasonló kép kiválasztását, a közben elrejtett, de a láncon is szereplő kép kiszűrését, illetve
    a nagybetűs, nem hash útvonal kitakarását nem rögzítette teszt – a pótolt tesztekkel 43/43;
  - **fekete dobozos próba** a lefordított, éles módú szerveren (`L12_39`): 53 ellenőrzés –
    biztonsági fejlécek (CSP, nosniff, HSTS, nincs `X-Powered-By`); a három eredménytípus; 19
    hibás bemenet (hibás %-kódolás, 8000 karakteres útvonal, útvonal-bejárás, idegen metódus, JSON,
    két fájl, 16 MB, GIF, 80 képpont, 49 MP-es WebP, 64 MP-es PNG, hibás multipart) mind a várt
    4xx, veremlista nélkül; IP-korlát (a 21. kérés 429), idegen oldalról indított GET 403;
    egyidejűség (429, illetve 503) és a csepegtetett kérések bontása a határidőnél; a közös keret
    kimerülése (503, `Retry-After` az időablak végéig, a megjegyzett rekord ekkor is VERIFIED, a
    fájlt be sem olvassa); a naplóban nincs hash, fájlnév, kulcs vagy hibasor; a tárhelyen csak a
    feltöltött kép 3 fájlja; ideiglenes `vips-*` fájl nem keletkezett;
  - **fuzz-próba** (`L12_38`): háromszor 294 elrontott fájl (véletlen bájtok, bitfordítás és
    csonkolás JPEG-ben, PNG-ben és WebP-ben, hiteles fejléc + szemét, 100 000 × 100 000-es
    „bomba”, üres fájl) és 150 elrontott útvonal – egyetlen 5xx vagy veremlista sincs, ideiglenes
    fájl nem keletkezett, a naplóban nincs hibasor, a szerver végig él;
  - a változásokban (76 fájl) nincs titok – a `server/.env` és a `blockchain/.env` 12 titkos
    értékét program kereste, kiírás nélkül –, nincs `.env`, kulcs, napló vagy feltöltött fájl,
    nincs `console.log`, és nincs láthatatlan vagy írásirány-vezérlő karakter.
- Kézzel készíthető (a szerző, ha kell): az Etherscan tranzakcióoldala a `L12_14` linkjéről
  (ugyanaz a tranzakció, mint az L11-ben).
- Képek:

  | Kép                                 | Forrás                                                                                              | Tartalom                                                               |
  | ----------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
  | `L12_01_tesztek_piros.png`          | `npx vitest run --project unit …` és `--project db tests/db/verification.test.ts` (mentett kimenet) | TDD piros fázis: 54 bukó teszt                                         |
  | `L12_02_unit_tesztek_zold.png`      | `npx vitest run --project unit … -t "verify\|Retry-After\|…" --reporter=verbose`                    | naplómaszkolás, Etherscan-link, Retry-After, egyidejűség, kliens-kulcs |
  | `L12_03_verify_tesztek_zold.png`    | `npx vitest run --project db tests/db/verification.test.ts --reporter=verbose`                      | a végpontok 59 tesztje                                                 |
  | `L12_04_lefedettseg.png`            | `npm run coverage` (`server/`)                                                                      | 533 teszt, lefedettség fájlonként                                      |
  | `L12_05_lint_typecheck_build.png`   | `npm run lint`, `typecheck`, `build`                                                                | hibátlan kódellenőrzés és build                                        |
  | `L12_06_feltoltes_regisztracio.png` | `curl` (regisztráció, feltöltés) a lokális láncra kötött szerverre                                  | 201, 201                                                               |
  | `L12_07_verified.png`               | `curl -F image=@tocsa.jpg … /api/verify`                                                            | `VERIFIED` a regisztráció és a fotó adataival                          |
  | `L12_08_similar.png`                | `curl -F image=@tocsa_800px.jpg …`                                                                  | `SIMILAR`, 1 bit eltérés                                               |
  | `L12_09_not_found.png`              | `curl -F image=@gitar.jpg …`                                                                        | `NOT_FOUND`                                                            |
  | `L12_10_similar_belyegkep.png`      | `curl -F image=@tocsa_400px.webp …`                                                                 | `SIMILAR` a 400 képpontos WebP-másolatra, 3 bit                        |
  | `L12_11_hash_alapu_ellenorzes.png`  | `curl … /api/verify/<hash>` (0x + nagybetű, ismeretlen, hibás)                                      | `VERIFIED`, `NOT_FOUND`, 400                                           |
  | `L12_12_hibas_bemenet.png`          | `curl` – nem kép, 80 képpontos kép, törzs nélkül                                                    | 415, 400, 415                                                          |
  | `L12_13_lanc_nem_erheto_el.png`     | `curl` – leállított lánc mellett                                                                    | 503 `CHAIN_UNAVAILABLE`, `Retry-After: 60`; az állapotellenőrzés 200   |
  | `L12_14_sepolia_verified.png`       | `curl` (fájl és hash) a valódi `server/.env`-vel futó szerverre                                     | `VERIFIED` a Sepolián, Etherscan-linkkel                               |
  | `L12_15_szervernaplo.png`           | a próbaszerver naplója (mentett kimenet)                                                            | a GET hash-e kitakarva; lánchiba-figyelmeztetés                        |
  | `L12_16_valasz_formatuma.png`       | `server/src/modules/verification/verification.service.ts`, 58–71. sor                               | a válasz típusa                                                        |
  | `L12_17_ellenorzes_menete.png`      | `server/src/modules/verification/verification.service.ts`, 335–352. sor                             | VERIFIED → SIMILAR → NOT_FOUND                                         |
  | `L12_18_verified_tulajdonos.png`    | `server/src/modules/verification/verification.service.ts`, 261–283. sor                             | a lánc rekordja, az adatbázis adatai csak tulajdonos-egyezésnél        |
  | `L12_19_hasonlo_kep.png`            | `server/src/modules/verification/verification.service.ts`, 302–333. sor                             | a legközelebbi nyilvános kép, a lánc megerősítésével                   |
  | `L12_20_lanc_szunet.png`            | `server/src/modules/verification/verification.service.ts`, 215–235. sor                             | láncolvasás: megjegyzett rekord, keret, szünet hiba után               |
  | `L12_21_utvonalak_korlatok.png`     | `server/src/modules/verification/verification.routes.ts`, 49–103. sor                               | a korlátok és a köztes rétegek sorrendje                               |
  | `L12_22_hash_parameter.png`         | `server/src/modules/verification/verification.schemas.ts`, 5–17. sor                                | a hash paraméter ellenőrzése                                           |
  | `L12_23_kepelemzes_kozos.png`       | `server/src/services/imageAnalysis.ts`, 78–98. sor                                                  | a közös képelemzés                                                     |
  | `L12_24_naplo_kitakaras.png`        | `server/src/lib/requestLogging.ts`, 27–34. sor                                                      | a hash kitakarása a naplóban                                           |
  | `L12_25_teszt_verified.png`         | `server/tests/db/verification.test.ts`, 195–224. sor                                                | a VERIFIED válasz teljes alakja                                        |
  | `L12_26_teszt_tulajdonos.png`       | `server/tests/db/verification.test.ts`, 312–328. sor                                                | más tulajdonos a láncon → az adatbázis adatai nélkül                   |
  | `L12_27_teszt_lanc_szunet.png`      | `server/tests/db/verification.test.ts`, 687–716. sor                                                | lánchiba után egy perc szünet, majd újra                               |
  | `L12_28_teszt_naplo.png`            | `server/tests/db/verification.test.ts`, 536–547. sor                                                | a fájl neve, hash-e nem kerül a naplóba                                |
  | `L12_29_atnezes_piros.png`          | `npx vitest run … --reporter=verbose` (mentett kimenet)                                             | az első átnézési kör új tesztjei a javítás előtt (19)                  |
  | `L12_30_vips_ideiglenes_elotte.png` | `node vips-check-l12.mjs` (a szerver `VIPS_DISC_THRESHOLD=100m`-mel)                                | 49 MP-es WebP: 1 ideiglenes fájl a lemezen                             |
  | `L12_31_vips_ideiglenes_utana.png`  | `node vips-check-l12.mjs` (a javított szerver)                                                      | ugyanez: 0 ideiglenes fájl                                             |
  | `L12_32_lancolvasasi_keret.png`     | `server/src/modules/verification/verification.service.ts`, 191–201. sor                             | olvasható-e a lánc (szünet, közös keret)                               |
  | `L12_33_torzs_hatarido.png`         | `server/src/middleware/bodyDeadline.ts`, 10–26. sor                                                 | a fájl beérkezési határideje                                           |
  | `L12_34_vips_kuszob.png`            | `server/src/config/imageMemory.ts`, 1–28. sor                                                       | a libvips lemezre bontási küszöbe                                      |
  | `L12_35_teszt_vips_ideiglenes.png`  | `server/src/services/imageAnalysis.test.ts`, 20–45. sor                                             | a teszt: nincs `vips-*` fájl az ideiglenes mappában                    |
  | `L12_36_atnezes2_piros.png`         | `npx vitest run … --reporter=verbose` (mentett kimenet)                                             | a második átnézési kör új tesztjei a javítás előtt (7)                 |
  | `L12_37_audit_mutacios_proba.png`   | `node mutation-check-l12.mjs` (mentett kimenet, jegyzetmappa)                                       | 43 szándékos rontás, a pótolt tesztekkel mind megfogva                 |
  | `L12_38_audit_fuzz.png`             | `node audit-l12-fuzz.mjs …` háromszor (mentett kimenet, jegyzetmappa)                               | elrontott fájlok és útvonalak – nincs 5xx                              |
  | `L12_39_audit_fekete_doboz.png`     | `node audit-l12-live.mjs …` (mentett kimenet, jegyzetmappa)                                         | 53 ellenőrzés a lefordított, éles módú szerveren                       |

- Commit: `7a81331` – `feat(L12): nyilvános hitelesség-ellenőrző API (VERIFIED / SIMILAR / NOT_FOUND)`

## L13 – Fotók listázása, keresés, adatlap, profil (2026-10-04)

- Elkészült (`server/`):
  - `modules/photos/photos.catalog.ts` – a nyilvános galéria (`GET /api/photos`): keresés a címben,
    a leírásban és a fotós nevében (`q`; kis- és nagybetűtől függetlenül, a `%`, a `_` és a `\`
    szó szerint értendő), szűrés kategóriára, fotósra és ártartományra (`categoryId`, `ownerId`,
    `minPrice`, `maxPrice`), rendezés (`newest` – alapértelmezett –, `oldest`, `price_asc`,
    `price_desc`; döntetlennél az azonosító dönt, így a lapozás stabil), lapozás (`page` legfeljebb
    1000, `pageSize` 1–50, alapból 20). A válasz `{ data: { photos }, meta: { page, pageSize,
total, totalPages } }`; a találatok száma és az oldal ugyanabból a pillanatképből jön
    (REPEATABLE READ). A galériában csak a regisztrált (`REGISTERED`) képek szerepelnek;
  - adatlap (`GET /api/photos/:id`, opcionális bejelentkezéssel): a nem nyilvános képet csak a
    tulajdonos és az admin látja, másnak 404; a tanúsítvány (`registeredAt`, `blockNumber`,
    `txHash`, `txUrl` – az Etherscan-link) csak a regisztrált képnél, egyébként `null`. A
    bejelentkezett nézőnek szóló válasz `Cache-Control: no-store`, és a válasz `Vary: Cookie`;
  - módosítás (`PATCH /api/photos/:id`): cím, leírás (`null`: törlés), ár, kategória – csak a
    tulajdonos; minden más mező (pl. `sha256`, `status`) 400; az elrejtett kép nem módosítható
    (409), és mivel az írás is feltételes, a módosítás közben elrejtett sem;
  - elrejtés (`DELETE /api/photos/:id`): a tulajdonos és az admin; `status = HIDDEN`, a kép
    nyilvános előnézete és bélyegképe törlődik, az eredeti fájl és a lánc rekordja megmarad;
    ismételve is 204. Idegen kép módosítására vagy elrejtésére 404, ha a felhasználó nem látja,
    403, ha nyilvános; a 403-as kísérlet és az elrejtés a naplóba kerül (ki, melyik képen, mit);
  - `photos.dto.ts` – a válaszok explicit mezőlistával (`select`) készülnek: az e-mail, a
    jelszó-hash, az eredeti fájl kulcsa és a gázadat le sem jön az adatbázisból; a feltöltés
    válasza is ezt az alakot adja (`certificate: null`);
  - `modules/users/` – nyilvános profil (`GET /api/users/:id`: `id`, `displayName`, `bio`,
    `createdAt`, `photoCount` – csak a nyilvános képek; e-mail soha), a saját profil módosítása
    (`PATCH /api/me`: `displayName`, `bio`) és a saját képek minden állapotban, lapozva
    (`GET /api/me/photos`); `modules/categories/` – `GET /api/categories` (név szerint);
  - `lib/schemas.ts` – közös Zod-építők (lapozás, szövegből olvasott egész szám, többsoros szöveg,
    törölhető mező, szigorú PATCH-törzs, azonosító); `lib/text.ts` – látható hossz: a cím és a
    megjelenítési név (a regisztrációnál is) nem állhat csak láthatatlan karakterekből (Unicode
    `Default_Ignorable_Code_Point`) vagy írásjelekből;
  - `middleware/auth.ts` – `optionalAuth` (letiltott vagy érvénytelen munkamenettel névtelen
    néző); `middleware/noStore.ts`; a galériát más webhelyről indított lekérés nem éri el
    (`rejectCrossSiteReads`, `Vary: Sec-Fetch-Site`); a kérésnaplóban a keresőszó helyett
    `q=***` (a százalékkódolt `%71=` alakban is);
  - `services/chainExplorer.ts` – `transactionProof`: a tanúsítvány és az L12-es ellenőrzés közös
    tranzakció-adatai;
  - adatbázis: a `schema.prisma`-ban csak a `HIDDEN` megjegyzése változott – új index és migráció
    nem kellett;
  - dokumentáció: `README.md` (új szakasz: végpontok, query-paraméterek, lista-válasz példa,
    szabályok, hibakódok), `server/http/photos.http` (7–14. kérés), új `server/http/users.http`,
    `docs/FORRASOK.md` (108–120); a `.env.example` nem változott (új változó nincs).
- Eredmények: 745/745 teszt (L12 végén: 533); TDD: előbb bukó tesztek (`L13_01`: 127 bukó teszt,
  és 4 tesztfájl be sem töltődött a még hiányzó modulok miatt; az átnézési körök új tesztjei:
  `L13_31`: 12, `L13_32`: 7); lefedettség: utasítás 99,74%, elágazás 98,29%, függvény 100%, sor
  99,9% (L12: 99,69 / 98,07 / 100 / 99,89), az L13 minden új és módosított fájlja 100%; ESLint,
  `tsc`, build, Prettier hibátlan.
- Élő próba a lefordított szerverrel (`node dist/server.js`) a **tesztadatbázison**, **blokklánc
  nélkül** – az RPC-cím szándékosan elérhetetlen, tranzakció nem mehetett ki (`L13_18`–`L13_30`):
  három kitalált próbafiók (két fotós és egy admin), három saját fotó feltöltése. A regisztrációs
  kísérletek a lánc hiányában `CHAIN_FAILED`-del zárultak, ezért a regisztrált állapot SQL-lel
  készült (szimulált tranzakció-hash és blokkszám, `L13_18`). Eredmények: a galéria lapozása
  a `meta`-val (3 kép, 2 oldal), keresés és szűrők, a hibás query-paraméterekre 400; adatlap a
  tanúsítvánnyal; módosítás (200), tiltott mező (400), idegen kép (403); elrejtés: az előnézet
  200 → 204 → 404, névtelenül az adatlap 404, a tulajdonos `HIDDEN` állapotban, URL-ek nélkül
  látja; idegen elrejtés 403, admin 204; profil (`photoCount` csak a nyilvános képekből),
  `PATCH /api/me` (200; a `role` mező 400); a saját képek listája. A naplóban a keresőszó
  `q=***`, a jogosulatlan kísérlet és az elrejtés a szereplővel együtt. A próba után a 4000-es és
  a 8545-ös port szabad.
- A szerző döntései (a lépés elején):
  - **Elrejtés:** `status = HIDDEN`; a tulajdonos és az admin rejtheti el, visszaállítani csak az
    admin tudja (L16).
  - **Fájlok:** a rejtett kép előnézete és bélyegképe törlődik – a statikus kiszolgálás (és az
    L32-es felhőtárhely) az állapotot nem nézi; az eredeti megmarad, az L16-os visszaállítás
    ebből készítheti el újra őket.
  - **Keresés:** ILIKE a címben, a leírásban és a fotós nevében; a `%` és a `_` (és maga az
    escape-karakter) szó szerint értendő – a Prisma `contains` ezt nem végzi el (teszt igazolja).
  - **Láthatóság:** a nem nyilvános képet a tulajdonos és az admin látja, másnak 404 (a létezése
    sem derül ki); idegen kép módosítására vagy elrejtésére 404, ha nem látható, 403, ha
    nyilvános. A profil: `id`, `displayName`, `bio`, `createdAt`, `photoCount`; e-mail soha.
- Megvalósítási döntések menet közben: az admin elrejthet, de más képének adatait nem módosíthatja; az
  elrejtett kép módosítása 409; az üres szűrőérték (pl. `minPrice=`) 400 – csak az üres
  keresőmező jelenti azt, hogy nincs keresés; az ismeretlen query-paraméter (pl. a
  gyorsítótár-törlő `_=`) nem hiba; a letiltott felhasználó képei egyelőre látszanak (L16).
- Független kódátnézés két körben (TypeScript és biztonság
  párhuzamosan az L13 diffjére, majd mindkettő csak a javításokra) – CRITICAL, HIGH és MEDIUM
  észrevétel egyik körben sem volt; a LOW és INFO szintűek is javítva, mindegyik előbb
  bukó teszttel:
  - 1. kör (`L13_31`, 12 teszt): a csak láthatatlan karakterekből (pl. hangul kitöltőből) álló cím
       és megjelenítési név (a galériában üresnek látszana) → a Unicode `Default_Ignorable_Code_Point`
       tulajdonsága szerint; a módosítás közben elrejtett kép is módosulhatott (versenyhelyzet) →
       feltételes írás, 409; a galéria keresését idegen oldal a látogató böngészőjéből is
       indíthatta → `rejectCrossSiteReads`; a jogosulatlan kísérlet nem került a naplóba →
       figyelmeztetés a szereplővel; a keresőszó (személynév is lehet) a kérésnaplóba került →
       `q=***`; a bejelentkezett nézőnek szóló adatlapot köztes gyorsítótár is tárolhatta →
       `no-store`, `Vary: Cookie`; egy hibára egyetlen, a valódi okot megnevező üzenet (PATCH-törzs,
       hosszú számjegysor, vezető nullák); a `RegistrationProof` a közös `TransactionProof`-ra épül; a
       `HIDDEN` megjegyzése;
  - 2. kör (`L13_32`, 7 teszt): a hossz kódpontokban (a kiegészítő síkon álló betű egy karakter);
       a cím és a név szabályainak megsértésekor egyetlen, pontos üzenet; a minimális és a maximális
       ár összevetése csak érvényes áraknál; a százalékkódolt kulccsal (`%71=`) küldött keresőszó is
       kitakarva; `Vary: Sec-Fetch-Site` a galérián; a napló a műveletet (`action`) is rögzíti; a
       pillanatkép izolációs szintjét teszt rögzíti;
  - nem javított (INFO): a módosítás feltételében nem szerepel az `ownerId` – tulajdonosváltás a
    rendszerben nincs (L30).
- Az ellenőrzés közben talált hibák:
  - a regisztráció L08-as tesztje bukott: az üres név a látható betű szabálya miatt két hibát adott
    → a második ellenőrzés csak az addig hibátlan értékre fut (`when`);
  - a `patchBody`-ban elérhetetlen ág maradt (88,9% elágazás) → egyszerűsítve;
  - a `photos.service` tesztjéből hiányzott az új `chainId` függőség (`tsc` jelezte);
  - a versenyhelyzet tesztje időtúllépéssel bukott (a sorompót a teszt az ellenőrzés előtt nem
    nyitotta ki) – a teszt hibája, a működés helyes volt.
- Ismert korlátok, későbbre (tudatosan nem most):
  - a fotós az árat bármikor módosíthatja → az L14-ben a rendelés összegét a fizetés indításakor
    kell rögzíteni (`Order.amountHuf`), nem a kép aktuális árából számolni;
  - L16: a visszaállítás (a `registeredAt` alapján `REGISTERED`, egyébként `CHAIN_FAILED`), a
    törölt előnézet és bélyegkép újragenerálása az eredetiből, a letiltott felhasználók képeinek
    láthatósága;
  - L30: a keresés (ILIKE `%…%`) nagy adatmennyiségnél trigram-indexet (`pg_trgm`) kíván, a
    lapozás 1000 oldalig ér (offset); az összetéveszthető megjelenítési nevek (NFKC,
    kisbetűsítés) kiszűrése;
  - L32: CDN mögött a `Vary` és a `no-store` viselkedésének ellenőrzése; a felhőtárhelyről törölt
    fájl a CDN gyorsítótárában még elérhető lehet;
  - az élő próbában a regisztrált állapot szimulált (SQL) – a valódi lánc-regisztrációt az L11
    igazolta, az L13 a regisztrációhoz nem nyúlt.
- Commit előtti audit (nulláról, a korábbi eredményektől függetlenül; 2026-10-04):
  - tiszta telepítés a lockfile-ból (`npm ci`), lint, típusellenőrzés, build, Prettier, minden
    teszt (745/745, a lefedettség változatlan); `npm audit`: 0 sebezhetőség; új függőség nincs
    (`L13_36`);
  - **mutációs próba** (`L13_33`): 88 kritikus pont szándékos elrontása egyenként (a galéria
    szűrői, a keresés escape-elése és mezői, a rendezés és a döntetlentörés, a lapozás és a
    pillanatkép, a láthatóság, a módosítás és az elrejtés jogosultsága és feltételes írása, a
    fájltörlés, a naplózás, a DTO-k mezőlistái – e-mail, eredeti fájlkulcs –, a tanúsítvány, a
    profil, az útvonalak köztes rétegei és fejlécei, a sémák határai, a látható hossz) – a tesztek
    mind a 88-at megfogták; a forrás minden rontás után visszaállt (SHA-256-tal ellenőrizve);
  - **fekete dobozos próba** a lefordított, éles módú szerveren, a tesztadatbázison, blokklánc
    nélkül (`L13_34`): 94 ellenőrzés – biztonsági fejlécek; a galériában csak nyilvános kép;
    lapozás, rendezés (döntetlennél is), keresés (cím, leírás, fotós; a `%`, a `_` és a `\` szó
    szerint; SQL-befecskendezési kísérlet), szűrők; 30 hibás query-paraméter, 17 hibás PATCH-törzs
    és 8 hibás profil-törzs mind 400, veremlista nélkül; láthatóság (névtelen, más felhasználó,
    tulajdonos, admin, hamisított süti, letiltott felhasználó); 401/403/404/409 a jogosulatlan és
    az ütköző kérésekre; CSRF (a galéria `GET`-je és a módosító kérések más webhelyről 403);
    elrejtés: az előnézet és a bélyegkép 404, az eredeti megmarad, ismételve is 204; a naplóban
    nincs keresőszó (`q=***`, `%71=***`), e-mail, jelszó vagy kulcs, a jogosulatlan kísérlet és az
    elrejtés a szereplővel szerepel. Az első futáson egy ellenőrzés a próba hibás elvárása miatt
    bukott: a csupasz szöveg vagy szám JSON-törzs is 400-at kap, csak `INVALID_JSON` kóddal (a
    JSON-olvasó szigorú módja) – ez helyes viselkedés, az elvárás javítva;
  - **fuzz-próba** (`L13_35`): háromszor 750 véletlen kérés, visszajátszható magokkal (elrontott
    query-paraméterek, hibás %-kódolás, hosszú és láthatatlan karakteres szövegek, hamis sütik,
    véletlen és hibás JSON-törzsek, `__proto__` kulcs, túl nagy törzs) – egyetlen 5xx vagy
    veremlista sincs, a naplóban nincs új hibasor, a szerver végig él;
  - a változásokban (80 fájl) nincs titok – a `server/.env` és a `blockchain/.env` 12 titkos értékét
    program kereste, kiírás nélkül (a kereső első változata az adatbázis-URL útvonalát, vagyis
    az adatbázis nevét is titoknak vette, de az nyilvános: `docker-compose.yml`, `.env.example`) –,
    nincs `.env`, kulcs, napló vagy feltöltött fájl, nincs `console.log`, és nincs láthatatlan vagy
    írásirány-vezérlő karakter (a kereső már a Unicode `Default_Ignorable_Code_Point` és formázó
    karaktereit is nézi; egy teszt családi emojijának összekötő karakterei escape-alakba kerültek).
    A próbák után a 4000-es és a 8545-ös port szabad.
- Képek:

  | Kép                                   | Forrás                                                                                                                             | Tartalom                                                                         |
  | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
  | `L13_01_tesztek_piros.png`            | `npx vitest run --project unit …` és `--project db …` (mentett kimenet)                                                            | TDD piros fázis: 127 bukó teszt, 4 tesztfájl be sem töltődik                     |
  | `L13_02_unit_tesztek_sema_zold.png`   | `npx vitest run --project unit src/lib/schemas.test.ts src/modules/users src/services/chainExplorer.test.ts --reporter=verbose`    | közös sémák, profil-séma, tranzakció-adatok                                      |
  | `L13_03_unit_tesztek_foto_zold.png`   | `npx vitest run --project unit src/modules/photos/photos.schemas.test.ts src/modules/photos/photos.dto.test.ts --reporter=verbose` | a galéria és a módosítás sémája, a DTO                                           |
  | `L13_04_galeria_tesztek_zold.png`     | `npx vitest run --project db tests/db/photos.list.test.ts --reporter=verbose`                                                      | a galéria tesztjei                                                               |
  | `L13_05_adatlap_tesztek_zold.png`     | `npx vitest run --project db tests/db/photos.detail.test.ts --reporter=verbose`                                                    | adatlap, módosítás, elrejtés                                                     |
  | `L13_06_profil_tesztek_zold.png`      | `npx vitest run --project db tests/db/users.test.ts tests/db/authorization.test.ts --reporter=verbose`                             | profil, saját képek, opcionális bejelentkezés                                    |
  | `L13_07_lefedettseg.png`              | `npm run coverage` (`server/`)                                                                                                     | 745 teszt, lefedettség fájlonként                                                |
  | `L13_08_lint_typecheck_build.png`     | `npm run lint`, `typecheck`, `build`                                                                                               | hibátlan kódellenőrzés és build                                                  |
  | `L13_09_galeria_query_sema.png`       | `server/src/modules/photos/photos.schemas.ts`, 72–104. sor                                                                         | a galéria query-paraméterei                                                      |
  | `L13_10_kereses_szurok.png`           | `server/src/modules/photos/photos.catalog.ts`, 90–111. sor                                                                         | a keresőszó escape-elése, a szűrők                                               |
  | `L13_11_rendezes_lathatosag.png`      | `server/src/modules/photos/photos.catalog.ts`, 63–88. sor                                                                          | stabil rendezés; ki mit láthat                                                   |
  | `L13_12_modositas_elrejtes.png`       | `server/src/modules/photos/photos.catalog.ts`, 207–252. sor                                                                        | módosítás és elrejtés (jogosultság, feltételes írás, fájltörlés)                 |
  | `L13_13_dto_tanusitvany.png`          | `server/src/modules/photos/photos.dto.ts`, 102–120. sor                                                                            | a tanúsítvány csak a regisztrált képnél                                          |
  | `L13_14_opcionalis_bejelentkezes.png` | `server/src/middleware/auth.ts`, 43–71. sor                                                                                        | `optionalAuth`                                                                   |
  | `L13_15_patch_torzs_szamok.png`       | `server/src/lib/schemas.ts`, 35–95. sor                                                                                            | szövegből olvasott szám, szigorú PATCH-törzs                                     |
  | `L13_16_teszt_kereses_escape.png`     | `server/tests/db/photos.list.test.ts`, 241–253. sor                                                                                | a teszt: a `%`, a `_` és a `\` szó szerint                                       |
  | `L13_17_teszt_elrejtes_verify.png`    | `server/tests/db/photos.detail.test.ts`, 649–676. sor                                                                              | a teszt: a rejtett képre a `/api/verify` a lánc adataival felel                  |
  | `L13_18_regisztracio_szimulalasa.png` | `psql` (tesztadatbázis): `UPDATE photos SET status = REGISTERED …`                                                                 | a lánc nélküli próbában a regisztráció szimulálva                                |
  | `L13_19_kategoriak.png`               | `curl …/api/categories`                                                                                                            | a 8 kategória                                                                    |
  | `L13_20_galeria_meta.png`             | `curl "…/api/photos?pageSize=2"`, majd `&page=2`                                                                                   | a lista-válasz a `meta` objektummal (3 kép, 2 oldal)                             |
  | `L13_21_galeria_szurok.png`           | `curl "…/api/photos?q=fanni&categoryId=8&maxPrice=2000&sort=price_asc"`, `?ownerId=…`                                              | keresés és szűrők; egy fotós képei                                               |
  | `L13_22_galeria_hibas_query.png`      | `curl` – `pageSize=500&sort=random`, `minPrice` > `maxPrice`, kétszeres `page` és `q=%00`                                          | 400 a pontos okokkal                                                             |
  | `L13_23_adatlap_tanusitvany.png`      | `curl …/api/photos/<id>`                                                                                                           | adatlap a tanúsítvánnyal (a lokális láncazonosítón `txUrl: null`)                |
  | `L13_24_modositas.png`                | `curl -X PATCH` – saját kép, `sha256` mező, idegen kép                                                                             | 200, 400, 403                                                                    |
  | `L13_25_elrejtes.png`                 | `curl` – előnézet, `DELETE`, előnézet, adatlap névtelenül és a tulajdonosként                                                      | 200 → 204 → 404; 404; `HIDDEN` URL-ek nélkül                                     |
  | `L13_26_galeria_elrejtes_utan.png`    | `curl` – galéria, idegen és admin `DELETE`                                                                                         | 2 kép; 403; 204                                                                  |
  | `L13_27_profil.png`                   | `curl …/api/users/<id>` (kétszer), `PATCH /api/me` (`bio`, `role`)                                                                 | `photoCount` 1 és 0; 200; 400                                                    |
  | `L13_28_sajat_kepek.png`              | `curl -b fanni.jar …/api/me/photos`                                                                                                | a saját (rejtett) képek a `meta`-val                                             |
  | `L13_29_adatbazis.png`                | `psql` (tesztadatbázis): `SELECT title, status, …`                                                                                 | a próba után: 1 nyilvános, 2 rejtett kép                                         |
  | `L13_30_szervernaplo.png`             | a próbaszerver naplója (mentett kimenet, szűrve)                                                                                   | `q=***`; a jogosulatlan kísérlet és az elrejtés naplója                          |
  | `L13_31_atnezes_piros.png`            | `npx vitest run … --reporter=verbose` (mentett kimenet)                                                                            | az első átnézési kör új tesztjei a javítás előtt (12)                            |
  | `L13_32_atnezes2_piros.png`           | `npx vitest run … --reporter=verbose` (mentett kimenet)                                                                            | a második átnézési kör új tesztjei a javítás előtt (7)                           |
  | `L13_33_audit_mutacios_proba.png`     | `node mutation-check-l13.mjs` (mentett kimenet, jegyzetmappa)                                                                      | 88 szándékos rontás – a tesztek mindet megfogták                                 |
  | `L13_34_audit_fekete_doboz.png`       | `node audit-l13-live.mjs …` (mentett kimenet, jegyzetmappa)                                                                        | 94 ellenőrzés a lefordított, éles módú szerveren                                 |
  | `L13_35_audit_fuzz.png`               | `node audit-l13-fuzz.mjs … 1 \| 2 \| 3` (mentett kimenet, jegyzetmappa)                                                            | háromszor 750 véletlen kérés – nincs 5xx                                         |
  | `L13_36_audit_telepites_titkok.png`   | `npm ci`, `npm audit`, lint, typecheck, build, coverage; `node secret-scan-l13.mjs`, `node find-invisible.mjs …`                   | tiszta telepítés, 0 sebezhetőség, 745 teszt; nincs titok és láthatatlan karakter |

- Commit: `05cd92b` – `feat(L13): galéria, keresés, adatlap, elrejtés és profil API`

## L14 – Stripe-fizetés, rendelések, védett letöltés (2026-10-04 – 2026-10-05)

- Elkészült (`server/`):
  - `modules/orders/` – a fizetés indítása (`POST /api/orders/checkout`, csak a kép azonosítója a
    törzsben; bejelentkezés, felhasználónkénti sebességkorlát): ellenőrzés (nyilvános – REGISTERED –,
    nem saját, még meg nem vett, vásárolható árú kép), `PENDING` rendelés a **checkoutkori árral**
    (`Order.amountHuf`), majd Stripe Checkout-munkamenet (HUF, az összeg fillérben, egy tétel, a
    metaadatban a rendelés azonosítója, csak kártya, 31 perces lejárat, idempotenciakulcs); a
    visszatérési URL-ek a szerver konfigurációjából (`APP_BASE_URL`) jönnek. A rendelés állapota a
    munkamenet azonosítója alapján (`GET /api/orders/by-session/:sessionId`, csak a saját, másé 404)
    és a vásárlásaim lista (`GET /api/me/purchases`, a kifizetett rendelések, lapozva);
  - `stripe.webhook.ts` – `POST /api/webhooks/stripe`: a nyers törzset kapja (`express.raw`, a
    JSON-feldolgozó előtt), az aláírást a Stripe-könyvtár `constructEvent`-je ellenőrzi (5 perces
    tűréshatár); hibás aláírás vagy törzs → 400, feldolgozás nélkül; a nem teszt módú esemény
    hatástalan;
  - `orders.service.ts` – feltételes állapotváltás (`PENDING → PAID / EXPIRED / FAILED`): ugyanaz az
    esemény többször is megérkezhet, csak az első hat; PAID csak fizetett munkamenetből, egyező
    összeggel és pénznemmel; a más munkamenetből érkező fizetés (kettős fizetés) hibaként naplózódik;
  - egy vevőnek egy képre egyszerre egy élő (PENDING vagy PAID) rendelése lehet: **részleges egyedi
    index** (`prisma/schema.prisma`, `partialIndexes` előzetes funkció; migráció
    `20261004180000_order_live_unique`) – párhuzamos kérésekből sem lesz kettő;
  - `services/payment.service.ts` – a Stripe-ot interfész mögé zárja (a tesztekben utánzat); a
    Stripe hibaüzenete nem jut tovább (`PaymentError`: csak típus, kód, státusz, kérésazonosító);
  - `modules/photos/photos.download.ts` – `GET /api/photos/:id/download`: a tulajdonos (minden
    állapotban) és a kifizetett rendeléssel rendelkező vásárló tölti le az eredetit; másnak 403, ha
    a kép nyilvános, egyébként 404 (L13); a fájl folyamként megy (`Content-Disposition: attachment`,
    RFC 6266 szerinti név a címből), felhasználónként legfeljebb 2 egyidejű letöltés; HEAD-re csak a
    fejlécek; `lib/download.ts` – fájlnév (tiltott és láthatatlan karakterek, Windows-eszköznevek
    nélkül), a fejléc és a folyam küldése (a fájl minden úton lezárul);
  - `lib/price.ts` – a HUF szabályai [S29]; a feltöltésnél és a módosításnál az ár 175–9 999 999 Ft;
  - `config/env.ts` – `STRIPE_WEBHOOK_SECRET` (whsec_…), `APP_BASE_URL` (csak eredet),
    `CHECKOUT_RATE_LIMIT_MAX`; a Stripe-kulcs csak `sk_test_…`; mindkét Stripe-titok a napló
    kitakart értékei között, és a szerver indulás után a környezetből is törli őket; a kérésnapló a
    munkamenet azonosítóját is kitakarja;
  - dokumentáció: README „Vásárlás és letöltés (L14)”, `server/http/orders.http`,
    `server/http/photos.http` (15.), `.env.example` (új változónevek), FORRASOK 121–132.
- Eredmények: 884/884 teszt (L13 végén: 745), az audit két javítása után 887/887; TDD: előbb bukó
  tesztek (`L14_01`: 9 unit-tesztfájl bukik, ebből 5 be sem töltődik; 16 unit- és 67 végponttest
  bukik); lefedettség 99,79 / 98,64 / 100 / 99,92 % (az L14 minden fájlja 100 %; az `env.ts`
  egyetlen fedetlen ága – indulás `.env` nélkül – L06 óta ilyen); lint, typecheck, build hibátlan. A
  webhook-tesztek a Stripe SDK `generateTestHeaderString` segédfüggvényével aláírt eseményeket
  küldenek; a valódi Stripe-ot a tesztek nem hívják.
- Élő próba a lefordított szerverrel a **tesztadatbázison**, blokklánc nélkül (a regisztrációt SQL
  szimulálja, `L14_23`), **valódi Stripe teszt móddal** (a kulcsokat a szerverfolyamat a
  `server/.env`-ből töltötte be, kiírás nélkül): fizetésindítás 201, ismételve ugyanaz a munkamenet
  200 (`L14_24`); saját kép 403, idegen mező 400, aláírás nélküli webhook 400 (`L14_25`); fizetés
  előtt a letöltés 403 (`L14_26`). A tesztkártyás fizetés első kísérlete elutasítással zárult
  (`charge.failed`), a második sikeres volt. A `stripe listen` azonban nem továbbította az
  eseményeket: az újabb CLI-nek kötelező az eseménylista (`--events …`), anélkül el sem indult, és
  utána sem jutott el esemény a szerverhez. A rendelést ezért a beépített **tartalékút** zárta le: a
  vevő ismételt fizetésindításakor a szerver lekérdezte a munkamenetet a Stripe-tól, látta, hogy
  kifizették, és PAID-re állította (409 ALREADY_PURCHASED, `L14_27`–`L14_28`). Utána: a rendelés
  állapota PAID, másnak 404 (`L14_29`); vásárlásaim (`L14_30`); a vevő letöltése bájtra egyezik az
  eredetivel (`L14_31`); más felhasználó 403, bejelentkezés nélkül 401 (`L14_32`); szervernapló
  (`L14_33`). A webhook útját a Stripe CLI-vel élőben nem sikerült bemutatni – a 29 automatikus
  webhook-teszt és az audit fekete dobozos próbája (aláírt próbaeseményekkel a futó szerveren)
  igazolja (aláírás, idempotencia, összeg- és pénznem-ellenőrzés); a README-ben a parancs javítva.
- A szerző döntései (a lépés elején):
  - **Rejtett kép:** a kifizetett vásárló a később elrejtett képet is letöltheti (a licenc nem vész
    el; az elrejtés közben befejezett fizetés is PAID); rejtett képre új vásárlás nem indulhat;
  - **Minimális ár:** 175 Ft a feltöltésnél és a módosításnál (a Stripe HUF-minimuma), felső határ
    9 999 999 Ft (fillérben 9 számjegy – az American Express határa); a régi, olcsóbb kép 409;
  - **Ismételt fizetésindítás:** a nyitott munkamenet újrahasznosítása; a lejárt helyett új; a
    kifizetett (a webhook előtt) PAID + 409;
  - **Letöltés:** a szerver streameli, a fájlnév a kép címéből (ékezetesen és ékezet nélküli
    tartalékkal).
- Megvalósítási döntések menet közben: a munkamenet élettartama 31 perc (a Stripe minimuma 30 perc a saját
  órája szerint); a munkamenet nélküli függő rendelés 2 perc után félbemaradtnak számít; a Stripe
  23-as SDK-jában (API 2026-09-30) a `payment_method_types` megszűnt – helyette
  `allowed_payment_method_types: ['card']` (ezt a typecheck fogta meg); a részleges index
  feltétele a PostgreSQL által tárolt alakban szerepel a sémában (különben a Prisma örökös eltérést
  lát).
- Független kódátnézés két körben (TypeScript és biztonság
  párhuzamosan, csak az L14 diffjére; a második kör csak a javításokra):
  - 1. kör: **HIGH** (TypeScript): ha a kliens a letöltés indulása előtt bontja a kapcsolatot, a
       fájlleíró nyitva marad, és hamis 500 kerül a naplóba – javítva; LOW/INFO: a webhook és a
       folytatás versenyhelyzete (hamis „kézi ellenőrzés” napló, 409 helyett „folyamatban”), a
       munkamenet feltétel nélküli beírása, HEAD-kérésre a teljes fájl beolvasása, csonka letöltés
       elnyelése, Windows-eszköznevek, `%XX` a tartalék fájlnévben, párosítatlan helyettesítő
       karakter, a letöltés egyidejűségi korlátja, éles módú esemény, munkamenet-azonosító a
       kérésnaplóban, `PaymentError` diagnosztika – mind javítva, előbb bukó teszttel (`L14_08`);
  - 2. kör: nincs MEDIUM vagy súlyosabb; a maradék LOW-ok (eszköznév a pont előtt és a tartalék
       névben, késői kapcsolatbontás, kettős fizetés jelzése, zárt alapállású livemode-ellenőrzés,
       `finally` a letöltésnél) javítva, bukó teszttel (`L14_09`);
  - elfogadva, nem javítva: az elrejtés közben befejezett fizetés PAID marad (döntés); a letöltésnek
    nincs válasz-időkorlátja (az egyidejűségi korlát kordában tartja; a proxy időkorlátjai L32); a
    `checkoutUrl` gépnevét nem ellenőrizzük (a Stripe saját domaint is használhat); visszatérítés
    és vitatott terhelés kezelése nincs (L30/L32).
- Az ellenőrzés közben talált hibák: a `migrate dev` nem interaktív környezetben a
  figyelmeztetés miatt leállt – a migráció a `prisma migrate diff` kimenetéből készült, és a
  `npm run db:migrate` alkalmazta; a Prisma a részleges index `IN (…)` alakú feltételét örökös
  eltérésnek látta (javítva); egy L07-es sémateszt két élő rendelést hozott létre ugyanarra a vevőre
  és képre – az új szabály szerint átírva; két tesztelvárás (a token alakú, idézőjel nélküli
  fájlnév) javítva; egy véletlen lágy kötőjel (U+00AD) egy tesztnévben – eltávolítva.
- Ismert korlátok, későbbre (tudatosan nem most): éles üzemben az `APP_BASE_URL` megadása kötelező
  legyen (L32); a webhook az általános IP-korlát alá esik (429-nél a Stripe újraküld); admin általi
  eltávolításnál a függő fizetés kezelése (L16); visszatérítés és vitatott terhelés (L30/L32); a
  kliens (L22) visszatérési oldalai: `/checkout/success?session_id=…` és
  `/checkout/cancel?photoId=…`.
- Commit előtti audit (2026-10-05; a segédszkriptek a jegyzetmappában, a repóba nem kerültek):
  - `npm ci` (466 csomag) és `npm audit`: 0 sebezhetőség;
  - mutációs próba: 68 szándékos rontás az L14 kritikus soraiban (ár, munkamenet, indítás,
    folytatás, kifizetés, webhook, letöltés, fájlnév, stream, env, napló) – mind megfogva; az audit
    javításai után a két módosult fájl 14 rontása (köztük 4 új) újra – mind megfogva; összesen 72
    (`L14_34`);
  - fekete dobozos próba a lefordított, éles módú szerveren (tesztadatbázis, blokklánc nélkül,
    valódi Stripe teszt mód; a webhook-titok egy eldobható, csak erre a futásra generált érték, így
    a próbaesemények valódi aláírással mennek): 67/67 (`L14_35`) – hibás törzsek, más webhelyről
    érkező kérés, saját / rejtett / 175 Ft alatti kép, ismételt és 6 párhuzamos fizetésindítás;
    aláírt, de eltérő összegű, más pénznemű, fizetetlen, éles, mód nélküli, lejárt időbélyegű,
    utólag módosított esemény – mind hatástalan; a helyes esemény PAID-re állít, ugyanaz még 3×
    egymás után és 5× párhuzamosan sem változtat; a késve érkező „lejárt” és „sikertelen” esemény
    nem írja felül; letöltési jogok, HEAD, bájtra egyező fájl; a napló érvényes JSON, titok nélkül;
  - fuzz-próba: 3 visszajátszható mag × 860 kérés (fizetésindítás, rendelés-lekérdezés,
    vásárlásaim, letöltés GET/HEAD, webhook hamis aláírással, aláírt, de elrontott eseményekkel és
    ismételt eseménnyel) – 0 eltérés, a rendelések változatlanok, új hibasor nincs (`L14_36`); a
    néhány 431-es válasz a Node 16 KB-os fejléckorlátja (túl hosszú hamis aláírásfejléc);
  - titokkeresés mintákkal (Stripe-kulcs, webhook-titok, RPC-kulcs, adatbázis-jelszó, PEM, JWT; a
    `.env` megnyitása nélkül): 0 gyanús találat, 16 szándékos ál-érték a tesztekben; a `.env`
    fájlok gitignore-ban; láthatatlan karakter 0 (`L14_37`);
  - **két lelet**, mindkettő előbb bukó teszttel javítva (`L14_41`):
    1. egy helyesen aláírt, de nem Stripe-esemény alakú törzs (pl. `null`) 500-at adott (a könyvtár
       csak az aláírást ellenőrzi, az alakot nem) – most a Zod-burokellenőrzés 400-at ad, „törzs”
       okkal. Csak a webhook-titok birtokában idézhető elő (a fuzz aláírt ága találta meg);
    2. minden sikeres letöltés `MaxListenersExceededWarning`-ot írt a naplóba (nem JSON sor): a
       `pipeline` 7, a kérésnapló 1, a letöltési korlát 2, a `sendStream` 1 „close”-figyelőt tesz a
       válaszra (11 > 10). Valódi szivárgás nem volt (a figyelők a válasszal együtt megszűnnek); a
       `sendStream` a válasz figyelőhatárát 10-zel megemeli (a korlátlant nem szűkíti) [133]. A
       unit-tesztek eddig nem fogták meg, mert mesterséges `Writable`-lel futottak – az új teszt
       valódi HTTP-választ használ;
  - mellékesen: a Stripe SDK egy, a fejlesztői gépen beállított környezeti változó hatására
    egy nem JSON ajánló sort ír a kimenetre – élesben nem jelenik meg; a képekről kiszűrve.
- Képek:

  | Kép                                           | Forrás                                                                                                                                                    | Tartalom                                                                                                        |
  | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
  | `L14_01_tesztek_piros.png`                    | `npx vitest run --project unit …` és `--project db …` (mentett kimenet)                                                                                   | TDD piros fázis: 16 unit- és 67 végponttest bukik, 5 tesztfájl be sem töltődik                                  |
  | `L14_02_unit_tesztek_zold.png`                | `npx vitest run --project unit src/lib/price.test.ts src/lib/download.test.ts src/modules/orders src/services/payment.service.test.ts --reporter=verbose` | árszabályok, fájlnév és stream, rendelés-sémák és DTO, Stripe-szolgáltatás (45 teszt, az audit 2 új tesztjével) |
  | `L14_03_checkout_tesztek_zold.png`            | `npx vitest run --project db tests/db/orders.checkout.test.ts --reporter=verbose`                                                                         | fizetésindítás, ismételt indítás, versenyhelyzetek, elutasítások (29 teszt)                                     |
  | `L14_04_webhook_tesztek_zold.png`             | `npx vitest run --project db tests/db/orders.webhook.test.ts --reporter=verbose`                                                                          | aláírás, eseményalak, idempotencia, összeg és pénznem, többi esemény (29 teszt)                                 |
  | `L14_05_letoltes_rendelesek_tesztek_zold.png` | `npx vitest run --project db tests/db/orders.read.test.ts` és `photos.download.test.ts --reporter=verbose`                                                | rendelés állapota, vásárlásaim, letöltés (27 teszt)                                                             |
  | `L14_06_teljes_csomag_lefedettseg.png`        | `npx vitest run --coverage` (mentett kimenet)                                                                                                             | 887 teszt (az audit javításai után); a lefedettség L14-et érintő sorai – az L14 kódja mind 100 %                |
  | `L14_07_lint_typecheck_build.png`             | `npm run lint`, `npm run typecheck`, `npm run build`                                                                                                      | hibátlan kódellenőrzés és fordítás                                                                              |
  | `L14_08_atnezes_piros.png`                    | `npx vitest run …` (mentett kimenet)                                                                                                                      | az első átnézés nyomán írt 12 teszt a javítás előtt                                                             |
  | `L14_09_atnezes2_piros.png`                   | `npx vitest run …` (mentett kimenet)                                                                                                                      | a második átnézési kör 5 tesztje a javítás előtt                                                                |
  | `L14_10_reszleges_egyedi_index.png`           | `server/prisma/schema.prisma`, `model Order`                                                                                                              | az egy élő rendelés szabálya (részleges egyedi index)                                                           |
  | `L14_11_huf_szabalyok.png`                    | `server/src/lib/price.ts`                                                                                                                                 | 175 Ft minimum, fillérben számolt összeg                                                                        |
  | `L14_12_checkout_munkamenet.png`              | `server/src/services/payment.service.ts`, `createCheckoutSession`                                                                                         | a Stripe-nak küldött munkamenet paraméterei                                                                     |
  | `L14_13_fizetes_inditasa.png`                 | `server/src/modules/orders/orders.service.ts`, `startCheckout`                                                                                            | rendelés, munkamenet, feltételes beírás                                                                         |
  | `L14_14_folytatas_ujrahasznositas.png`        | `orders.service.ts`, `resumePending`                                                                                                                      | a nyitott munkamenet újrahasznosítása, a tartalékút                                                             |
  | `L14_15_kifizetes_ellenorzese.png`            | `orders.service.ts`, `fulfill`                                                                                                                            | PAID csak fizetett munkamenetből, egyező összeggel és pénznemmel                                                |
  | `L14_16_webhook_alairas.png`                  | `server/src/modules/orders/stripe.webhook.ts`                                                                                                             | nyers törzs, aláírás-ellenőrzés, az eseményburok ellenőrzése (Zod), livemode                                    |
  | `L14_17_koztes_retegek_sorrendje.png`         | `server/src/app.ts`                                                                                                                                       | a webhook a JSON-feldolgozó előtt                                                                               |
  | `L14_18_letoltes_jogosultsag.png`             | `server/src/modules/photos/photos.download.ts`, `open`                                                                                                    | tulajdonos / PAID vásárló; 403 vagy 404                                                                         |
  | `L14_19_fajlnev_stream.png`                   | `server/src/lib/download.ts`, `sendStream`                                                                                                                | a fájl minden úton lezárul; a kliens bontása nem hiba; a figyelőhatár emelése                                   |
  | `L14_20_env_stripe.png`                       | `server/src/config/env.ts`                                                                                                                                | Stripe-kulcs, webhook-titok, kliens címe, korlát                                                                |
  | `L14_21_teszt_parhuzamos.png`                 | `server/tests/db/orders.checkout.test.ts`                                                                                                                 | 8 párhuzamos kérésből egy élő rendelés                                                                          |
  | `L14_22_teszt_webhook_alairas.png`            | `server/tests/db/orders.webhook.test.ts`                                                                                                                  | hamis, módosított és visszajátszott esemény                                                                     |
  | `L14_23_regisztracio_szimulalasa.png`         | psql (TEST adatbázis)                                                                                                                                     | a lánc nélküli próba: REGISTERED SQL-lel                                                                        |
  | `L14_24_fizetes_inditasa.png`                 | `curl … /api/orders/checkout` (kétszer)                                                                                                                   | 201, majd ugyanaz a munkamenet 200-zal                                                                          |
  | `L14_25_fizetes_elutasitva.png`               | `curl …`                                                                                                                                                  | saját kép 403, idegen mező 400, aláírás nélküli webhook 400                                                     |
  | `L14_26_letoltes_fizetes_elott.png`           | `curl … /download`                                                                                                                                        | fizetés előtt 403                                                                                               |
  | `L14_27_tartalekut_stripe_lekerdezes.png`     | `curl … /api/orders/checkout` (a sikeres fizetés után)                                                                                                    | a szerver a Stripe-tól lekérdezve lezárja a rendelést: 409 ALREADY_PURCHASED                                    |
  | `L14_28_rendeles_paid_adatbazis.png`          | psql (TEST adatbázis)                                                                                                                                     | a rendelés PENDING → PAID (paidAt)                                                                              |
  | `L14_29_rendeles_allapota.png`                | `curl … /api/orders/by-session/…`                                                                                                                         | a vevőnek PAID, másnak 404                                                                                      |
  | `L14_30_vasarlasaim.png`                      | `curl … /api/me/purchases`                                                                                                                                | a kifizetett rendelés, meta objektummal                                                                         |
  | `L14_31_letoltes_vevo.png`                    | `curl -D - … /download`, `node compare.mjs`                                                                                                               | melléklet, ékezetes fájlnév, no-store; bájtra egyezik az eredetivel                                             |
  | `L14_32_jogosulatlan_letoltes_403.png`        | `curl -D - … /download` (más felhasználó, bejelentkezés nélkül)                                                                                           | 403 FORBIDDEN, illetve 401                                                                                      |
  | `L14_33_szervernaplo.png`                     | `node dist/server.js` (mentett, szűrt napló)                                                                                                              | a kérések, a tartalékút („A rendelés kifizetve”), a jogosulatlan kísérlet                                       |
  | `L14_34_audit_mutacios_proba.png`             | `node mutation-check-l14.mjs` (jegyzetmappa)                                                                                                              | 68 + 14 (a javítások után) rontás, összesen 72 különböző – mind megfogva                                        |
  | `L14_35_audit_fekete_doboz.png`               | `node audit-l14-live.mjs` (a lefordított, éles módú szerveren)                                                                                            | 67/67 ellenőrzés, aláírt próbaeseményekkel                                                                      |
  | `L14_36_audit_fuzz.png`                       | `node audit-l14-fuzz.mjs <napló> 1 \| 2 \| 3`                                                                                                             | 3 × 860 véletlen kérés, a webhookra is – 0 eltérés                                                              |
  | `L14_37_audit_telepites_titkok.png`           | `npm ci`, `npm audit`, lint, typecheck, build, coverage, `secret-scan-l14.mjs`, `find-invisible.mjs`                                                      | 0 sebezhetőség, 887 teszt, 0 titok, 0 láthatatlan karakter                                                      |
  | `L14_41_audit_javitasok_piros.png`            | `npx vitest run --project unit src/lib/download.test.ts` és `--project db tests/db/orders.webhook.test.ts` (mentett kimenet)                              | az audit két leletének tesztje a javítás előtt (hamis szivárgás-figyelmeztetés; aláírt `null` → 500)            |

  A szerző készíti (a Stripe oldalai bejelentkezést igényelnek):
  `L14_38_stripe_checkout_oldal.png` (a Stripe fizetési oldala),
  `L14_39_stripe_cli_webhook_naplo.png` (a `stripe listen` ablaka),
  `L14_40_stripe_dashboard_fizetes.png` (a sikeres 2 500 Ft-os fizetés a Dashboardon).

- Commit: `5d00e38` – `feat(L14): Stripe-fizetés, rendelések, webhook és védett letöltés`

## L15 – Értékelések (2026-10-05)

- Elkészült (`server/`):
  - `modules/reviews/` – a kép értékeléseinek listája (`GET /api/photos/:id/reviews`: nyilvános,
    opcionális bejelentkezéssel; a legújabb elöl, lapozva; a szerző azonosítója és neve, és a kép
    összesítése: `rating: { average, count }`), az értékelés írása (`POST /api/photos/:id/reviews`:
    csak a kép kifizetett – `PAID` – vásárlója, csak nyilvános képre, képenként egyszer, 1–5 csillag,
    nem kötelező szöveg) és törlése (`DELETE /api/reviews/:id`: a szerző vagy az admin);
  - képenként egy értékelés: az adatbázis meglévő egyedi indexe (L07, `reviews`: `photoId` +
    `authorId`) dönt – párhuzamos kérésekből is egy lesz (`409 ALREADY_REVIEWED`); új migráció nem
    kellett;
  - `reviews.rating.ts` – az átlag a csillagok összegéből és számából, két tizedesre kerekítve (Prisma
    `aggregate`); a profil (`GET /api/users/:id`) új `rating` mezője a fotós nyilvános képeinek
    értékeléseiből készül;
  - `lib/text.ts` – `hasVisibleCharacter` (kell egy látható jel; írásjel vagy emoji is elég),
    `removeHiddenCharacters` (a rejtett karakterek kimaradnak, a teljes emoji-sorozatok épek),
    `collapseBlankLines` (két bekezdés között legfeljebb egy üres sor);
  - a jogosulatlan írási és törlési kísérlet, illetve a törlés (szerző vagy admin) a végrehajtó
    azonosítójával naplózódik;
  - dokumentáció: README „Értékelések (L15)” (és a profil sora), `server/http/reviews.http`, FORRASOK
    134–138.
- Eredmények: 953/953 teszt (L14 végén: 887), az audit két új tesztjével 955/955; TDD: előbb bukó
  tesztek (`L15_01`: 3 unit-tesztfájl
  bukik, ebből 2 be sem töltődik; 7 unit- és 25 végponttest bukik); lefedettség 99,8 / 98,72 / 100 /
  99,93 % (az L15 minden fájlja 100 %); lint, typecheck, build és a formázás hibátlan.
- Élő próba a lefordított szerverrel a **tesztadatbázison**, blokklánc és Stripe nélkül: a kép
  regisztrációját és két vevő kifizetett rendelését SQL szimulálja (`L15_19` – a fizetést az L14
  már élőben mutatta be); értékelés szöveggel és csak csillaggal – 201, a négy sortörésből egy üres
  sor lett (`L15_20`); a nem vásárló és a fotós 403, bejelentkezés nélkül 401 (`L15_21`); az ismételt
  értékelés 409, a hibás törzs 400 (`L15_22`); a lista az átlaggal (`L15_23`); a fotós profilja
  4,5-ös átlaggal (`L15_24`); törlés: idegennek 403, a szerzőnek 204, ismét 404, utána a profil
  átlaga 4 (`L15_25`); szervernapló (`L15_26`).
- A szerző döntései (a lépés elején):
  - **Nem nyilvános kép:** értékelés csak nyilvános (`REGISTERED`) képre írható; a nem nyilvános kép
    értékeléseit csak a tulajdonos és az admin látja, másnak `404` (mint az L13 adatlapnál);
  - **Szöveg:** nem kötelező – a csillag is elég;
  - **A fotós átlaga:** csak a nyilvános képei értékeléseiből (mint a profil képszáma);
  - **Módosítás:** nincs – az értékelés szerzője törölheti az értékelését, és újat írhat.
- Megvalósítási döntések menet közben: a lista a kép összesítését (`rating`) is megadja – a kliens (L23) a
  képnél ezt mutatja; az átlag két tizedesre kerekítve; a fotós a saját képét nem értékelheti (403,
  a kísérlet naplózva); a nem nyilvános képet látó tulajdonos vagy admin írási kísérlete `409`; az
  értékelés szerzője a később elrejtett kép értékelését is törölheti (a saját tartalma); a nem vásárló 403-a is
  naplózódik.
- Független kódátnézés két körben (TypeScript és biztonság
  párhuzamosan, csak az L15 diffjére; a második kör csak a javításokra):
  - 1. kör: nincs MEDIUM vagy súlyosabb; a LOW-ok javítva, előbb bukó teszttel (`L15_07`): rejtett
       karakterek a szövegben (a címke-karakterekkel írt „ASCII-csempészet” az olvasónak
       láthatatlan, egy gépi feldolgozó – pl. egy moderáló nyelvi modell – viszont elolvassa) →
       eltávolítás; üres sorokkal szétnyújtott lista → legfeljebb egy üres sor; az átlag lebegőpontos
       kerekítése (41/40 = 1,025 → 1,02) → az összegből számolva 1,03; a profil a `reviews.service`-t
       importálta → külön `reviews.rating.ts`; kettős hibaüzenet a csillagnál (pl. `1e21`) → egy
       szabály; egy változónév; hiányzó tesztesetek (a 404-es válasz fejlécei, az utolsó oldalon túl,
       nem támogatott metódus, törzs nélküli kérés, párosítatlan helyettesítő karakter);
  - 2. kör: nincs MEDIUM vagy súlyosabb; javítva, bukó teszttel (`L15_08`): a nem törhető,
       ideografikus szóközös vagy Braille-üres sor is üres sornak számít; a számjegyes keycap emoji és a
       címke-karakteres zászlók (Anglia, Skócia, Wales) épek maradnak – az eltávolítás a teljes (RGI)
       emoji-sorozatokat hagyja meg (`\p{RGI_Emoji}`, a reguláris kifejezés `v` kapcsolójával); a
       csak hibás karakterből álló szöveg nem tartalom. Új tesztek: szivárványos zászló, futó nő,
       rejtett karakterrel kettévágott pár, ismételt alkalmazás, NaN és végtelen csillag;
  - elfogadva, nem javítva: ha a képet az ellenőrzés és az írás között elrejtik, az értékelés a
    rejtett képhez kerül (ugyanez az állapot jönne létre, ha egy pillanattal korábban érkezik); a
    saját kép álfiókkal való megvétele és értékelése (a vásárlás-alapú modell velejárója – moderáció:
    L16, L30); a vélemény nyilvánosan összeköti a vevőt a vásárlással (adatvédelmi megjegyzés a
    dolgozatba); törlés és újraírás = tényleges módosítás; a fotós elrejtheti a gyenge értékelésű
    képét, és annak értékelései kiesnek az átlagból (a döntés szerint); a nem latin írások
    láthatatlan jelei (pl. perzsa ZWNJ, héber és arab irányjelek) is kimaradnak – magyar felületen
    elfogadható; az emoji-sorozatokon belül maradó csekély rejtett kapacitás; a sok rövid sorból álló
    szöveg magassága (a kliens korlátozza, L23).
- Az ellenőrzés közben talált hibák: a 100 %-os ágfedéshez két teszt hiányzott (egyéb
  adatbázishiba írás közben `500`, nem `409`; a közben már törölt értékelés törlése `404`) – a kód
  helyesen kezelte; az élő próba SQL-szimulációjában az `orders.id`-nek nincs adatbázis-oldali
  alapértéke (a Prisma generálja) – `gen_random_uuid()`; a verbose tesztképek felirata tévesen
  ígérte a fájlútvonal rövidítését – javítva.
- Ismert korlátok, későbbre (tudatosan nem most): L16 – a letiltott felhasználók értékeléseinek
  láthatósága (most látszanak), admin moderáció; L23 – a vélemény magasságának korlátozása, a szöveg
  csak szövegként jelenhet meg (nincs `dangerouslySetInnerHTML`); L30 – a többi szabad szöveges mező
  (cím, leírás, bemutatkozás) rejtett karaktereinek eltávolítása (most csak a véleményé), az
  álfiókok felismerése; L33 – adatvédelmi megjegyzés a nyilvános értékelésekről.
- Commit előtti audit (2026-10-05; a segédszkriptek a jegyzetmappában, a repóba nem kerültek):
  - `npm ci` (466 csomag) és `npm audit`: 0 sebezhetőség;
  - mutációs próba: 45 szándékos rontás az L15 kritikus soraiban (lista, írás, törlés, átlag, profil,
    DTO, séma, szövegszabályok, útvonalak, fejlécek) – az első futásban **43/45**: két rontás
    átcsúszott, mert a tesztek nem rögzítettek két jogosultsági szabályt (a kód helyes volt):
    1. ha a vásárlás-ellenőrzésből kimaradna a vevő azonosítója, _bárki_ értékelhetne egy képet,
       amint valaki más megvette – nem volt teszt arra, hogy más vevő kifizetett rendelése mellett az
       idegen 403-at kap;
    2. a fotós saját képének külön ellenőrzése – a fotóst a vásárlás-ellenőrzés is megállítja (a
       saját képét nem veheti meg), ezért nem volt teszt arra, ha (pl. régi vagy javított adat miatt)
       mégis van kifizetett rendelése;
       a két új teszttel az írás mind a 8 rontását megfogják – összesen 45/45 (`L15_27`);
  - fekete dobozos próba a lefordított, éles módú szerveren (tesztadatbázis, lánc és Stripe nélkül):
    43/43 (`L15_28`) – 401/403 (más webhelyről, letiltott fiók), 15 hibás törzs 400, nem vásárló és
    a fotós 403, a később elrejtett kép 404, a rejtett képet látó admin 409; a rejtett karakterek és
    az üres sorok kimaradnak, az emojik épek, a tárolt és a visszaadott szöveg egyezik; 6 párhuzamos
    írásból egy; a lista sorrendje, átlaga, fejlécei, a rejtett kép listája csak a tulajdonosnak és
    az adminnak; a profil átlaga a rejtett kép értékelése nélkül; a törlés jogosultságai; nincs
    e-mail, szerepkör, tiltás, jelszó-hash a válaszokban, a napló érvényes JSON, véleményszöveg és
    e-mail nélkül;
  - fuzz-próba: 3 visszajátszható mag × ~765 kérés (a vevő, a nem vásárló és névtelen írás véletlen
    törzsekkel; lista, törlés, profil véletlen azonosítókkal és query-kkel) – 0 eltérés, 0 hibasor a
    naplóban; a 191 elfogadott értékelés tárolt szövegében egyszer sem maradt vezérlő-, írásirány-
    váltó, rejtett vagy hibás karakter, sem kettőnél több üres sor (`L15_29`). A fuzz-script első
    változata maga hibázott (párosítatlan helyettesítő karakter került a véletlen URL-be) – javítva;
  - titokkeresés mintákkal (a `.env` megnyitása nélkül): 0 gyanús találat, 0 tiltott fájl; a `.env`
    fájlok gitignore-ban; láthatatlan karakter a 20 szöveges fájlban: 0 (`L15_30`); 955 teszt,
    lefedettség 99,8 / 98,72 / 100 / 99,93 %.
- Képek:

  | Kép                                              | Forrás                                                                                               | Tartalom                                                                                       |
  | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
  | `L15_01_tesztek_piros.png`                       | `npx vitest run --project unit …` és `--project db …` (mentett kimenet)                              | TDD piros fázis: 7 unit- és 25 végponttest bukik, 2 tesztfájl be sem töltődik                  |
  | `L15_02_unit_tesztek_zold.png`                   | `npx vitest run --project unit src/lib/text.test.ts src/modules/reviews --reporter=verbose`          | szövegszabályok, séma, DTO, átlag (55 teszt)                                                   |
  | `L15_03_ertekelesek_tesztek_zold.png`            | `npx vitest run --project db tests/db/reviews.test.ts --reporter=verbose`                            | lista, írás, törlés, láthatóság, versenyhelyzetek, napló (32 teszt, az audit 2 újával)         |
  | `L15_04_profil_tesztek_zold.png`                 | `npx vitest run --project db tests/db/users.test.ts --reporter=verbose`                              | a profil, benne az átlag (21 teszt)                                                            |
  | `L15_05_teljes_csomag_lefedettseg.png`           | `npx vitest run --coverage` (mentett kimenet)                                                        | 955 teszt (az audit után); az L15 fájljai mind 100 %                                           |
  | `L15_06_lint_typecheck_build.png`                | `npm run lint`, `npm run typecheck`, `npm run build`                                                 | hibátlan kódellenőrzés és fordítás                                                             |
  | `L15_07_atnezes_piros.png`                       | `npx vitest run …` (mentett kimenet)                                                                 | az első átnézési kör új tesztjei a javítás előtt                                               |
  | `L15_08_atnezes2_piros.png`                      | `npx vitest run …` (mentett kimenet)                                                                 | a második kör 4 tesztje a javítás előtt                                                        |
  | `L15_09_ertekeles_irasa.png`                     | `server/src/modules/reviews/reviews.service.ts`, `create` (105–133. sor)                             | nem látható 404, saját kép 403, nem nyilvános 409, nem vásárló 403, ismételt 409               |
  | `L15_10_torles_jogosultsag.png`                  | `reviews.service.ts`, `remove` (135–167. sor)                                                        | szerző vagy admin; másnak 403 vagy 404; napló                                                  |
  | `L15_11_lista_atlaggal.png`                      | `reviews.service.ts`, `list` (79–103. sor)                                                           | az összesítés és az oldal egy pillanatképből                                                   |
  | `L15_12_atlag_kerekites.png`                     | `server/src/modules/reviews/reviews.rating.ts` (15–33. sor)                                          | az átlag az összegből, két tizedesre kerekítve                                                 |
  | `L15_13_bemeneti_sema.png`                       | `server/src/modules/reviews/reviews.schemas.ts` (18–45. sor)                                         | csillag 1–5; a szöveg szabályai és tisztítása                                                  |
  | `L15_14_rejtett_karakterek.png`                  | `server/src/lib/text.ts` (68–104. sor)                                                               | a teljes emoji-sorozatok maradnak, a rejtett karakterek nem; üres sorok                        |
  | `L15_15_utvonalak.png`                           | `server/src/modules/reviews/reviews.routes.ts` (17–40. sor)                                          | `mergeParams`, `optionalAuth`, `noStore`                                                       |
  | `L15_16_profil_atlag.png`                        | `server/src/modules/users/users.service.ts`, `getProfile` (42–56. sor)                               | a nyilvános képek értékeléseinek átlaga                                                        |
  | `L15_17_teszt_nem_vasarlo.png`                   | `server/tests/db/reviews.test.ts` (376–391. sor)                                                     | nem vásárló, illetve függő, lejárt, sikertelen rendelés: 403                                   |
  | `L15_18_teszt_parhuzamos.png`                    | `server/tests/db/reviews.test.ts` (439–449. sor)                                                     | 5 párhuzamos kérésből egy értékelés                                                            |
  | `L15_19_regisztracio_es_fizetes_szimulalasa.png` | psql (TEST adatbázis)                                                                                | REGISTERED és két PAID rendelés SQL-lel                                                        |
  | `L15_20_ertekeles_letrehozasa.png`               | `curl … POST /api/photos/:id/reviews`                                                                | 201 szöveggel (az üres sorok összevonva) és csak csillaggal                                    |
  | `L15_21_tiltott_nem_vasarlo_403.png`             | `curl …` (nem vásárló, a fotós, névtelen)                                                            | 403, 403, 401                                                                                  |
  | `L15_22_ismetelt_es_hibas_ertekeles.png`         | `curl …`                                                                                             | ismételt értékelés 409 `ALREADY_REVIEWED`; hibás törzs 400                                     |
  | `L15_23_ertekelesek_listaja.png`                 | `curl … GET /api/photos/:id/reviews`                                                                 | a legújabb elöl, átlag 4,5, meta                                                               |
  | `L15_24_fotos_profil_atlag.png`                  | `curl … GET /api/users/:id`                                                                          | `rating: { average: 4.5, count: 2 }`                                                           |
  | `L15_25_ertekeles_torlese.png`                   | `curl … DELETE /api/reviews/:id`                                                                     | idegennek 403, a szerzőnek 204, ismét 404; az átlag 4                                          |
  | `L15_26_szervernaplo.png`                        | `node dist/server.js` (mentett, szűrt napló)                                                         | a kérések, a jogosulatlan kísérletek, a törlés (szerző)                                        |
  | `L15_27_audit_mutacios_proba.png`                | `node mutation-check-l15.mjs` (jegyzetmappa)                                                         | 43/45, a két tesztlyuk pótlása után az írás 8/8 rontása – összesen 45 különböző, mind megfogva |
  | `L15_28_audit_fekete_doboz.png`                  | `node audit-l15-live.mjs` (a lefordított, éles módú szerveren)                                       | 43/43 ellenőrzés                                                                               |
  | `L15_29_audit_fuzz.png`                          | `node audit-l15-fuzz.mjs <napló> 1 \| 2 \| 3`                                                        | 3 × ~765 véletlen kérés – 0 eltérés; 191 elfogadott értékelés tiszta szöveggel                 |
  | `L15_30_audit_telepites_titkok.png`              | `npm ci`, `npm audit`, lint, typecheck, build, coverage, `secret-scan-l15.mjs`, `find-invisible.mjs` | 0 sebezhetőség, 955 teszt, 0 titok, 0 láthatatlan karakter                                     |

- Commit: `a305b66` – `feat(L15): értékelések API – lista, írás (csak vásárló), törlés, fotós átlaga`

## L16 – Admin API (2026-10-06)

- Elkészült (`server/`):
  - `modules/admin/` – az `/api/admin` útvonalak, mind csak bejelentkezett, nem letiltott adminnak
    (`noStore` → `requireAuth` → `requireRole('ADMIN')`; névtelenül 401, másnak 403): felhasználók
    listája (lapozás, keresés e-mailre és névre, tiltási szűrő) és tiltása / feloldása; képek listája
    állapot szerint, elrejtése és visszaállítása; a `CHAIN_FAILED` lánc-regisztráció újrapróbálása
    (`202`, adminonként korlátozva: `CHAIN_RETRY_RATE_LIMIT_MAX`, alapból 10); statisztika
    (felhasználók, képek és rendelések állapotonként, bevétel, láncon regisztrált hash-ek – egy
    adatbázis-pillanatképből);
  - `photos.visibility.ts` – a láthatóság közös szabálya (`PUBLIC_PHOTO_WHERE`, `isPublic`,
    `canView`): nyilvános a regisztrált kép, ha a fotósa nincs letiltva; minden modul ezt használja
    (galéria, adatlap, letöltés, vásárlás, értékelések és átlagok, profil, hitelesség-ellenőrző,
    feltöltés 409-es válasza);
  - `photos.hiding.ts` és két migráció – `photos.hiddenBy` (`OWNER`, `ADMIN`, `OWNER_AND_ADMIN`; CHECK:
    elrejtett képnél kötelező, másnál üres): ki rejtette el a képet; `photos.restore.ts` – az admin
    levételének feloldása, a nyilvános fájlok újragenerálása az eredetiből;
  - `orders.service.ts` – `closeOpenCheckouts`: elrejtéskor és tiltáskor a nyitott Stripe
    Checkout-munkamenetek lejárnak (`payment.service.ts`: `expireCheckoutSession`); az induló fizetés
    a rendelés beszúrása után újra ellenőrzi a képet és a vevőt;
  - `lib/search.ts` (a keresés közös ILIKE-feltétele), `lib/schemas.ts` (`searchQueryText`); egyetlen
    közös képkatalógus (`app.ts`);
  - dokumentáció: README „Adminisztráció (L16)” (és az L14-es letöltési szabály),
    `server/http/admin.http`, `.env.example` (`CHAIN_RETRY_RATE_LIMIT_MAX`), FORRASOK 139–146.
- Eredmények: 1076/1076 teszt (L15 végén: 955); TDD: előbb bukó tesztek (`L16_01`: 96 bukó teszt, 5
  tesztfájl be sem töltődik); lefedettség 99,83 / 98,88 / 100 / 99,93 % (az L16-ban új vagy módosított
  fájlok mind 100 %); lint, typecheck, build és a formázás hibátlan.
- Élő próba a lefordított szerverrel a **tesztadatbázison**, blokklánc és Stripe nélkül: két saját
  fotó feltöltése (a lezárt RPC-port miatt `CHAIN_FAILED`), az egyik regisztrációját és egy vevő
  kifizetett rendelését SQL szimulálja (`L16_19`); statisztika (`L16_20` – a terv képe); nem admin 403,
  névtelen 401 (`L16_21`); felhasználólista (`L16_22`); tiltás: 200, a fotós következő kérése 403, az
  admin nem tiltható (409), a `role` mező 400 (`L16_23`); tiltás alatt üres a galéria, a profil 404, a
  vevő letöltése 200 (`L16_24`); feloldás után minden visszajön (`L16_25`); elrejtés (`ADMIN`, az
  adatlap 404) és visszaállítás (`REGISTERED`, az előnézet újra elérhető – 200) (`L16_26`); a
  tulajdonos saját elrejtése után a visszaállítás 409 (`L16_27`); a `CHAIN_FAILED` kép újrapróbálása
  202 (`L16_28`); szervernapló (`L16_29` – ki, kit, mit; e-mail-cím nélkül).
- A szerző döntései:
  - **Letiltott felhasználó tartalma:** a tiltás idejére eltűnik (lekérdezéskor szűrve), a feloldás
    után visszajön; semmi nem törlődik, a vásárlók letöltése megmarad;
  - **Visszaállítás:** csak az admin által elrejtett kép állítható vissza – a tulajdonos döntését az
    admin nem írja felül (új mező: `hiddenBy`);
  - **Nyitott fizetések:** elrejtéskor és tiltáskor lezárulnak (Stripe expire); ha a Stripe nem érhető
    el, az elrejtés és a tiltás akkor is megtörténik, a hiba a naplóba kerül;
  - **Moderátori levétel és letöltés** (az első átnézés nyomán): amíg a kép az admin által levett, a
    vásárló sem töltheti le az eredetit (a tulajdonos igen); a tulajdonos elrejtésénél és a letiltott
    fotósnál a letöltés megmarad (L14-es szabály).
- Megvalósítási döntések menet közben: adminisztrátor – a saját fiók is – nem tiltható le (409; szerepkört az
  API nem módosít); a felhasználólista keresése és tiltási szűrője; az újrapróbálás válasza `202` és a
  kép `PENDING_CHAIN` állapota (a regisztráció a háttérben fut); a letiltott fotós regisztrációra
  váró képeihez nem megy ki tranzakció, és nem is próbálhatók újra (409) – a feloldás után a szerver
  időszakos folytatása (10 percenként) lezárja őket; a tulajdonos és az admin elrejtése független
  (`OWNER_AND_ADMIN`, lásd a 2. kört); az elrejtés feltételes írás, a közben változott képet
  újraolvassa (legfeljebb 3-szor, utána 409); a visszaállítás képfeldolgozása sorban fut.
- A korábbi lépések tesztjei közül néhány a döntések miatt változott: a letiltott fotós képei (L13
  galéria) és profilja (L13) a tiltás idejére nem látszanak; a letiltott tulajdonos a saját nem
  nyilvános képét sem látja; a teszteken belüli közvetlen `HIDDEN` írások `hiddenBy`-t is kapnak (a
  CHECK miatt).
- Független kódátnézés (TypeScript és biztonság párhuzamosan):
  - 1. kör: nincs CRITICAL vagy HIGH; 4 MEDIUM, javítva, előbb bukó teszttel (`L16_07`): (1) a
       fizetés indítása és az egyidejű elrejtés / tiltás versenyhelyzete fizethető munkamenetet hagyhatott
       → újraellenőrzés a rendelés beszúrása után (mindkét átnéző jelezte); (2) az elrejtés a Stripe-hívások
       után törölte a nyilvános fájlokat, és az ő hibájuk ki is hagyta → a két lépés független; (3) két
       egyidejű visszaállítás közül az egyik törölhette a már nyilvános kép fájljait → foglalás a beolvasás
       előtt, takarítás csak a még rejtett képen; (4) a visszaállítások párhuzamos képfeldolgozása kifuttathatta
       a memóriát → sor. LOW-ok javítva: a visszaállítás írási hibájánál is takarítás; a lezárás közben
       csatolt munkamenet és a gazdátlan munkamenet is lejár; a Stripe-hívások korlátozott párhuzamossága;
       a letiltott tulajdonos képéhez nem megy ki tranzakció; kódismétlés és típus; az INFO
       „moderátori levétel és letöltés” a szerző döntésével zárult (fent);
  - 2. kör (csak a javításokra): **HIGH / MEDIUM** (mindkét átnéző): a tulajdonos a saját elrejtésével
       felülírhatta az admin levételét (`ADMIN` → `OWNER`), így a vásárlók újra letölthették volna a
       levett képet; a tulajdonos által elrejtett képen pedig az admin nem tudott levételt rögzíteni →
       `OWNER_AND_ADMIN` (új migráció; a két döntés független, egyik fél sem szünteti meg a másikét; az
       admin feloldása után a kép a tulajdonos döntése szerint rejtett marad), bukó teszttel (`L16_08`).
       LOW-ok javítva: a letiltott fotós ellenőrzése a küldés előtti utolsó lépésben is; az újrapróbálás a
       letiltott fotós képére 409; a takarítás olvasási hibánál is töröl; minden lezárási hiba a naplóba
       kerül, és egyik sem hagyja félbe a többit; a Stripe-hívások korlátja az egész szolgáltatásra érvényes;
       a vevő a valódi okot kapja (404 / 403) a „próbáld újra” 409 helyett; az újraellenőrzés olvasási
       hibájánál a rendelés lezárul. Ezeknek a LOW-oknak egy részét (hibakódok, naplózás, újrapróbálás,
       olvasási hiba, az elrejtés újraolvasása) a kóddal egy menetben írt tesztek fedik – hogy a javítás
       nélkül buknak-e, a commit előtti mutációs próba igazolja;
  - 3. kör (szűk ellenőrzés a levételi modellre): nincs MEDIUM vagy súlyosabb; 2 LOW javítva teszttel
       (ha az írás lefutott, de a válasza elveszett, a már nyilvános kép fájljai megmaradnak; az
       újrapróbálás kisbetűs azonosítóval), 1 elfogadva (kétszeres naplósor a lezárási hibánál);
  - elfogadva, nem javítva: a korábban látott `/media` URL-ek a letiltott fotós képeinél tovább
    működnek (UUID – nem kitalálható; a valódi levétel az elrejtés); ha egy admin ugyanakkor rejti el a
    képet, amikor egy másik visszaállítja, a nyilvános fájlok hiányozhatnak (egy újabb elrejtés és
    visszaállítás rendbe teszi); a Stripe hibája után nyitva maradt munkamenet legfeljebb 31 percig
    fizethető (nincs időszakos takarító); a lezárás előtt már kifizetett munkamenet `PAID` lesz (kézi
    visszatérítés); a hitelesség-ellenőrző a rejtett és a letiltott fotósú kép lánc-bizonyítékát (tx
    hash) kiadja – nyilvános láncadat.
- Az ellenőrzés közben talált hibák: az `admin.access` tesztben az elrejtés az újrapróbálás előtt
  futott, majd a tiltás is (mindkettő után helyesen 409) – a hívássorrend javítva; egy közvetlen
  `HIDDEN` írás kimaradt egy tesztből; a lefedettségi kép szűrője a táblázat rövidített („…”)
  fájlneveit nem ismerte fel; a teljes csomag egy futásában a `restrictImageDecoders` unit-tesztje
  terhelés alatt túllépte az 5 másodpercet (egyedül és a további futásokban zöld).
- Ismert korlátok, későbbre: L22 – a tulajdonos vezérlőpultján jelezni, ha a képét a moderátor vette
  le (most csak a `HIDDEN` állapot látszik); L25 – az admin felület ezekre a végpontokra épül; L28 –
  E2E-ben a `CHAIN_RETRY_RATE_LIMIT_MAX`; L30 – időszakos takarító a lezáratlan fizetésekhez, az
  újrapróbálások teljes (nem adminonkénti) gázkerete, a szerepkör a tiltás feltételében (mélységi
  védelem); L32 – több szerverpéldánynál a visszaállítás foglalása és a Stripe-sor példányonkénti
  (adatbázis-zár kellene), a `/media` gyorsítótár ürítése levételkor.
- Képek:

  | Kép                                              | Forrás                                                                                    | Tartalom                                                                                      |
  | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
  | `L16_01_tesztek_piros.png`                       | `npx vitest run` (mentett kimenet)                                                        | TDD piros fázis: 96 bukó teszt, 5 tesztfájl be sem töltődik                                   |
  | `L16_02_unit_tesztek_zold.png`                   | `npx vitest run --project unit src/modules/admin … --reporter=verbose`                    | láthatóság, elrejtési szabályok, sémák, DTO-k, statisztika, keresés, Stripe expire (38 teszt) |
  | `L16_03_admin_tesztek_zold.png`                  | `npx vitest run --project db tests/db/admin.*.test.ts --reporter=verbose`                 | hozzáférés, felhasználók, képek, visszaállítás, újrapróbálás, statisztika (58 teszt)          |
  | `L16_04_tiltas_fizetes_tesztek_zold.png`         | `npx vitest run --project db tests/db/moderation.test.ts tests/db/orders.close.test.ts …` | a letiltott felhasználó tartalma, a nyitott fizetések lezárása, versenyhelyzetek (27 teszt)   |
  | `L16_05_teljes_csomag_lefedettseg.png`           | `npx vitest run --coverage` (mentett kimenet)                                             | 1076 teszt; az L16 fájljai mind 100 %                                                         |
  | `L16_06_lint_typecheck_build.png`                | `npm run lint`, `npm run typecheck`, `npm run build`                                      | hibátlan kódellenőrzés és fordítás                                                            |
  | `L16_07_atnezes_piros.png`                       | `npx vitest run …` (mentett kimenet)                                                      | az első átnézési kör 12 új tesztje a javítás előtt                                            |
  | `L16_08_atnezes2_piros.png`                      | `npx vitest run …` (mentett kimenet)                                                      | a második kör 12 új tesztje (és az új modul) a javítás előtt                                  |
  | `L16_09_admin_utvonalak.png`                     | `server/src/modules/admin/admin.routes.ts` (37–78. sor)                                   | csak adminnak; az újrapróbálás adminonkénti korlátja                                          |
  | `L16_10_lathatosag_tiltott_fotos.png`            | `server/src/modules/photos/photos.visibility.ts` (30–48. sor)                             | a nyilvános kép: regisztrált, a fotósa nincs letiltva                                         |
  | `L16_11_tiltas.png`                              | `server/src/modules/admin/admin.users.ts`, `setBlocked` (81–105. sor)                     | admin nem tiltható; napló csak valódi változásnál; a nyitott fizetések lezárása               |
  | `L16_12_elrejtes_szabalyai.png`                  | `server/src/modules/photos/photos.hiding.ts` (1–36. sor)                                  | a tulajdonos és az admin döntése független (`OWNER_AND_ADMIN`)                                |
  | `L16_13_visszaallitas.png`                       | `server/src/modules/photos/photos.restore.ts`, `restoreHidden` (154–170. sor)             | fájlok előbb, feltételes írás, takarítás                                                      |
  | `L16_14_fizetesek_lezarasa.png`                  | `server/src/modules/orders/orders.service.ts`, `closeCheckout` (348–369. sor)             | a munkamenet lejár; a munkamenet nélküli rendelés FAILED                                      |
  | `L16_15_statisztika.png`                         | `server/src/modules/admin/admin.stats.ts`, `platformStats` (51–80. sor)                   | egy pillanatképből: darabszámok, bevétel, láncon lévő hash-ek                                 |
  | `L16_16_migracio_hiddenby.png`                   | `server/prisma/migrations/20261006090000_photo_hidden_by/migration.sql` (1–19. sor)       | új oszlop, visszatöltés, CHECK                                                                |
  | `L16_17_teszt_nem_admin_403.png`                 | `server/tests/db/admin.access.test.ts` (101–112. sor)                                     | minden admin végpont: nem adminnak 403, semmi nem változik                                    |
  | `L16_18_teszt_tiltott_galeria.png`               | `server/tests/db/moderation.test.ts` (131–148. sor)                                       | a letiltott fotós képei eltűnnek, a feloldás után visszajönnek                                |
  | `L16_19_regisztracio_es_fizetes_szimulalasa.png` | psql (TEST adatbázis)                                                                     | REGISTERED és egy PAID rendelés SQL-lel                                                       |
  | `L16_20_statisztika.png`                         | `curl … GET /api/admin/stats`                                                             | a statisztika-válasz (a terv képe)                                                            |
  | `L16_21_nem_admin_403.png`                       | `curl …` (nem admin, névtelen)                                                            | 403, 401, 403                                                                                 |
  | `L16_22_felhasznalok_listaja.png`                | `curl … GET /api/admin/users?pageSize=3`                                                  | e-mail, szerepkör, tiltás, képek száma; meta                                                  |
  | `L16_23_tiltas.png`                              | `curl … PATCH /api/admin/users/:id`                                                       | tiltás 200, a fotós kérése 403, admin tiltása 409, `role` mező 400                            |
  | `L16_24_tiltott_tartalom_rejtve.png`             | `curl …` (galéria, profil, letöltés)                                                      | üres galéria, profil 404, a vevő letöltése 200                                                |
  | `L16_25_feloldas.png`                            | `curl …`                                                                                  | feloldás után a kép újra a galériában                                                         |
  | `L16_26_elrejtes_es_visszaallitas.png`           | `curl … PATCH /api/admin/photos/:id`                                                      | `HIDDEN` / `ADMIN`, adatlap 404; visszaállítás `REGISTERED`, az előnézet 200                  |
  | `L16_27_tulajdonos_elrejtese_409.png`            | `curl …` (a tulajdonos elrejti, az admin visszaállítaná)                                  | 204, majd 409                                                                                 |
  | `L16_28_ujraprobalas.png`                        | `curl … POST /api/admin/photos/:id/retry-registration`                                    | a `CHAIN_FAILED` kép listája, újrapróbálás 202                                                |
  | `L16_29_szervernaplo.png`                        | `node dist/server.js` (mentett, szűrt napló)                                              | tiltás, feloldás, elrejtés, visszaállítás, újrapróbálás – a végrehajtó azonosítójával         |

- Commit: `5c64863` – `feat(L16): admin API – felhasználók tiltása, képek elrejtése és visszaállítása, újrapróbálás, statisztika`

## L17 – UI-design: drótvázak és stílusútmutató (2026-10-08)

- Elkészült:
  - `docs/design/theme.css` – a design tokenek egyetlen forrása (Tailwind CSS v4 `@theme`):
    fekete-fehér paletta egyetlen piros kiemelőszínnel, zöld `trust` skála (kizárólag a blokkláncon
    igazolt hitelesség), borostyán `caution` skála (folyamatban, figyelmet kér), szerepalapú nevek
    (`canvas`, `surface`, `fg`, `fg-muted`, `line`, `line-strong`, `primary`, `on-primary`, `danger`,
    `focus` …); Inter és JetBrains Mono; sarkok, kártyaárnyék; a helykitöltő szöveg színe;
  - `tools/design/contrast.mjs` – a WCAG 2.2 relatív fénysűrűsége és kontrasztaránya; a tokenek
    beolvasása (a hivatkozások feloldása, a körkörös és a kettős deklaráció hiba); 19 előírt
    szín-páros (szöveg 4,5:1, felületi elem 3:1); parancssori táblázat (`npm run design:check`);
  - `tools/design/styleguide.mjs` és `styleguide.components.mjs` – a stílusútmutató
    (`docs/design/stilusutmutato.html`) generálása a témából: színminták, kontraszttáblázat,
    tipográfia, formák, a bizalom vizuális nyelve (állapot → ikon → szín → szöveg) és a komponensek
    (gombok, mezők hibaállapottal, állapotjelvények, értesítések, fotókártya, blokklánc-tanúsítvány,
    értékelés, nézetváltó és lapozó, megerősítő párbeszédablak, fejléc, üres állapot);
  - hat reszponzív drótváz (`docs/design/drotvazak/`): galéria, adatlap, feltöltés, ellenőrzés,
    vezérlőpult, admin – lo-fi, szürkeárnyalatos, számozott jegyzetekkel és Nielsen-heurisztika
    jelöléssel ([H1]–[H10]);
  - `docs/design/README.md` – a UI-terv: elvek (Nielsen), WCAG 2.2 AA táblázat, tokenek,
    tipográfia, komponenslista, a bizalom vizuális nyelve, képernyők és API-hívások, a drótvázakhoz
    szükséges API-bővítések, a tokenek használata a kliensben (L18);
  - `tools/screenshot/render.mjs` – a `html` mód 500 px alatt egy ekkora iframe-be teszi az oldalt
    (a fej nélküli Edge ablaka nem lehet ennél keskenyebb, a mobilnézet jobbra kilógott);
  - gyökér `package.json`: `design:test` (az `npm test` első lépése), `design:check`,
    `design:styleguide`; `.prettierignore` (a generált stílusútmutató); README, FORRASOK 147–155.
- Eredmények: 22/22 teszt (Node beépített tesztfuttatója; ebből 3 az auditban került be); TDD: előbb bukó tesztek (`L17_01`: a
  modul még nem létezett); mind a 19 szín-páros eléri a WCAG AA szintet (a legszűkebbek: a
  hitelesítve jelvény 4,79:1, a folyamatban jelvény 4,84:1); a stílusútmutató frissességét teszt
  ellenőrzi (betűre egyezik a témából generált változattal); a Prettier-ellenőrzés tiszta; a
  böngészőben mind a hét lapon minden ikon feloldódik, nincs ismétlődő azonosító és hiányzó
  ARIA-hivatkozás.
- A szerző döntései: HTML-drótvázak a repóban – a terv Figma/Excalidraw [S55] eszköze
  helyett (verziókezelhető, a képgenerátorral lefényképezhető, a stílusútmutatóval közös
  Tailwind-alapon); fekete-fehér, minimalista arculat egyetlen piros kiemelőszínnel; Inter +
  JetBrains Mono; egyelőre csak világos téma.
- Megvalósítási döntések menet közben: a zöld kizárólag a blokkláncon igazolt hitelességet jelenti (a
  sikeres fizetés, mentés semleges); a piros egyben hibaszín, ezért a hiba mindig ikon + szöveg, a
  veszélyes gomb körvonalas; fekete csillag; a „nincs a nyilvántartásban” semleges; lo-fi drótváz +
  hi-fi stílusútmutató; a stílusútmutató generált és tesztelt (a téma az egyetlen forrás); javasolt
  oldalméret 24 (a 2, 3 és 4 oszlopos rács is teli sorokkal zárul); a vezérlőpult nézetváltója
  hivatkozássor (URL-hez kötött), az ellenőrzésé WAI-ARIA fülsor; egyetlen, állandó élő régió.
- Független átnézés (akadálymentesség és kód párhuzamosan):
  - 1. kör – akadálymentesség: 3 HIGH (a fülek hiányos ARIA-mintája; a csillagos értékelés bevitele
       kapcsológombokból; az állapotüzenetek bejelentése – WCAG 4.1.3), 7 MEDIUM (letiltott és
       folyamatban lévő állapot, a menüpont csak színnel jelölve, az értékelés jelentése
       képernyőolvasónak, a fotókártya hivatkozása és alt-szabálya, ismétlődő gombnevek, a szűrők
       állapota, ál-táblázat a vezérlőpulton) és több LOW (README-állítások, nem használt `-600` tokenek,
       a helykitöltő színe, görgethető táblázat) – mind javítva; kód: nincs CRITICAL vagy HIGH; 2 MEDIUM
       (a drótvázak olyan adatot mutattak, amelyet az API nem ad → README „API-bővítések” táblázat és
       jegyzetek; a kétszer deklarált token csendben felülírta az elsőt → hiba, bukó teszttel `L17_02`)
       és LOW-ok (mindig igaz tesztállítás; sorvégi szóköz a generált lapon – bukó teszttel; README- és
       drótváz-szöveg) – javítva;
  - 2. kör (a javításokra): kód – elfogadva, 2 LOW szóhasználat (hiányzó és függő tranzakció) javítva;
       akadálymentesség – nincs HIGH; 2 MEDIUM javítva (a statikus `aria-modal` párbeszéd-makett
       VoiceOveren elrejtené a lap többi részét → natív `<dialog open>`; a fiókgomb neve nem tartalmazta
       a látható „FN”-t → `FN – fiókmenü`), a LOW-ok is (a jegyzetjelek `aria-hidden`, href nélküli
       `aria-disabled` hivatkozás, `aria-busy` helyett felirat és élő régió, keresőcímkék, a hash-mező
       súgója, 2.5.3 és 2.5.8 a README-ben, a minták navigációja „(minta)” névvel);
- Az ellenőrzés közben talált hibák: a 390 px-es mobilkép kilógott (`render.mjs` iframe); az
  admin mobilnézetében a 40rem-es táblázat kifeszítette a rácsoszlopot (`min-w-0`); a jelvények
  tördelődtek; a galéria találatszáma ütközött az admin-statisztikával; a vásárlások között saját
  kép szerepelt; az API szerint a sikertelen regisztrációt csak az admin próbálhatja újra, és a
  tulajdonos elrejtése végleges (a szövegek ehhez igazítva); a kódképnél a `--symbol` a tömb első
  sora után megállt (sortartomány), a hosszú sablonsor levágódott (`BADGE` állandó).
- Audit a commit előtt (segédscriptek a munkamappában):
  - mutációs próba: 31 célzott rontás a WCAG-képletben, a tokenek beolvasásában, az előírt
    párosokban, a téma színeiben és a generátorban; az első futáson 28/31 (`L17_26`) – 3 tesztrés:
    a sötét tartomány lineáris ága (csatorna ≤ 10) és a színcsatornák súlya nem volt pontos
    értékkel rögzítve, a minimummal pontosan egyező arányra (≥) nem volt teszt. A kód helyes volt;
    3 új teszt (a közismert piros 4,00:1, kék 8,59:1, zöld 1,37:1 fehéren; #0a0a0a 19,80:1; a
    határérték) → 31/31 (`L17_27`–`L17_29`);
  - véletlenszerű próba (kezdőértékkel reprodukálható, két kezdőértékkel): szimmetria és tartomány,
    „minden színnek ≥ 4,58:1 a fehérrel vagy a feketével”, szürkeskála-monotonitás, egy független
    (a WCAG 2.0 0,03928-as küszöbével, más kódúton írt) megvalósítás – a 19 előírt páros két
    tizedesre egyezik –, véletlen hivatkozási gráfok és körök, HTML-escape, rosszindulatú leírás a
    stílusútmutatóban → 9/9 (`L17_30`). A próbagenerátor első változata a blokk közepén is elhagyta a
    pontosvesszőt – CSS-ben ez a következő deklarációt is az értékhez fűzi, a beolvasó helyesen
    hibát jelzett; a generátor javítva;
  - feketedobozos akadálymentesség: Lighthouse 13.4.1 mind a 7 lapon – akadálymentesség 100, best
    practices 100 (`L17_31`);
  - a `render.mjs` keskeny nézete próbalappal: 390 és 499 px-nél (iframe) a lap valóban ilyen széles,
    nem lóg ki, a médialekérdezés a mobil ágra vált, az ékezetek és az entitások épek; 500 és 800
    px-nél (közvetlen ablak) a betöltéskor mért szélesség kisebb, de a kép az átméretezés utáni,
    pontos állapotot rögzíti (`L17_33`, `L17_34`);
  - statikus ellenőrzés a változásokon (a `.env` megnyitása nélkül, mintákkal): nincs titok, tiltott
    fájl, láthatatlan karakter, hibás relatív hivatkozás vagy 800 sornál hosszabb forrás; az
    e-mail-címek csak csomagverziók és a drótvázak kitalált `@pelda.hu` címei (`L17_32`). Az első
    változat a módosított napló korábbi, nyilvános Sepolia-tranzakció-hash-eit is jelezte – csak a
    hozzáadott sorokat vizsgálva nincs találat;
  - elfogadva: a Lighthouse `meta-description`, `robots-txt` és `llms-txt` ellenőrzése bukik a helyi
    dokumentációs lapokon (a kliensnél L18, a telepítésnél L31 számít); a CDN-ről töltött
    csomagoknak nincs integritás-ellenőrzése (SRI) – csak a dokumentációs lapok használják őket, a
    kliens saját maga szolgálja ki a betűket és az ikonokat.
- Ismert korlátok, későbbre: L18 – a téma importja a kliensbe (vagy áthelyezése a `client/` alá,
  ha a Docker-build csak azt látja), saját hosztolású betűk, `lucide-react`; L20–L24 – a README
  „API-bővítések” táblázata (értékelés a listában, nézői jelzők, a tulajdonos `chainTxHash`-e és
  `hiddenBy`-a, a rendelés bővítése); sötét téma később (csak a szerepalapú tokeneket kell
  felülírni); a mobil drótvázképek az oldal első 1600 px-ét mutatják.
- Képek:

  | Kép                                    | Forrás                                                                                 | Tartalom                                                                                               |
  | -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
  | `L17_01_tesztek_piros.png`             | `node --test "tools/design/*.test.mjs"` (mentett kimenet)                              | TDD piros fázis: a `contrast.mjs` még nem létezik                                                      |
  | `L17_02_atnezes_piros.png`             | `node --test "tools/design/*.test.mjs"` (mentett kimenet)                              | az átnézés 3 új tesztje a javítás előtt: megjegyzés és pontosvessző, kettős deklaráció, sorvégi szóköz |
  | `L17_03_tesztek_zold.png`              | `npm run design:test`                                                                  | 22/22 teszt                                                                                            |
  | `L17_04_kontraszt_ellenorzes.png`      | `npm run design:check`                                                                 | a 19 szín-páros aránya, mind megfelel                                                                  |
  | `L17_05_tema_tokenek.png`              | `docs/design/theme.css` (21–76. sor)                                                   | a paletta és a szerepalapú nevek                                                                       |
  | `L17_06_kontrasztarany.png`            | `tools/design/contrast.mjs` (62–80. sor)                                               | a WCAG 2.2 relatív fénysűrűsége és kontrasztaránya                                                     |
  | `L17_07_eloirt_parosok.png`            | `tools/design/contrast.mjs` (17–46. sor)                                               | az előírt párosok (4,5:1 és 3:1)                                                                       |
  | `L17_08_tokenek_beolvasasa.png`        | `tools/design/contrast.mjs`, `readColorTokens` (88–115. sor)                           | hivatkozások feloldása; körkörös és kettős deklaráció                                                  |
  | `L17_09_allapotjelveny.png`            | `tools/design/styleguide.components.mjs` (117–129. sor)                                | állapotjelvény: ikon + szöveg + szín                                                                   |
  | `L17_10_teszt_tema_aa.png`             | `tools/design/contrast.test.mjs` (161–183. sor)                                        | a valódi téma minden párosa eléri az AA szintet                                                        |
  | `L17_11_teszt_frissesseg.png`          | `tools/design/styleguide.test.mjs` (68–74. sor)                                        | a stílusútmutató a témából generált változat                                                           |
  | `L17_12_keskeny_nezet.png`             | `tools/screenshot/render.mjs` (415–446. sor)                                           | mobilnézet: 500 px alatt iframe                                                                        |
  | `L17_13_stilusutmutato.png`            | `render.mjs html --file docs/design/stilusutmutato.html --width 1440 --height 8316`    | a teljes stílusútmutató                                                                                |
  | `L17_14_drotvaz_galeria.png`           | `render.mjs html --file docs/design/drotvazak/galeria.html --width 1440 --height 1699` | galéria, asztali nézet, jegyzetekkel                                                                   |
  | `L17_15_drotvaz_galeria_mobil.png`     | ugyanaz, `--width 390 --height 1600`                                                   | galéria, mobilnézet                                                                                    |
  | `L17_16_drotvaz_adatlap.png`           | `… adatlap.html --width 1440 --height 1945`                                            | adatlap: előnézet, vásárlás, tanúsítvány, értékelések                                                  |
  | `L17_17_drotvaz_adatlap_mobil.png`     | `… adatlap.html --width 390 --height 1600`                                             | adatlap mobilon, alul rögzített vásárlássáv                                                            |
  | `L17_18_drotvaz_feltoltes.png`         | `… feltoltes.html --width 1440 --height 2103`                                          | feltöltés, a folyamat lépései, állapotok és a 409                                                      |
  | `L17_19_drotvaz_feltoltes_mobil.png`   | `… feltoltes.html --width 390 --height 1600`                                           | feltöltés mobilon                                                                                      |
  | `L17_20_drotvaz_ellenorzes.png`        | `… ellenorzes.html --width 1440 --height 1635`                                         | ellenőrzés: VERIFIED, SIMILAR, NOT_FOUND, „Hogyan működik?”                                            |
  | `L17_21_drotvaz_ellenorzes_mobil.png`  | `… ellenorzes.html --width 390 --height 1600`                                          | ellenőrzés mobilon                                                                                     |
  | `L17_22_drotvaz_vezerlopult.png`       | `… vezerlopult.html --width 1440 --height 1764`                                        | saját képek állapotokkal, vásárlások, megerősítés                                                      |
  | `L17_23_drotvaz_vezerlopult_mobil.png` | `… vezerlopult.html --width 390 --height 1600`                                         | vezérlőpult mobilon (kártyalista)                                                                      |
  | `L17_24_drotvaz_admin.png`             | `… admin.html --width 1440 --height 1733`                                              | statisztika, felhasználók, képek, tiltás megerősítése                                                  |
  | `L17_25_drotvaz_admin_mobil.png`       | `… admin.html --width 390 --height 1600`                                               | admin mobilon (görgethető táblázatok)                                                                  |
  | `L17_26_audit_mutacio_elso.png`        | `node mutation-check-l17.mjs` (munkamappa, mentett kimenet)                            | audit: 31 rontásból 28-at fogtak meg a tesztek – 3 tesztrés                                            |
  | `L17_27_audit_uj_tesztek.png`          | `tools/design/contrast.test.mjs` (47–56. sor)                                          | az audit új tesztjei: a színcsatornák súlya, a sötét tartomány lineáris ága                            |
  | `L17_28_audit_hatarertek_teszt.png`    | `tools/design/contrast.test.mjs` (146–151. sor)                                        | az audit új tesztje: a minimummal pontosan egyező arány megfelel                                       |
  | `L17_29_audit_mutacio_vegso.png`       | `node mutation-check-l17.mjs` (mentett kimenet)                                        | a 3 új teszttel 31/31 rontást megfognak                                                                |
  | `L17_30_audit_veletlen_proba.png`      | `node audit-l17-fuzz.mjs 20261008` (mentett kimenet)                                   | 9 tulajdonság, kb. 72 000 véletlen eset, független megvalósítással összevetve                          |
  | `L17_31_audit_lighthouse.png`          | `node lighthouse-summary.mjs` (Lighthouse 13.4.1 jelentései)                           | mind a 7 lap akadálymentessége 100                                                                     |
  | `L17_32_audit_statikus.png`            | `node audit-l17-static.mjs` (mentett kimenet)                                          | nincs titok, tiltott fájl, láthatatlan karakter, hibás hivatkozás                                      |
  | `L17_33_audit_keskeny_nezet_390.png`   | `render.mjs html --file viewport-probe.html --width 390 --height 440` (munkamappa)     | a keskeny nézet: valóban 390 px, nem lóg ki, mobil médialekérdezés, ép escape                          |
  | `L17_34_audit_keskeny_nezet_800.png`   | ugyanaz, `--width 800 --height 330`                                                    | a közvetlen út: 800 px (betöltés után átméretezve), sm médialekérdezés                                 |

- Commit: `81a0f9f` – `feat(L17): UI-terv – design tokenek, generált stílusútmutató, hat drótváz, WCAG 2.2 kontrasztellenőrzés`

## L18 – Kliens projektváz: React + Vite, layout és UI-alapkomponensek (2026-10-08)

- Elkészült:
  - `client/` – a `create-vite` 9.2.1 sablonjából (react-ts, ESLint): React 19.3, TypeScript ~6.0.3,
    Vite 8.3, Tailwind CSS 4.3 (`@tailwindcss/vite`), React Router 8.4 (adat-mód), TanStack Query
    5.104, lucide-react, saját hosztolású betűk (`@fontsource-variable/inter`, `…/jetbrains-mono`);
    tesztek: Vitest 5 + jsdom + Testing Library + axe-core; `npm audit`: 0 sebezhetőség;
  - `vite.config.ts` – fejlesztői és preview proxy (`^/api(/|$)`, `^/media(/|$)` → 4000-es port),
    kötött 5173-as port (a szerver `APP_BASE_URL`-je erre mutat), Vitest-beállítás 80%-os küszöbbel;
  - `src/api/http.ts` – az egyetlen fetch-burkoló: relatív `/api` cím, `credentials: 'same-origin'`,
    JSON-törzs (GET-nél típusszinten sem), a szerver borítékából `ApiError` (státusz, kód, magyar
    üzenet, részletek, `Retry-After`); hálózati hiba → `NETWORK_ERROR` (0), a proxy boríték nélküli
    502/503/504-e → `SERVER_UNAVAILABLE`, egyéb → `UNEXPECTED_RESPONSE`; a megszakítás változatlanul
    továbbmegy; `health.api.ts` futásidejű ellenőrzéssel;
  - `src/lib/queryClient.ts` – újrapróbálás csak hálózati és 5xx hibánál (legfeljebb kétszer), a
    `Retry-After` szerinti vagy exponenciális várakozással (max. 30 s); `networkMode: 'always'`;
  - layout: ugrólink (ideiglenes `tabindex`, GOV.UK-minta), fejléc logóval és fő navigációval
    (`aria-current`), `main`, lábléc, egyetlen élő régió (7 s után kiürül), `ScrollRestoration`;
    oldalváltáskor a fókusz görgetés nélkül az új oldal címére kerül; oldalanként egyedi fülcím;
  - UI-alapkomponensek: `Button`/`ButtonLink` (4 változat, foglalt állapot `aria-disabled`-del),
    `TextField`, `StatusBadge`, `Alert`, `Card`, `PageHeading`, `Spinner`, `LiveRegion`/`useAnnounce`;
  - oldalak: kezdőlap a rendszer állapotával (a `GET /api/health` válasza, újraellenőrzés); 404 (a
    keresett cím szövegként, olvashatóan, vezérlőkarakterek nélkül, rövidítve); hibaoldal (részletek
    nélkül, a layouton belül, gyökérszinten saját `main`-nel); betöltésjelző (`HydrateFallback`);
    fejlesztői komponenslap (`/_komponensek`) – a produktív buildből kimarad;
  - a téma (`theme.css`) a `docs/design/` alól a `client/src/styles/` alá költözött; a
    `tools/design` és a generált stílusútmutató innen olvassa;
  - `tools/screenshot/render.mjs` – `url` mód (csak helyi http(s) cím, csökkentett mozgással), a
    kódképeken `jsx`/`tsx` kiemelés;
  - README (webes felület; a gyökérszintű `dev`, `build`, `test`, `lint` most használható),
    `client/README.md`, `docs/design/README.md`, FORRASOK 156–172.
- Eredmények: 83/83 teszt (14 fájl, StrictMode-ban; ebből 8 az auditban került be); lefedettség 99,45 / 97,94 / 100 / 100%
  (utasítás / ág / függvény / sor); a lint és a típusellenőrzés tiszta; a build egyetlen JS-csomag
  (364 kB, gzip 115 kB), a fejlesztői komponenslap nincs benne; élőben: a kliens fut, a layout
  megjelenik, a health végpont válasza kiírható (`L18_25`); a proxy a `/api` és a `/media` alatti
  kérést továbbítja, a `/mediakit`-et nem (`L18_30`); mutációs próba: mind a 21 célzott rontást
  megfogják a tesztek (`L18_10`).
- Megvalósítási döntések: TypeScript ~6.0.3 (a typescript-eslint 6.1 alattit követel); az
  `eslint-plugin-jsx-a11y` nem támogatja az ESLint 10-et → axe-core tesztek (a kattintható `div`-et
  ez nem látja – a kódáttekintés pótolja); az `eslint.config.js` a sablonból változatlan, a generált `coverage/` kizárása a `lint` scriptben; a téma a kliensbe költözött
  (a build a `docs/` nélkül is működjön); a fejlécben csak a meglévő oldal (Galéria) szerepel, a
  menüpontok a lépésekkel bővülnek; a kezdőlap ideiglenesen az állapotkártya (a galéria az L20-ban
  kerül ide); a fejlesztői komponenslap csak `import.meta.env.DEV` alatt része az útvonalfának.
- Független átnézés (React, biztonság, akadálymentesség):
  - 1. kör – React/TS és akadálymentesség egybehangzóan 1 HIGH: az állapotkártya gombja
       állapotváltáskor újraépült, a fókusz a `<body>`-ra esett (a tesztek az azonnal válaszoló
       fetch-csonk miatt nem fogták meg) → egyetlen, mindig ugyanott álló gomb; MEDIUM: a `focus()`
       görgetése felülírta a ScrollRestorationt (`preventScroll`), a foglalt állapot nem volt hallható
       („Ellenőrzés folyamatban…”), a globális `[tabindex='-1']{outline:none}` a későbbi menük keretét
       is eltüntette volna (elemenkénti `focus:outline-none`), a köztes állapotok nem voltak tesztelve;
       LOW: dupla és elavult bejelentés (kulcsolt riasztás, a sikert csak csatolt állapotban jelentjük),
       az élő régió soha nem ürült, a hibaoldal nem kapott fókuszt és gyökérszinten nem volt `main`-je,
       a `main` kattintásra fókuszt kapott, a Card landmarkot hozott létre, a best-practice
       axe-szabályok nem futottak, hiányzott a `HydrateFallback`, a törzs olvasása közbeni megszakítás
       „váratlan válasz” lett, a GET törzset kaphatott, a health válasza nem volt ellenőrizve;
       biztonság: nincs CRITICAL, HIGH vagy MEDIUM; 2 LOW (a `render.mjs` URL-protokollja; vezérlő- és
       irányváltó karakterek a 404-oldalon – megtévesztő szöveg) és megerősítések (a `Retry-After`
       figyelembevétele, a proxy teljes útvonalszakaszra illesszen) – mind javítva, bukó tesztekkel
       (`L18_04`); későbbre: a dinamikus útvonalszakaszok kódolása (L19);
  - közben talált hiba: a React Router a dekódolt címre illeszt, és a `*` útvonal nem illeszkedik
    sortörésre – egy `%0A`-t tartalmazó címre a 404 helyett a „Váratlan hiba” jelent meg → a
    hibaoldal a 404-es útvonalhibára a 404-oldalt mutatja (bukó teszttel);
  - 2. kör (a javításokra): mind a 12 javítás helyes, regresszió nincs; 1 MEDIUM: offline jelzésnél a
       TanStack szüneteltette a lekérdezést, a kártya beragadt → `networkMode: 'always'`; LOW: a
       fókuszban lévő gomb felirata újrapróbálás közben átváltott (az utolsó befejezett ellenőrzést
       követi), a hibaoldalról a kezdőlapra lépve elveszhetett a fókusz (teljes újratöltés) – javítva,
       bukó tesztekkel (`L18_05`);
  - a tesztinfrastruktúra a review nyomán: megszakítható fetch-csonk kézzel lezárható válasszal, a
    tesztek StrictMode-ban, a tesztkliens az alkalmazás `createQueryClient`-je.
- Az ellenőrzés közben talált hibák: a jsdom `DOMException`-je nem `Error`-példány (a csonk
  válaszként adta vissza); jsdom-zaj (`scrollTo`, canvas) → üres megvalósítás a setupban; a proxy
  502-je „váratlan válasz” volt → `SERVER_UNAVAILABLE` (`L18_03`); a riasztás címe és üzenete pont
  nélkül folyt egybe; a mobil élő képen a gomb a színátmenet kezdőállapotában (szürkén) maradt – a
  fej nélküli böngésző animációs órája nem haladt → `motion-safe:transition-colors` és csökkentett
  mozgású képkészítés; a `.tsx` kódképek kiemelés nélkül készültek (hiányzó Prism-nyelv); a hosszú
  ugrólink-osztálysor levágódott a képen → állandó (`SKIP_LINK`).
- Audit a commit előtt (segédscriptek a munkamappában):
  - statikus ellenőrzés a 98 commitra váró fájlon (a `.env` megnyitása nélkül): nincs tiltott fájl,
    titokminta, láthatatlan karakter, hibás relatív hivatkozás, 800 sornál hosszabb forrás,
    konzolkiírás, nyers HTML-beszúrás / `eval`, fókuszált vagy kihagyott teszt (`L18_31`);
  - függőségek: tiszta telepítés a lockfile-ból (`npm ci`) után is 83/83 teszt és sikeres build;
    `npm audit` (futásidejű és teljes): 0 sebezhetőség (`L18_32`); a 13 futásidejű csomag licence
    MIT, ISC és – a két betűkészletnél – OFL-1.1, copyleft nincs (`L18_33`);
  - bővített mutációs próba a magkódon (HTTP-réteg, újrapróbálás, komponensek, fókusz, cím): az első
    futáson 15/25 (`L18_34`) – 10 tesztrés: hibás státuszú „siker” boríték, sikeres státuszú
    hibaboríték, nem szöveges hibakód, dátum formájú `Retry-After`, `data: null` a health-válaszban,
    az 500-as határérték, a foglalt küldőgomb űrlapküldése, a `cx` hamis értékei, a kiinduló oldalra
    visszanavigálás fókusza; a kód mindenhol helyes volt; 9 új teszt (`L18_35`), az egyik rontás
    (a „/” NavLink `end` jelzője) egyenértékűnek bizonyult (a React Router a gyökérhivatkozást eleve
    csak pontos egyezésnél jelöli aktívnak) → 24/24 (`L18_36`);
  - véletlenszerű próba (két kezdőértékkel, reprodukálható): 2×2000 véletlen API-válasz (státusz,
    tartalomtípus, törzs, `Retry-After`, hálózati hiba, megszakítás) – mindig adat vagy rendezett
    `ApiError`, más hiba soha; 2×20 000 újrapróbálási eset a specifikáció szerint; 2×150 véletlen
    404-cím (vezérlő- és irányváltó karakterek, hibás százalékkódolás, HTML) – összeomlás nélkül,
    tiszta, legfeljebb 100 kódpont + „…” hosszú címmel (`L18_37`). A próba első futása a
    szóközzel kezdődő `Retry-After`-t jelezte – a Fetch szabványosan levágja a mező körüli
    szóközt, a próba elvárása volt hibás;
  - feketedobozos ellenőrzés a produktív buildön (`vite preview` + szerver): Lighthouse 13.4.1,
    navigációs mód – akadálymentesség 100, best practices 100, SEO 91 a kezdőlapon (asztali és mobil)
    és a 404-oldalon (`L18_38`); valódi böngészőben billentyűzettel: az első Tab az ugrólinkre
    kerül, és az látható, 2 px-es fókuszkerettel (`L18_39`); Enterre a fókusz a fő tartalomra kerül
    (ideiglenes `tabindex`), a következő Tab az „Újraellenőrzés” gombra, a `tabindex` eltűnik; a gomb
    lenyomása után a fókusz rajta marad, az élő régió bejelenti az eredményt (`L18_40`);
  - elfogadva: a Lighthouse `robots-txt` és `llms-txt` ellenőrzése bukik (nincs `robots.txt` – a
    telepítés, L31 kérdése); a kliensoldali 404 HTTP-státusza 200 (egyoldalas alkalmazás – az L31-ben
    az Express dönthet róla); a látható ugrólink a logó elé kerül (megszokott minta, a fókuszban lévő
    elem teljesen látszik – WCAG 2.4.11).
- Ismert korlátok, későbbre: L19 – a dinamikus útvonalszakaszok kódolása (`encodeURIComponent`, `..`
  tiltása) az `apiRequest` hívásainál, a Stripe-ra irányító cím originjének ellenőrzése; L20 – a
  galéria a kezdőlapra; L31 – az Express szolgálja ki a buildet (az `index.html` inline szkript
  nélküli, megfelel a helmet CSP-jének); a proxy a `/api?x`-szerű, perjel nélküli lekérdezést nem
  továbbítja (az `apiRequest` mindig perjeles utat ad); a buildben minden nyelvi betűkészlet ott
  van, a böngésző csak a szükségeset tölti le.
- Képek:

  | Kép                               | Forrás                                                                               | Tartalom                                                                                          |
  | --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
  | `L18_01_create_vite.png`          | `npx create-vite@9.2.1 client --template react-ts --eslint …` (mentett kimenet)      | a kliens váza a Vite sablonjából                                                                  |
  | `L18_02_tesztek_piros.png`        | `npx vitest run` a `client/`-ben (mentett kimenet)                                   | TDD piros fázis: a 13 tesztfájl modulja még nem létezik                                           |
  | `L18_03_502_piros.png`            | `npx vitest run` (mentett kimenet)                                                   | a proxy 502/503/504-e elérhetetlenség – bukó tesztek a javítás előtt                              |
  | `L18_04_atnezes1_piros.png`       | `npx vitest run` (mentett kimenet)                                                   | az 1. átnézés 18 bukó tesztje a javítás előtt                                                     |
  | `L18_05_atnezes2_piros.png`       | `npx vitest run` (mentett kimenet)                                                   | a 2. átnézés 5 bukó tesztje a javítás előtt                                                       |
  | `L18_06_tesztek_zold.png`         | `npx vitest run`                                                                     | 83/83 teszt (az audit új tesztjeivel)                                                             |
  | `L18_07_lefedettseg.png`          | `npx vitest run --coverage`                                                          | lefedettség fájlonként (99,45 / 97,94 / 100 / 100%)                                               |
  | `L18_08_lint_tipus.png`           | `npm run lint`, `npm run typecheck`                                                  | ESLint és TypeScript hiba nélkül                                                                  |
  | `L18_09_build.png`                | `npm run build` és a `dist/assets` átvizsgálása                                      | produkciós build; a fejlesztői komponenslap 0 találat                                             |
  | `L18_10_mutacios_proba.png`       | `node mutation-check-l18.mjs` (munkamappa, mentett kimenet)                          | a review-javítások 21 célzott rontásából mindet megfogják a tesztek                               |
  | `L18_11_vite_proxy.png`           | `client/vite.config.ts` (13–27. sor)                                                 | proxy teljes útvonalszakaszra, kötött port                                                        |
  | `L18_12_http_apirequest.png`      | `client/src/api/http.ts`, `apiRequest` (112–153. sor)                                | a fetch-burkoló: boríték → adat vagy `ApiError`                                                   |
  | `L18_13_ujraprobalas.png`         | `client/src/lib/queryClient.ts` (19–45. sor)                                         | újrapróbálási szabály, `Retry-After`, `networkMode`                                               |
  | `L18_14_utvonalak.png`            | `client/src/routes/router.ts` (17–48. sor)                                           | útvonalfa: layout, kettős ErrorBoundary, HydrateFallback, fejlesztői útvonal                      |
  | `L18_15_layout.png`               | `client/src/components/layout/Layout.tsx`, `Layout` (21–48. sor)                     | ugrólink, fejléc, fő tartalom, lábléc, élő régió                                                  |
  | `L18_16_focus.png`                | `client/src/lib/focus.ts` (8–14. sor)                                                | fókusz görgetés nélkül, ideiglenes `tabindex`                                                     |
  | `L18_17_utvonal_fokusz.png`       | `client/src/hooks/useRouteFocus.ts` (13–26. sor)                                     | oldalváltáskor a fókusz az új oldal címére                                                        |
  | `L18_18_elo_regio.png`            | `client/src/components/ui/LiveRegion.tsx` (15–37. sor)                               | az egyetlen élő régió, kiürülés                                                                   |
  | `L18_19_allapotkartya.png`        | `client/src/pages/HomePage.tsx`, `HealthCard` (36–101. sor)                          | állapotkártya: egy gomb, kulcsolt riasztás, bejelentések                                          |
  | `L18_20_gomb.png`                 | `client/src/components/ui/Button.tsx`, `Button` (37–67. sor)                         | gomb foglalt állapottal (`aria-disabled`)                                                         |
  | `L18_21_404_cim.png`              | `client/src/pages/NotFoundPage.tsx`, `readablePath` (18–30. sor)                     | a keresett cím: dekódolás, szűrés, rövidítés                                                      |
  | `L18_22_hibaoldal.png`            | `client/src/pages/RouteErrorPage.tsx` (21–40. sor)                                   | hibaoldal: 404-es útvonalhiba, fókusz a címre                                                     |
  | `L18_23_teszt_ujraprobalas.png`   | `client/src/pages/HomePage.test.tsx` (37–62. sor)                                    | teszt: foglalt gomb, a fókusz marad, bejelentések (késleltetett válasszal)                        |
  | `L18_24_teszt_ugrolink.png`       | `client/src/components/layout/Layout.test.tsx` (29–42. sor)                          | teszt: ugrólink, ideiglenes `tabindex`                                                            |
  | `L18_25_kezdolap.png`             | `render.mjs url --url http://localhost:5173/ --width 1280 --height 760`              | élő kezdőlap: a health végpont válasza (a szerver és a Vite fut)                                  |
  | `L18_26_kezdolap_mobil.png`       | ugyanaz, `--width 390 --height 844`                                                  | kezdőlap mobilon                                                                                  |
  | `L18_27_404.png`                  | `… --url http://localhost:5173/nincs-ilyen-oldal --width 1280 --height 620`          | 404-oldal                                                                                         |
  | `L18_28_komponensek.png`          | `… --url http://localhost:5173/_komponensek --width 1280 --height 1040`              | fejlesztői komponenslap: gombok, mező, jelvények, visszajelzés                                    |
  | `L18_29_api_nem_erheto.png`       | `… --url http://localhost:5173/ --width 1280 --height 760` (a szerver leállítva)     | a proxy 502-je: érthető hibaüzenet, újrapróbálás                                                  |
  | `L18_30_proxy.png`                | `node proxy-check.mjs` (munkamappa, mentett kimenet)                                 | mely útvonal megy a szerverhez, és melyik marad a kliensnél                                       |
  | `L18_31_audit_statikus.png`       | `node audit-l18-static.mjs` (munkamappa, mentett kimenet)                            | audit: titok, tiltott fájl, láthatatlan karakter, hivatkozás, kliensoldali kockázatok – 0 találat |
  | `L18_32_audit_fuggosegek.png`     | `npm ci`, `npm audit --omit=dev`, `npm audit`                                        | tiszta telepítés a lockfile-ból, 0 sebezhetőség                                                   |
  | `L18_33_audit_licencek.png`       | `node audit-l18-licenses.mjs` (munkamappa, mentett kimenet)                          | a 13 futásidejű csomag licence (MIT, ISC, OFL-1.1), copyleft nincs                                |
  | `L18_34_audit_mutacio_elso.png`   | `node audit-l18-mutation.mjs` (munkamappa, mentett kimenet)                          | audit: 25 rontásból 15-öt fogtak meg – 10 tesztrés                                                |
  | `L18_35_audit_uj_tesztek.png`     | `client/src/api/http.test.ts` (121–161. sor)                                         | az audit új tesztjei a HTTP-rétegre (boríték és státusz, hibakód, `Retry-After`)                  |
  | `L18_36_audit_mutacio_vegso.png`  | `node audit-l18-mutation.mjs` (mentett kimenet)                                      | az új tesztekkel 24/24 (egy egyenértékű rontás kiszűrve)                                          |
  | `L18_37_audit_veletlen_proba.png` | `npx vitest run --config fuzz/vitest.config.mjs` két kezdőértékkel (mentett kimenet) | véletlenszerű próba: API-válaszok, újrapróbálás, 404-címek                                        |
  | `L18_38_audit_lighthouse.png`     | `node lighthouse-summary-l18.mjs` (Lighthouse 13.4.1 jelentései)                     | akadálymentesség és best practices 100 a produktív buildön                                        |
  | `L18_39_audit_ugrolink.png`       | Chrome DevTools képernyőkép (`vite preview`, Tab után)                               | a látható ugrólink fókuszkerettel                                                                 |
  | `L18_40_audit_fokuszkeret.png`    | Chrome DevTools képernyőkép (ugrólink, Tab, Enter után)                              | a fókusz a gombon marad, jól látható kerettel                                                     |

- Commit: `e073d50` – `feat(L18): kliens projektváz – React + Vite, layout, UI-alapkomponensek, API-hívás proxyn át`

## L19 – Belépés, regisztráció, munkamenet a kliensen (2026-10-08)

- Elkészült:
  - `client/src/api/auth.api.ts` – az `/api/auth` végpontok kliense (belépés, regisztráció,
    kijelentkezés, `GET /me`), a felhasználó futásidejű ellenőrzésével; a 401 `UNAUTHORIZED` és a
    403 `ACCOUNT_BLOCKED` „nincs munkamenet” (`isSessionEndError`);
  - munkamenet (`client/src/auth/`): `AuthProvider` + `useAuth` (ellenőrzés alatt / vendég /
    bejelentkezve / hiba – újrapróbálás közben is hibanézet); az egyetlen forrás a TanStack Query
    gyorsítótára (`['auth', 'me']`); `sessionCache.ts`: beírás a futó ellenőrzés megszakításával,
    felhasználóváltáskor a többi lekérdezés alapállapotba kerül; ablakváltáskor mindig újraellenőriz
    (hibaállapotban nem); bármely kérésre érkező 401 vagy letiltott fiók kijelentkeztet
    (`lib/queryClient.ts`);
  - `ProtectedRoute` / `AdminRoute` (layout-útvonal): a vendéget a belépésre irányítja, a célt az
    útvonal-állapotban megjegyzi (visszairányítás csak az alkalmazás saját, relatív útvonalára –
    `redirectTarget`); nem adminnak „Nincs jogosultság” oldal; ellenőrzés közben és hibájakor saját
    oldalcím, az újrapróbálás gombja a helyén marad; fejlesztői próbaoldalak: `/_vedett`, `/_admin`;
  - belépő és regisztrációs oldal: a szerver szabályait követő kliensoldali ellenőrzés
    (`validation.ts`: e-mail a Zod „practical” mintájával, jelszó legalább 8 karakter és legfeljebb
    72 bájt, név 2–50 karakter – a minimumba csak a látható számít –, vezérlő- és irányváltó
    karakter nélkül, legalább egy betűvel vagy számmal; a hosszt – mint a szerver Zod 4-e –
    kódpontban méri); a szerver mezőhibái a mezőhöz, más hiba riasztásként (429-nél a várakozási
    idővel); `useAuthForm`: előbb a hiba, aztán a fókusz az első hibás mezőre – ha már ott van
    (Enter), rejtett riasztás a mező nevével; sikeres belépés vagy regisztráció után vissza a kért
    oldalra, a bejelentés a fókusz áthelyezése után;
  - fejléc: vendégként Belépés és Regisztráció (a célt megtartva, hibaállapotban is), bejelentkezve
    monogramos fiókmenü (disclosure-minta: név, e-mail-cím, kijelentkezés; Escape, kívülre kattintás
    – Safariban is –, oldalváltás bezárja; kijelentkezési hibánál újra kinyílik); ha a fiókrész a
    fókusszal együtt cserélődik, a fókusz az oldal címére kerül (`useFocusRescueOnUnmount`);
  - UI: `PasswordField` (a megjelenítő gomb a mező után, állandó felirat, `aria-pressed`, benyomva
    inverz; beküldéskor és a vissza-gyorsítótárból visszatérve újra rejtett), `TextField` kiegészítő
    vezérlővel, `Button` `ref`-fel; az élő régió oldalváltás utánra kért bejelentést is kezel;
  - tesztsegédek: `test/users.ts`, a `renderRoute` `session` opciója, `test/liveRegion.ts`;
  - README (webes felület: belépés, regisztráció, védett oldalak), `client/README.md` (felépítés,
    munkamenet, űrlapok akadálymentessége), FORRASOK 173–187 és öt bővített sor.
- Eredmények: 216/216 teszt (27 fájl, StrictMode-ban; ebből 6 az auditban került be); lefedettség
  99,82 / 98,74 / 100 / 100% (utasítás / ág / függvény / sor); a lint és a típusellenőrzés tiszta;
  a build egyetlen JS-csomag (382 kB, gzip 120 kB), a fejlesztői oldalak (`/_vedett`, `/_admin`,
  `/_komponensek`) nincsenek benne (`L19_07`); élőben, a tesztadatbázison: üres és hibás űrlap,
  átirányítás védett oldalról, regisztráció, fiókmenü, védett oldal, „nincs jogosultság”,
  kijelentkezés, foglalt e-mail-cím, hibás jelszó (`L19_27`–`L19_40`); mutációs próba: az 1. kör
  javításainak 31 rontásából 29-et, a 2. körének 18-ból 18-at megfogják a tesztek (`L19_08`,
  `L19_09`) – a két túlélő egyenértékű: a fókusz áthelyezése és a bejelentés sorrendje ugyanazon a
  szinkron lépésen belül nem számít, mert a React az élő régió szövegét csak a lépés után rajzolja
  ki.
- Megvalósítási döntések:
  - a munkamenetnek nincs külön kliensállapota: a TanStack Query gyorsítótára az egyetlen forrás (a
    süti `HttpOnly`, a kliens a tokent nem látja) – a belépés, a kijelentkezés és bármely kérés
    401-e ugyanott frissít;
  - felhasználóváltáskor `resetQueries`, nem `removeQueries`: a látható lekérdezés újratöltődik, a
    törölt lekérdezést figyelő oldal a régi adaton (töltés közben „töltődik” állapotban) ragadna;
  - kijelentkezéskor előbb a kezdőlapra lép (`replace`, `flushSync`), csak utána törlődik a
    munkamenet – különben a még látható védett oldal a belépésre irányítana; feltétele, hogy a
    kezdőlapnak ne legyen loadere, és ne lustán töltődjön (L20);
  - a jelszó megjelenítése állandó feliratú váltógomb (WAI-ARIA APG), nem cserélődő feliratú gomb
    (GOV.UK) – a hangvezérlés így mindig ugyanazt a nevet látja; beküldéskor a GOV.UK-hoz hasonlóan
    akkor is elrejti, ha a kliensoldali ellenőrzés megállítja a küldést (vállalt kompromisszum);
  - a sikerüzenet a mutáció hívásonkénti visszahívásában (csak csatolt oldalon fut le), nem a
    `mutateAsync` folytatásában;
  - ablakváltáskor mindig újraellenőrzés (a másik lapon történt kilépés miatt), hibaállapotban
    viszont nem – a hibaüzenet ne ugorjon fel magától (mint a kezdőlap állapotkártyáján);
  - a fejlesztői próbaoldalak (`/_vedett`, `/_admin`) csak fejlesztői módban részei az útvonalfának.
- Független átnézés (biztonság, akadálymentesség, React):
  - 1. kör – biztonság: nincs CRITICAL, HIGH vagy MEDIUM; 5 LOW: a beküldött jelszó 5 percig a
       mutációk gyorsítótárában maradt (`gcTime: 0`); kijelentkezéskor a többi adat megmaradt; a másik
       lapon történt kilépést csak 30 s után vette észre; a letiltott fiók nem jelentkeztetett ki; a
       visszairányítás célja tabulátort vagy sortörést tartalmazhatott (a böngésző kihagyja őket:
       „/[tab]/x” → „//x”); akadálymentesség: 2 MEDIUM (a már fókuszban lévő hibás mező hibája nem
       hangzott el; az újrapróbálás gombja eltűnt, a fókusz a `<body>`-ra esett), 9 LOW (a bezárt
       panelben maradó kijelentkezési hiba, a bejelentés és a fókuszváltás sorrendje, oldalcím
       ellenőrzés és hiba közben, a figyelmeztetés helye, elavult hibadoboz, a jelszógomb a mező előtt
       és látható állapot nélkül, bezárás Safariban, gépelés közben felugró új hiba, halvány
       panelszegély); React/TS: 3 MEDIUM (a futó `/me` késve érkező válasza felülírta a belépés vagy a
       kijelentkezés eredményét; a többi gyorsítótárazott adat túlélte a kijelentkezést; az
       újrapróbálás fókuszvesztése), 6 LOW (a fejléc hivatkozása a belépő oldalon elvesztette a célt;
       hibaállapotban nem volt belépési lehetőség; elavult hiba; letiltott fiók; a `flushSync`
       előfeltétele dokumentálatlan; tesztrések) – mind javítva, 36 bukó teszttel (`L19_02`);
  - 2. kör (a javításokra): React/TS 1 MEDIUM (ha a felhasználó a válasz előtt elnavigált, a
       sikerüzenet egy későbbi, idegen oldalon hangozhatott el → hívásonkénti visszahívás), 5 LOW (a
       fejléc belépési hivatkozásáról elvesző fókusz; a kijelentkezés elvette a máshová vitt fókuszt;
       a munkamenet-azonosítás minden „auth” kulcsra reagált; az első sikeres ellenőrzés előtti
       belépés nem törölte a vendégként betöltött adatot; az első betöltés fókusza teszteletlen) és
       apróságok (`replace` a kijelentkezésnél, a `/login/` és `/LOGIN` alak); akadálymentesség 6 LOW
       (a rejtett riasztás a javítás után is megmaradt; kijelentkezési hibánál a gomb leírása legyen a
       hiba; hibaállapotban ablakváltáskor magától újrapróbált; csendes siker, ha a fókusz máshol volt;
       a jelszógomb benyomott állapota alig látszott, az áthúzott szem ellentmondott a feliratnak; a
       globális Escape a máshol álló fókuszt is elvette) – mind javítva, 16 bukó teszttel (`L19_03`).
- Az ellenőrzés közben talált hibák: a kijelentkezés a védett oldalról a belépő oldalon
  végződött (a router átmenetként frissít, a munkamenet előbb törlődött) → `flushSync`; a
  `removeQueries` az épp töltődő, látható lekérdezést „töltődik” állapotban hagyta volna (néma
  megszakítás) → `resetQueries`; ingadozó teszt: a lusta útvonal betöltése után a böngészőfül címét
  beállító effekt a tartalom megjelenése után kicsivel futott le (az első zöld képkészítéskor egy
  teszt elbukott) → a cím-ellenőrzés `waitFor`-t kapott, a tesztek közt a cím törlődik, a teljes
  csomag háromszor egymás után is zöld; a jsdom e-mail mezője levágja a szóközt (a teszt elvárása
  igazítva); a `refetchOnWindowFocus` külön, `Query` paraméterű függvényként elrontotta a `useQuery`
  típuskövetkeztetését → beágyazott függvény; a `/\/+$/` minta egy (saját maga által összerakott)
  nagyon hosszú perjelsoros címnél négyzetes idejű lehetett → lineáris ciklus.
- Audit a commit előtt (segédscriptek a munkamappában):
  - statikus ellenőrzés a commitra váró fájlokon (a `.env` megnyitása nélkül): nincs tiltott fájl,
    titokminta, láthatatlan karakter, hibás relatív hivatkozás, 800 sornál hosszabb forrás,
    konzolkiírás, nyers HTML-beszúrás / `eval`, fókuszált vagy kihagyott teszt, munkamenet a
    böngésző tárolójában (`L19_41`); az első futás a `focus.test.ts` `innerHTML`-jét jelezte (csak
    tesztben, de a szabály egységes) → DOM-műveletekkel (`createElement`, `replaceChildren`);
  - függőségek: tiszta telepítés a lockfile-ból (`npm ci`), `npm audit` (futásidejű és teljes):
    0 sebezhetőség (`L19_42`); az L19 nem hozott új függőséget;
  - bővített mutációs próba a magkódon (a `/me` válaszának ellenőrzése, kliensoldali szabályok,
    szerverhibák, visszairányítás, monogram, hibaszövegek, oldalak): az első futáson 23/32
    (`L19_43`) – 9 tesztrés: az `id` és a név típusa a `/me` válaszában, az egybetűs legfelső
    szintű tartomány, mezőnként az első szerverüzenet, a „?” nélküli lekérdezés, a `required`
    pontos értéke, a várakozás csak 429-nél, a belépő e-mail-cím levágása (Unicode-szóköz) és a név
    kódpontos maximuma; a kód – az utolsó kivételével, lásd lent – helyes volt, a rések tesztet
    kaptak (`L19_44`);
  - véletlenszerű próba (két kezdőértékkel, reprodukálható), amely a klienst a szerver valódi
    Zod-sémájával veti össze: 2 × 4000 regisztráció és 2 × 2000 belépés mezőnként, 2 × 6000
    visszairányítási állapot, 2 × 4000 monogram, 2 × 3000 szerverhiba, 2 × 600 `/me`-válasz. Az
    első futás 158, illetve 146 eltérést talált (`L19_45`): a Zod 4 a szöveg hosszát kódpontban
    méri, a kliens UTF-16 egységben – a kiegészítő síkú karakter (pl. U+1D400, matematikai félkövér
    A) a kliensen kettőnek számított. A 26 ilyen betűből álló nevet a kliens elutasította, a szerver
    elfogadta; a 7 kódpontos („abcdef” + U+1D400) jelszót a kliens elfogadta, a szerver elutasította.
    A mutációs próba túlélő rontása („név: kódpontokban számolt maximum”) tehát valójában a helyes
    viselkedés volt, és a rá írt (UTF-16-os) teszt is hibás volt. Emellett az üres (vagy csak
    szóközből álló) szerverüzenetből üres mezőhiba, az üres hibaüzenetből üres riasztás lett volna;
  - javítás TDD-vel: előbb 3 bukó teszt (`L19_46`, `L19_47`), aztán a kliens a hosszkorlátokat
    kódpontban számolja (`codePoints`, `L19_16`), a `serverFieldErrors` az üres üzenetet kihagyja,
    a foglalt e-mail-címnél üres üzenet helyett saját szöveget ad (`L19_48`), az `errorText` üres
    üzenetnél általános szöveget; a véletlenszerű próba ezután mindkét kezdőértékkel 0 eltérést ad
    (`L19_49`), a mutációs próba – a megváltozott sorok rontásait az új kódhoz igazítva, 4 új
    rontással – 36/36 (`L19_50`);
  - feketedobozos ellenőrzés a produktív buildön (`vite preview` + szerver a tesztadatbázison):
    Lighthouse 13.4.1, navigációs mód – akadálymentesség 100 (28/28 ellenőrzés), best practices 96,
    SEO 91 a belépő oldalon (asztali és mobil) és a regisztrációs oldalon (`L19_51`); valódi
    böngészőben billentyűzettel: a Tab-sorrend a látható sorrendet követi, Enterre az üres,
    fókuszban lévő mezőnél a fókusz marad, és rejtett riasztás szól a mező nevével (`L19_52`);
    regisztráció után a `document.cookie` üres (a munkamenet sütije `HttpOnly`), a `/me` mégis 200;
    a kijelentkezés billentyűzettel: fókusz a kezdőlap címén, „Kijelentkeztél.” (`L19_53`);
  - elfogadva: a vendég `/me`-ellenőrzésének 401-ét a böngésző „Failed to load resource” sorként
    naplózza (nem az alkalmazás; a szerver így jelzi, hogy nincs munkamenet) – emiatt 96 a best
    practices; mobilon a vendéglinkek az ellenőrzés végén második sorba törnek, a tartalom 24 px-szel
    lejjebb kerül (CLS 0,06 – „jó”, < 0,1); a `robots.txt` és az `llms.txt` hiánya a telepítés
    kérdése (L31–L32).
- Ismert korlátok, későbbre: L20 – a dinamikus útvonalszakaszok kódolása (`encodeURIComponent`,
  `..` tiltása; az L18-ból áthozva, az L19-ben nincs ilyen szakasz), illetve a kijelentkezés
  `flushSync`-feltétele, ha a kezdőlap loadert kap; L21–L25 – a valódi védett oldalak a
  `ProtectedRoute` / `AdminRoute` alá kerülnek, a fiókmenü hivatkozásokat kap; L22 – a Stripe-ra
  irányító cím originjének ellenőrzése (az L18-ból áthozva); L26 – a mobil fejléc elrendezés-ugrása
  (helyfoglalás a fiókrésznek az ellenőrzés alatt) és a `/me` 401-ének konzolsora (pl. 200
  `user: null`-lal); L28 – az auth-korlát emelése az E2E-környezetben (az L08-ból); L30 –
  opcionális `BroadcastChannel` a lapok közti azonnali szinkronhoz; a demófelhasználó
  (`minta.marta.l19@photochain.test`) és az audit felhasználója (`audit.l19.…@photochain.test`) a
  tesztadatbázisban maradt.
- Képek:

  | Kép                                      | Forrás                                                                                                          | Tartalom                                                                                                                                 |
  | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
  | `L19_01_tesztek_piros.png`               | `npx vitest run` a `client/`-ben (mentett kimenet)                                                              | TDD piros fázis: az új modulok még nem léteznek                                                                                          |
  | `L19_02_atnezes1_piros.png`              | `npx vitest run` (mentett kimenet)                                                                              | az 1. átnézés 36 bukó tesztje a javítás előtt                                                                                            |
  | `L19_03_atnezes2_piros.png`              | `npx vitest run` (mentett kimenet)                                                                              | a 2. átnézés 16 bukó tesztje a javítás előtt                                                                                             |
  | `L19_04_tesztek_zold.png`                | `npx vitest run` (az audit javításai után, mentett kimenet)                                                     | 216/216 teszt (az audit új tesztjeivel)                                                                                                  |
  | `L19_05_lefedettseg.png`                 | `npx vitest run --coverage` (mentett kimenet)                                                                   | lefedettség fájlonként (99,82 / 98,74 / 100 / 100%)                                                                                      |
  | `L19_06_lint_tipus.png`                  | `npm run lint`, `npm run typecheck` (az audit javításai után, mentett kimenet)                                  | ESLint és TypeScript hiba nélkül                                                                                                         |
  | `L19_07_build.png`                       | `npm run build` és a `dist/assets` átvizsgálása (mentett kimenet)                                               | produkciós build; a fejlesztői oldalak: 0 találat                                                                                        |
  | `L19_08_mutacio_atnezes1.png`            | `node mutate-l19-fixes.mjs` (munkamappa, mentett kimenet)                                                       | az 1. kör javításainak 31 rontásából 29-et megfogják a tesztek (az első sor: a futó ellenőrzés megszakításának elhagyása; 2 egyenértékű) |
  | `L19_09_mutacio_atnezes2.png`            | `node mutate-l19-fixes2.mjs` (munkamappa, mentett kimenet)                                                      | a 2. kör javításainak 18 rontásából mind a 18-at                                                                                         |
  | `L19_10_auth_api.png`                    | `client/src/api/auth.api.ts` (55–75. sor)                                                                       | a munkamenet vége (401, letiltott fiók) és a `/me` lekérdezése                                                                           |
  | `L19_11_munkamenet_gyorsitotar.png`      | `client/src/auth/sessionCache.ts` (21–53. sor)                                                                  | beírás a futó ellenőrzés megszakításával; felhasználóváltáskor alapállapot                                                               |
  | `L19_12_authprovider.png`                | `client/src/auth/AuthProvider.tsx`, `AuthProvider` (18–38. sor)                                                 | a munkamenet állapotai, ablakváltáskori ellenőrzés                                                                                       |
  | `L19_13_vedett_utvonal.png`              | `client/src/auth/ProtectedRoute.tsx` (67–103. sor)                                                              | védett útvonal, fókusz és bejelentés a várakozás végén                                                                                   |
  | `L19_14_kijelentkezes.png`               | `client/src/auth/useAuthActions.ts`, `useLogout` (29–52. sor)                                                   | kijelentkezés: oldalváltás, a munkamenet törlése, fókusz, bejelentés                                                                     |
  | `L19_15_urlap_allapot.png`               | `client/src/auth/useAuthForm.ts` (44–88. sor)                                                                   | hibák, fókusz vagy rejtett riasztás, a szerver hibája                                                                                    |
  | `L19_16_validacio.png`                   | `client/src/auth/validation.ts` (35–75. sor)                                                                    | az e-mail-cím, a jelszó és a név szabályai (mint a szerveren; a hossz kódpontban – az audit javítása)                                    |
  | `L19_17_visszairanyitas.png`             | `client/src/auth/session.ts` (9–53. sor)                                                                        | a visszairányítás célja (nyílt átirányítás ellen), a hivatkozások állapota                                                               |
  | `L19_18_belepo_oldal.png`                | `client/src/pages/LoginPage.tsx`, `LoginPage` (22–99. sor)                                                      | a belépő oldal                                                                                                                           |
  | `L19_19_fiokmenu.png`                    | `client/src/components/layout/AccountMenu.tsx` (45–88. sor)                                                     | fiókmenü: bezárás oldalváltáskor, Escape, kívülre kattintás, kijelentkezési hiba                                                         |
  | `L19_20_jelszomezo.png`                  | `client/src/components/ui/PasswordField.tsx`, `PasswordField` (23–63. sor)                                      | jelszómező megjelenítő kapcsolóval                                                                                                       |
  | `L19_21_elo_regio.png`                   | `client/src/components/ui/LiveRegion.tsx` (18–33. sor)                                                          | az oldalváltás utánra kért bejelentés                                                                                                    |
  | `L19_22_utvonal_fokusz.png`              | `client/src/hooks/useRouteFocus.ts`, `useRouteFocus` (15–28. sor)                                               | fókusz az új oldal címére, utána a bejelentés                                                                                            |
  | `L19_23_teszt_belepes_verseny.png`       | `client/src/pages/LoginPage.test.tsx` (268–283. sor)                                                            | teszt: a belépés előtti ellenőrzés késő válasza nem jelentkeztet ki                                                                      |
  | `L19_24_teszt_kijelentkezes_verseny.png` | `client/src/components/layout/AccountMenu.test.tsx` (225–247. sor)                                              | teszt: a kijelentkezés előtti ellenőrzés késő válasza nem hozza vissza a munkamenetet                                                    |
  | `L19_25_teszt_ujraprobalas.png`          | `client/src/auth/ProtectedRoute.test.tsx` (121–136. sor)                                                        | teszt: az újrapróbálás gombja helyben marad, siker után fókusz a címre                                                                   |
  | `L19_26_teszt_enter.png`                 | `client/src/pages/LoginPage.test.tsx` (64–83. sor)                                                              | teszt: Enterrel beküldve rejtett riasztás a mező nevével                                                                                 |
  | `L19_27_belepes.png`                     | `render.mjs url --url http://localhost:5173/login --width 1280 --height 760`                                    | élő belépő oldal (a szerver a tesztadatbázison fut)                                                                                      |
  | `L19_28_belepes_mobil.png`               | ugyanaz, `--width 390 --height 844`                                                                             | belépő oldal mobilon (a jelszógomb a mező alá törik)                                                                                     |
  | `L19_29_atiranyitas.png`                 | `… --url http://localhost:5173/_vedett --width 1280 --height 760`                                               | védett oldalról a belépésre: a figyelmeztetés a cím alatt                                                                                |
  | `L19_30_regisztracio.png`                | `… --url http://localhost:5173/register --width 1280 --height 900`                                              | regisztrációs oldal súgókkal                                                                                                             |
  | `L19_31_belepes_hibak.png`               | Chrome DevTools képernyőkép (üres beküldés)                                                                     | mezőhibák, fókusz az első hibás mezőn                                                                                                    |
  | `L19_32_regisztracio_hibak.png`          | Chrome DevTools képernyőkép (rövid név, hibás e-mail-cím, 7 karakteres jelszó)                                  | mindhárom mezőhiba a súgó alatt                                                                                                          |
  | `L19_33_jelszo_megjelenitve.png`         | Chrome DevTools képernyőkép (be nem küldött mintajelszó, megjelenítés be)                                       | a benyomott (inverz) megjelenítő gomb; a javított mezők hibája eltűnt                                                                    |
  | `L19_34_regisztracio_utan.png`           | Chrome DevTools képernyőkép (sikeres regisztráció)                                                              | kezdőlap bejelentkezve, monogramos fiókmenü-gomb                                                                                         |
  | `L19_35_fiokmenu.png`                    | Chrome DevTools képernyőkép (a fiókmenü lenyitva)                                                               | név, e-mail-cím, Kijelentkezés                                                                                                           |
  | `L19_36_vedett_oldal.png`                | Chrome DevTools képernyőkép (`/_vedett` bejelentkezve)                                                          | a védett próbaoldal a munkamenet adataival                                                                                               |
  | `L19_37_nincs_jogosultsag.png`           | Chrome DevTools képernyőkép (`/_admin` nem adminként)                                                           | „Nincs jogosultságod” oldal                                                                                                              |
  | `L19_38_kijelentkezes.png`               | Chrome DevTools képernyőkép (kijelentkezés a védett oldalról)                                                   | kezdőlap kijelentkezve (az élő régióban: „Kijelentkeztél.”)                                                                              |
  | `L19_39_foglalt_email.png`               | Chrome DevTools képernyőkép (regisztráció a már használt címmel)                                                | 409: a hiba az e-mail-mezőnél, oda került a fókusz                                                                                       |
  | `L19_40_hibas_jelszo.png`                | Chrome DevTools képernyőkép (belépés hibás jelszóval)                                                           | 401: „A belépés nem sikerült. Hibás e-mail-cím vagy jelszó.”                                                                             |
  | `L19_41_audit_statikus.png`              | `node audit-l19-static.mjs` (munkamappa, mentett kimenet)                                                       | audit: titok, tiltott fájl, láthatatlan karakter, hivatkozás, kliensoldali kockázatok – 0 találat                                        |
  | `L19_42_audit_fuggosegek.png`            | `npm ci`, `npm audit --omit=dev`, `npm audit` (mentett kimenet)                                                 | tiszta telepítés a lockfile-ból, 0 sebezhetőség                                                                                          |
  | `L19_43_audit_mutacio_elso.png`          | `node audit-l19-mutation.mjs` (munkamappa, mentett kimenet)                                                     | audit: 32 rontásból 23-at fogtak meg – 9 tesztrés                                                                                        |
  | `L19_44_audit_uj_tesztek.png`            | `client/src/auth/session.test.ts` (71–79. sor)                                                                  | az audit egyik új tesztje: a visszairányítás csak a védett oldal pontos `required: true` jelzésére kötelező                              |
  | `L19_45_audit_fuzz_elso.png`             | `FUZZ_SEED=… npx vitest run --config fuzz/vitest.config.mjs l19`, `node zod-codepoint-demo.mjs` (szűrt kimenet) | véletlenszerű próba a javítás előtt: 158 / 146 eltérés a szerver sémájától; az ok: a Zod 4 kódpontban mér                                |
  | `L19_46_audit_kodpont_piros.png`         | `npx vitest run src/auth/validation.test.ts src/lib/text.test.ts` (mentett kimenet)                             | a javítás előtt 3 bukó teszt (kódpontos hossz, üres szerverüzenet, üres hibaszöveg)                                                      |
  | `L19_47_audit_kodpont_teszt.png`         | `client/src/auth/validation.test.ts` (88–99. sor)                                                               | teszt: 50 kiegészítő síkú betű még jó, 51 már nem; a 7 kódpontos jelszó kevés                                                            |
  | `L19_48_audit_ures_uzenet.png`           | `client/src/auth/validation.ts`, `serverFieldErrors` (111–131. sor)                                             | a szerver mezőhibái: üres üzenet kihagyva, foglalt e-mail-címnél saját szöveg                                                            |
  | `L19_49_audit_fuzz_vegso.png`            | ugyanaz, `--silent=false --reporter=verbose` (mentett kimenet)                                                  | a javítás után mindkét kezdőértékkel 0 eltérés, 0 hiba                                                                                   |
  | `L19_50_audit_mutacio_vegso.png`         | `node audit-l19-mutation.mjs` (mentett kimenet)                                                                 | az új tesztekkel és javításokkal 36/36                                                                                                   |
  | `L19_51_audit_lighthouse.png`            | `node lighthouse-summary-l19.mjs` (Lighthouse 13.4.1 jelentései)                                                | akadálymentesség 100 a produktív buildön; a bukott ellenőrzések oka                                                                      |
  | `L19_52_audit_billentyuzet.png`          | Chrome DevTools képernyőkép (`vite preview`, Enter az üres e-mail-mezőben)                                      | a fókusz a hibás mezőn marad, látható kerettel; a mezők alatt a hibák                                                                    |
  | `L19_53_audit_feketedoboz.png`           | Chrome DevTools szkriptes és billentyűzetes próbáinak eredményei (munkamappa, mentett szöveg)                   | Tab-sorrend, rejtett riasztás, `HttpOnly` süti, kijelentkezés billentyűzettel, mobil elrendezés-ugrás                                    |

- Commit: `c948b9f` – `feat(L19): belépés, regisztráció, munkamenet – AuthProvider, védett útvonalak, fiókmenü, űrlap-ellenőrzés`

## L20 – Galéria és fotó adatlap (2026-10-09)

- Elkészült:
  - szerver (az L13-as API bővítése): a listák eleme (galéria, saját képek) a kép értékeléseinek
    összesítését is tartalmazza (`rating`: átlag és darabszám) – egy oldalnyi képhez egyetlen,
    képenként csoportosító lekérdezéssel (`ratingsOf` → `ratingsByPhoto`, értékelés nélkül
    `NO_RATING`), a letiltott szerző értékelése nélkül; a tanúsítvány a hálózatot és a szerződést is
    megadja (`chainId`, `contractAddress`, `contractUrl` – az Etherscan címoldala, `addressUrl`); a
    `GET /api/photos/:id` a bejelentkezett néző jelzőjét is (`viewer: { purchased }`, vendégnek
    `null`);
  - kliens API-réteg (`photos.api.ts`, `categories.api.ts`, `reviews.api.ts`) a válaszok futásidejű
    ellenőrzésével: az azonosítók a szerver `z.uuid()` mintájával (`api/guards.ts`), a tanúsítvány
    linkjei csak a kiírt hash, illetve cím Etherscan-oldalára mutathatnak, a lekérdezés csak „?”-lel
    kezdődhet, a dinamikus útvonalszakasz kódolva (`pathSegment`: `encodeURIComponent`, a „.” és a
    „..” tiltva – az L19-ből áthozott pont);
  - galéria a kezdőlapon (`/`; a `HomePage` és a `health.api` törölve): keresés a címben, a
    leírásban és a fotós nevében, kategória- és árszűrő, rendezés, lapozás – a nézet az URL-ben
    (`galleryParams.ts`: a hibás értékek elhagyása – fordított ártartománynál mindkét határ, az 1000. oldalon túli lap –, a keresés legfeljebb 100 karakter, a beillesztett vezérlőkarakter
    szóközzé válik); szűrősáv (`GalleryFilters`, `GalleryFilterFields`, `useGalleryDrafts`):
    gépelés közben 400 ms késleltetéssel, Enterre azonnal alkalmaz; az árhiba megnevezi a mezőt, a
    sorrendhiba csak Enterre vagy a mezők elhagyásakor jelenik meg; az aktív szűrők címkéi (törlés
    után a fókusz a következő címkére), „Szűrők törlése” / „Keresés törlése”; mobilon lenyíló
    panel; az oldalcím a keresést és az oldalt is mutatja (`Galéria – „tó” – 3. oldal`);
  - kártya (`PhotoCard`): vízjeles bélyegkép, cím, fotós, ár, átlagos értékelés, „Hitelesítve”
    jelzés; az egész kártya kattintható (a cím hivatkozása fedi); lapozó (`Pagination`,
    GOV.UK-minta, mobilon „P. oldal (összesen N)”);
  - betöltés és hiba: `loadStateOf` (betöltés / kész / hiba / újrapróbálás), `LoadError` (az
    újrapróbálás gombja foglalt állapotban a helyén marad), `useFocusAfterRecovery` (siker után a
    fókusz a tartalomra kerül, ha közben máshová vitték, bejelentés szól), `EmptyState`;
  - adatlap (`/photos/:id`): morzsamenü, vízjeles előnézet, leírás, adatok, vásárlódoboz (vendégnek
    belépés, vevőnek az eredeti letöltése, bejelentkezett nem vevőnek „Az online fizetés hamarosan
    elérhető.” – a fizetés az L22-ben), értékelések (további oldalak, az ismétlődő elem kiszűrve),
    tanúsítvány-panel (`ChainCertificate`: hálózat, a regisztráció ideje, SHA-256 rövidítve – a
    teljes érték másolható (`CopyButton`; ha a másolás nem sikerül, kijelölhető mező) –, dHash,
    blokk, tranzakció és szerződés az Etherscanen; nem regisztrált képnél állapotüzenet); hibás
    azonosítónál és 404-nél „A kép nem található”; a háttérfrissítés hibája nem cseréli le a már
    betöltött képet; ha a vendégként megnyitott adatlap közben (másik lapon) bejelentkezés történt,
    a munkamenet újraellenőrzése (`useSessionRecheck`);
  - tesztsegédek: `test/photos.ts` (mintaválaszok), a `stubFetch` útvonalhoz kötött válaszai
    (`forPath` – az egyidejű kérések sorrendje nem számít), a kiszolgált címek (`requestedUrls`), a
    fel nem használt válasz a teszt végén hiba;
  - README (webes felület: galéria és adatlap; API: értékelések a listában, tanúsítvány, néző),
    `client/README.md` (L20 fejezet), FORRASOK 188–198 és két bővített sor (177, 187).
- Eredmények: szerver 1082/1082 teszt (68 fájl), a lint és a build tiszta (`L20_03`); kliens
  356/356 teszt (35 fájl, StrictMode-ban; ebből 3 az auditban került be), lefedettség 99,91 /
  99,15 / 100 / 100% (utasítás / ág / függvény / sor); a lint, a típusellenőrzés és a build tiszta, a JS-csomag 424,59 kB (gzip
  132,76 kB) (`L20_09`, `L20_10`); mutációs próba a két átnézési kör javításain: az első futáson
  47/48 – a túlélő egy túl korán ellenőrző teszt volt –, a teszt javítása és két új rontás után
  50/50 (`L20_07`, `L20_08`); élőben a produktív buildön (`vite preview` + szerver a
  tesztadatbázison): galéria asztali és mobil nézetben, szűrve és üres találattal; adatlap
  vendégként (asztali és mobil nézetben), vevőként és bejelentkezett nem vevőként; „nem található”
  oldal; a tanúsítvány-panel (`L20_30`–`L20_39`).
- Megvalósítási döntések:
  - a nézet egyetlen forrása az URL (megosztható, a vissza gomb is működik); a mezők piszkozata
    külön állapot, amely az URL külső változását követi, de a közben gépelt szöveget nem írja felül;
  - böngészőelőzmény: egy szerkesztési sorozat (ugyanaz a mező, változatlan URL) egy bejegyzés – az
    első alkalmazás új bejegyzés, a folytatás a helyére lép; új sorozatot a mező fókuszálása, az
    Enter, a címke törlése és az URL külső változása (pl. a vissza gomb) kezd;
  - `setSearchParams` `flushSync`-kel (a választó nem ugrik vissza egy pillanatra), és a saját
    URL-frissítés felismerése (`committed`), hogy a megérkező URL ne írja felül a közben gépelt
    betűt;
  - szűrés és lapozás közben a régi találat látszik (`keepPreviousData`, `aria-busy`, „Találatok
    frissítése…”), de a hibanézet szempontjából nem adat: a sikertelen szűrés újrapróbálásakor a
    hibanézet – és benne a fókuszban lévő gomb – marad;
  - az „újrapróbálás” állapot az `errorUpdateCount`-ból: az adat nélküli lekérdezés újrapróbáláskor
    a TanStack Queryben hiba nélküli „pending” állapotba kerül – különben a hibanézet eltűnne;
  - aszinkron fókuszmozgatás csak akkor, ha a fókusz még a kiinduló elemen vagy a `<body>`-n van;
    különben a változást az élő régió mondja be;
  - a kártyán csak az átlag és a darabszám – oldalanként egyetlen csoportosító lekérdezés (nincs
    N+1); az értékelések eltolásos lapozása marad, az ismétlődés azonosító szerint kiszűrve;
  - a tanúsítvány csak a regisztrált képé; a szerződés címe a beállított hálózat telepítéséből
    (`resolveContractAddress`) – a prototípusban hálózatonként egy szerződés van, ezért nem
    képenként tárolt;
  - a kezdőlap (galéria) se loadert, se lusta betöltést nem kapott – a kijelentkezés L19-es
    `flushSync`-feltétele továbbra is teljesül.
- Független átnézés (biztonság, akadálymentesség, React):
  - Első kör – biztonság: nincs CRITICAL, HIGH vagy MEDIUM; 2 LOW (a tanúsítvány szerződéscíme és
    hálózata nincs a kép rekordjához kötve; a névtelen válaszoknak nincs kifejezett
    `Cache-Control`-ja – mindkettő későbbre, lásd lent) és 4 INFO (a `listPhotos` nyers
    lekérdezés-szövege más API-útvonalra vihetett volna → „?”-ellenőrzés; a kliens azonosító-mintája
    lazább volt a szerverénél → a Zod UUID-mintája; ellenőrizetlen azonosítók a válaszban →
    ellenőrzés; `npm audit`: a szerver függőségfájában a `source-map-js` magas besorolású hibája –
    csak támadó által adott source map feldolgozásakor, a szerver ilyet nem tesz), továbbá két nem
    biztonsági megjegyzés (a lapozó az 1000. oldalon túl is linkelt; az eltolásos lapozás
    ismétlődést okozhat); akadálymentesség: nincs HIGH; 6 MEDIUM (az árhiba nem hangzott el; a
    hosszú szó 320 px-en kilógott; a keresőmező neve nem egyezett a látható helyőrzővel; az
    értékelések újrapróbálása után elveszett a fókusz; címke törlésekor és a „Szűrők törlése” után
    a fókusz a keresőmezőre ugrott; a másolásnak nem volt látható visszajelzése) és 14 LOW
    (lapozáskori fókusz, gépelés közbeni bejelentések, a választó minden lépése új
    előzmény-bejegyzés, az ármezők látható címke nélkül, a lapozó jelzései, aláhúzatlan morzsamenü,
    az Etherscan-linkek neve, a nem regisztrált kép panelcíme, a vásárlódoboz szerkezete, a fókuszba
    kerülő értékelés neve, fókuszvesztés munkamenet-váltás után, a drótvázból kimaradt elemek –
    mobil sorrend, rendezés mobilon, „Mit jelent ez?” –, apróságok – oldalcím, halványítás helyett
    foglaltjelzés, `role="list"`, ismeretlen kategória, a törlőgomb felirata –, tesztrések);
    React/TS: 2 HIGH (a háttérfrissítés hibája a betöltött képet a teljes hibaoldalra cserélte; az
    újrapróbálás után a fókusz a `<body>`-ra esett), 8 MEDIUM (a „Szűrők törlése” a piszkozatot nem
    törölte; a késleltetett URL-frissítés közben gépelt betű elveszett; a gépelés mindig felülírta
    az előzmény-bejegyzést; a vásárlódoboz zsákutca volt elavult munkamenetnél; az eltolásos
    lapozás ismétlődő értékelést és dupla React-kulcsot okozott; az árhiba néma volt, az
    `aria-invalid` mindkét mezőre került; a tesztcsonk a kérések sorrendjéhez kötötte a kódot, és
    elrejtette a köztes állapotokat; tesztrések) és 7 LOW (helykitöltő adat alatt felvillanó üres
    állapot, nem-null állítások, késve elsülő fókusz, tartományon kívüli oldal, néma kategóriahiba,
    a vezérlőkarakter az egész keresést eldobta, néma sikeres újrapróbálás) – 50 bukó teszttel
    javítva (`L20_04`); nem javítva: a két LOW biztonsági pont, az `npm audit` jelzése, a „Mit
    jelent ez?” hivatkozás (L24) és a gépelés közbeni bejelentések ritkítása (eszközös próba);
  - Második kör (a javításokra): akadálymentesség 1 HIGH (hosszú kártyacímnél a rács 640 px alatt
    oldalra kilógott), 5 MEDIUM (az aktuális oldalszám rámutatáskor eltűnt; az adatlap rácsa hosszú
    leírásnál kilógott; a „Kategóriák újratöltése” után elveszett a fókusz, és nem volt foglalt /
    sikertelen visszajelzés; az újrapróbálás állapotai csak láthatók voltak, a sikeres újrapróbálás
    néma maradt, ha a fókusz máshol volt; a sorrendhiba gépelés közben riasztásként szólt, a bezárt
    mobil panelben pedig nem látszott) és 13 LOW, ebből 8 javítva (a gyorsítótárból nyitott adatlap
    címe nem kapott fókuszt; feltétel nélküli aszinkron fókuszmozgatás; a „Szűrők törlése” az URL
    frissítése előtt fókuszált; a „Másolva” jelzés túl rövid volt, és fókusznál is eltűnt; a hibás
    ármezőt csak a szín jelölte; „mozgó” lapozógomb mobilon; levágott kártyacím és fotósnév; túl
    sok régió az adatlapon), 5 nem (a helyőrző levágása 320 px-en – L26; körvonal nélküli fókusz a
    találatszámon és az értékelések címén – elfogadva, nem kezelőelemek; eszközös próba – L26/L29;
    rejtett „Fotós:” előtag – elhagyva; eltérés a drótváztól) – 18 bukó teszttel (`L20_05`);
    React/TS 3 MEDIUM (a sikertelen szűrés vagy lapozás újrapróbálásakor eltűnt a gomb és a fókusz;
    a mezők elhagyása alkalmazta a beírt árat, és ez elnyelte az első kattintást – az elhagyás már
    csak jelzi a hibát; az 1. kör több javítását nem rögzítette teszt – túlélő rontások) és 5 LOW
    (a szerkesztési sorozat a vissza gomb után is folytatódott; elavult komment; beragadó
    `tabindex="-1"` sikertelen fókuszáláskor; a `GalleryFilters` mérete – a mezők külön fájlba;
    apróságok: `maxLength`, `key` az adatlapon, a bezárt panelben keletkező riasztás) – 5 bukó
    teszttel (`L20_06`).
- Az ellenőrzés közben talált hibák: álló képnél a kártya 4:3-as doboza megnyúlt →
  `overflow-hidden`; 390 px-en a hosszú cím kiszélesítette a rácsot (a dokumentum 519 px széles
  lett) → egy oszlopnál is megadott oszlop (`grid-cols-1`, azaz `minmax(0, 1fr)`), a javítás után
  390 px – az adatlapon hosszú címmel és leírással is; a lefordított CSS-ben a rámutatási háttér
  (`hover:bg-surface`) a sorrend miatt az aktuális oldal fekete hátterét is felülírta → csak a nem
  aktuális elemek kapják; a kategóriák ismételt hibájának bejelentése egy ritkán kirajzolt köztes
  állapottól függött → az `errorUpdatedAt` változásából; a fel nem használt csonkválaszok
  ellenőrzése 6 régebbi tesztben fölösleges választ talált (törölve); a `CopyButton` időzítéses
  tesztje a teljes csomagban ingadozott → valós idő mellett léptetett hamis időzítők, tartalékkal;
  a demóadatban a tócsás kép – amelyre a valódi Sepolia-tranzakció adatai kerültek – feltöltési
  ideje a regisztráció utánra esett → a tesztadatbázisban a regisztráció elé igazítva, az
  adatlapképek újra elkészültek.
- Audit a commit előtt (segédscriptek a munkamappában):
  - statikus ellenőrzés a commitra váró 114 fájlon (a `.env` megnyitása nélkül): nincs tiltott
    fájl, titokminta, láthatatlan karakter, hibás relatív hivatkozás, konzolkiírás, nyers
    HTML-beszúrás, fókuszált vagy kihagyott teszt, munkamenet a böngésző tárolójában, új lapon nyíló
    link `rel` nélkül, `alt` nélküli kép, idegen abszolút URL vagy kódolatlan azonosító az
    API-útvonalban (`L20_40`); egyetlen jelzés: a `GalleryPage.test.tsx` 909 soros – tesztfájl, a
    800 soros korlát a forrásfájloké (elfogadva);
  - függőségek: tiszta telepítés a lockfile-ból (`npm ci`) a kliensen és a szerveren, `npm audit`: a
    kliens 0 sebezhetőség; a szerveren a már ismert `source-map-js` jelzés (a Prisma
    függőségfájában, csak támadó által adott source map feldolgozásakor kihasználható – L30)
    (`L20_41`); az L20 nem hozott új függőséget; a kliens újraépített buildje azonos a végleges
    képen szereplővel (`index-DFBDzKNY.js`);
  - véletlenszerű próba (két kezdőértékkel, reprodukálható), amely a klienst a szerver valódi
    kódjával veti össze: 2 × 5000 URL-lekérdezés – a kliens által összeállított kérést a szerver
    Zod-sémája mindig elfogadja és ugyanúgy értelmezi, a beolvasás idempotens –; 2 × 1500 adatlap-
    és 2 × 500 × 3 lista-, értékelés- és kategória-DTO a szerver `toPhotoDetailDto`,
    `toPhotoListItemDto` és `toReviewDto` függvényeiből – a kliens ellenőrzői mezőről mezőre
    azonosan elfogadják –; 2 × 2500 elrontott adatlap-válasz – vagy rendezett `ApiError`, vagy csak
    biztonságos címekkel (saját `/media/`, pontos Etherscan-link) bíró kép jön ki –; 2 × 5000
    invariáns (keresőszó, ár, rövidített hexa, feliratok): 0 eltérés (`L20_42`); az első futás két
    bukása a próba hibája volt (kulcssorrend-érzékeny összevetés; a `shortenHex` emojis szövegre –
    a függvény csak ellenőrzött hexa értéket kap);
  - bővített mutációs próba a magkódon (az átnézések javításain túl): a kliensen 54 rontásból
    41-et fogtak meg a tesztek (`L20_43`) – egy rontás a próba hibája volt (a fájl kommentjét
    találta el), egy egyenértékű (kimaradt), 11 tesztrés: vezető nullák, a levágott keresőszó vége,
    0 szélesség, 0 hálózat-azonosító, 0. oldal, 0 kategória-azonosító, a rövidítés határhossza, a
    pajzs és a tanúsítvány nem regisztrált képen, az átlag nélküli fejléc, a csillagok kerekítése;
    a kód mind helyes volt, a rések tesztet kaptak (`L20_44`, `L20_45`), újrafuttatva 12/12; a
    szerveren 13/13 (DTO, Etherscan-linkek, értékelés-összesítés, a néző jelzője, a letiltott
    szerző, séma) (`L20_46`) – összesen 53/53;
  - feketedobozos ellenőrzés a produktív buildön (`vite preview` + lefordított szerver a
    tesztadatbázison): 39 API-szonda – lista, szűrés, keresés a címben és a fotós nevében, a kliens
    által kiszűrt kilenc hibás paraméterre a szerver 400-a, a tanúsítvány pontos Etherscan-linkjei
    és a valódi blokk, `viewer: null`, 400/404/401 a hibás és a hiányzó képre, illetve a letöltésre,
    az értékelések, az eredeti fájl és az útvonal-kijátszás tiltása, biztonsági fejlécek, az
    előnézet proxyja, nincs harmadik fél – 39/39 (`L20_47`); Lighthouse 13.4.1: akadálymentesség
    100 (30/30, illetve 29/29 ellenőrzés) a galérián és az adatlapon, asztali és mobil nézetben,
    best practices 96, SEO 92 (`L20_48`); billentyűzettel és a DOM-ból kiolvasva: fókuszsorrend,
    gépelés → URL és fülcím, Enter = REPLACE, vissza gomb, címke törlése → fókusz az összegzőn;
    konzol és hálózat (`L20_49`);
  - a Lighthouse CLS-értéke (0,47–0,94) valós betöltéssel nem reprodukálható: PerformanceObserverrel
    és teljesítmény-nyomkövetéssel – Slow 4G + 4× CPU lassítással és a Lighthouse pixelarányával is
    – 0,02–0,024, egyetlen okkal (a fejléc L19-ből ismert ugrása); az L26 Lighthouse-auditjában
    tisztázandó;
  - a próbakörnyezet tanulsága: a próbaszerver újraindítása törli az ideiglenes tárhelyet, ezért az
    első szondafutás a demóképek fájljait nem találta – a származtatott fájlok a szerver saját,
    lefordított feldolgozójával (`createPreview`, `createThumbnail`) készültek újra, a nyilvános
    `public/` almappába;
  - végeredmény: 356 teszt, lefedettség 99,91 / 99,15 / 100 / 100%, lint és típusellenőrzés tiszta
    (`L20_50`).
- Ismert korlátok, későbbre: L22 – a fizetés indítása a vásárlódobozból; L23 – értékelés írása az
  adatlapon; L24 – „Mit jelent ez?” hivatkozás a tanúsítvány-panelről az ellenőrző oldalra; L26 – a
  keresőmező helyőrzője 320–390 px-en levágódik, a „Keresés törlése” gomb címkék nélkül 3 px-szel
  beljebb kezdődik, a bezárt mobil panelben a késleltetett árhiba nem látszik (Enterre a panel
  kinyílik), eszközös próba (TalkBack, iOS VoiceOver), a gépelés közbeni bejelentések ritkítása,
  statikus akadálymentességi lint (`eslint-plugin-jsx-a11y` – az 1. React-átnézés apró javaslata);
  L28 – Playwright-tesztek az elrendezésre és a rámutatásra 320 és 1280 px-en; L30 – `npm audit
fix` (`source-map-js`); L30/L32 – a tanúsítvány hálózata és szerződése képenként, ha több
  telepítés lesz; L31 – kifejezett `Cache-Control` (`no-cache`) a névtelen válaszokra; szerver –
  kurzoros lapozás az értékelésekre; a drótvázak frissítése (`galeria.html` lapozó-megjegyzése,
  `adatlap.html` ragadós sávja). A gyertyás és a gitáros kép tanúsítványa a tesztadatbázisban
  szimulált – a képeken csak a galéria kártyáin szerepelnek; a tanúsítványt mutató képek a tócsás
  kép valódi Sepolia-tranzakcióját mutatják (blokk 11 820 993). A tesztadatbázisban maradtak a demó
  fiókjai (`fotos.fanni@…`, `kep.karoly@…`, `vasarlo.vera@…`, `kovacs.bence@…`, `szabo.dora@…`,
  `minta.marta.l20@…` – vevő, `minta.nora.l20.…@…` – nem vevő; mind `photochain.test`, véletlen
  jelszóval).
- Képek:

  | Kép                                       | Forrás                                                                                                                                  | Tartalom                                                                                                                |
  | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
  | `L20_01_szerver_piros.png`                | `npx vitest run` a hat érintett szerverteszt-fájlra (mentett kimenet)                                                                   | TDD piros fázis a szerveren: 13 bukó teszt (értékelések a listában, néző, a tanúsítvány új mezői)                       |
  | `L20_02_kliens_piros.png`                 | `npx vitest run` a `client/`-ben (mentett kimenet)                                                                                      | TDD piros fázis a kliensen: 67 bukó teszt, a még nem létező modulok                                                     |
  | `L20_03_szerver_zold.png`                 | `npx vitest run`, `npm run lint`, `npm run build` a `server/`-ben (mentett kimenet)                                                     | 1082/1082 teszt, ESLint és build hiba nélkül                                                                            |
  | `L20_04_atnezes1_piros.png`               | `npx vitest run` a `client/`-ben (mentett kimenet)                                                                                      | az 1. átnézés 50 bukó tesztje a javítás előtt                                                                           |
  | `L20_05_atnezes2_a11y_piros.png`          | ugyanaz (mentett kimenet)                                                                                                               | a 2. kör akadálymentességi megállapításainak 18 bukó tesztje                                                            |
  | `L20_06_atnezes2_react_piros.png`         | ugyanaz (mentett kimenet)                                                                                                               | a 2. kör React-megállapításainak 5 bukó tesztje                                                                         |
  | `L20_07_mutacio_elso.png`                 | `node mutate-l20-fixes.mjs` (munkamappa, mentett kimenet)                                                                               | a javítások 48 rontásából 47-et megfogják a tesztek (a túlélő: a háttérfrissítés tesztje túl korán ellenőrzött)         |
  | `L20_08_mutacio_vegso.png`                | ugyanaz (a teszt javítása és két új rontás után, mentett kimenet)                                                                       | 50/50                                                                                                                   |
  | `L20_09_kliens_lefedettseg.png`           | `npm run coverage` a `client/`-ben (mentett kimenet)                                                                                    | 353 teszt, lefedettség fájlonként (99,91 / 99,15 / 100 / 100%)                                                          |
  | `L20_10_kliens_lint_build.png`            | `npm run lint`, `npm run typecheck`, `npm run build` (mentett kimenet)                                                                  | ESLint, TypeScript és build hiba nélkül; JS 424,59 kB (gzip 132,76 kB)                                                  |
  | `L20_11_szerver_ertekelesek_nezo.png`     | `server/src/modules/photos/photos.catalog.ts` (144–165. sor)                                                                            | a lista értékelései egyetlen csoportosító lekérdezéssel; a néző jelzője (kifizetett rendelés)                           |
  | `L20_12_szerver_tanusitvany.png`          | `server/src/modules/photos/photos.dto.ts`, `certificateOf` (146–159. sor)                                                               | a tanúsítvány: a regisztráció ideje, a tranzakció, a hálózat, a szerződés és Etherscan-oldala                           |
  | `L20_13_url_nezet.png`                    | `client/src/photos/galleryParams.ts`, `parseGalleryParams` (74–88. sor)                                                                 | a nézet az URL-ből: tisztítás, fordított ártartomány, lapkorlát                                                         |
  | `L20_14_tanusitvany_ellenorzes.png`       | `client/src/api/photos.api.ts`, `isCertificate` (130–147. sor)                                                                          | a tanúsítvány ellenőrzése: a linkek csak a kiírt hash, illetve cím Etherscan-oldalára mutathatnak                       |
  | `L20_15_tanusitvany_panel.png`            | `client/src/components/photos/ChainCertificate.tsx`, `ChainCertificate` (163–207. sor)                                                  | a tanúsítvány-panel                                                                                                     |
  | `L20_16_szerkesztes_szabalyai.png`        | `client/src/components/photos/useGalleryDrafts.ts` (146–202. sor)                                                                       | a szűrősáv piszkozata: külső változás, előzmény-sorozat, árhiba, alkalmazás                                             |
  | `L20_17_galeria_oldal.png`                | `client/src/pages/GalleryPage.tsx`, `GalleryPage` (119–174. sor)                                                                        | a galériaoldal állapota: lekérdezések, betöltési állapot, fókusz és bejelentés, URL-frissítés                           |
  | `L20_18_betoltes_allapota.png`            | `client/src/lib/loadState.ts`, `loadStateOf` (18–22. sor)                                                                               | betöltés / kész / hiba / újrapróbálás                                                                                   |
  | `L20_19_fokusz_helyreallas.png`           | `client/src/hooks/useFocusAfterRecovery.ts` (11–27. sor)                                                                                | sikeres újrapróbálás után fókusz – ha a fókusz máshol van, bejelentés                                                   |
  | `L20_20_adatlap_nezet.png`                | `client/src/pages/PhotoDetailPage.tsx`, `pageViewOf` (50–60. sor)                                                                       | az adatlap nézete: nem található / kép / betöltés / hiba                                                                |
  | `L20_21_teszt_csonk.png`                  | `client/src/test/fetch.ts`, `stubFetch` (54–88. sor)                                                                                    | tesztsegéd: útvonalhoz kötött válaszok, a kiszolgált címek rögzítése                                                    |
  | `L20_22_teszt_url.png`                    | `client/src/pages/GalleryPage.test.tsx` (64–86. sor)                                                                                    | teszt: az URL paraméterei a kérésbe, a mezőkbe és a böngészőfül címébe kerülnek                                         |
  | `L20_23_teszt_gepeles_elozmeny.png`       | `client/src/pages/GalleryPage.test.tsx` (210–232. sor)                                                                                  | teszt: a gépelés folytatása az előző bejegyzés helyére lép, a vissza gomb a keresés előttre visz                        |
  | `L20_24_teszt_sajat_frissites.png`        | `client/src/pages/GalleryPage.test.tsx` (302–328. sor)                                                                                  | teszt: a késleltetett alkalmazás közben gépelt betű nem vész el                                                         |
  | `L20_25_teszt_ujraprobalas.png`           | `client/src/pages/PhotoDetailPage.test.tsx` (147–167. sor)                                                                              | teszt: újrapróbálás közben a gomb a helyén marad (foglalt), siker után a fókusz a címre kerül                           |
  | `L20_26_teszt_tanusitvany_ellenorzes.png` | `client/src/api/photos.api.test.ts` (108–127. sor)                                                                                      | teszt: a hibás tanúsítvány (pl. `javascript:` vagy idegen link) és néző-jelző váratlan válasz                           |
  | `L20_27_galeria_oldal_megjelenites.png`   | `client/src/pages/GalleryPage.tsx` (176–244. sor)                                                                                       | a galériaoldal megjelenítése: szűrősáv, találatszám, hiba, üres állapot, rács, lapozó                                   |
  | `L20_30_galeria.png`                      | `render.mjs url --url http://localhost:4173/ --width 1280 --height 900`                                                                 | élő galéria (produktív build, a szerver a tesztadatbázison)                                                             |
  | `L20_31_galeria_mobil.png`                | ugyanaz, `--width 390 --height 900`                                                                                                     | galéria mobilon (a szűrők a panelben)                                                                                   |
  | `L20_32_galeria_szurve.png`               | `… --url "http://localhost:4173/?categoryId=8&maxPrice=9000&sort=price_desc" --width 1280 --height 760`                                 | szűrt nézet: a szűrők címkéi, „Szűrők törlése”                                                                          |
  | `L20_33_galeria_ures.png`                 | `… --url "http://localhost:4173/?q=tenger" --width 1280 --height 780`                                                                   | nincs találat: „Keresés törlése”                                                                                        |
  | `L20_34_adatlap.png`                      | `… --url http://localhost:4173/photos/<a tócsás kép azonosítója> --width 1280 --height 1500`                                            | adatlap vendégként, a tanúsítvány-panellel (valódi Sepolia-tranzakció)                                                  |
  | `L20_35_adatlap_mobil.png`                | Chrome DevTools képernyőkép (390 × 844, 2×, mobil emuláció, teljes oldal)                                                               | adatlap mobilon: ár, tanúsítvány, leírás, adatok, értékelések                                                           |
  | `L20_36_nem_talalhato.png`                | `… --url http://localhost:4173/photos/nem-azonosito --width 1280 --height 480`                                                          | érvénytelen azonosító: „A kép nem található”                                                                            |
  | `L20_37_adatlap_vevo.png`                 | Chrome DevTools képernyőkép (bejelentkezett vevő)                                                                                       | „Már megvetted.” – az eredeti letöltése                                                                                 |
  | `L20_38_adatlap_bejelentkezve.png`        | Chrome DevTools képernyőkép (bejelentkezett, nem vevő)                                                                                  | „Az online fizetés hamarosan elérhető.” (a fizetés az L22-ben)                                                          |
  | `L20_39_tanusitvany_panel.png`            | Chrome DevTools elem-képernyőkép (a tanúsítvány-panel)                                                                                  | a dolgozat kulcsképe: hálózat, a regisztráció ideje, SHA-256, dHash, blokk, tranzakció, szerződés                       |
  | `L20_40_audit_statikus.png`               | `node audit-l20-static.mjs` (munkamappa, mentett kimenet)                                                                               | audit: titok, tiltott fájl, láthatatlan karakter, hivatkozás, kliensoldali kockázatok – csak a tesztfájl hossza jelezve |
  | `L20_41_audit_fuggosegek.png`             | `npm ci`, `npm audit --omit=dev`, `npm audit` a `client/` és a `server/` mappában (mentett kimenet)                                     | tiszta telepítés a lockfile-ból; a kliens 0 sebezhetőség, a szerveren a `source-map-js` jelzés (L30)                    |
  | `L20_42_audit_fuzz.png`                   | `npx vitest run --config fuzz/vitest.config.mjs l20` két kezdőértékkel (mentett kimenet)                                                | véletlenszerű próba a szerver sémája és DTO-i ellen: 0 eltérés                                                          |
  | `L20_43_audit_mutacio_elso.png`           | `node audit-l20-mutation.mjs client` (munkamappa, mentett kimenet)                                                                      | audit: 54 rontásból 41-et fogtak meg – 13 túlélő (11 tesztrés, 1 próbahiba, 1 egyenértékű)                              |
  | `L20_44_audit_uj_tesztek.png`             | `client/src/photos/galleryParams.test.ts` (49–53. sor)                                                                                  | az audit egyik új tesztje: a vezető nullák nem számítanak a szám hosszába                                               |
  | `L20_45_audit_tanusitvany_teszt.png`      | `client/src/components/photos/ChainCertificate.test.tsx` (191–197. sor)                                                                 | az audit új tesztje: a nem regisztrált kép tanúsítványadat nélkül, akkor is, ha a válaszban van                         |
  | `L20_46_audit_mutacio_vegso.png`          | `node audit-l20-mutation.mjs client <túlélők>`, `node audit-l20-mutation.mjs server` (mentett kimenet)                                  | a 12 korábbi túlélő az új tesztekkel mind megfogva; a szerveren 13/13                                                   |
  | `L20_47_audit_elo_szondak.png`            | `node audit-l20-live.mjs` (munkamappa, mentett kimenet)                                                                                 | 39/39 API-szonda a lefordított szerveren és az előnézet proxyján                                                        |
  | `L20_48_audit_lighthouse.png`             | `node lighthouse-summary-l20.mjs` (Lighthouse 13.4.1 jelentései)                                                                        | akadálymentesség 100 a galérián és az adatlapon (asztali, mobil); a bukott ellenőrzések oka                             |
  | `L20_49_audit_feketedoboz.png`            | Chrome DevTools eredményei (fókusznapló, billentyűleütések, mezőkitöltés, konzolos szkriptek, teljesítmény-nyomkövetés; mentett szöveg) | fókuszsorrend, gépelés, Enter, vissza gomb, címke törlése, konzol, hálózat, CLS valós betöltéssel                       |
  | `L20_50_audit_kliens_vegso.png`           | `npm run lint`, `npm run typecheck`, `npm run coverage` a `client/`-ben (mentett kimenet)                                               | az audit új tesztjeivel 356 teszt, lefedettség 99,91 / 99,15 / 100 / 100%                                               |

- Commit: `337dfe4` – `feat(L20): galéria és fotó adatlap – szűrés és lapozás az URL-ben, kártyák, tanúsítvány-panel, értékelések`

## L21 – Feltöltés oldala (2026-10-09)

- Elkészült:
  - szerver (az adatlap API-jának bővítése a design-README táblázata szerint): a `GET /api/photos/:id`
    válasza `pendingTransaction` mezőt kap – a regisztrációra váró kép már elküldött, de meg nem
    erősített tranzakciója (`txHash`, `txUrl` – Sepolián Etherscan-link, lokális láncon `null`;
    `pendingTransactionOf`), csak a kép kezelőjének (tulajdonos, admin); a kezelő szabálya egy helyre
    került (`canManage` a `photos.visibility.ts`-ben – a `canView`, a `hide` és a tranzakció adata
    ugyanazt használja);
  - kliens API-réteg: `upload.api.ts` – a feltöltés `XMLHttpRequest`-tel (a fetch nem ad feltöltési
    haladást), a fetch-burkolóval közös borítékkezeléssel (`interpretResponse`, `parseJsonText`,
    `retryAfterSecondsOf` a `http.ts`-ből kiemelve); `onProgress`, `onSent` (a törzs elment – az
    `xhr.upload` `load` eseménye), `AbortSignal`; a 201 válasza futásidőben ellenőrzött
    (`isUploadedPhoto`); `photos.api.ts`: `UploadedPhoto`, `PhotoDetail.pendingTransaction`
    (a `txUrl` csak a kiírt hash Etherscan-oldala lehet), `detailOfUploaded`, `photoKeys.lists()`;
    `categories.api.ts`: `categoriesQuery()` (a galéria és a feltöltés közös beállítása);
  - kliensoldali ellenőrzés a szerver szabályaival (`upload/uploadValidation.ts`): cím (3–120
    kódpont, látható karakterek, vezérlőkarakter tiltva), leírás (≤ 2000, CRLF→LF), ár (egész forint
    175–9 999 999, tagolt alak is), kategória; fájl: JPEG/PNG/WebP (MIME, enélkül kiterjesztés),
    ≤ 15 MB, az előnézet betöltése után a rövidebb oldal ≥ 600 képpont és ≤ 50 megapixel (a szerver
    dekódolási korlátja); a szövegszabályok közös segédjei a `lib/text.ts`-be kerültek (a
    regisztráció ellenőrzése is ezeket használja), a `lib/format.ts` fájlméretet formáz;
  - `useForm` (az L19-es `useAuthForm` általánosítása: szöveges, többsoros és választó mező; `reset`,
    `showErrors` fókusz nélkül, `showFailure`, `focusField`; stabil ref-visszahívások, a legfrissebb
    értékek egy ütemben érkező változásoknál); új UI-mezők: `SelectField`, `TextAreaField`;
  - a feltöltés oldala (`/upload`, védett útvonal; a fejlécben elsődleges „Feltöltés” gomb – keskeny
    képernyőn a fiókmenü „Kép feltöltése” hivatkozása): fogadóterület húzással és a natív
    fájlválasztóval (`FileDropZone`: a vezérlő neve „Kép Tallózás…”, kötelező, a súgó + a kiválasztott
    fájl összefoglalója + a hiba a leírása, a natív érték követi a kiválasztást, a húzást szöveg és
    keret is jelzi), kiválasztott fájl előnézettel, mérettel, felbontással (`SelectedFile`,
    `useImageSelection`: az objektum-URL eseménykezelőben készül és csere/törlés/elhagyás után
    felszabadul; a kliens és a szerver ítélete külön – a szerveré nem blokkol), haladásjelző
    (`UploadProgress`: `progressbar`, egész százaléknál frissül, az első esemény előtt határozatlan,
    „Mégse” a törzs elküldéséig, utána „a szerver feldolgozza” állapot), 409-kártya a szerver
    üzenetével, közérthető magyarázattal, a dHash-távolsággal és – ha nyilvános vagy saját – a
    meglévő kép adataival (`DuplicateNotice`), állapotkártya a 201 után (`RegistrationStatus`: a
    regisztráció lépései, a függő majd a tanúsítvány tranzakciója ugyanabban a sorban, 3 másodperces
    lekérdezés – `pollInterval.ts`: két perc után 30 s, tíz perc után, 404-re leáll, 429-nél a
    `Retry-After` –, a gyorsítótárat a 201 válasza tölti fel régi keltezéssel, hitelesítéskor a
    galéria listái érvénytelenednek); a hibák a helyükön (kép → fogadóterület, mező → mező, más →
    riasztás a küldő gomb mellett és leírásaként; 401 → kijelentkezett állapot); elnavigálás
    feltöltés közben megerősítéssel (`useBlocker`: „A feltöltés még tart.” – Maradok / Mégis
    elhagyom / Escape; az azonos oldalra mutató hivatkozás és a kijelentkezés kivétel), bezárás előtt
    a böngésző kérdez (`useBeforeUnload`); a megerősítés nélkül elhagyott oldal a még tartó feltöltést
    megszakítja; felhasználóváltáskor az oldal újraindul (`<Outlet key={user.id}>`), a fókusz a
    címre kerül és az élő régió elmondja;
  - fókusz és bemondás minden lépésben: a kiválasztás, az indulás, a törzs elküldése, a siker, a
    megszakítás, a hitelesítés, az elrejtés, a kategóriák újratöltése az élő régióban; az eltűnő
    vezérlők (Mégse, Kép cseréje, a megerősítő panel, az űrlap) fókusza a küldő gombra, a
    fájlválasztóra, az állapotsorra vagy a kártya címére kerül; az elutasított fájl rejtett riasztás;
  - tesztek: `UploadPage.test.tsx` (32 teszt, hamis `XMLHttpRequest`-tel – `test/xhr.ts`),
    `upload.api.test.ts`, `uploadValidation.test.ts`, `pollInterval.test.ts`, `DuplicateNotice.test.tsx`
    (ellenséges azonosítók), `SelectField.test.tsx`, `TextAreaField.test.tsx`, a router-, fiókmenü-,
    formázás- és szövegtesztek bővítése; szerveren `pendingTransactionOf`, `canManage` és a
    `GET /api/photos/:id` függő tranzakciója (tulajdonos, admin, állapotok);
  - dokumentáció: README (API: `pendingTransaction`), client/README (felépítés, „Feltöltés (L21)”
    szakasz), design-README (a bővítés megvalósult), FORRASOK (199–207, a 187 bővítve).
- Átnézés – két független kör (React, biztonság, akadálymentesség), a leletek teszt-először
  javítva:
  - 1. kör: nem volt kritikus. React: a szerver képhibáját az előnézet újratöltése törölte; a „Mégse”
       a törzs elküldése után is megszakítást ígért (a szerver a megkezdett feldolgozást nem állítja le,
       a kép elkészülne); fókuszvesztés a 201 / Mégse / elutasított csere után; 401 feltöltés közben
       nem zárta a munkamenetet; az oldal állapota túlélte a felhasználóváltást; a kategóriák hibája
       zsákutca volt; az objektum-URL `useMemo`-ban (a StrictMode a használt URL-t szabadította volna
       fel); nem volt elnavigálási védelem; a fejléc gombjának `hidden sm:inline-flex` osztálya a
       Tailwind-kaszkádban (a `cx` nem egyesít) nem rejtett. Biztonság: a 3 másodperces lekérdezés
       15 perc alatt elfogyasztotta volna az IP-nkénti kérelemkeretet (300/15 perc) – visszalépő
       ütem; a kezdőadat (`initialData`) a közös gyorsítótárban túlélte a kijelentkezést –
       `setQueryData` régi keltezéssel; a `canManage` kiemelése. Akadálymentesség: a fájlválasztó
       „nincs fájl kiválasztva”-t jelentett (az érték kattintáskor törlődött), a kiválasztás és az
       elutasítás nem volt bemondva, a fogadóterület piros kerete a kaszkádban elveszett, a vezérlőnek
       nem volt tárgya (csak „Tallózás…”) és nem volt kötelező, a tranzakció sora eltűnt a fókusszal;
       szóhasználat (MB/képpont egységesítés, 409 közérthető magyarázattal, CHAIN_FAILED teendővel).
  - 2. kör: a „Mégse” eltűnésekor (a törzs elküldésekor) a rajta álló fókusz elveszett; a
       megerősítő panel nem záródott a feltöltés végén és nem volt neve/leírása/Escape-je; a
       kategória-újratöltés gombja a fókusszal tűnt el; a tranzakció sora CHAIN_FAILED-nél eltűnt; a
       kijelentkezés navigációját a blokkoló elnyelte (a feltöltés tovább futott); az azonos oldalra
       mutató gomb megerősítést kért; a 404 utáni szöveg újrapróbálást ígért; a `Retry-After` felső
       korlát nélkül; az elrejtett kép megjegyzése hamis volt; módosított kattintás a fiókmenü
       hivatkozásán; a kB-os méret törtszámmal („244,722 kB”). Elfogadva, későbbre: a lekérdezési keret
       kártyánként és nem munkamenetenként számol (prototípus); a mezők szerkeszthetők maradnak feltöltés
       közben; a Helmet CSP-je a `blob:` előnézetet blokkolja majd (L31: `img-src` bővítése); kézi
       képernyőolvasó-próba (L26); `npm audit` – `source-map-js` a Prisma láncán (külön chore).
- Ellenőrzés: kliens 430 teszt, lefedettség 98,6 % (utasítás) / 95,9 % (ág); szerver 1089 teszt
  (DB-tesztekkel); lint, típusellenőrzés, build tiszta; axe az űrlapon és az állapotkártyán. A tesztkörnyezet időkorlátai a
  lefedettséggel műszerezett, párhuzamos futáshoz igazítva (`asyncUtilTimeout` 2,5 s, `testTimeout` 15 s –
  a sikeres teszt ideje nem változik).
- Élő próba lokális Hardhat-láncon (új node, `deploy:local`, a szerver `CHAIN_ID=31337`-tel a
  tesztadatbázison; demóadatok: két saját fotó regisztrálva): a harmadik saját fotó feltöltése →
  függő (automine szüneteltetve) → hitelesítve a 4. blokkban, az adatlapon „Lokális Hardhat-hálózat”
  tanúsítvánnyal; a tócsás fotó eredetije (9,0 MB) → 409 „nagyon hasonló” (2 bit eltérés, a meglévő
  kép hivatkozásával), a tócsás fotó újra → 409 „azonos”; a 21,4 MB-os eredeti → kliensoldali hiba;
  haladás fojtott hálózaton (Fast 4G, Fast 3G). Mellékleletként: a láncra már regisztrált kép
  újratöltését a szerver a láncon is észleli („már regisztrálták a blokkláncon”, 409).
- Képek:

  | Kép                                   | Forrás                                                                         | Tartalom                                                                       |
  | ------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
  | `L21_01_szerver_piros.png`            | `npx vitest run --project unit` (`photos.dto.test.ts`, mentett kimenet)        | piros: a `pendingTransactionOf` 5 tesztje, a függvény még nincs                |
  | `L21_02_kliens_piros.png`             | `npx vitest run` (mentett kimenet)                                             | piros: 21 bukó teszt, 2 tesztfájl modulja még hiányzik                         |
  | `L21_03_szerver_zold.png`             | `npm test` a `server/`-ben (mentett kimenet)                                   | 68 fájl, 1089 teszt zöld (a DB-tesztekkel)                                     |
  | `L21_04_kliens_lefedettseg.png`       | `npm run coverage` a `client/`-ben (mentett kimenet)                           | 430 teszt, 98,6 % lefedettség, az L21-es fájlok sorai                          |
  | `L21_05_kliens_lint_build.png`        | `npm run lint`, `npm run typecheck`, `npm run build` (mentett kimenet)         | lint, típus, build tiszta                                                      |
  | `L21_06_atnezes1_piros.png`           | `npx vitest run` az 1. átnézési kör új tesztjeivel (mentett kimenet)           | piros: 29 bukó teszt a javítások előtt                                         |
  | `L21_07_atnezes2_piros.png`           | `npx vitest run <3 fájl>` a 2. kör tesztjeivel (mentett kimenet)               | piros: 16 bukó teszt a javítások előtt                                         |
  | `L21_08_szerver_fuggo_tranzakcio.png` | `server/src/modules/photos/photos.dto.ts` (179–186. sor)                       | `pendingTransactionOf`: csak PENDING_CHAIN és hash esetén                      |
  | `L21_09_szerver_canmanage.png`        | `server/src/modules/photos/photos.visibility.ts` (41–59. sor)                  | `canManage` és a rá épülő `canView`                                            |
  | `L21_10_validacio_fajl.png`           | `client/src/upload/uploadValidation.ts` (100–122. sor)                         | a fájl típusa, mérete, felbontása (600 képpont, 50 megapixel)                  |
  | `L21_11_feltoltes_api.png`            | `client/src/api/upload.api.ts` (73–120. sor)                                   | `uploadPhoto`: XHR, haladás, `onSent`, megszakítás, közös borítékkezelés       |
  | `L21_12_kepkivalasztas_hook.png`      | `client/src/upload/useImageSelection.ts` (27–91. sor)                          | a kiválasztott kép: objektum-URL, kliens- és szerverhiba külön                 |
  | `L21_13_lekerdezesi_utem.png`         | `client/src/upload/pollInterval.ts` (22–35. sor)                               | a lekérdezés üteme: 3 s → 30 s → leáll; 404, 429                               |
  | `L21_14_feltoltes_inditasa.png`       | `client/src/pages/UploadPage.tsx` (310–362. sor)                               | `startUpload`: haladás, `onSent`, siker, hiba, fókusz                          |
  | `L21_15_bekuldes_sorrend.png`         | `client/src/pages/UploadPage.tsx` (364–383. sor)                               | beküldés: előbb a kép, aztán a mezők – a fókusz az elsőre                      |
  | `L21_16_allapotkartya_lekerdezes.png` | `client/src/components/upload/RegistrationStatus.tsx` (174–202. sor)           | a kártya lekérdezése és a cím fókusza                                          |
  | `L21_17_fogadoterulet_vezerlo.png`    | `client/src/components/upload/FileDropZone.tsx` (44–54. sor)                   | a natív vezérlő értéke követi a kiválasztást                                   |
  | `L21_18_duplikacio_kartya.png`        | `client/src/components/upload/DuplicateNotice.tsx` (56–90. sor)                | a 409-kártya: riasztás csak az üzenet, a meglévő kép adatai                    |
  | `L21_19_useform_fokusz.png`           | `client/src/hooks/useForm.ts` (64–81. sor)                                     | `showErrors`: fókusz vagy rejtett riasztás az első hibás mezőre                |
  | `L21_20_fejlec_feltoltes_gomb.png`    | Chrome DevTools képernyőkép (bejelentkezve, galéria)                           | a fejléc „Feltöltés” gombja                                                    |
  | `L21_21_fiokmenu_kep_feltoltese.png`  | Chrome DevTools képernyőkép (nyitott fiókmenü)                                 | a fiókmenü „Kép feltöltése” hivatkozása                                        |
  | `L21_22_feltoltes_oldal.png`          | Chrome DevTools képernyőkép (teljes oldal)                                     | a feltöltés oldala üresen: fogadóterület a korlátokkal, mezők, magyarázat      |
  | `L21_23_kivalasztott_fajl.png`        | Chrome DevTools képernyőkép (teljes oldal)                                     | kiválasztott fájl előnézettel, mérettel, felbontással; kitöltött mezők         |
  | `L21_24_ures_bekuldes_hibak.png`      | Chrome DevTools képernyőkép (üres beküldés után)                               | minden hiba egyszerre, a fogadóterület hibája is                               |
  | `L21_25_tul_nagy_fajl.png`            | Chrome DevTools képernyőkép (teljes oldal, 21,4 MB-os saját eredeti)           | kliensoldali hiba: „A fájl túl nagy: legfeljebb 15 MB lehet…”                  |
  | `L21_26_feltoltes_folyamatban.png`    | Chrome DevTools képernyőkép (Fast 4G fojtás, 9,0 MB-os fájl)                   | haladásjelző: 2,3 / 9,0 MB, 26 %, Mégse                                        |
  | `L21_27_409_hasonlo_kep.png`          | Chrome DevTools képernyőkép (teljes oldal)                                     | 409: „nagyon hasonló” – 2 bit eltérés, a meglévő kép hivatkozásával            |
  | `L21_28_409_azonos_kep.png`           | Chrome DevTools képernyőkép                                                    | 409: „azonos” – bitre azonos egy már feltöltött képpel                         |
  | `L21_29_regisztralas_folyamatban.png` | Chrome DevTools képernyőkép (lokális lánc, automine szüneteltetve)             | állapotkártya: „Regisztrálás folyamatban”, függő tranzakció                    |
  | `L21_30_hitelesitve.png`              | Chrome DevTools képernyőkép (a blokk kibányászása után)                        | állapotkártya: „Hitelesítve a blokkláncon”                                     |
  | `L21_31_adatlap_lokalis_lanc.png`     | Chrome DevTools képernyőkép (teljes oldal)                                     | az új kép adatlapja a lokális lánc tanúsítványával (4. blokk)                  |
  | `L21_32_galeria_uj_kep.png`           | Chrome DevTools képernyőkép                                                    | a galéria az új, hitelesített képpel                                           |
  | `L21_33_feltoltes_mobil.png`          | Chrome DevTools képernyőkép (390 × 844, 2×, mobil emuláció, teljes oldal)      | a feltöltés oldala mobilon                                                     |
  | `L21_34_elnavigalas_megerosites.png`  | Chrome DevTools képernyőkép (Fast 3G fojtás, a Galéria hivatkozásra kattintva) | megerősítés feltöltés közben: Maradok / Mégis elhagyom                         |
  | `L21_35_teszt_sikeres_feltoltes.png`  | `client/src/pages/UploadPage.test.tsx` (352–388. sor)                          | teszt: a kérés mezői, a haladás, a határozatlan sáv, a szöveges érték          |
  | `L21_36_teszt_fakexhr.png`            | `client/src/test/xhr.ts` (6–79. sor)                                           | tesztsegéd: hamis XMLHttpRequest (haladás, elküldés, válasz, megszakítás)      |
  | `L21_37_teszt_fokusz_megse.png`       | `client/src/pages/UploadPage.test.tsx` (601–624. sor)                          | teszt: a Mégse eltűnésekor a fókusz az állapotsorra, a 409 után a küldő gombra |
  | `L21_38_teszt_lekerdezesi_utem.png`   | `client/src/upload/pollInterval.test.ts` (17–66. sor)                          | teszt: a lekérdezési ütem szabályai                                            |

- Döntések:
  - a feltöltés `XMLHttpRequest`-tel megy (a terv L21 pontja), de a válasz értelmezése a
    fetch-burkolóéval közös – egy hibamodell;
  - a „Mégse” csak a törzs elküldéséig: a szerver a megkezdett feldolgozást nem állítja le, a kép a
    láncra kerülne, miközben a felület „megszakítva”-t mondana;
  - a kliens csak a saját ellenőrzéseit tekinti blokkolónak; a szerver képhibája (sérült, egyszínű
    kép) látszik, de újra lehet küldeni – a szerver dönt újra;
  - a kártya kezdőadata nem `initialData`, hanem a gyorsítótárba írt 201-válasz régi keltezéssel:
    így a kijelentkezés kiüríti, az adatlap pedig frissnek nem tekinti;
  - a lekérdezés visszalépő üteme (3 s / 30 s / leáll) a 300 kérés / 15 perc keret miatt;
  - a megerősítő panel nem natív `<dialog>` (a jsdom nem valósítja meg a `showModal`-t): névvel,
    leírással, Escape-pel ellátott csoport, a fókusz a hivatkozásra tér vissza;
  - a `SelectField` kötelezőségét `aria-required` mondja (a Chrome a kötelező, üres `select`-et már
    betöltéskor érvénytelennek jelentené).
- Későbbre: L22 – a saját képek listája a `pendingTransaction`/`hiddenBy` mezőkkel; L26 – kézi
  képernyőolvasó-próba (sr-only fájlválasztó iOS/Android), `eslint-plugin-jsx-a11y`; L31 – Helmet
  `img-src 'self' data: blob:`; chore – `npm audit fix` (`source-map-js`).

- Commit: `94d5fdf` – `feat(L21): feltöltés oldala – fogadóterület, kliensoldali ellenőrzés, XHR-feltöltés haladással, 409-kártya, állapotkövetés`

## L22 – Vásárlás és vezérlőpult (2026-10-09)

- Elkészült:
  - szerver (a design-README táblázatának L22-es sorai): a rendelés válasza (`OrderDto` – a
    `GET /api/orders/by-session/:id` és a `GET /api/me/purchases`) kiegészült a vevőnek szóló
    mezőkkel: `downloadable` (kifizetett és a moderátor nem vette le), `reviewable` (kifizetett,
    nyilvános kép, még nincs saját értékelés), `review` (a vevő saját értékelése: `id`, `rating`) és
    `photo.ownerDisplayName`; a lekérdezés a vevő értékelését beágyazott `select`-tel kéri le
    (`orderSelect(buyerId)`), a Stripe-azonosító, az eredeti fájl kulcsa és a tulajdonos e-mailje
    továbbra sem kerül a válaszba; a saját képek listája (`GET /api/me/photos`) a galéria mezőin túl a
    tulajdonosnak szóló `description`, `hiddenBy` és `pendingTransaction` mezőket adja
    (`OWN_PHOTO_SELECT`, `toOwnPhotoListItemDto`; a lapozás `findOwnPage` a közös pillanatkép-segéddel);
    az `isPublic` szabály a `photos.visibility.ts`-be került;
  - kliens API-réteg: `orders.api.ts` (`startCheckout`, `getOrderBySession`, `listPurchases`,
    `orderKeys`; a Stripe-munkamenet azonosítója a szerver sémája szerint ellenőrzött –
    `isCheckoutSessionId` –, a fizetési cím csak `https`, pontosan a `checkout.stripe.com` eredet,
    belépési adat nélkül – `isStripeCheckoutUrl`); `photos.api.ts`: `listOwnPhotos`, `updatePhoto`
    (PATCH), `hidePhoto` (DELETE), `photoKeys.own()/ownPage()`, futásidejű ellenőrzés (`hiddenBy`
    pontosan akkor, ha a kép rejtett); `lib/redirect.ts` (az átirányítás egy helyen, tesztben
    cserélhető);
  - az adatlap „Megveszem” gombja (`PurchaseBox`): a fizetés indítása bemondással, a gomb a
    sikeres válasz után is foglalt (az átirányítás folyamatban; a dupla kattintás nem indít második
    fizetést), átirányítás csak a Stripe címére (más válasz riasztás); a Stripe-ról visszalépve a
    vissza-gyorsítótárból helyreállított oldal gombja újra használható (`pageshow`); a 409
    `ALREADY_PURCHASED` és a 404 az adatlap újratöltésével magyarázódik (a gomb addig foglalt), ha
    az újratöltés nem igazolja, riasztás; a már megvett képnél a fókusz a letöltés hivatkozására;
  - visszatérési oldalak: `/checkout/success?session_id=…` (`CheckoutSuccessPage`): az azonosító
    ellenőrzése kérés előtt („Érvénytelen hivatkozás”), a rendelés 3 másodpercenkénti lekérdezése
    (`pollInterval.ts`: két perc után 30 s, tíz perc után leáll – ekkor a szöveg megmondja, hol
    nézhető meg később, és a „Frissítés” gomb kézzel kérdez), PAID után a rendelés adatai és az
    eredeti letöltése (vagy a moderátori levétel magyarázata), bemondás, az adatlap és a
    vásárlásaim gyorsítótárának érvénytelenítése; a lejárt/sikertelen fizetés, a nem található
    rendelés (más fiók vagy ismeretlen) és a betöltési hiba (újrapróbálással) saját nézet; a nézet
    váltásakor a fókusz a címre, ha sehol vagy eltűnt elemen volt; `/checkout/cancel?photoId=…`
    (`CheckoutCancelPage`): „Nem történt terhelés”, vissza a képhez (csak UUID azonosítóval) vagy a
    galériába; mindhárom új útvonal védett;
  - a vezérlőpult (`/dashboard`, `DashboardPage`): a fül és az oldal az URL-ben
    (`?tab=kepeim|vasarlasaim`, `?page=`; `dashboard/dashboardParams.ts`), ezért a fülek
    hivatkozások (`nav` + `aria-current`) darabszámmal; mindkét listát az oldal kérdezi; amíg a
    saját képek közt van regisztrációra váró, a lista 3 másodpercenként frissül
    (`createPollClock().trackPending`: az időkeret csak új függő képnél indul újra), a hitelesítést
    és a sikertelen regisztrációt egyetlen bemondás sorolja fel – a másik fülön is –, és a galéria
    listái érvénytelenednek (`registrationNotices.ts`); lapozás és fülváltás után a fókusz a
    találatszámra (vagy az üres állapot címére) kerül, különben az összesítés hangzik el
    (`listSummary.ts`);
  - Saját képeim (`OwnPhotosTab`, `OwnPhotoRow`): soronként bélyegkép (`Thumbnail`; a rejtett képnek
    nincs), a cím hivatkozás az adatlapra, dátum, állapotjelvény magyarázattal (`ownPhotoStatus.ts`:
    Hitelesítve · Regisztrálás folyamatban a függő tranzakció linkjével · Sikertelen regisztráció „Az
    adminisztrátor újrapróbálja” · Elrejtve „Te vetted le a galériából” · Moderátor eltávolította „A
    vásárlók sem tölthetik le” + „Miért?” feltáró magyarázat), ár rejtett címkével, műveletek a kép
    nevével (a látható szöveg és a teljes név egy-egy szövegcsomópont: „Szerkesztés: <cím>”,
    „Levétel: <cím>”); a rejtett kép nem módosítható, levenni csak hitelesített képet lehet; az
    eltűnő tranzakció-linkről a fókusz a kép címére kerül; mobilon kártyák, szélesebb képernyőn
    táblázatszerű sorok;
  - szerkesztés és levétel párbeszédablakban (`ui/Dialog.tsx` – natív `<dialog>`, `showModal()`): a
    szerkesztő (`EditPhotoDialog`) a feltöltés mezőit és szabályait használja (`PhotoFormFields` –
    az `UploadPage`-ből kiemelve –, `useForm` kiinduló értékekkel), a mentés PATCH a szerver
    formájában; a levétel (`HidePhotoDialog`) a következményt mondja el (végleges; a vevők továbbra
    is letölthetik; a láncon a rekord megmarad), a fókusz a „Mégse” gombon indul; amíg a kérés fut,
    az ablak nem zárható (Mégse foglalt, Escape hatástalan – `closedby="none"`); siker után a lista
    gyorsítótára azonnal frissül (`setQueriesData`), majd a lista, az adatlap és a galéria
    érvénytelenedik, a fókusz a sor címére (a műveletek eltűntek) és bemondás; a hiba (409 – a kép
    közben megváltozott; a kategóriák újratöltése) az ablakban marad, a lista frissül;
  - Vásárlásaim (`PurchasesTab`): soronként a kép, a fotós neve, a fizetés napja, az ár (rejtett
    címkékkel), az eredeti letöltése a szerver védett címén, a saját értékelés („Értékelted: 4 / 5”)
    vagy az „Értékelés írása” hivatkozás az adatlapra; a moderátor által levett kép sora megmarad
    „Most nem tölthető le” jelzéssel;
  - navigáció: a fő navigációban és a fiókmenüben „Vezérlőpult” (a fiókmenü hivatkozásai külön
    sorban; a vezérlőpult másik füléről vagy oldaláról az alapnézetre visz);
  - tesztek: `DashboardPage.test.tsx` (29), `CheckoutSuccessPage.test.tsx` (11),
    `CheckoutCancelPage.test.tsx`, `orders.api.test.ts`, `dashboardParams.test.ts`, a
    `PhotoDetailPage`-, `AccountMenu`-, `router`-, `photos.api`-, `pollInterval`- és
    `UploadPage`-tesztek bővítése; tesztsegédek: `test/dialog.ts` (a jsdom `<dialog>`-pótléka:
    `showModal`/`close`, aszinkron `close` esemény, fókusz-visszaállítás), `test/orders.ts`,
    `test/photos.ts` (`ownPhotoListItem`); szerveren `orders.dto.test.ts` (újraírva),
    `photos.dto.test.ts`, `tests/db/orders.read.test.ts` (új mezők, saját értékelés, levétel,
    letiltott fotós, a kiszivárgó mezők tiltólistája), `tests/db/users.test.ts`;
  - dokumentáció: README (API: `OrderDto`, saját képek), client/README (felépítés, „Vásárlás és
    vezérlőpult (L22)” szakasz), FORRASOK (208–212: MDN és WHATWG `<dialog>`, TanStack
    `setQueriesData`, Stripe success URL, MDN `Location.assign`).
- Átnézés – három független kör (React, biztonság, akadálymentesség), a leletek teszt-először
  javítva:
  - 1. kör (26 bukó teszt a javítások előtt): React: a párbeszédablak bezárása az elem eltávolítása
       után történt (a böngésző nem adta vissza a fókuszt), és a StrictMode késve érkező `close`
       eseményét a szülő döntésének vette – `useLayoutEffect`-takarítás, a saját bezárás jelzése,
       fókusz a megnyitó gombra vagy az oldal címére; a függő tranzakció linkjének fókusza a React
       Router `Link` ref-jén át nem volt elérhető a mutációs fázisban – DOM-lekérdezés
       (`data-row-title`); a lekérdezési stopper nem indult újra új függő képnél; a „Megveszem” a
       siker után felszabadult (dupla fizetés), a vissza-gyorsítótárból visszatérve örökre foglalt
       maradt, a 409 `ALREADY_PURCHASED` nem töltötte újra az adatlapot; a sikeres fizetés oldalán
       a nézetváltás fókusza, a lejárt fizetés bemondása és a tízperces leállás hiányzott.
       Biztonság: `isStripeCheckoutUrl` elfogadta a `blob:` címet (az eredete a beágyazott címé) –
       séma-ellenőrzés; a `hiddenBy` nem rejtett képnél is átment az ellenőrzésen. Akadálymentesség:
       a sorok műveleteinek neve nem tartalmazta a kép címét, a lapozás és a fülváltás fókusza
       elveszett, a hibák a nyitott ablak alatt az oldal élő régiójába kerültek (inert), a levétel
       futása közben az ablak bezárható volt, a sikertelen levétel után a fókusz elveszett.
  - 2. kör (5): a tízperces leállás után nem volt kézi „Frissítés”; a nem igazolt „már megvette”
       válasz némán elnyelődött – riasztás; az üres fülre váltva a fókusz elveszett (az üres állapot
       címére); több kép egy lekérdezésben hitelesítve egymást felülíró bemondásokat adott – egy
       felsorolás; a Chromium az ismételt Escape-et a `cancel` megakadályozása ellenére végrehajtja –
       `closedby="none"`.
  - 3. kör (4): a stopper minden lekérdezésnél újraindult (a régóta függő kép is nyitva tartotta az
       időkeretet) – csak új azonosítónál; a fiókmenü „Vezérlőpult” hivatkozása a másik fülről is
       navigáció nélkül zárta a panelt – alapnézet-ellenőrzés; a tízperces időkeret lejárta után
       megjelenő új függő kép nem indította újra a lekérdezést; a 409-es levétel után a lista nem
       frissült. Elfogadva, dokumentálva: a `reviewable` hamis értéke elárulhatja, hogy a fotós le
       van tiltva (a vevő a saját rendelésénél); felhasználónkénti kérelemkeret a lekérdezett
       végpontokra (L30/L32); a kliens HTML-jének `frame-ancestors`/`Referrer-Policy` fejléce (L31);
       az élő régió bemondásai nyitott ablak alatt (központi javítás az L23 előtt); a letöltés
       hivatkozásának szerveroldali hibaoldala (L31); Playwright-tesztek és kézi billentyűzet/NVDA
       próba a natív ablakra (L26/L28).
- Ellenőrzés: kliens 525 teszt, lefedettség 98,5 % (utasítás) / 95,4 % (ág); lint,
  típusellenőrzés, build tiszta; szerver 68 fájl, 1100 teszt zöld (DB-tesztekkel) – az
  `imageDecoding.test.ts` egy tesztje a teljes futás terhelése alatt az 5 másodperces időkorlátba
  ütközött (a sharp dekódereinek betöltése), külön futtatva 3/3 zöld; az L22 nem érinti, az
  időkorlát emelése külön chore.
- Élő próba lokális Hardhat-láncon (új node, `deploy:local`, a szerver `CHAIN_ID=31337`-tel a
  tesztadatbázison, a build előnézete a 4173-as porton a `/api` proxyval): a `prepare-live-l22.mjs`
  két fiókot hozott létre (Fotós Fanni – fotós; Kép Károly – vevő), Fanni három saját tesztfotóját az
  API-n át töltötte fel (a lokális láncon regisztrálódtak), majd SQL-lel állította be a vezérlőpult
  állapotait (függő regisztráció jelképes tranzakció-hash-sel, sikertelen regisztráció, két fájl
  nélküli rejtett kép – saját, illetve moderátori levétel), Károlynak kifizetett rendeléseket
  (egyikhez saját értékelés, egy a moderátor által levett képre) és egy függő rendelést jelképes
  `cs_test_…` azonosítóval. A sikeres fizetés oldala a függő rendelést 3 másodpercenként kérdezte
  (szervernapló: `GET /api/orders/by-session/:sessionId → 200`), a rendelés SQL-lel PAID-re
  állítása után „Sikeres fizetés” az eredeti letöltésével – a webhook hatását így játszottuk el. A
  valódi átirányítást Károly „Megveszem” gombja igazolta: `POST /api/orders/checkout → 201`, az
  oldal a `checkout.stripe.com` fizetési oldalára váltott (a Stripe-oldal képét és a tesztfizetést a
  szerző készíti). Mellékleletként: a szerver összegző folyamata a jelképes hash-ű függő képet
  visszaállította hitelesítettre (a láncon nincs ilyen tranzakció) – a demóban elfogadva.
- Képek:

  | Kép                                   | Forrás                                                                                                                 | Tartalom                                                                                                                                    |
  | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
  | `L22_01_szerver_piros.png`            | `npx vitest run --project unit` (`orders.dto`, `photos.dto`), `--project db` (`orders.read`, `users`; mentett kimenet) | piros: 12 + 6 bukó teszt az `OrderDto` és a saját képek új mezőire                                                                          |
  | `L22_02_kliens_piros.png`             | `npx vitest run` az L22 tesztfájljain (mentett kimenet)                                                                | piros: 40 bukó teszt, a `dashboardParams` modulja még hiányzik                                                                              |
  | `L22_03_szerver_zold.png`             | `npm test` a `server/`-ben, majd `npx vitest run --project unit src/services/imageDecoding.test.ts` (mentett kimenet)  | 68 fájl, 1100 teszt zöld; az időkorlátba ütközött dekóder-teszt külön 3/3 zöld                                                              |
  | `L22_04_kliens_lefedettseg.png`       | `npm run coverage` a `client/`-ben (mentett kimenet)                                                                   | 525 teszt, 98,5 % lefedettség, az L22-es fájlok sorai                                                                                       |
  | `L22_05_kliens_lint_build.png`        | `npm run lint`, `npm run typecheck`, `npm run build` (mentett kimenet)                                                 | lint, típus, build tiszta                                                                                                                   |
  | `L22_06_atnezes1_piros.png`           | `npx vitest run` az 1. átnézési kör új tesztjeivel (mentett kimenet)                                                   | piros: 26 bukó teszt a javítások előtt                                                                                                      |
  | `L22_07_atnezes2_3_piros.png`         | `npx vitest run` a 2. és a 3. kör tesztjeivel (mentett kimenet)                                                        | piros: 5, illetve 4 bukó teszt a javítások előtt                                                                                            |
  | `L22_08_szerver_orderdto.png`         | `server/src/modules/orders/orders.dto.ts` (76–95. sor)                                                                 | `toOrderDto`: `downloadable`, `reviewable`, `review`, `ownerDisplayName`                                                                    |
  | `L22_09_szerver_sajat_kepek_dto.png`  | `server/src/modules/photos/photos.dto.ts` (185–197. sor)                                                               | `toOwnPhotoListItemDto`: `description`, `hiddenBy`, `pendingTransaction`                                                                    |
  | `L22_10_stripe_cim_ellenorzes.png`    | `client/src/api/orders.api.ts` (80–107. sor)                                                                           | a munkamenet-azonosító és a Stripe-cím ellenőrzése (https, pontos eredet, nincs belépési adat)                                              |
  | `L22_11_fizetes_inditasa.png`         | `client/src/components/photos/PurchaseBox.tsx` (49–107. sor)                                                           | `CheckoutButton`: foglalt gomb, bemondás, átirányítás csak a Stripe címére, `pageshow`, 409 magyarázata                                     |
  | `L22_12_sikeres_fizetes_nezet.png`    | `client/src/pages/CheckoutSuccessPage.tsx` (88–134. sor)                                                               | `viewOf`, a nézetváltás fókusza és bemondása, a PAID utáni érvénytelenítés                                                                  |
  | `L22_13_vezerlopult_lekerdezesek.png` | `client/src/pages/DashboardPage.tsx` (89–109. sor)                                                                     | a két lista lekérdezése, `refetchInterval` a stopperrel                                                                                     |
  | `L22_14_levetel_frissites.png`        | `client/src/components/dashboard/OwnPhotosTab.tsx` (165–191. sor)                                                      | `applyHidden`: `setQueriesData`, érvénytelenítés, fókusz vagy bemondás                                                                      |
  | `L22_15_dialog.png`                   | `client/src/components/ui/Dialog.tsx` (34–105. sor)                                                                    | natív `<dialog>`: `showModal`, bezárás a layout-effektus takarításában, fókusz-visszaállítás, `closedby`                                    |
  | `L22_16_allapotjelveny.png`           | `client/src/components/dashboard/ownPhotoStatus.ts` (28–59. sor)                                                       | `ownPhotoStatusOf`: az öt állapot jelvénye és megjegyzése                                                                                   |
  | `L22_17_lekerdezesi_stopper.png`      | `client/src/upload/pollInterval.ts` (31–81. sor)                                                                       | `createPollClock` (`trackPending`) és `pollIntervalOf`                                                                                      |
  | `L22_18_vezerlopult_sajat_kepek.png`  | Chrome DevTools képernyőkép (Fanni, teljes oldal)                                                                      | Saját képeim: sikertelen, folyamatban (függő tranzakció), hitelesítve (műveletekkel), elrejtve, moderátor eltávolította („Miért?” kinyitva) |
  | `L22_19_vezerlopult_mobil.png`        | Chrome DevTools képernyőkép (390 × 844, 2×, mobil emuláció, teljes oldal)                                              | a saját képek kártyás elrendezése mobilon                                                                                                   |
  | `L22_20_adatlap_megveszem.png`        | Chrome DevTools képernyőkép (Károly, teljes oldal)                                                                     | az adatlap „Megveszem” gombja a Stripe-magyarázattal, a lokális lánc tanúsítványa                                                           |
  | `L22_21_szerkesztes_ablak.png`        | Chrome DevTools képernyőkép                                                                                            | „Kép adatainak szerkesztése” ablak a kitöltött mezőkkel, a fókusz a címen                                                                   |
  | `L22_22_levetel_megerosites.png`      | Chrome DevTools képernyőkép                                                                                            | „Leveszed a képet a galériából?” – a következmény, Mégse / Levétel                                                                          |
  | `L22_23_levetel_utan.png`             | Chrome DevTools képernyőkép (teljes oldal)                                                                             | a sor „Elrejtve” lett, a műveletei eltűntek                                                                                                 |
  | `L22_24_sikeres_fizetes_fuggo.png`    | Chrome DevTools képernyőkép (függő rendelés)                                                                           | „A fizetés feldolgozása folyamatban” – várakozás a Stripe visszaigazolására                                                                 |
  | `L22_25_sikeres_fizetes_kesz.png`     | Chrome DevTools képernyőkép (a rendelés PAID után)                                                                     | „Sikeres fizetés”: a rendelés adatai, „Eredeti letöltése”                                                                                   |
  | `L22_26_fizetes_megszakadt.png`       | Chrome DevTools képernyőkép                                                                                            | „A fizetés megszakadt”: vissza a képhez, galéria                                                                                            |
  | `L22_27_vasarlasaim.png`              | Chrome DevTools képernyőkép (Károly)                                                                                   | Vásárlásaim: letöltés és „Értékelted: 5 / 5”; a moderátor által levett kép nem tölthető le                                                  |
  | `L22_28_fiokmenu_vezerlopult.png`     | Chrome DevTools képernyőkép (nyitott fiókmenü)                                                                         | a fiókmenü „Vezérlőpult” és „Kép feltöltése” hivatkozása                                                                                    |
  | `L22_29_teszt_levetel.png`            | `client/src/pages/DashboardPage.test.tsx` (690–723. sor)                                                               | teszt: a levétel megerősítése, DELETE, a sor „Elrejtve”, fókusz, bemondás                                                                   |
  | `L22_30_teszt_sikeres_fizetes.png`    | `client/src/pages/CheckoutSuccessPage.test.tsx` (33–79. sor)                                                           | teszt: függő → kifizetett rendelés, lekérdezés, fókusz, érvénytelenítés                                                                     |
  | `L22_31_teszt_rendeles_dto.png`       | `server/tests/db/orders.read.test.ts` (223–258. sor)                                                                   | teszt: a levett kép rendelése nem tölthető le, a saját elrejtés igen                                                                        |
  | `L22_32_teszt_atiranyitas.png`        | `client/src/pages/PhotoDetailPage.test.tsx` (336–370. sor)                                                             | teszt: „Megveszem” → POST, foglalt gomb, bemondás, átirányítás                                                                              |

- Döntések:
  - a párbeszédablak natív `<dialog>` (`showModal`): a háttér valóban nem érhető el, az Escape és a
    fókusz-visszaállítás a böngészőé; a bezárás a layout-effektus takarításában történik, mert az
    eltávolított elem bezárása már nem adná vissza a fókuszt; a jsdomban pótlék;
  - a fülek hivatkozások, nem ARIA-fülsor: a nézet az URL-ben van (vissza gomb, könyvjelző, oldalcím);
  - a listák a mutáció után azonnal, a gyorsítótárban frissülnek (`setQueriesData` a kulcs
    előtagján), és utána érvénytelenednek – a felhasználó nem vár a lekérdezésre, de a valós állapot
    jön vissza;
  - a fizetés gombja a siker után is foglalt marad (az oldal elhagyása következik), és csak a
    `pageshow persisted` oldja fel – a visszatérés a Stripe-ról nem marad zsákutca;
  - a lekérdezési stopper csak új függő képnél indul újra: a régóta függő kép nem tartja örökké
    életben a lekérdezést (az IP-nkénti kérelemkeret miatt);
  - az „Értékelés írása” az adatlapra visz: az értékelő űrlap az L23-ban készül el.
- Későbbre: L23 – az értékelés űrlapja (a hivatkozás célrészlete); L26 – a galéria
  lapozás-fókuszának egyesítése a vezérlőpultéval, az élő régió nyitott ablak alatt, kézi
  billentyűzet/NVDA próba a natív ablakra; L28 – Playwright a vásárlás és a vezérlőpult folyamataira;
  L30/L32 – felhasználónkénti kérelemkeret a lekérdezett végpontokra; L31 – `frame-ancestors`,
  `Referrer-Policy`, a letöltés hibaoldala; chore – az `imageDecoding.test.ts` időkorlátja.

- Commit: `cda2fe9` – `feat(L22): vásárlás és vezérlőpult – „Megveszem” → Stripe, visszatérési oldalak, saját képek és vásárlások`

## L23 – Fotósprofil és értékelések felülete (2026-10-10)

- Elkészült:
  - szerver (a design-README táblázatának L20/L23-as sora): a `GET /api/photos/:id` válaszának
    `viewer` jelzője a `purchased` mellett `canReview` (vásárló, nyilvános kép, nem a sajátja, még nem
    értékelte – ugyanaz, amit a `POST …/reviews` ellenőriz) és `ownReviewId` mezőt kap
    (`viewerFlags`: két párhuzamos, indexelt lekérdezés – a rendelés és a saját értékelés);
  - kliens API-réteg: `users.api.ts` (`getProfile` – csak UUID azonosítóval indít kérést,
    `updateProfile`, `userKeys`), `reviews.api.ts` (`createReview`, `deleteReview`, `ReviewInput`),
    `photos.api.ts` (a néző jelzőinek ellenőrzése – a lehetetlen pár, pl. „értékelhet, de már
    értékelt”, váratlan válasz; `photoKeys.details()`), `auth.api.ts` (`isAuthUser`: UUID azonosító és
    ISO dátum – a profil hivatkozása az azonosítóból épül);
  - kliensoldali szabályok a szerveréivel: `reviews/reviewValidation.ts` (csillag 1-től 5-ig, a
    vélemény legfeljebb 1000 kódpont, vezérlőkarakter nélkül, látható karakterrel),
    `users/profileValidation.ts` (a név a regisztráció szabályaival, a bemutatkozás legfeljebb 500
    kódpont); a név ellenőrzése az `auth/validation.ts`-ből közös;
  - a fotós profilja (`/users/:id`, `ProfilePage`): név monogrammal, a csatlakozás ideje, a
    hitelesített képek száma, az átlag (`RatingSummary` – az adatlappal közös), a bemutatkozás
    szövegként (a sortörései megmaradnak, HTML soha), a képek rácsa a galéria végpontjával
    (`?ownerId=…`, lapozva, az oldal az URL-ben; a lapozás után a fókusz az összesítésre); a nem
    létező vagy letiltott felhasználó saját oldalt kap; a saját profilon „Profil szerkesztése”
    (`users/EditProfileDialog`, `PATCH /api/me`: a munkamenet, a profil, a galéria és az adatlapok
    frissülnek, a fókusz a gombra tér vissza); a fotós neve az adatlapon a profiljára mutat
    („Fotós Fanni profilja”), a fiókmenüben „Profilom”; a kártyák címe a profilon h3 (`PhotoCard`
    `headingLevel`); az oldal címfókuszának hookja (`useHeadingFocusWhenShown`) az adatlapból
    kiemelve, közös;
  - az értékelés írása (`photos/ReviewForm`, `RatingInput`): csak a vásárlónak (`viewer.canReview`),
    az értékelések elején, `#ertekeles` azonosítóval (a vásárlásaim hivatkozásának célja); a csillag
    natív rádiócsoport (fieldset + legend, „1 csillag” … „5 csillag”, nyilakkal is választható,
    `aria-required`, a hiba a csoport alatt és minden rádió leírásaként), a vélemény nem kötelező;
    siker után a lista és az adatlap frissül (megvárva), az űrlap eltűnik, a fókusz az új
    értékelésre kerül, „Köszönjük az értékelést!”; a galéria, a vásárlásaim és a profil
    gyorsítótára érvénytelenedik; 400 → mezőhiba; 403/409 → az adatlap (409-nél a lista is)
    frissül, a fókusz a saját értékelésre vagy a szakasz címére, az üzenet elhangzik; 404 → az
    oldal „nem található” lesz;
  - a saját értékelés jelölve („A te értékelésed”) és törölhető (`DeleteReviewDialog`,
    `DELETE /api/reviews/:id`, a fókusz a Mégse gombon indul; amíg a kérés fut, az ablak nem
    zárható); siker után – és a szerver szerint már törölt (404) értékelésnél is – a lista és az
    adatlap frissül, a fókusz az értékelések címére, bemondás; a kép újra értékelhető;
  - a vásárlásaim „Értékelés írása” hivatkozása a `#ertekeles` célra visz: az űrlap csak az adatlap
    betöltése után jelenik meg, ezért a `PhotoReviews` görget és fókuszál (az űrlap címére, aki
    nem értékelhet, annál a szakasz címére);
  - tesztek: `ProfilePage.test.tsx` (11), `PhotoDetailPage.test.tsx` (+15: űrlap, hibák, siker, a
    két frissítés sorrendje, 403/404/409, törlés, `#ertekeles`, rejtett riasztás),
    `users.api.test.ts`, `reviewValidation.test.ts`, `profileValidation.test.ts`, a `reviews.api`-,
    `photos.api`-, `auth.api`-, `AccountMenu`-, `router`- és `DashboardPage`-tesztek bővítése;
    szerveren `photos.detail.test.ts` (a néző jelzői: vevő, már értékelt vevő, tulajdonos saját
    rendeléssel, admin nem nyilvános képpel); a tesztfelhasználók azonosítója UUID lett;
  - dokumentáció: README (a `viewer` mezői, „Fotósprofil és értékelések (L23)” bekezdés),
    client/README (felépítés, L23-szakasz), FORRASOK (213–215: WAI-ARIA rádiócsoport, MDN fieldset,
    TanStack mutációk).
- Átnézés – három független kör egyszerre (React, biztonság, akadálymentesség), a leletek
  teszt-először javítva (előbb 7, majd 11 piros teszt):
  - React: HIGH – az új értékelés utáni fókusz ref-alapú jelzése versenyhelyzetben elveszett: a lista
    megfigyelője (useInfiniteQuery) külön feladatban követi a gyorsítótárat, és az adatlap frissítése
    később is visszaérhet, mint a listáé – a jelzés ott maradt, és egy későbbi frissítéskor rossz
    pillanatban sült el. Javítás: egyszeri fókuszkérés számlálóval kiváltva, a lista gyorsítótárának
    frissítési idejéhez (`dataUpdatedAt`) kötve, a saját értékelés azonosítója a gyorsítótárból; a
    fókusz csak akkor mozdul, ha elveszett vagy az eltűnő űrlapon volt. MEDIUM: fókusz 403/409 után
    (az űrlap eltűnt, a fókusz a body-ra esett), a `#ertekeles` cél elérése. LOW: a lista kétszer
    frissült (a lista kulcsa az adatlapé alatt van – `exact: true`), a név változása a betöltött
    adatlapokon, a nyitott szerkesztő a munkamenet megszűnése után.
  - Biztonság: nincs HIGH. LOW: a küldés 404-e (közben eltűnt kép) elavult oldalt hagyott →
    az adatlap frissül; a törlés 404/403-a → frissítés és bezárás; a profil gyorsítótára csak
    azonos fiók válaszával íródik (másik lapon átjelentkezve a válasz másé); az `isAuthUser`
    szigorítása; a jelzők összefüggésének ellenőrzése. INFO: a forrásban maradt láthatatlan
    karakterek escape-pel.
  - Akadálymentesség: HIGH – a profil fejlécének oszlopa (`flex-1`) keskeny képernyőn
    összecsuklott, a név betűnként tört → `grow basis-64`; MEDIUM mint fent; LOW: a rádiócsoport
    rejtett riasztása a legend nevével (nem „1 csillag”), kötelezőség jelzése (`aria-required` – a
    natív `required`-et a Chrome a kitöltés előtt is érvénytelennek mutatta, mint az L21 választóját),
    a kártya címsorszintje, görgetés a programból mozgatott fókusznál, az átlag tördelése, a
    fotós-hivatkozás neve, a „Még nincs értékelés.” írásjele.
  - Elfogadva, későbbre: a bemutatkozás szerveroldali szabályai gyengébbek a véleményénél (rejtett
    karakterek, üres sorok – L30); felhasználónkénti írási korlát az értékelésekre (L28/L30); a név
    változása a már betöltött értékelés-listákban csak frissítéskor (30 s); kézi képernyőolvasó-próba
    a csillagokra, `eslint-plugin-jsx-a11y` (L26); a `#ertekeles` görgetési helye a nagy előnézet
    betöltésekor eltolódhat (a fókusz jó helyen van – L26).
- Ellenőrzés: kliens 574 teszt (a lefedettségi futásban a galéria 400 ms-os árszűrő-tesztje a
  terhelés alatt bukott, külön zöld; a végső futásban mind zöld), lefedettség 98,66 % (utasítás) /
  95,18 % (ág) / 99,28 % (függvény) / 98,99 % (sor); lint, típusellenőrzés, build tiszta; szerver
  68 fájl, 1102 teszt zöld (DB-tesztekkel, ezúttal a dekóder-teszt is).
- Élő próba lokális Hardhat-láncon (friss node, `deploy:local`, a lefordított szerver
  `CHAIN_ID=31337`-tel a tesztadatbázison, a build előnézete a 4173-as porton): a
  `prepare-live-l23.mjs` három fiókot hozott létre (Fotós Fanni – bemutatkozással; Kép Károly és
  Vevő Vera – vásárlók), Fanni három saját tesztfotóját az API-n át töltötte fel (a lokális láncon
  regisztrálódtak), majd SQL-lel Vera három vásárlását és két értékelését, Károly vásárlását a
  gyertyákra. Képsor: Fanni profilja vendégként és mobilon; ismeretlen profil; a saját profil
  szerkesztése és mentése (a szöveget billentyűzettel gépelve – a DevTools mezőkitöltője a React
  állapotát nem frissítette, az első mentés változatlan adatot küldött); Károly a vásárlásaimból a
  `#ertekeles` hivatkozással az űrlapra ér (a fókusz a címén), csillag nélkül a hiba, 4 csillag és
  vélemény küldése → a saját értékelés a lista élén, jelölve, a fókusz rajta, „Köszönjük az
  értékelést!”, az átlag frissül; törlés megerősítéssel → az űrlap vissza, a fókusz a címen, „Az
  értékelésed törölve.”; Tab-bal az első csillagra: látható fókuszkeret; a fiókmenü „Profilom”.
  Minden szerveroldali válasz a lefordított kódból jött (`PATCH /api/me → 200`, `POST …/reviews →
201`, `DELETE /api/reviews/:id → 204`).
- Képek:

  | Kép                                     | Forrás                                                                                                     | Tartalom                                                                                                      |
  | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
  | `L23_01_szerver_piros.png`              | `npx vitest run --project db tests/db/photos.detail.test.ts` (mentett kimenet)                             | piros: a `viewer` két új tesztje (`canReview`, `ownReviewId`) a megvalósítás előtt                            |
  | `L23_02_kliens_piros.png`               | `npx vitest run` az L23 tesztfájljain (mentett kimenet)                                                    | piros: 26 bukó teszt, 3 tesztfájl modulja még hiányzik                                                        |
  | `L23_03_szerver_zold.png`               | `npm test` a `server/`-ben (mentett kimenet)                                                               | 68 fájl, 1102 teszt zöld (a DB-tesztekkel)                                                                    |
  | `L23_04_kliens_lefedettseg.png`         | `npm run coverage` a `client/`-ben, majd `npx vitest run src/pages/GalleryPage.test.tsx` (mentett kimenet) | 574 teszt; a galéria késleltetett árszűrő-tesztje a terhelés alatt bukott, külön zöld                         |
  | `L23_05_kliens_lint_build.png`          | `npm run lint`, `npm run typecheck`, `npm run build` (mentett kimenet)                                     | lint, típus, build tiszta                                                                                     |
  | `L23_06_atnezes_piros.png`              | `npx vitest run` az átnézési kör új tesztjeivel (mentett kimenet)                                          | piros: 7 (akadálymentesség), majd 11 (biztonság, React) bukó teszt a javítások előtt                          |
  | `L23_07_szerver_nezo_jelzoi.png`        | `server/src/modules/photos/photos.catalog.ts` (174–199. sor)                                               | `viewerFlags`: `purchased`, `canReview`, `ownReviewId` két párhuzamos lekérdezésből                           |
  | `L23_08_users_api.png`                  | `client/src/api/users.api.ts` (62–73. sor)                                                                 | `getProfile` (csak UUID azonosítóval), `updateProfile`                                                        |
  | `L23_09_csillag_bevitel.png`            | `client/src/components/photos/RatingInput.tsx` (30–72. sor)                                                | natív rádiócsoport: rejtett rádiók, csillag ikonok, `aria-required`, a hiba leírásként                        |
  | `L23_10_ertekeles_kuldes_mutacio.png`   | `client/src/components/photos/ReviewForm.tsx` (55–82. sor)                                                 | a küldés mutációja: megvárt frissítések, a 400/403/404/409 kezelése                                           |
  | `L23_11_ertekeles_validacio.png`        | `client/src/reviews/reviewValidation.ts` (36–62. sor)                                                      | a csillag és a vélemény szabályai, a kérés törzse                                                             |
  | `L23_12_fokusz_uj_es_torolt.png`        | `client/src/components/photos/PhotoReviews.tsx` (170–197. sor)                                             | egyszeri fókuszkérés a lista frissítési idejéhez kötve; a `#ertekeles` cél                                    |
  | `L23_13_profil_lekerdezesek.png`        | `client/src/pages/ProfilePage.tsx` (78–98. sor)                                                            | a profil és a képek lekérdezése, az oldal az URL-ben                                                          |
  | `L23_14_profil_mentes.png`              | `client/src/pages/ProfilePage.tsx` (158–175. sor)                                                          | `saved`: munkamenet, profil (csak azonos fiók), listák és adatlapok frissítése                                |
  | `L23_15_profil_validacio.png`           | `client/src/users/profileValidation.ts` (20–40. sor)                                                       | a bemutatkozás szabályai, a kérés törzse                                                                      |
  | `L23_16_profil_oldal.png`               | Chrome DevTools képernyőkép (vendég, teljes oldal)                                                         | Fanni profilja: név, csatlakozás, 3 hitelesített kép, 4,5 az 5-ből · 2 értékelés, bemutatkozás, a képek rácsa |
  | `L23_17_profil_mobil.png`               | Chrome DevTools képernyőkép (390 × 844, 2×, mobil emuláció, teljes oldal)                                  | a profil mobilon: az adatok az avatár mellett tördelve, a kártyák egy oszlopban                               |
  | `L23_18_profil_nem_talalhato.png`       | Chrome DevTools képernyőkép (ismeretlen azonosító)                                                         | „A felhasználó nem található” oldal                                                                           |
  | `L23_19_sajat_profil.png`               | Chrome DevTools képernyőkép (Fanni)                                                                        | a saját profil a „Profil szerkesztése” gombbal                                                                |
  | `L23_20_profil_szerkesztes_ablak.png`   | Chrome DevTools képernyőkép                                                                                | a szerkesztő ablak a meglévő adatokkal, a bemutatkozás átírva                                                 |
  | `L23_21_profil_mentve.png`              | Chrome DevTools képernyőkép (mentés után)                                                                  | a profil az új, kétsoros bemutatkozással                                                                      |
  | `L23_22_adatlap_ertekeles_urlap.png`    | Chrome DevTools képernyőkép (Károly, a gyertyák adatlapja)                                                 | az értékelő űrlap a vásárlónak az értékelések elején, Vera értékelése alatta                                  |
  | `L23_23_ertekeles_hiba_csillag.png`     | Chrome DevTools képernyőkép (csillag nélküli beküldés)                                                     | a hiba a csillagoknál: „Válassz csillagot: 1-től 5-ig.”                                                       |
  | `L23_24_ertekeles_elkuldve.png`         | Chrome DevTools képernyőkép (küldés után)                                                                  | a saját értékelés a lista élén, jelölve és törölhető, a fókusz rajta; az átlag két értékelésből               |
  | `L23_25_ertekeles_torles_ablak.png`     | Chrome DevTools képernyőkép                                                                                | „Törlöd az értékelésedet?” – a fókusz a Mégse gombon                                                          |
  | `L23_26_ertekeles_torolve.png`          | Chrome DevTools képernyőkép (törlés után)                                                                  | az űrlap újra látszik, az átlag egy értékelésből                                                              |
  | `L23_27_vasarlasaim_ertekeles_iras.png` | Chrome DevTools képernyőkép (a vásárlásaim „Értékelés írása” hivatkozása után)                             | az adatlap a `#ertekeles` célnál: az űrlap a nézetben, a fókusz a címén                                       |
  | `L23_28_fiokmenu_profilom.png`          | Chrome DevTools képernyőkép (nyitott fiókmenü)                                                             | a fiókmenü „Profilom” hivatkozása                                                                             |
  | `L23_29_csillag_billentyu_fokusz.png`   | Chrome DevTools képernyőkép (Tab az értékelések címéről)                                                   | látható fókuszkeret az első csillagon                                                                         |
  | `L23_30_teszt_ertekeles_kuldes.png`     | `client/src/pages/PhotoDetailPage.test.tsx` (803–852. sor)                                                 | teszt: küldés, foglalt gomb, a saját értékelés fókusza, bemondás, frissítések                                 |
  | `L23_31_teszt_ertekeles_torles.png`     | `client/src/pages/PhotoDetailPage.test.tsx` (934–973. sor)                                                 | teszt: törlés megerősítéssel, a fókusz a címre, bemondás                                                      |
  | `L23_32_teszt_profil_szerkesztes.png`   | `client/src/pages/ProfilePage.test.tsx` (191–237. sor)                                                     | teszt: a profil szerkesztése és mentése, a fejléc és a cím frissül                                            |
  | `L23_33_teszt_szerver_nezo.png`         | `server/tests/db/photos.detail.test.ts` (325–363. sor)                                                     | teszt: `ownReviewId` és `canReview` a vevőnél, a tulajdonosnál és a nem nyilvános képnél                      |

- Döntések:
  - a csillagos bevitel natív rádiócsoport (fieldset + legend), nem egyedi ARIA-vezérlő: a
    billentyűzetes választás és a bemondás a böngészőé; a kötelezőséget `aria-required` jelzi, mert a
    natív `required` a Chrome-ban már a kitöltés előtt érvénytelennek mutatná a csoportot;
  - a `canReview` és az `ownReviewId` a szerver jelzője, nem jogosultság: az űrlap megjelenését
    vezérli, a döntés a `POST …/reviews` végponté marad – a kliens a 403/404/409 választ az adatlap
    frissítésével oldja fel, nem találgat;
  - a változás utáni fókusz egyszeri kérés, a lista gyorsítótárának frissítési idejéhez kötve: a
    megfigyelő állapota (`isFetching`, az elemek) a gyorsítótárnál később frissül, ezért az nem
    lehet a jel; a fókusz csak akkor mozdul, ha elveszett vagy az eltűnő űrlapon volt;
  - a profil szerkesztője után a munkamenet gyorsítótára a válaszból frissül (a fejléc azonnal), a
    nyilvános profilé csak akkor, ha a válasz ugyanazé a fióké;
  - a fotós profilja a galéria végpontját használja (`?ownerId=`): a szervernek nem kell új listája,
    a kártyák és az átlagok ugyanazok, mint a galériában;
- Későbbre: L24 – a hitelesség-ellenőrző oldal; L26 – kézi képernyőolvasó-próba a rádiócsoportra
  (NVDA, VoiceOver), a `#ertekeles` görgetési helye a nagy előnézet betöltésekor,
  `eslint-plugin-jsx-a11y`; L28 – Playwright az értékelés folyamatára; L28/L30 – felhasználónkénti
  írási korlát az értékelésekre; L30 – a bemutatkozás szerveroldali szabályai a véleményével azonosan
  (rejtett karakterek, üres sorok); elfogadva – a törlés utáni újraértékelés a lista élére kerül, a
  név változása a már betöltött értékelés-listákban csak frissítéskor látszik.

- Commit: `33ff6be` – `feat(L23): fotósprofil és értékelések felülete – profiloldal, értékelés írása és törlése, saját profil szerkesztése`

## L24 – Hitelesség-ellenőrző oldal (2026-10-10)

- Elkészült:
  - kliens API-réteg: `api/verify.api.ts` – `verifyFile` (`POST /api/verify`, többrészes űrlap
    XMLHttpRequest-tel, haladással és megszakítással; a fájl saját neve nem megy el) és `verifyHash`
    (`GET /api/verify/:sha256` – a beírt hash kisbetűs, előtag nélküli alakra hozva; a válasznak a kért
    hash-ről kell szólnia, dHash nélkül); az eredmény futásidejű ellenőrzése (`isVerificationResult`):
    a három eredmény mezőinek összhangja (NOT_FOUND-nál nincs regisztráció és kép, SIMILAR-nál van
    távolság 0–64), a tranzakció linkje csak a kiírt hash Etherscan-oldala, a bélyegkép csak saját
    `/media/` útvonal, az azonosítók UUID-k; `api/multipart.ts` – a többrészes küldés az
    `upload.api.ts`-ből kiemelve (a feltöltéssel közös); `api/guards.ts` – a hash- és
    tranzakció-ellenőrzők (`isSha256`, `isDHash`, `isTxHash`, `hasTransactionProof`), a `photos.api.ts`
    is ezeket használja;
  - kliensoldali szabályok a szerveréivel: `verify/verifyValidation.ts` (a kép korlátai a
    feltöltéséi, de a rövidebb oldal már 100 képponttól – `imageHintOf`, a `checkImageDimensions`
    minimum-paramétere; a hash mező a szerver sémája szerint, a 0x előtag és a nagybetű elfogadott),
    `verify/verificationGate.ts` (egyszerre egy ellenőrzés fut; a szerver kérte várakozás –
    `Retry-After` – alatt egyik űrlap sem indít kérést, a hátralévő idő a riasztásban),
    `verify/anchors.ts` (a magyarázat célrészlete);
  - az oldal (`/verify`, `pages/VerifyPage.tsx` – nyilvános; a fejlécben „Ellenőrzés” menüpont):
    `components/verify/VerifyFileForm.tsx` (a feltöltés fogadóterülete és kiválasztott-fájl doboza,
    haladás és Mégse; a képhiba – 400, 413, 415 – a fogadóterülethez kerül, a fókusz csak az űrlapból
    megy a fájlválasztóra, máshonnan rejtett riasztás szól; más hiba riasztás a gomb mellett, a gomb
    leírásaként; az oldal elhagyása a kérést megszakítja), `VerifyHashForm.tsx` (`useForm` +
    `useMutation`, megszakítás az oldal elhagyásakor, az indulás bemondva), `VerificationResult.tsx`
    (a három eredménykártya a bizalom vizuális nyelvén – `resultStates.ts`, a hangnemek a
    tanúsítvánnyal közös `ui/panelTones.ts`-ből; a kártya az űrlapok helyére lép, a címe kapja a
    fókuszt, ha az elveszett, különben az élő régió mondja be; a cím leírása a magyarázat; VERIFIED és
    SIMILAR a kép és a fotós hivatkozásával – ha a kép nyilvános – és a regisztráció adataival
    (`photos/proofRows.tsx`, a tanúsítvánnyal közös sorok; a tranzakció „nem érhető el”, ha nem
    ismert), SIMILAR az eltérés bitjeivel (szám, sáv, a képernyőolvasónak szöveg), NOT_FOUND a
    kiszámolt, másolható hash-sel), `HowItWorks.tsx` („Hogyan működik?” – három rövid magyarázat);
  - közös segédek kiemelve: `upload/useImagePicker.ts` (a kép kiválasztása, bemondás, rejtett
    riasztás, a felbontás hibája – a feltöltés oldala is ezt használja), `upload/imageErrors.ts`,
    `hooks/useFileDropGuard.ts`, `ui/DefinitionRow.tsx` (320 képponton is tördelődő adatlista-sor),
    az `UploadProgress` szövegei paraméterezve;
  - az adatlap tanúsítványának „Mit jelent ez?” hivatkozása (az L20-ból elhalasztva) a magyarázathoz
    visz (`/verify#hogyan-mukodik`; a neve megmondja, hogy másik oldalra): a `useRouteFocus`
    útvonalváltáskor a cím célrészletére teszi a fókuszt, ha az a fő tartalomban van – ha az oldal
    maga már odatette (PhotoReviews, `#ertekeles`), nem viszi el; vissza-navigációnál az oldal címe
    kapja; a `lib/text.ts` a `CHAIN_UNAVAILABLE` hibához is újrapróbálási időt ír;
  - dokumentáció: README (L24 bekezdés), client/README (fa, „Hitelesség-ellenőrzés (L24)”),
    FORRASOK 216–218. A szerver nem változott.
- Tesztek (TDD): először a tesztek – `verify.api.test.ts`, `verifyValidation.test.ts`,
  `VerificationResult.test.tsx`, `VerifyPage.test.tsx`, a bővített `uploadValidation`, `text`,
  `router`, `ChainCertificate` tesztek – piros: 6 bukó és 4 még nem létező modul (L24_01); majd a
  megvalósítás. Az átnézések után újabb tesztek (`hooks/useRouteFocus.test.tsx`,
  `upload/imageErrors.test.ts`; VerifyPage: egyszerre egy ellenőrzés, a várakozás, az eredmény fókusz
  nélkül, a hash indulásának bemondása és a dupla Enter, az oldal elhagyása megszakít, a képhiba
  fókusza, Mégse → állapotsor → küldő gomb, INVALID_UPLOAD; `verifyHash` visszhang és megszakítás) –
  piros: 16 bukó (L24_02); a javítások után a teljes kliens: 57 fájl, 636 teszt zöld, lefedettség
  98,49 / 95,03 / 99,09 / 98,98 (L24_03); lint, typecheck, build tiszta (L24_04).
- Átnézések (három párhuzamos, csak olvasó kör): **React** – 0 kritikus/magas, 5 közepes: a
  `useRouteFocus` célrészlet-fókusza meleg gyorsítótárnál elvitte a PhotoReviews `#ertekeles` fókuszát
  (javítva: ha a célrészlet már tartalmazza a fókuszt, marad); a kártya mindig elvette a fókuszt
  (javítva: csak ha elveszett, különben bemondás); a két űrlap egyszerre futhatott (javítva: kapu); a
  fájl-folyamat duplikálta a feltöltését (javítva: `useImagePicker`); teszthiányok (pótolva); alacsony:
  az `autoFocus` effektus összekötve a megszakítással (szétválasztva), a hash űrlap kézi `pending`-je
  (`useMutation`), vissza-navigáció célrészletre (POP kivétel), fókusz képhibánál (kapu), a
  `percentOf` kettős exportja (megszüntetve), `HOW_IT_WORKS_ID` csatolás (anchors), duplikált
  sorok/színek (`proofRows`, `panelTones`). **Biztonság** – 0 kritikus/magas/közepes, 4 alacsony: a
  Retry-After-t a kliens nem kényszerítette ki (kapu); egyidejű kérések (kapu, `verifyHash` signal); a
  hash-válasz nem volt a kéréshez kötve (visszhang-ellenőrzés); a fájlnév elment (`kep`). Igazolt: a
  hash csak `[0-9a-f]{64}` alakban juthat az URL-be, a szerver szövegei csak JSX-szövegként jelennek
  meg, a linkek/képcímek ellenőrzöttek, a külső link `noopener noreferrer`, nincs automatikus
  újrapróbálás. **Akadálymentesség** – 1 magas: a `DefinitionRow` megnevezése nem tört (320 px-en
  átlóghatott – javítva: tördelődő sor, az érték a megnevezés alá kerülhet, L24_27); 2 közepes:
  egyidejű ellenőrzés (kapu), a fotós hivatkozásának célterülete (24 px magas sorok); alacsony: a cím
  fókusza `useLayoutEffect`-ben és csak ha elveszett, a cím leírása a magyarázat, a Mégse → állapotsor
  esetén nincs dupla bemondás, a „Mit jelent ez?” neve megmondja, hogy másik oldalra visz, a sáv neve
  „A kép küldése”, a hash űrlap indulása bemondva, „a 64 bitből 3 tér el” a képernyőolvasónak, a
  képhiba nem rántja el a fókuszt. Elfogadva (nem javítva): a hash űrlap mezőhibája a kapu előtt is
  megjelenik; a kártya régiójának neve a címe (mint az állapotkártyánál).
- Élő demó: lokális Hardhat-lánc, a lefordított szerver a tesztadatbázison (Fotós Fanni két
  regisztrált képe), a lefordított kliens a `vite preview`-n; a három eset a saját fotókkal: a tócsa
  (VERIFIED), a tócsa 800 px-es kicsinyített másolata (SIMILAR – 1 bit eltérés), a basszusgitár, amely
  nincs feltöltve (NOT_FOUND); hash alapján VERIFIED; a hash mező hibája; a 320 px-es kártya; az
  adatlap „Mit jelent ez?” hivatkozása → a „Hogyan működik?” cím fókuszban.

| Kép                                    | Forrás                                                                                              | Tartalom                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `L24_01_kliens_piros.png`              | `L24_red_client.log` – `npx vitest run` az L24 tesztfájljaira a megvalósítás előtt                  | piros kör: 6 bukó teszt, 4 még nem létező modul                                           |
| `L24_02_atnezes_piros.png`             | `L24_red_review_client.log` – az átnézések utáni tesztek a javítások előtt                          | piros kör: 16 bukó teszt                                                                  |
| `L24_03_kliens_lefedettseg.png`        | `L24_client_coverage.log` – `npm run coverage` (client)                                             | 57 fájl, 636 teszt zöld; lefedettség 98,49 / 95,03 / 99,09 / 98,98; az új modulok sorai   |
| `L24_04_kliens_lint_build.png`         | `npm run lint`, `npm run typecheck`, `npm run build` (client)                                       | mind tiszta; a build 521 kB-os fő csomagja (figyelmeztetés, mint az L18 óta)              |
| `L24_07_verify_api_ellenorzes.png`     | `client/src/api/verify.api.ts` – `isConsistent`, `isVerificationResult`                             | a három eredmény mezőinek összhangja és a válasz futásidejű ellenőrzése                   |
| `L24_08_verify_api_kuldes.png`         | `client/src/api/verify.api.ts` – `VERIFY_FILE_NAME`, `verifyFile`, `verifyHash`                     | a fájl névtelen küldése; a hash normalizálása és a válasz visszhang-ellenőrzése           |
| `L24_09_ellenorzesi_kapu.png`          | `client/src/verify/verificationGate.ts` – `useVerificationGate`                                     | egyszerre egy ellenőrzés; a Retry-After várakozás                                         |
| `L24_10_eredmeny_kartya.png`           | `client/src/components/verify/VerificationResult.tsx` – `VerificationResult`                        | a kártya: fókusz vagy bemondás, a cím leírása, a sorok és a gombok                        |
| `L24_11_eredmeny_allapotok.png`        | `client/src/components/verify/resultStates.ts` – `RESULT_STATES`                                    | a három eredmény címe, ikonja, hangneme és magyarázata                                    |
| `L24_12_fajl_urlap_inditas.png`        | `client/src/components/verify/VerifyFileForm.tsx` – `startVerification`                             | a kérés indítása, a haladás, az elküldés, a hibák és a fókusz eredete                     |
| `L24_13_hash_urlap_mutacio.png`        | `client/src/components/verify/VerifyHashForm.tsx` – `useMutation`, `start`, `onSubmit`              | a hash ellenőrzése mutációként, a kapu és a megszakítás                                   |
| `L24_14_utvonal_fokusz.png`            | `client/src/hooks/useRouteFocus.ts` – `useRouteFocus`                                               | a cím célrészletének fókusza útvonalváltáskor, a kivételekkel                             |
| `L24_15_adatlista_sor.png`             | `client/src/components/ui/DefinitionRow.tsx` – `DefinitionRow`                                      | a 320 képponton is tördelődő adatlista-sor                                                |
| `L24_16_tanusitvany_link.png`          | `client/src/components/photos/ChainCertificate.tsx` – a megjegyzés és a „Mit jelent ez?” hivatkozás | a hivatkozás az ellenőrző oldal magyarázatához                                            |
| `L24_20_ellenorzo_oldal.png`           | élő: `http://localhost:4173/verify` (teljes oldal)                                                  | az oldal: cím, magyarázat, a kép és a hash űrlapja, „Hogyan működik?”                     |
| `L24_21_kivalasztott_kep.png`          | élő: a tócsa kiválasztva                                                                            | a fogadóterület a kiválasztott fájl dobozával (név, méret, előnézet)                      |
| `L24_22_hiteles_kep.png`               | élő: a tócsa ellenőrzése                                                                            | VERIFIED – „Hiteles, regisztrált kép”: a kép és a fotós, regisztrálva, blokk, tranzakció  |
| `L24_23_hasonlo_kep.png`               | élő: a tócsa 800 px-es másolatának ellenőrzése                                                      | SIMILAR – „Hasonló regisztrált kép”: 1 / 64 bit eltérés, az eredeti adatlapja             |
| `L24_24_nincs_talalat.png`             | élő: a basszusgitár ellenőrzése (nincs feltöltve)                                                   | NOT_FOUND – „Nincs a nyilvántartásban”: a vizsgált fájl SHA-256 hash-e (másolható), dHash |
| `L24_25_hash_alapjan.png`              | élő: a tócsa hash-e beírva (0x előtaggal, nagybetűvel)                                              | VERIFIED hash alapján, a hash-ről szóló magyarázattal, „Másik hash ellenőrzése”           |
| `L24_26_hash_mezohiba.png`             | élő: hibás (túl hosszú) hash beküldve                                                               | a mező hibája a mezőnél, a fókusz a mezőn                                                 |
| `L24_27_nincs_talalat_320px.png`       | élő: a NOT_FOUND kártya 320 képpontos nézetben                                                      | a tördelődő sorok: a hash és a másolás gombja elfér                                       |
| `L24_28_tanusitvany_mit_jelent_ez.png` | élő: az adatlap tanúsítványdoboza                                                                   | a „Mit jelent ez?” hivatkozás a tanúsítvány megjegyzésében                                |
| `L24_29_hogyan_mukodik_fokusz.png`     | élő: a „Mit jelent ez?” hivatkozás után                                                             | az ellenőrző oldal a „Hogyan működik?” szakasznál, a cím fókuszban                        |
| `L24_30_teszt_hiteles.png`             | `client/src/pages/VerifyPage.test.tsx` – a POST, a haladás és a VERIFIED kártya tesztje             | a teljes folyamat: kérés, haladás, elküldés, a kártya fókusza, visszaállítás              |
| `L24_31_teszt_kapu.png`                | `client/src/pages/VerifyPage.test.tsx` – egyszerre egy ellenőrzés                                   | a másik űrlap riasztással áll, kérés nem indul – mindkét irányban                         |
| `L24_32_teszt_fokusz_mashol.png`       | `client/src/pages/VerifyPage.test.tsx` – az eredmény fókusz nélkül                                  | a fejlécben lévő fókusz marad, az élő régió mondja be; a cím leírása                      |
| `L24_33_teszt_utvonal_fokusz.png`      | `client/src/hooks/useRouteFocus.test.tsx` – a célrészlet szabályai                                  | az oldal saját fókusza marad; vissza-navigációnál az oldal címe                           |
| `L24_34_teszt_valasz_ellenorzes.png`   | `client/src/api/verify.api.test.ts` – `isVerificationResult` ellentmondó mezői                      | a hibás válaszok elutasítása                                                              |

- Elhalasztott, elfogadott:
  - L26 – kézi NVDA/VoiceOver ellenőrzés (a kártya címének leírása, a „Mit jelent ez?” neve, az
    állapotsor fókusza); `eslint-plugin-jsx-a11y`; a 320 px-es tördelés csak élő képpel igazolt (a
    jsdom nem rendez el), a rejtett célrészlet fókusz-fallbackje sem tesztelhető jsdomban.
  - L28/L30 – Playwright az ellenőrzés folyamatára (fájl, hash, a három eredmény); az `errorText` egy
    nem-ApiError hibánál az angol motorüzenetet mutatná (előzetes).
  - L32 – a GET-nél a hash az URL-ben: a reverse proxy vagy a gazda naplója rögzítheti (az alkalmazás
    naplója kitakarja).
  - Elfogadva: a két űrlap kapuja csak a küldést állítja meg, a begépelt hash az eredmény
    megjelenésekor elvész (a kártya az űrlapok helyére lép); a kártya régiójának neve a címe; a
    szerver kérte várakozás alatt a mező ellenőrzése lefut a kapu előtt.

- Commit: `3a42aec` – `feat(L24): hitelesség-ellenőrző oldal – kép vagy SHA-256 hash ellenőrzése, a három eredmény kártyája, „Hogyan működik?”`

## L25 – Admin felület (2026-10-11)

- Elkészült:
  - kliens API-réteg: `api/admin.api.ts` – a statisztika (`GET /api/admin/stats`), a felhasználók
    (`GET /api/admin/users`, `PATCH /api/admin/users/:id`), a képek (`GET /api/admin/photos`,
    `PATCH /api/admin/photos/:id`, `POST /api/admin/photos/:id/retry-registration` – 202); a válaszok
    futásidejű ellenőrzése (a rejtett kép ⇔ `hiddenBy`, a tranzakció-hash alakja, a statisztika minden
    állapota egész számmal és az összegek egyezése, a tiltott és admin szám legfeljebb az összes), a
    módosító kérés válasza csak a kért elemé lehet (`sameId`); a lista-lekérdezés csak „?…” alakú
    (`guards.ts` – `expectQueryString`, a galéria is ezt használja; `isPhotoStatus`, `isHiddenBy`
    exportálva a `photos.api.ts`-ből);
  - a nézet az URL-ben: `admin/adminParams.ts` – `q`, `blocked` (a szerver paramétere), `usersPage`,
    `status`, `photosPage`; a két lista paraméterei függetlenek, a hibás érték az alapértelmezés, a
    szerver lekérdezése ebből készül (`usersApiQuery`, `photosApiQuery`); a böngészőfül címe a
    szűrőkkel és az oldallal – a keresőszó nélkül (az előzményekben maradna);
  - `pages/AdminPage.tsx` (lustán töltődő útvonal az `AdminRoute` alatt): három független lekérdezés,
    a képek listája a várakozó képeknél 3 másodpercenként frissül (`pollInterval.ts` – az
    újrapróbálás az időkeretet újraindítja), a várakozó képek kimenetét az
    `admin/registrationOutcome.ts` figyeli (bemondás, a statisztika, a galéria és az adatlap
    frissítése – a szűrt listából eltűnő várakozó képnél is); a fejlécben „Admin” menüpont csak
    adminisztrátornak;
  - `components/admin/`: `StatCards` (öt kártya leíró listában, rejtett h2, mobilon két oszlop és
    kisebb szám), `FilterGroup` (kapcsológombok `aria-pressed`-del – gombsor és címkék), `DataTable`
    (vízszintesen görgethető, a rejtett feliratáról elnevezett, fókuszálható régió; oszlop- és
    sorfejlécek; mobil jelzés), `UsersSection` (keresés Enterre, tiltási szűrő, a saját fiók „(te)”,
    admin „nem tiltható”, letiltás megerősítéssel – `BlockUserDialog` –, feloldás egy gombbal),
    `PhotosSection` (állapotszűrő darabszámmal, a drótváz öt állapota – `adminPhotoStatus.ts` –,
    elrejtés megerősítéssel – `HideAdminPhotoDialog` –, visszaállítás, újrapróbálás; a tulajdonos
    elrejtését az admin nem írja felül), `adminCache.ts` (a sor azonnal a válaszból frissül, aztán az
    admin lekérdezései, a galéria, az adatlapok és a fotósprofil érvénytelenednek; a szerver hibája
    után is újratöltés, a 400 és a 429 kivételével), `actionState.ts` (a futó kérések sorai
    `useMutationState`-tel, a hiba a sorhoz kötve, visszaszámlálás a 429 után), `useRowFocus.ts` (a
    művelet után a fókusz a gombon marad vagy a sor elejére kerül; a szűrt listából a fókusszal együtt
    kikerülő sor helyett a helyére lépő sor vagy a lista eleje kapja; a bemondás a kikerülést is
    mondja);
  - közös változások: `ui/Dialog` `fallbackFocus` (az eltűnt megnyitó gomb helyett a sor eleje),
    `ui/Pagination` `preventScrollReset`, `ui/LoadError` (a gomb leírása a riasztás),
    `dashboard/listSummary.ts` (`countSummaryOf`, a `useViewChangeFocus` szakaszra szűkítve és a
    találatszám görgetésbe hozva), `registrationNotices.ts` (`noticeOf` exportja);
  - tesztek: `api/admin.api.test.ts` (19), `admin/adminParams.test.ts` (9), `pages/AdminPage.test.tsx`
    (32: hozzáférés, áttekintés, nézet az URL-ben, tiltás/feloldás, moderálás, újrapróbálás,
    lekérdezés, betöltési hibák), `routes/router.test.tsx` bővítve; tesztadatok `test/admin.ts`;
  - dokumentáció: README (L25-bekezdés), `client/README.md` (fa, „Adminfelület (L25)”), FORRASOK
    219–220, ez a naplóbejegyzés.
- Ellenőrzés: a négy érintett tesztfájl 77 zöld (előtte 25 piros az implementáció nélkül, majd 15
  piros az átnézések utáni új tesztekkel); a teljes kliens-csomag 703 teszt zöld (60 fájl), lefedettség
  98,43 / 94,86 / 98,93 / 98,94 (az új modulok 95–100 %); `npm run lint`, `npm run typecheck`,
  `npm run build` hibátlan – az adminfelület külön darab (`AdminPage-*.js`, 28 kB), a fő darab
  kisebb lett. Egy korábbi lépés tesztje (`UploadPage` „Mégse”) a lefedettség-mérés alatt egyszer
  időzítés miatt bukott, külön futtatva és a megismételt teljes futásban zöld.
- Átnézések (három párhuzamos, csak olvasó kör): **React** – 2 magas: a szűrt listából (Aktív,
  Tiltott, Hitelesítve, Sikertelen…) a művelet utáni újratöltéskor eltűnő sorral elveszett a fókusz
  (javítva: a sor a layout-effektus takarításában jelzi a sorszámát, a helyére lépő sor vagy a lista
  eleje kapja a fókuszt – `useRowRemovalRescue`), az újrapróbálás nem indította újra a lekérdezés
  időkeretét egy már látott képnél (javítva: `clock.restart()`); 4 közepes: egy `useMutation` minden
  sorhoz – csak a legutóbbi kérés állapota látszott (javítva: `useMutationState` + saját
  hibaállapot), a „Folyamatban” szűrőben eltűnő kép után a statisztika elavult (javítva: a kulcshoz
  kötött figyelés), a lapozó az oldal tetejére görgetett (javítva: `preventScrollReset`, a találatszám
  görgetésbe hozva), a regisztráció kimenete néma volt (javítva: `registrationOutcome.ts`); alacsony:
  a kényszerített fókuszmozgatás (csak ha a fókusz a sorban van), a riasztás nem törlődött (a nézet
  váltásakor és a következő sikernél törlődik), a cím, az ismételt keresőszó (a találatszámra viszi a
  fókuszt), a profil és az adatlap érvénytelenítése, a lusta betöltés – mind javítva.
  **Biztonság** – 0 kritikus/magas/közepes, 7 alacsony: a keresőszó a fül címében (eltávolítva; az
  URL-ben marad – L32), a nem 404/409 hiba után a régi állapot maradt (javítva: a 400 és a 429
  kivételével újratöltés), nem volt visszaszámlálás a 429 után (javítva), a fejlesztői kiszolgáló
  keretezhető (L31/L32: `frame-ancestors`), a „kérés nélkül” teszt nem állított (javítva, és 403-as
  eset is), a fotósprofil gyorsítótára (javítva), az újrapróbálás gyorsítótár-foltja (csak a
  sikertelen/várakozó sort módosítja, `hiddenBy: null`). Igazolt: a lekérdezés csak „?…” alakban mehet
  az útvonalra, minden azonosító UUID és `pathSegment`, a válaszok ellenőrzöttek, nincs `innerHTML`, a
  mutációk az `apiRequest`-en át mennek (Sec-Fetch-Site, SameSite), a szerver minden kérésnél
  ellenőrzi a szerepkört – a felület csak nem kínál elérhetetlen műveletet.
  **Akadálymentesség** – 1 magas (ugyanaz, mint a React-átnézésé – javítva, a bemondás a kikerülést
  is mondja); közepes: a görgetés (javítva), az ablak bezárásakor eltűnt megnyitó gomb helyett az
  oldal címe kapta a fókuszt (javítva: `fallbackFocus` → a sor eleje), a kimenet bemondása
  (javítva), a keresőmező 320 px-en összenyomódott (javítva: teljes sor), a bevétel kilóghatott
  (javítva: kisebb szám keskeny képernyőn); alacsony: a sor hibája a gomb leírása (javítva), az
  „Újrapróbálás” nevek (a betöltésé a riasztás leírásával, a soré „… regisztrációja”), felirat és
  sorfejléc (javítva), a görgethető régió asztali gépen is tabulátor-megálló (elfogadva), mobil
  jelzés (javítva), azonos hivatkozásszövegek a két szakaszban (elfogadva: a h2 adja a
  szövegkörnyezetet), a „levétel”/„elrejtés” szóhasználat (egységesítve), a statisztika rejtett
  címe (javítva).
- Élő demó: lokális Hardhat-lánc, a lefordított szerver a tesztadatbázison, a lefordított kliens a
  `vite preview`-n; az előkészítő script (`prepare-live-l25.mjs`, jegyzetmappa) négy fiókot (Admin Ádám –
  SQL-lel ADMIN, Fotós Fanni, Vásárló Vera – SQL-lel tiltva, Teszt Elek), Fanni öt képét (a három
  saját fotó és két, sharp-pal készített származék: a gyertyák részlete, az elforgatott tócsa) a
  drótváz állapotaiban (hitelesítve; SQL-lel sikertelen; a tulajdonos elrejtette; moderátori levétel;
  mindkettő), és négy rendelést (SQL) hoz létre. Élőben: letiltás és feloldás, elrejtés, visszaállítás
  (a tulajdonos elrejtése érvényben marad), újrapróbálás – a kép a lokális láncon valóban
  regisztrálódott („Hash a láncon” 4 → 5), a szűrt nézet, a nem admin felhasználó „Nincs
  jogosultság” oldala. A várakozó állapot képét a lánc gyorsasága miatt nem sikerült elkapni (a
  lekérdezés 3 másodpercen belül hitelesítettet hozott); a 320 px-es nézet a DevTools eszköz-emulációjával.

| Kép                                         | Forrás                                                                                             | Tartalom                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `L25_01_kliens_piros.png`                   | `npx vitest run` – az L25 négy tesztfájlja az implementáció előtt                                  | 25 piros teszt, két fájl nem is töltődik be (nincs modul)                            |
| `L25_02_atnezes_piros.png`                  | `npx vitest run` – az átnézések utáni új és módosított tesztek a javítások előtt                   | 15 piros teszt                                                                       |
| `L25_03_kliens_zold.png`                    | `npx vitest run` – a négy tesztfájl a javítások után                                               | 77 zöld teszt                                                                        |
| `L25_04_kliens_lefedettseg.png`             | `npm run coverage` (client)                                                                        | 703 teszt, lefedettség 98,43 %, az új modulok sorai                                  |
| `L25_05_kliens_lint_build.png`              | `npm run lint`, `npm run typecheck`, `npm run build` (client)                                      | hibátlan; az adminfelület külön darab                                                |
| `L25_06_regisztracio_kimenet.png`           | `client/src/admin/registrationOutcome.ts` – `useRegistrationOutcome`                               | a várakozó képek kimenete: bemondás, érvénytelenítés                                 |
| `L25_07_admin_api_kep_ellenorzes.png`       | `client/src/api/admin.api.ts` – `isAdminPhoto`                                                     | a kép válaszának ellenőrzése (rejtett ⇔ hiddenBy, hash, dátumok)                     |
| `L25_08_admin_api_statisztika.png`          | `client/src/api/admin.api.ts` – `isStatusCounts`, `isUserCounts`, `isPlatformStats`                | a statisztika ellenőrzése: minden állapot, az összegek egyeznek                      |
| `L25_09_admin_api_muveletek.png`            | `client/src/api/admin.api.ts` – `sameId` és a végpontok függvényei                                 | listák, tiltás, elrejtés, újrapróbálás, statisztika                                  |
| `L25_10_admin_params_beolvasas.png`         | `client/src/admin/adminParams.ts` – `parseAdminParams`                                             | az URL paramétereinek beolvasása a szerver szabályaival                              |
| `L25_11_admin_params_lekerdezes.png`        | `client/src/admin/adminParams.ts` – `adminSearchParams` … `photosApiQuery`                         | az URL és a szerver lekérdezése                                                      |
| `L25_12_stat_kartyak.png`                   | `client/src/components/admin/StatCards.tsx` – `cardsOf`                                            | az öt kártya szövegei                                                                |
| `L25_13_kep_allapot_muvelet.png`            | `client/src/components/admin/adminPhotoStatus.ts` – `adminPhotoActionOf`                           | a sor művelete az állapot szerint                                                    |
| `L25_14_gyorsitotar_frissites.png`          | `client/src/components/admin/adminCache.ts` – `shouldRefreshAfterError`, `applyUserChange`         | a sor frissítése a válaszból, érvénytelenítések                                      |
| `L25_15_sor_fokusz.png`                     | `client/src/components/admin/useRowFocus.ts` – `useRowFocus`                                       | a fókusz a művelet után, és a kikerült sor mentése                                   |
| `L25_16_sor_eltunes_mentes.png`             | `client/src/components/admin/useRowFocus.ts` – `useRowRemovalRescue`                               | a sor jelzése a layout-effektus takarításában                                        |
| `L25_17_felhasznalo_sor.png`                | `client/src/components/admin/UsersSection.tsx` – `UserRow`                                         | a felhasználó sora: sorfejléc, állapot, egyetlen gomb-elem                           |
| `L25_18_kepek_mutaciok.png`                 | `client/src/components/admin/PhotosSection.tsx` – a bemondás, a visszaállítás és az újrapróbálás   | a mutációk, a kikerülés szövege, a visszaszámlálás                                   |
| `L25_19_muvelet_allapot.png`                | `client/src/components/admin/actionState.ts` – `usePendingIds`                                     | a futó kérések sorai a mutációs gyorsítótárból                                       |
| `L25_20_admin_oldal.png`                    | `client/src/pages/AdminPage.tsx` – `AdminPage`                                                     | a három lekérdezés, a lekérdezési ütem, a szakaszok                                  |
| `L25_21_admin_attekinto.png`                | Chrome DevTools – `http://localhost:4173/admin` adminként (teljes oldal)                           | statisztika, felhasználók és képek a drótváz állapotaiban                            |
| `L25_22_statisztika_kartyak.png`            | Chrome DevTools – a „Statisztika” régió                                                            | öt kártya a lokális adatokból                                                        |
| `L25_23_felhasznalok_tablazat.png`          | Chrome DevTools – a „Felhasználók táblázata” régió                                                 | négy sor: aktív, tiltott, a saját fiók „(te)” és „nem tiltható”                      |
| `L25_24_kepek_tablazat.png`                 | Chrome DevTools – a „Képek táblázata” régió                                                        | öt állapot a hozzá tartozó művelettel vagy magyarázattal                             |
| `L25_25_letiltas_megerosites.png`           | Chrome DevTools – „Letiltás: Teszt Elek” után                                                      | a megerősítő ablak a következményekkel, fókusz a Mégse gombon                        |
| `L25_26_letiltas_utan.png`                  | Chrome DevTools – a „Letiltás” megerősítése után                                                   | a sor Tiltva, a gombja Feloldás                                                      |
| `L25_27_feloldas_utan.png`                  | Chrome DevTools – „Feloldás: Vásárló Vera” után                                                    | a sor Aktív, a gombja Letiltás                                                       |
| `L25_28_elrejtes_megerosites.png`           | Chrome DevTools – „Elrejtés: Tócsa tükröződéssel” után                                             | a megerősítő ablak a következményekkel                                               |
| `L25_29_elrejtes_utan.png`                  | Chrome DevTools – az „Elrejtés” megerősítése után                                                  | a sor „Moderátor eltávolította”, előnézet nélkül, a gombja Visszaállítás             |
| `L25_30_teszt_letiltas.png`                 | `client/src/pages/AdminPage.test.tsx` – „letiltás: megerősítő ablak…”                              | a tiltás folyamata: ablak, PATCH, a sor, a fókusz, az újratöltés                     |
| `L25_31_teszt_szurt_lista.png`              | `client/src/pages/AdminPage.test.tsx` – „szűrt listában (Hitelesítve)…”                            | a kikerülő sor: a fókusz a helyére lépő sor címére, a bemondás                       |
| `L25_32_teszt_ujraprobalas.png`             | `client/src/pages/AdminPage.test.tsx` – „újrapróbálás: POST…”                                      | a POST, a várakozó sor, a fókusz, a 429 és a visszaszámlálás                         |
| `L25_33_teszt_egyideju.png`                 | `client/src/pages/AdminPage.test.tsx` – „két sor művelete egyszerre…”                              | két futó kérés: mindkét gomb foglalt, a későbbi hiba is látszik                      |
| `L25_34_teszt_valasz_ellenorzes.png`        | `client/src/api/admin.api.test.ts` – a hibás képsorok esetei                                       | a hibás válaszok elutasítása                                                         |
| `L25_35_visszaallitas_utan.png`             | Chrome DevTools – „Visszaállítás: Gyertyaláng közelről” után                                       | a sor Hitelesítve, előnézettel, a gombja Elrejtés                                    |
| `L25_36_visszaallitas_tulajdonos_marad.png` | Chrome DevTools – „Visszaállítás: Tükörkép álló képen” után                                        | a kép rejtett marad: „Elrejtve (tulajdonos)”, „a tulajdonos döntése”                 |
| `L25_38_ujraprobalas_hitelesitve.png`       | Chrome DevTools – „Újrapróbálás: Gyertyák a sötétben regisztrációja” után, a lekérdezés frissítése | a kép a lokális láncon regisztrálódott: Hitelesítve, a gombja Elrejtés               |
| `L25_39_szurt_nezet.png`                    | Chrome DevTools – `/admin?blocked=true&status=HIDDEN` (teljes oldal)                               | a „Tiltott” és a „Rejtett” szűrő: egy felhasználó, három kép, a fül címe a szűrőkkel |
| `L25_40_keskeny_320px.png`                  | Chrome DevTools – `/admin` 320 px széles nézetben (teljes oldal)                                   | kétoszlopos kártyák, a keresőmező teljes sorban, a táblázatok görgethető régióban    |
| `L25_41_nincs_jogosultsag.png`              | Chrome DevTools – `/admin` nem admin felhasználóként (Fotós Fanni)                                 | „Nincs jogosultságod”, a fejlécben nincs Admin menüpont                              |

- Elhalasztott, elfogadott:
  - L26 – kézi NVDA/VoiceOver ellenőrzés (a sorfejlécek, a kikerülő sor fókusza, a kimenet
    bemondása); a 320 px-es tördelés csak élő képpel igazolt (a jsdom nem rendez el); a görgethető
    régió asztali gépen is tabulátor-megálló (ResizeObserver-rel lehetne feltételes).
  - L28/L30 – Playwright az adminfolyamatra (tiltás, elrejtés, újrapróbálás).
  - L31/L32 – a kiszolgált felület keretezése ellen `frame-ancestors` (helmet); a keresőszó az
    URL-ben (az előzményekben marad – a szerver naplója kitakarja).
  - Elfogadva: a két szakasz azonos nevű hivatkozásai („Vissza az első oldalra”, „Szűrő törlése” – a
    h2 adja a szövegkörnyezetet); a választott szűrő gombja nem „nyomható ki”; a bemondás nem
    ismétli a kikerülés okát szűrőnként; a várakozó állapot élő képe nem készült el.

- Commit: `f9718cf` – `feat(L25): admin felület – statisztika, felhasználók tiltása, képek moderálása, a lánc-regisztráció újrapróbálása`

## L26 – Reszponzivitás, akadálymentesség, UX-csiszolás (2026-10-11)

- Elkészült:
  - statikus akadálymentességi lint: `eslint-plugin-jsx-a11y` külön konfigurációval
    (`client/eslint.a11y.config.js`, `npm run lint:a11y`; a `npm run lint` mindkettőt futtatja). Az
    első futás 16 találata: 6× `no-redundant-roles` (a kiírt `role="list"` szándékos – a Safari +
    VoiceOver miatt –, beállítással engedett), 5× `no-autofocus` (a párbeszédablakok első mezője és a
    hitelesség-ellenőrző „Másik kép / hash” visszaállítása – a szabály kikapcsolva, az ok a
    konfigurációban), a görgethető adattábla-régió `tabindex`-e (engedett szerep), a `SessionGate`
    `role` propja (`ignoreNonDOM`), a csillagok `aria-required`/`aria-invalid` jelölése (a
    `fieldset`-re került `role="radiogroup"`-pal – `RatingInput.tsx`), a feltöltés oldalán a nem
    kezelőelem csoport `onKeyDown`-ja (natív `keydown` figyelő egy effektusban, `useEffectEvent`-tel).
    A bővítmény peer-függősége még ESLint 9-et nevez meg: először `client/.npmrc`
    (`legacy-peer-deps`), az átnézések után ehelyett a `package.json` `overrides` mezője csak erre az
    egy függőségre írja elő a projekt ESLint-jét (a többi peer-ütközés látható marad, a lockfile
    újragenerálva, a 114 új bejegyzés mind fejlesztői és integritás-hash-sel);
  - látható értesítés (toast) ugyanabban az élő régióban (`components/ui/LiveRegion.tsx`,
    `liveRegionContext.ts`): `announce(üzenet, { visible: true, tone })` – rövid fekete doboz a
    képernyő alján, a sikeré pipa, a sikertelen kimeneté (a lánc-regisztráció nem sikerült, a szerver
    elutasította az értékelést – 403/409) figyelmeztető ikon, a semleges változásé (egy kép kikerült a
    szűrt listából, a képet elrejtették) „i”; `data-tone` a tesztekhez. 7 másodpercig látszik
    (`LIVE_MESSAGE_TTL_MS`), rámutatáskor megáll (a szünet csak a láthatóé – a helyére lépő rejtett
    üzenet akkor is kiürül, ha az egér ott maradt), az Escape eltünteti (ha eltakarna valamit), a
    hosszú, szóköz nélküli cím is tördelődik (`wrap-anywhere`), szélesen legfeljebb 28 rem,
    érintőképernyőn nem fogja el a koppintást (`pointer-coarse:pointer-events-none`), kontrasztos
    módban átlátszó keretből látható keret. Egy üzenethely van: az újabb bejelentés a korábbit váltja.
    Amíg modális párbeszédablak van nyitva, a bejelentések várnak – a `Dialog` a kontextuson át jelzi
    a megnyitást és a bezárást (`dialogOpened`/`dialogClosed`, a fókusz visszaadása után) –, és az
    ablak bezárása után egybefűzve, a legerősebb tónussal hangzanak el. Látható hívóhelyek:
    vezérlőpult (szerkesztés, levétel, a regisztráció kimenete), admin (tiltás, feloldás, elrejtés,
    visszaállítás, újrapróbálás, a regisztráció kimenete), értékelés írása és törlése, profil mentése,
    másolás, be- és kijelentkezés, a feltöltés oldalán a feltöltés sikere és az állapotváltások;
  - elrendezés-ugrás (CLS) ellen: a fejléc fiókrészének helyét a munkamenet ellenőrzése alatt a
    belépési hivatkozások rejtett mása foglalja (`Header.tsx`); egész oldalas betöltésjelző
    (`components/ui/LoadingView.tsx` – a hajtásig ér, így a lábléc a betöltés alatt is a hajtás alatt
    van: `LoadingPage`, a `ProtectedRoute` munkamenet-ellenőrzése, az adatlap és a profil betöltése);
    az admin statisztikájának kártyái helyén ugyanakkora vázak a valódi címkékkel
    (`StatCardsSkeleton`), a listák táblázata helyén `ListPlaceholder`; az adatlap előnézetének
    kerete a kép méretarányát előre foglalja (`aspect-(--preview-ratio)`, legfeljebb 70 vh, legalább
    8 rem – a hiányzó előnézet szövege a lapos panorámánál sem vágódik le); a görgetősáv helye
    állandó (`html { scrollbar-gutter: stable }` – a betöltődő tartalommal megjelenő sáv Windowson
    7,5 képponttal tolta el a középre igazított oldalt), a görgetési ráhagyás alul az értesítés sávja
    (`scroll-padding-bottom: 6rem`);
  - a vendég induló munkamenet-ellenőrzése nem hiba: `GET /api/auth/me` süti nélkül 200
    `{ data: { user: null } }` (új `loadSession` köztes réteg – a letiltott fiók 403 marad; a
    használhatatlan sütit a válasz törli – `auth.controller.ts`), a kliens `fetchSessionUser`-e a
    `user: null`-t fogadja (a 401 és a 403 ACCOUNT_BLOCKED továbbra is „nincs munkamenet”); a
    böngésző konzoljába nem kerül 401 (a Lighthouse `errors-in-console` ellenőrzése átmegy);
  - apróbb csiszolások: a galéria hosszú helykitöltője keskeny mezőben három ponttal rövidül
    (`text-ellipsis` a mezőn – a `::placeholder` nem minden böngészőben fogad `text-overflow`-t);
    a `types/express.d.ts` megjegyzése a három köztes réteggel;
  - dokumentáció: `docs/design/README.md` (2.2.1 sor: az értesítés kiegészítő visszajelzés, az
    eltűnése nem időkorlát), `docs/design/stilusutmutato.html` („Visszajelzés”: a tónusok), a kliens
    README „Csiszolás (L26)” bekezdése, a gyökér README (`GET /auth/me`), `docs/FORRASOK.md` (a
    218–223. sor hiányzó oszlopai és elcsúszott URL-je javítva; új sorok: 221–227 – jsx-a11y, WCAG
    4.1.3, 2.2.1, 2.4.11, `scrollbar-gutter`/`scroll-padding`, web.dev CLS, Lighthouse);
  - tesztek (TDD, két piros kör): kliens 707 → 714 (új: `LoadingView.test.tsx`; az élő régió
    tónusa, Escape, az egy üzenethely és a szünet, a párbeszédablak alatti várakozás; az admin vázak;
    a fejléc helyfoglalása 200-as `user: null` válasszal; az adatlap keretének osztályai és a
    betöltés nézete; a rádiócsoport – a csillagokon nincs `aria-required`, választás után nincs
    `aria-invalid`; a 409-es értékelés figyelmeztető tónusa; a vezérlőpult és az admin sikertelen
    regisztrációjának tónusa, a kikerülés tájékoztató tónusa); szerver 1095 → 1103 (a `/me` vendégnek
    200 `user: null`, érvénytelen sütinél a süti törlése – az integrációs tesztben is –; a „be van
    jelentkezve” előfeltételek a felhasználó azonosítójával, mert a 200 önmagában a vendégé is lehet).
- Ellenőrzés: kliens lefedettség 714 teszt, 61 fájl – 98,49 % utasítás, 94,89 % elágazás, 98,96 %
  függvény, 99,02 % sor; `npm run lint` (ESLint + jsx-a11y) és `typecheck` 0 hiba; `npm run build`
  rendben (az `index` darab 525 kB, gzip 161 kB – a Vite figyelmeztetése, lásd elhalasztva); szerver
  `npm test` 1103 teszt, 68 fájl; `npm run design:check` mind a 19 színpár megfelel.
- Átnézések (három párhuzamos, csak olvasó: React, biztonság, akadálymentesség – 0 kritikus, 0
  magas). **React** – közepes: a pipa a sikertelen üzeneteknél is (javítva: tónus), a nyitott modális
  ablak alatt elvesző értesítés (javítva: várakozás, egybefűzve), a rejtett bejelentés korán leváltja
  a látható értesítést és a szünet ráragadhat (javítva: a szünet csak a láthatóé; a feltöltés oldalán
  a hitelesítés is látható; az egy üzenethely elfogadva, dokumentálva), a hosszú cím kilóg (javítva:
  `wrap-anywhere`), az értesítés eltakarhatja a fókuszt és elfogja a koppintást (javítva:
  `scroll-padding-bottom`, Escape, érintőképernyőn átengedi), a szervertesztek előfeltételei a 200
  után üresek (javítva); alacsony: tesztrések (javítva), a 2.2.1 hivatkozás pontatlan (javítva a
  kódban, a tesztekben és a dokumentációban), a FORRASOK sorai (javítva), `.npmrc` (javítva:
  `overrides`; az `allowExpressionValues` és a saját komponensek leképezése elfogadva), a
  `placeholder:truncate` Firefoxban (javítva: `text-ellipsis`), a keret `overflow-hidden`-je (javítva:
  `min-h-32`), a bejelentkezett fejléc szélessége (elfogadva – nem változott), kontrasztos mód
  (javítva: átlátszó keret), régi csomag az új szerverrel (elfogadva – telepítési megjegyzés), a
  natív `keydown` figyelő (elfogadva), ismétlődő visszajelzés és az oldalváltást túlélő értesítés
  (elfogadva). **Biztonság** – közepes: a `legacy-peer-deps` az egész kliensre (javítva:
  `overrides`, `npm ci` ellenőrizve); alacsony: a `/me` naplójában nem látszik a hamis süti és a
  süti nem törlődik (javítva: törlés; a külön naplóesemény elfogadva), más felhasználó szövege a
  bizalmas kinézetű értesítésben (javítva: szélesség és tördelés; a címek idézőjelben, XSS nincs –
  React szövegcsomópont), a `req.user` elavult megjegyzése (javítva). Igazolva: a token-ellenőrzés
  változatlan, nincs felhasználó-felsorolás (minden rossz süti ugyanazt a 200-at kapja), `no-store`,
  a sebességkorlát, minden más védett útvonal `requireAuth`. **Akadálymentesség** – közepes: az
  értesítés eltakarhatja a fókuszt (javítva), tördelés (javítva), tónus (javítva), a modális ablak
  alatti értesítés (javítva), a 2.2.1 megfogalmazása (javítva); alacsony: egy üzenethely
  (elfogadva), érintés (javítva), sorhossz (javítva: 28 rem), a fejléc `inert` (nem kell: a
  `visibility: hidden` kiveszi a fókuszból is), a rádiócsoport tesztrései (javítva), a keret
  (javítva), a helykitöltő (javítva), `no-autofocus` szigorítása soronkénti kivétellel (elfogadva:
  a kivétel-megjegyzés a fő konfigurációban „ismeretlen szabály” hibát ad), a React `autoFocus`
  párbeszédablakban (nem igazolt élőben – elhalasztva).
- Lighthouse 13.4.1 (CLI, produktív build a `vite preview`-n, a próbaszerver a tesztadatbázissal, a
  bejelentkezett oldalak sütivel; nyolc oldal asztali és mobil előbeállítással): akadálymentesség
  mind a 16 futásban 100 (25–33 ellenőrzés oldalanként), legjobb gyakorlatok 100, SEO 91–92. Az első
  futás a CLS-t mutatta meg: adatlap 0,3 / 0,15, feltöltés 0,376 / 0,169, admin 0,279 / 0,42 – az okok
  a `PerformanceObserver` `layout-shift` bejegyzéseiből: a rövid betöltési nézet után megérkező
  tartalom kitolta a láblécet, a megjelenő görgetősáv eltolta a középre igazított oldalt, az admin
  statisztikájának és táblázatainak megérkezése letolta az alatta lévő szakaszokat. A javítások után
  minden futásban legfeljebb 0,078 (adatlap 0 / 0,001, feltöltés 0 / 0,012, admin 0,064 / 0,012), a
  teljesítmény asztalon 99–100, mobilon 89–92 (a szimulált lassú 4G-n az FCP 2,0–2,6 s, az LCP
  2,9–3,2 s – az egyetlen 525 kB-os darab miatt). Elfogadott, nem javított ellenőrzések:
  `valid-source-maps` (a produktív csomaghoz szándékosan nincs forrástérkép), `unused-javascript`
  és `render-blocking` (egy közös darab és egy stíluslap), `robots-txt`/`llms-txt` (telepítés –
  L31–L32), `image-delivery` és `lcp-discovery` (az előnézet a lekérdezés után töltődik – SPA),
  `network-dependency-tree`.
- Élő demó (lokális Hardhat-lánc – a tesztadatbázis törlése után a láncot is újra kellett indítani
  és a szerződést újratelepíteni, mert a hash-ek már a láncon voltak –, a lefordított szerver a
  tesztadatbázison, a `vite preview`, a `prepare-live-l25.mjs` demóadatai): a mobilnézetek a Chrome
  DevTools eszköz-emulációjával (390×844, 2×; a galéria 320×568-on is), az admin újrapróbálása a
  lokális láncon valóban regisztrált („Gyertyák a sötétben” hitelesítve, a galéria 1 → 2 kép). A
  rögzített helyzetű értesítés képéhez új lap, egyszeri emuláció és egyetlen betöltés kellett: az
  emuláció utólagos átállítása után a DevTools a rögzített elemeket az ablak (834 px) és nem a
  dokumentum (390 px) szélességéhez igazította – ez az emuláció, nem a felület hibája (a
  dokumentum `clientWidth`-e 390 maradt); az értesítést a rámutatás szünete (`mouseover` esemény)
  tartotta a képernyőn a kép elkészültéig.

| Kép                                   | Forrás                                                                                  | Tartalom                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `L26_01_kliens_piros.png`             | `npx vitest run` – az L26 első kliens-tesztjei az implementáció előtt                   | 4 piros teszt: `user: null`, látható értesítés, a fejléc helyfoglalása                    |
| `L26_02_szerver_piros.png`            | `npx vitest run` – a `/me` tesztjei a két kör előtt                                     | 4 + 4 piros teszt: `user: null`, majd a süti törlése                                      |
| `L26_03_kliens_piros_2.png`           | `npx vitest run` – az átnézések és a CLS javításainak tesztjei az implementáció előtt   | 13 piros teszt: tónus, Escape, párbeszédablak, vázak, betöltési nézet, rádiócsoport       |
| `L26_04_kliens_lefedettseg.png`       | `npm run coverage` (client)                                                             | 714 teszt, 61 fájl; 98,49 / 94,89 / 98,96 / 99,02 %; az L26 fájljai                       |
| `L26_05_kliens_lint_build.png`        | `npm run lint`, `npm run typecheck`, `npm run build` (client)                           | ESLint + jsx-a11y és tsc 0 hiba; a build darabjai (525 kB index, gzip 161 kB)             |
| `L26_06_szerver_tesztek.png`          | `npm test` (server)                                                                     | 1103 teszt, 68 fájl                                                                       |
| `L26_07_kontraszt.png`                | `npm run design:check`                                                                  | mind a 19 színpár megfelel a WCAG AA-nak                                                  |
| `L26_08_lighthouse_elott.png`         | `lighthouse-summary-l26.mjs` (jegyzetmappa) – az első futás 16 jelentése                | A11y 100 mindenhol; CLS: adatlap 0,3, feltöltés 0,376, admin 0,42                         |
| `L26_09_lighthouse_utan.png`          | `lighthouse-summary-l26.mjs` (jegyzetmappa) – a javítások utáni 16 jelentés             | CLS legfeljebb 0,078, teljesítmény asztalon 99–100; az elfogadott ellenőrzések            |
| `L26_10_elo_regio_bejelentes.png`     | `client/src/components/ui/LiveRegion.tsx` 77–110. sor                                   | `announce` tónussal, `flushPending`, `dialogOpened`/`dialogClosed` (egybefűzés)           |
| `L26_10b_elo_regio_megjelenes.png`    | `client/src/components/ui/LiveRegion.tsx` 114–156. sor                                  | a kiürülés és a szünet, az Escape, a `data-tone`, az ikon a tónus szerint                 |
| `L26_11_fejlec_helyfoglalas.png`      | `client/src/components/layout/Header.tsx` 123–132. sor                                  | a belépési hivatkozások rejtett mása a munkamenet ellenőrzése alatt                       |
| `L26_12_munkamenet_betoltese.png`     | `server/src/middleware/auth.ts` – `createAuthMiddleware`                                | `requireAuth`, `optionalAuth`, az új `loadSession`, `requireRole`                         |
| `L26_13_munkamenet_kliens.png`        | `client/src/api/auth.api.ts` – `fetchSessionUser`                                       | a `user: null` nem hiba; a 401 és a 403 ACCOUNT_BLOCKED „nincs munkamenet”                |
| `L26_14_elonezet_meretarany.png`      | `client/src/pages/PhotoDetailPage.tsx` 200–215. sor                                     | a keret a méretarányt előre foglalja (`--preview-ratio`, `max-h-[70vh]`, `min-h-32`)      |
| `L26_15_csillagok_radiogroup.png`     | `client/src/components/photos/RatingInput.tsx` – `RatingInput`                          | `fieldset role="radiogroup"` `aria-required`/`aria-invalid`-dal                           |
| `L26_16_a11y_lint_konfig.png`         | `client/eslint.a11y.config.js`                                                          | a jsx-a11y konfiguráció és a szabályok indoklása                                          |
| `L26_17_feltoltes_escape.png`         | `client/src/pages/UploadPage.tsx` 346–360. sor                                          | a panel Escape-je natív figyelővel (`useEffectEvent`)                                     |
| `L26_18_betoltes_nezet.png`           | `client/src/components/ui/LoadingView.tsx`                                              | az egész oldalas betöltésjelző a hajtásig (CLS)                                           |
| `L26_19_statisztika_vaz.png`          | `client/src/components/admin/StatCards.tsx` – `StatCardsSkeleton`                       | a kártyák váza a valódi címkékkel, rejtett felirat                                        |
| `L26_1A_alapstilus_gorgetosav.png`    | `client/src/styles/index.css` 12–33. sor                                                | `scrollbar-gutter: stable`, `scroll-padding-bottom`, a fókuszkeret                        |
| `L26_20_mobil_galeria.png`            | Chrome DevTools – `/` 390×844 (2×)                                                      | a galéria mobilon: egy oszlop, a helykitöltő három ponttal rövidül                        |
| `L26_21_mobil_adatlap.png`            | Chrome DevTools – `/photos/<tócsa>` 390×844                                             | az adatlap mobilon: morzsamenü, cím, fotós, az előnézet a kerettel                        |
| `L26_22_mobil_ellenorzes.png`         | Chrome DevTools – `/verify` 390×844                                                     | a hitelesség-ellenőrző mobilon                                                            |
| `L26_23_mobil_belepes.png`            | Chrome DevTools – `/login` 390×844                                                      | a belépés mobilon: teljes szélességű mezők és gomb, a lábléc alul                         |
| `L26_24_mobil_320_galeria.png`        | Chrome DevTools – `/` 320×568                                                           | a galéria 320 képponton: nincs vízszintes görgetés                                        |
| `L26_25_mobil_ertesites.png`          | Chrome DevTools – a belépés utáni galéria 390×844 (az értesítés a rámutatás szünetében) | a látható értesítés: „Bejelentkeztél, Admin Ádám.” pipával, a képernyő alján középen      |
| `L26_26_mobil_feltoltes.png`          | Chrome DevTools – `/upload` 390×844 (bejelentkezve)                                     | a feltöltés mobilon: a bejelentkezett fejléc két sorban, a fogadóterület                  |
| `L26_27_mobil_vezerlopult.png`        | Chrome DevTools – `/dashboard` 390×844                                                  | a vezérlőpult üres állapota mobilon                                                       |
| `L26_28_mobil_admin.png`              | Chrome DevTools – `/admin` 390×844                                                      | az admin kártyái két oszlopban, a keresőmező teljes sorban                                |
| `L26_30_teszt_ertesites.png`          | `client/src/components/ui/LiveRegion.test.tsx` 91–124. sor                              | a látható értesítés tesztje: osztály, kezelőelem nélkül, a szünet és a kiürülés           |
| `L26_31_teszt_fejlec.png`             | `client/src/components/layout/Layout.test.tsx` 63–82. sor                               | a fejléc helyfoglalása a válaszig, utána a valódi hivatkozások (200 `user: null`)         |
| `L26_32_teszt_me_null.png`            | `server/tests/db/auth.test.ts` 300–321. sor                                             | `/me` süti nélkül 200 `user: null`, érvénytelen sütinél a süti törlése                    |
| `L26_33_teszt_radiogroup.png`         | `client/src/pages/PhotoDetailPage.test.tsx` 797–805. sor                                | a kötelezőség és a hiba a rádiócsoporton, nem a csillagokon                               |
| `L26_34_teszt_dialogus_varakozas.png` | `client/src/components/ui/LiveRegion.test.tsx` 208–229. sor                             | a modális ablak alatt várakozó két üzenet bezárás után egybefűzve, figyelmeztető tónussal |
| `L26_35_teszt_statisztika_vaz.png`    | `client/src/pages/AdminPage.test.tsx` 309–326. sor                                      | a statisztika váza öt kártyával és rejtett felirattal, betöltés után eltűnik              |

- Elhalasztott, elfogadott:
  - kézi NVDA/VoiceOver/TalkBack-próba (az értesítés felolvasása, a modális ablak utáni egybefűzött
    bemondás, a rádiócsoport) – a szerző végzi; a React `autoFocus` a párbeszédablakokban élő
    böngészőben nem igazolt (L28 – Playwright).
  - L30/L31 – a kliens egyetlen 525 kB-os darabja (a mobil FCP/LCP a szimulált lassú 4G-n 2–3 s):
    útvonalankénti darabolás; produktív forrástérkép nincs (szándékos); `robots.txt`/`llms.txt`
    (L31–L32); újratelepítéskor a régi csomag a `/me` `user: null` válaszát hibának veszi egy
    újratöltésig.
  - Elfogadva: a galéria lapozásakor a fókusz a keresőmezőben marad (nem egységesítve a többi
    listával); a görgethető admin-régió asztali gépen is tabulátor-megálló; egy üzenethely az élő
    régióban (az újabb bejelentés a korábbit váltja, a szünet csak a láthatóé); az értesítés az
    oldalváltást túlélheti (legfeljebb 7 s); a több képet felsoroló értesítés nincs darabszámra
    rövidítve; a `no-autofocus` kikapcsolva (a soronkénti kivétel a fő lint-konfigurációban hibát
    adna); a jsx-a11y nem képezi le a saját `Button`/`ButtonLink` komponenseket.

- Commit: `f0c6d11` – `feat(L26): reszponzivitás, akadálymentesség, UX-csiszolás – látható értesítések, CLS-javítások, jsx-a11y lint, Lighthouse-audit`

## L27 – Automatizált tesztek kiegészítése, lefedettség, CI (2026-10-11)

- Kiindulás (az L27 előtt mért lefedettség): szerver 1103 teszt, 68 fájl – 99,83 % utasítás,
  98,93 % elágazás, 100 % függvény, 99,94 % sor (a kitűzött cél a szerver üzleti logikáján ≥ 80 %);
  kliens 714 teszt, 61 fájl – 98,49 / 94,89 / 98,96 / 99,02 %; okosszerződés 17 teszt, 100 % sor és
  utasítás (`hardhat test --coverage`). A terv kulcskomponensei már le vannak fedve:
  `ChainCertificate.test.tsx` (12 teszt), `UploadPage.test.tsx` (32 → 33), `ProtectedRoute.test.tsx`
  (16). A lefedettség-műszerezés alatt egy teszt (`imageDecoding.test.ts` – öt kép kódolása és
  dekódolása egy esetben) túllépte az 5 másodperces alapértelmezést: külön időkorlátot kapott
  (20 s), a hiba oka dokumentálva.
- Elkészült:
  - hiányzó ágak tesztjei a szerveren: `jwt.test.ts` (a könyvtár szöveges törzsére is `null` – a
    `jsonwebtoken.verify` mockolva, mert a `maxAge` miatt valódi tokennel nem idézhető elő),
    `logger.test.ts` (fejlesztői módban a pino-pretty transzport), `env.test.ts` (nem létező `.env`
    fájlnál csak a folyamat környezete); a kliensen: `pollInterval.test.ts` (`pollErrorNoteOf`:
    404, 429 másodpercben és percben, általános hiba), `UploadPage.test.tsx` (a fogadóterület fölött
    a dobás engedett és „másolás” jelzésű; a megszakított fájlválasztó nem törli a kiválasztást; egy
    megabájt alatti törzsnél a haladás kB-ban). A tesztek a meglévő viselkedést rögzítik (nem új
    funkció – piros fázisuk nincs); a megmaradt le nem fedett sorok védőágak: `hashing.service.ts`
    (a sharp mindig 72 bájtot ad), `concurrency.ts` (a kulcs bejegyzése nem hiányozhat),
    `errorHandler.ts` (a törzs beolvasása közben megkezdett válasz), `redirect.ts` (a jsdom nem
    navigál – a hívók mockolják), a jsdom-ban nem létező `DataTransfer`/`scrollIntoView` ágak.
  - lefedettségi jelentés bukó teszt mellett is (`coverage.reportOnFailure: true` a szerver és a
    kliens Vitest-konfigurációjában): a CI mellékletként így is megőrzi;
  - gyökér-scriptek: `npm run typecheck` (mindhárom alprojekt), `npm run coverage` (szerver +
    kliens, 80 %-os küszöbbel), `npm run check` (formázás, lint, design-tesztek,
    okosszerződés-tesztek – ez fordítja a szerződést –, utána a típusellenőrzés a generált
    szerződés-típusokkal, végül a lefedettség – ugyanaz, mint a CI);
  - GitHub Actions (`.github/workflows/ci.yml`): push a `main`-re, minden pull request és kézi
    indítás; Ubuntu, Node.js 24, npm-gyorsítótár a négy lockfile-ra, `npm ci` a gyökérben és a
    három alprojektben, a `check` lépései külön (formázás és lint; design- és
    okosszerződés-tesztek; típusellenőrzés; szervertesztek lefedettséggel; klienstesztek
    lefedettséggel – `!cancelled()` feltétellel, hogy a kliens jelentése a szerver bukásakor is
    elkészüljön), `npm run build`, a szerver és a kliens `coverage/` mappája mellékletként
    (`lefedettseg`, 14 napig, bukásnál is). A szerver adatbázis-tesztjeihez PostgreSQL 17
    szolgáltatás-konténer egészségellenőrzéssel és eldobható jelszóval; a `TEST_DATABASE_URL`
    csak a szerverteszt-lépésé (a `globalSetup` a környezeti változót a `.env` előtt olvassa, a név
    „_test” végű); a lánctesztek saját lokális Hardhat-hálózatot indítanak; a Stripe hamisított; a
    token csak olvas (`permissions: contents: read`), a checkout nem hagyja a `.git/config`-ban
    (`persist-credentials: false`); ugyanarra az ágra érkező újabb push leállítja a futót; az
    action-ök (`checkout`, `setup-node`, `upload-artifact`) a jelenlegi `@v7` főverzión (Node 24-es
    futtató). Titkos kulcs nem kell. A munkafolyamat helyben nem futtatható: a szerkezetét a
    Prettier (YAML) és egy kulcs-ellenőrzés, az action-ök bemeneteit az `action.yml`-jük igazolta;
    a zöld futás képét a push után a szerző készíti (a push az ő döntése).
  - a `design:test` az L26 óta bukott: a stílusútmutató „Visszajelzés” bekezdése az L26-ban
    kézzel módosult a HTML-ben, a generátor (`tools/design/styleguide.components.mjs`) szövege
    nem – most a generátor frissült, az újragenerált HTML azonos a kézzel írttal;
  - dokumentáció: gyökér README (scriptek táblája, „Folyamatos integráció (CI)” alfejezet),
    `docs/FORRASOK.md` 228–229 (GitHub Docs: Node.js build és teszt; PostgreSQL
    szolgáltatás-konténer).
- Ellenőrzés: `npm run check` helyben (a CI lépései egyben) – Prettier rendben, ESLint (szerver,
  kliens + jsx-a11y) 0 hiba, `tsc` mindhárom alprojektben 0 hiba, design-tesztek 22/22,
  okosszerződés 17/17; szerver 1106 teszt, 68 fájl – 99,89 % utasítás, 99,29 % elágazás, 100 %
  függvény, 99,94 % sor (a `jwt.ts`, a `logger.ts` és az `env.ts` 100 %-ra került; a maradék négy
  le nem fedett ág: `concurrency.ts:61`, `errorHandler.ts:123`, `blockchain.service.ts:507` – a
  régi típusú díj tartaléka –, `hashing.service.ts:87`); kliens 718 teszt, 61 fájl – 98,68 / 95,14 /
  99,16 / 99,25 %; mindkét alprojekt a 80 %-os küszöb fölött, a HTML-jelentések a `coverage/`
  mappákban.
- Átnézések (két párhuzamos, csak olvasó: kódminőség/CI és biztonság – 0 kritikus, 0 magas, 0
  közepes). **Kódminőség/CI** (elfogadva, 5 alacsony): a blockchain típusellenőrzése a fordítás előtt
  futott volna a tiszta klónban (javítva: a `check` sorrendje és a CI-lépések – a szerződés tesztje,
  azaz a fordítás előzi meg a `typecheck`-et); a README és a munkafolyamat szövege („minden push”
  helyett a `main` ág és a pull requestek; a `check` a build nélkül; a helyi futáshoz a
  `TEST_DATABASE_URL`) (javítva); a `pollErrorNoteOf` tesztje nem bizonyította a felfelé
  kerekítést (javítva: 59 s / 60 s / 61 s); a két szerverteszt csak sorokat fedett (javítva: a JWT-
  teszt a `verify` hívását és az őr védekező jellegét rögzíti, a naplózó-teszt a külön szálú
  `ThreadStream`-et igazolja); egyetlen CI-lépés futtatta a teljes `check`-et (javítva: külön
  lépések, a kliens jelentése `!cancelled()` feltétellel akkor is elkészül, ha a szerveré bukott);
  az action-ök elavult (Node 20-as) főverziója (javítva: `checkout`, `setup-node`,
  `upload-artifact` `@v7` – a bemenetek és a `node24` futtató az `action.yml`-ből ellenőrizve). Az
  első Linuxos futás kockázataira (a `GOLDEN_SCENE_3_HASH` teszt, a vízjel első szövegrenderelése, a
  faliórás állítások) a `unit` projekt 15 másodperces időkorlátja a válasz; a többi a push utáni
  futásból derül ki. **Biztonság** (3 alacsony): a checkout tokenje a `.git/config`-ban maradt volna
  (javítva: `persist-credentials: false`); az action-ök főverzióra rögzítése (elfogadva, indok a
  naplóban); a `TEST_DATABASE_URL` az egész jobé volt (javítva: csak a szerverteszt lépésé).
  Tanácsok: a migrációs hiba szövegéből a jelszó kitakarása (javítva: `globalSetup.ts`
  `maskPassword`), a JWT-teszt a kém hívását is ellenőrzi (javítva), a naplózó teszt neve (javítva).
  Igazolva: titok nem kell, a token csak olvas, a `pull_request` (nem `pull_request_target`)
  forkból sem kap titkot, a melléklet csak a nyilvános `src/` kódját tartalmazza (a tesztfixtúrák
  és a hamis kulcsok nem), mind a négy lockfile integritás-hash-es, telepítő scriptet csak a
  Prisma és az esbuild futtat.
- Elhalasztott, elfogadott: a zöld CI képe a szerző pushja után; a GitHub saját action-jei
  commit-hash helyett főverzióra (`@v4`) rögzítve – titok és telepítés nélkül a kockázat egy hamis
  zöld futás, a lockfile integritás-hash-ei a gyorsítótár-manipulációt is kizárják (ha a repó
  később titkot vagy telepítést kap: SHA-rögzítés és Dependabot a `github-actions` ökoszisztémára);
  Playwright (L28) a CI-ba az L28-ban kerül; a kliens `redirect.ts` sora és a jsdom-ban nem
  előidézhető ágak le nem fedve maradnak; a Prisma használati telemetriája a CI-ban nincs letiltva
  (`CHECKPOINT_DISABLE`), a `postgres:17` címke nincs digestre rögzítve.

- Utólag (2026-10-12, a push után): az első CI-futás (GitHub Actions 38184677288) a
  klienstesztek lépésénél bukott – egyetlen teszt, a `VerifyPage.test.tsx` „ha a Mégse gombon volt
  a fókusz…” esete: a hibaüzenet megjelenése után azonnal a küldő gomb fókuszát várta, a fókuszt
  viszont egy effekt mozgatja a kirajzolás után, és a lassabb futtatón a riasztás már látszott, a
  gomb még nem kapta meg (a `<body>` volt fókuszban). Javítva: az állítás `waitFor`-ban (külön
  `test(L27)` commit); a többi lépés – formázás, lint, design- és szerződéstesztek,
  típusellenőrzés, a szerver 1106 tesztje lefedettséggel – zöld volt, a build a bukás miatt nem
  futott le. A javítás után a tesztfájl háromszor zöld helyben.

  | Kép                                         | Forrás                                                                         | Tartalom                                                                                         |
  | ------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
  | `L27_01_szerver_lefedettseg_elott.png`      | `npm run coverage` (`server/`) az L27 tesztjei előtt                           | 1103 teszt; 99,83 / 98,93 / 100 / 99,94 %; a 100 % alatti fájlok (`jwt.ts`, `logger.ts`)         |
  | `L27_02_uj_tesztek.png`                     | `npx vitest run src/lib/jwt.test.ts src/lib/logger.test.ts` (`server/`)        | 18 teszt zöld az új esetekkel                                                                    |
  | `L27_03_uj_kliens_tesztek.png`              | `npx vitest run src/upload/pollInterval.test.ts src/pages/UploadPage.test.tsx` | 43 teszt zöld az új esetekkel                                                                    |
  | `L27_04_blockchain_lefedettseg.png`         | `npm run coverage` (`blockchain/`)                                             | 17 teszt, a `PhotoRegistry.sol` 100 % sor és utasítás                                            |
  | `L27_05_check.png`                          | `npm run check` (gyökér)                                                       | a CI lépései helyben: formázás, lint, típusok, design, szerződés, lefedettség                    |
  | `L27_06_szerver_lefedettseg_utan.png`       | `npm run coverage` (`server/`) az L27 tesztjei után                            | 1106 teszt; 99,89 / 99,29 / 100 / 99,94 %; a `src/lib` minden fájlja 100 %                       |
  | `L27_07_kliens_lefedettseg_utan.png`        | `npm run coverage` (`client/`)                                                 | 718 teszt; 98,68 / 95,14 / 99,16 / 99,25 %                                                       |
  | `L27_10_ci_workflow.png`                    | `.github/workflows/ci.yml`                                                     | a teljes munkafolyamat: szolgáltatás-konténer, külön lépések, melléklet                          |
  | `L27_11_gyoker_scriptek.png`                | `package.json` 9–26. sor                                                       | a gyökér-scriptek, köztük `coverage`, `typecheck`, `check` (a fordítás utáni típusellenőrzéssel) |
  | `L27_12_lefedettseg_konfig.png`             | `server/vitest.config.ts` 17–28. sor                                           | a lefedettség beállítása: küszöbök, `reportOnFailure`                                            |
  | `L27_13_dekoder_teszt_idokorlat.png`        | `server/src/services/imageDecoding.test.ts` 10–15. sor                         | a lassú teszt külön időkorlátja indoklással                                                      |
  | `L27_20_teszt_jwt_szoveges_torzs.png`       | `server/src/lib/jwt.test.ts` 18–31. sor                                        | a szöveges törzs elutasítása (mockolt `verify`, a hívás paraméterei ellenőrizve)                 |
  | `L27_21_teszt_naplo_fejlesztoi.png`         | `server/src/lib/logger.test.ts` 60–70. sor                                     | a fejlesztői transzport külön szálon (`ThreadStream`)                                            |
  | `L27_22_teszt_poll_hibaszoveg.png`          | `client/src/upload/pollInterval.test.ts` 112–147. sor                          | `pollErrorNoteOf` három esete (59 / 60 / 61 s)                                                   |
  | `L27_23_teszt_fajlvalaszto_megszakitva.png` | `client/src/pages/UploadPage.test.tsx` 204–214. sor                            | a megszakított fájlválasztó nem törli a kiválasztást                                             |
  | `L27_30_szerver_lefedettseg_html.png`       | `server/coverage/index.html` (helyi statikus kiszolgálóról)                    | a szerver HTML-lefedettségi jelentése fájlonként                                                 |
  | `L27_31_szerver_lefedettseg_jwt_html.png`   | `server/coverage/lib/jwt.ts.html`                                              | a `jwt.ts` soronkénti lefedettsége (az új teszt után)                                            |
  | `L27_32_kliens_lefedettseg_html.png`        | `client/coverage/index.html`                                                   | a kliens HTML-lefedettségi jelentése                                                             |

- Commit: `85e101a` – `feat(L27): automatizált tesztek kiegészítése, lefedettség és GitHub Actions CI`; továbbá `4f9c92c` (`test(L27)`)

## L28 – End-to-end tesztek (Playwright) (2026-10-12)

- Kiindulás: a terv négy forgatókönyve (regisztráció → feltöltés → „Hitelesítve”; ugyanaz a kép
  másik fiókkal → elutasítás; vásárlás a Stripe oldaláig, a fizetést aláírt tesztwebhook
  szimulálja → letöltés; ellenőrző oldal), lokális Hardhat-lánccal. Ide került a korábbi lépések
  Playwrightra halasztott próbája is: az adminfolyamat (L25 – elrejtés, visszaállítás), a
  megerősítő ablak fókuszának élő ellenőrzése (L26 – a Mégse gombon nyílik), az E2E a CI-ban
  (L27). Az L08-ban halasztott „auth-korlát emelése az E2E-környezetben” nem kellett: a
  forgatókönyvek az alapértelmezett korlátokba férnek (6 auth-, 4 feltöltés-, 3 ellenőrzés-, 1
  fizetéskérés), a számlálók minden futásban nullázódnak.
- Elkészült:
  - `e2e/` alprojekt (Playwright 1.64, Chromium; `@playwright/test`, `stripe`, `ethers`): a
    tesztek a lefordított kliens ellen futnak (`vite preview`, 4173, a `/api` és a `/media`
    proxyval), sorban, egy folyamatban (közös adatbázis és lánc), minden futásról nyomkövetéssel
    (`trace: 'on'`; a CI-ban csak bukásnál), HTML-riporttal, 90 s-os teszt- és 30 perces globális
    időkorláttal.
  - a környezet felépítése (`setup/global.ts`, `setup/processes.ts`): a szerver és a kliens
    fordítása; a portok ellenőrzése (IPv4 és IPv6, a build előtt és közvetlenül az indítás előtt
    újra); lokális Hardhat-lánc (8545) és a `PhotoRegistry` telepítése Ignitionnel (a lokális
    telepítési napló előbb törlődik; a telepített cím egyezik a szerver `PhotoRegistry.json`-jával,
    különben hiba); a tesztadatbázis migrálása, kiürítése (`server/scripts/reset-test-db.ts`) és
    seedelése (az admin és a demófiókok eldobható, futásonként véletlen jelszóval); a lefordított
    szerver (`NODE_ENV=test`, a tesztadatbázison, a lokális lánccal – a platform kulcsa a Hardhat
    nyilvános teszt-mnemonicjából –, véletlen JWT- és webhook-titokkal, a Stripe-tesztkulcs a
    szerver `.env`-jéből; ha nincs, hamis kulcs és a fizetés forgatókönyve kimarad); a kliens
    `vite preview`-ja. Minden folyamatot közvetlenül a Node indít (shell nélkül – Windowson így a
    tényleges folyamat áll le), a kimenetük a `logs/` mappába megy; minden indított folyamat egy
    közös listába kerül, a lebontás (és a hibás előkészítés) mindet leállítja (`stopAll`, a
    kilépést megvárva, 5 s után kényszerrel); a készenlét-várakozás hibával zárul, ha a saját
    folyamat időközben kilépett (pl. foglalt port) – így a tesztek nem futhatnak egy idegen
    (fejlesztői) szerver ellen. A tesztadatbázis csak helyi (localhost) címen és csak `_test`
    végű névvel lehet; a hibaüzenetekből az adatbázis és a seed jelszavai ki vannak takarva.
  - segédek: `helpers/accounts.ts` (regisztráció, belépés, kilépés a felületen), `helpers/photos.ts`
    (feltöltés az űrlapon; a hitelesítést a feltöltés állapotkártyáján várja meg – „Hitelesítve a
    blokkláncon” –, az azonosítót az adatlap hivatkozásából veszi), `helpers/stripe.ts`
    (`checkout.session.completed` esemény a Stripe SDK `generateTestHeaderString` aláírásával, az
    E2E-szerver webhook-titkával – a szerver valódi aláírás-ellenőrzése fut, kártyaadat sehol).
  - forgatókönyvek (`tests/marketplace.spec.ts`, sorban): (1) regisztráció → feltöltés → a kép a
    lokális láncon hitelesítve (adatlap: „Hitelesítve a blokkláncon”, „Lokális Hardhat-hálózat”),
    a galéria kártyáján a „Hitelesítve” jelvény; (2) ugyanaz a fájl másik fiókkal → „A fájl bitre
    azonos egy már feltöltött képpel.”, a fiók képei között nincs feltöltés; (3) vásárlás:
    „Megveszem” → a Stripe Checkout oldaláig (`checkout.stripe.com`, csak a navigáció megkezdéséig),
    a rendelés `PENDING`; hamis aláírású webhook → 400 és a rendelés függő marad; az aláírt
    esemény → 200 és `PAID`; a visszatérési oldal „Sikeres fizetés”; az adatlapon „Már megvetted.”,
    az eredeti letölthető és SHA-256-a azonos a feltöltött fájléval; értékelés (5 csillag – a
    rejtett rádiógomb címkéjére kattintva –, vélemény) → „A te értékelésed”; (4) az ellenőrző
    oldal bejelentkezés nélkül: a regisztrált kép „Hiteles, regisztrált kép” a címével, egy másik
    kép „Nincs a nyilvántartásban”, a SHA-256 hash alapján is hiteles. Admin (`tests/admin.spec.ts`,
    L25): külön böngésző-kontextusban regisztrált fotós képe; elrejtés előtt a vendég látja a
    betöltött galériában (pozitív kontroll); az admin elrejti – a megerősítő ablak a Mégse gombon
    nyílik (L26 élő ellenőrzés), „elrejtve” állapotüzenet –, a vendég betöltött galériájában nincs,
    az adatlap „A kép nem található”; visszaállítás után az adatlap és a galéria is mutatja.
  - szerver: `scripts/reset-test-db.ts` (`npm run db:reset-test`; csak `_test` végű névvel) és a
    közös `src/lib/truncateAll.ts` – ugyanezt használja az adatbázis-tesztek
    `tests/helpers/testDatabase.ts`-e (egy új táblát csak egy helyen kell felvenni).
  - CI (`.github/workflows/ci.yml`): külön `e2e` feladat (PostgreSQL 17 szolgáltatás-konténer,
    `npm ci` a négy alprojektben, `playwright install --with-deps chromium`, `npm test` az `e2e/`
    mappában a `TEST_DATABASE_URL`-lel; a riport – bukásnál a trace-ekkel – és a naplók a
    `playwright-riport` melléklet; a Stripe-forgatókönyv kulcs híján kimarad); a `check` feladat
    az `e2e` függőségeit is telepíti, a gyökér `npm run typecheck` az `e2e`-t is ellenőrzi;
    gyökér `npm run test:e2e`, `install:all` az `e2e`-vel.
  - dokumentáció: `e2e/README.md` (előfeltételek, futtatás, a környezet), gyökér README
    (scripttábla, CI- és E2E-alfejezet, a szerver `db:reset-test` scriptje), `docs/FORRASOK.md`
    230–232 (Playwright: konfiguráció, globalSetup, trace viewer; lokátorok, állítások,
    APIRequestContext, böngésző-kontextusok; Stripe: `generateTestHeaderString`).
- Ellenőrzés: hét futás. 1. a seed lépés elbukott (`prisma db seed` shellből hívta a `tsx`-et, ami
  a shell nélküli indításnál nincs a PATH-on → közvetlenül a `tsx` CLI-vel); 2. az admin-forgatókönyv
  zöld, az első piactér-teszt a „Hitelesítve” szövegen bukott (az adatlapon a doboz címe
  „Hitelesítve a blokkláncon” → régió és címsor szerinti ellenőrzés); 3. három zöld, a vásárlás a
  csillag-rádiógombon ragadt (vizuálisan rejtett `sr-only` input, a címke fogja a kattintást → a
  címkére kattintás); 4. a címkeszűrő belső lokátora az űrlapból indult (a `has` a címkéhez képest
  értendő → az oldalról indul); 5. négy zöld, az ellenőrző oldalon a „SHA-256 hash” címke két
  elemre illett (az űrlap neve is tartalmazza → `exact: true`); 6. mind az öt zöld (39,1 s, a Stripe
  fizetési oldala elérve, a webhook igazolva, letöltés 200); 7. az átnézések javításai után újra
  mind az öt zöld (41,2 s). A `tsc` az `e2e/`-ben és a `server/`-ben 0 hiba, ESLint 0 hiba, Prettier
  rendben; a szerver adatbázis-tesztjei a közös `truncateAll`-lal 546/546. A portok (4000, 4173, 8545) minden futás után szabadok.
- Átnézések (két párhuzamos, csak olvasó). **Kódminőség** (javításokkal elfogadható; 1 magas, 3
  közepes, 6 alacsony): a hibás előkészítés után árva folyamatok maradtak (a `startChain` a
  `try`-on kívül, a `startServer`/`startClient` csak sikeres várakozás után adta vissza a
  folyamatot, a klienst a `catch` nem állította le – javítva: közös lista, `stopAll`, minden
  indítás a `try`-ban, a teardown is `stopAll`); két `pipe` egy naplófolyamba alapértelmezett
  `end`-del (a stdout lezárulása után a stderr írása ledöntené a futtatót – javítva: `end: false`,
  a naplót a kilépés zárja); a `waitForHttp` nem vette észre a kilépett folyamatot, az `isPortFree`
  csak IPv4-en próbált (egy bent felejtett `vite preview` a `::1`-en régi buildet szolgált volna –
  javítva: kilépés-figyelés `logs/<név>` hivatkozással, IPv4+IPv6); a galéria-ellenőrzés mindig
  átment (a h1 statikus, a lista aszinkron – javítva: a találatszám megvárása, pozitív kontroll
  elrejtés előtt, a galéria visszaállítás után is). Alacsony: a hitelesítést API-pollozás helyett a
  felületen várjuk (javítva – az állapotkártya pollozása is tesztelve); a letöltött fájl SHA-256-a
  egyezik a fixtúráéval (javítva); `waitForURL` `waitUntil: 'commit'` (javítva); a `stopProcess`
  megvárja a kilépést és SIGKILL-tartalékot kapott, a `runStep` időkorlátot, a config
  `globalTimeout`-ot (javítva); dokumentáció – a 230–231. forrás minden hivatkozott oldala, `//
Forrás:` kommentek a specekben és segédekben, a `db:reset-test` a README-ben, PowerShell-használat
  a scriptben (javítva); ismétlődés – közös `truncateAll`, a telepített cím ellenőrzése,
  `requiredEnv` (javítva). **Biztonság** (feltétellel elfogadható; 0 kritikus/magas, 1 közepes, 8
  alacsony): a portellenőrzés a build előtt futott, és a készenlét-várakozás egy közben elindított
  fejlesztői szervertől is elfogadta volna a 200-at – a tesztek a fejlesztői adatbázisba és a
  valódi Sepolia-kulccsal a nyilvános láncra írtak volna (javítva: második portellenőrzés
  közvetlenül az indítás előtt, a várakozás hibával zárul, ha a saját folyamat kilépett). Alacsony:
  árva folyamatok (javítva); a sebességkorlátok emelése szükségtelen (az alapértékek maradnak – az
  E2E így azt is igazolja, hogy a valós folyamat beléjük fér); a `trace: 'on'` a CI-mellékletben a
  kitöltött jelszavakat is tartalmazná – mind eldobható, de a CI-ban `retain-on-failure` (javítva);
  a maszkolás (`decodeURIComponent` hibatűrő, a seed jelszavai is a maszkban – javítva); a törlési
  őr csak a név utótagját nézte (javítva: csak helyi cím; az adatbázis közös a szerver
  adatbázis-tesztjeivel – dokumentálva, hogy ne fussanak egyszerre); a szerver a `.env` többi
  beállítását örökli (dokumentálva); `NODE_ENV` (`test`: JSON-napló, azonos biztonsági viselkedés –
  a süti `Secure` jelzőjét és a `trust proxy`-t az E2E nem fedi le, csak élesben más); a webhook
  csak a pozitív ágat bizonyította (javítva: hamis aláírás → 400, a rendelés függő marad); az
  action-ök főverzióra rögzítve, a Chromium futásidőben töltődik le (elfogadva, mint az L27-ben).
  Igazolva: a `.env`-et a környezet csak kiolvassa (a tesztadatbázis URL-je és a Stripe-kulcs
  megléte), értéket nem ír ki; a titkok környezeti változóban mennek a gyermekeknek, futásonként
  véletlenek; a szerver naplója takar; a Hardhat-naplóban csak a nyilvános tesztfiókok; a
  `loadEnvFile` nem írja felül az átadott értékeket, így a valódi `PLATFORM_PRIVATE_KEY`, `RPC_URL`,
  `DATABASE_URL` sosem jut az E2E-szerverhez; a sémája csak `sk_test_` kulcsot fogad; a webhook a
  valódi `constructEvent`-en megy át, a `PAID` csak onnan jöhet; a CI-token csak olvas, a
  `test-results` (eredeti képek) nem kerül a mellékletbe; a lockfile 15 csomagja integritás-hash-es,
  telepítő script nélkül.
- Elhalasztott, elfogadott: a süti `Secure` jelzője és a `trust proxy` (csak élesben) E2E-ben nem
  ellenőrizhető; a vásárlás forgatókönyve a CI-ban kimarad (nincs Stripe-kulcs – helyben fut); a
  CI-mellékletben csak a bukott tesztek trace-ei; a lánc-regisztráció újrapróbálása (L25) E2E-ben
  nem tesztelt (hibás láncot kellene előidézni – az egységtesztek fedik); a keskeny (320 px)
  elrendezést az L26 DevTools-emulációval ellenőrizte, E2E-projekt nincs rá; a zöld CI-futás képe a
  szerző pushja után.

| Kép                                    | Forrás                                                                          | Tartalom                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `L28_01_e2e_futas.png`                 | `npx playwright test` (`e2e/`, 7. futás)                                        | a környezet felépítése (fordítás, lánc, telepítés, adatbázis), 5 forgatókönyv zöld      |
| `L28_02_e2e_elso_futas.png`            | `npx playwright test` (`e2e/`, 1. futás)                                        | a seed lépés hibája: a `tsx` nincs a shell nélküli PATH-on                              |
| `L28_10_playwright_config.png`         | `e2e/playwright.config.ts`                                                      | sorban futás, időkorlátok, trace és riport, `baseURL`, magyar nyelv és időzóna          |
| `L28_11_kornyezet_lanc.png`            | `e2e/setup/global.ts` `startChain`                                              | a Hardhat-lánc indítása, készenlét, Ignition-telepítés, a cím egyeztetése a szerverével |
| `L28_12_kornyezet_szerver.png`         | `e2e/setup/global.ts` `startServer`                                             | a szerver eldobható titkokkal, a lokális lánc kulcsával, `NODE_ENV=test`                |
| `L28_13_kornyezet_folyamat.png`        | `e2e/setup/global.ts` `globalSetup`                                             | a lépések sorrendje, a második portellenőrzés, `stopAll` hibánál és a lebontáskor       |
| `L28_14_stripe_seged.png`              | `e2e/helpers/stripe.ts` `signedCheckoutCompleted`                               | a kifizetett Checkout Session eseménye `generateTestHeaderString` aláírással            |
| `L28_15_feltoltes_seged.png`           | `e2e/helpers/photos.ts` `submitUpload`–`waitForRegistered`                      | feltöltés az űrlapon, a hitelesítés megvárása az állapotkártyán                         |
| `L28_16_reset_test_db.png`             | `server/scripts/reset-test-db.ts`                                               | a tesztadatbázis kiürítése `_test` őrrel, a közös `truncateAll`                         |
| `L28_17_folyamatok_lista.png`          | `e2e/setup/processes.ts` `startProcess`–`stopAll`                               | a futó folyamatok listája, naplózás, leállítás kényszerrel                              |
| `L28_18_keszenlet.png`                 | `e2e/setup/processes.ts` `waitForHttp`                                          | készenlét-várakozás, hiba a saját folyamat kilépésekor                                  |
| `L28_20_forgatokonyv_regisztracio.png` | `e2e/tests/marketplace.spec.ts` 1. teszt                                        | regisztráció → feltöltés → tanúsítványdoboz, galéria-jelvény                            |
| `L28_21_forgatokonyv_masolat.png`      | `e2e/tests/marketplace.spec.ts` 2. teszt                                        | ugyanaz a kép másik fiókkal: elutasítás, nincs feltöltés                                |
| `L28_22_forgatokonyv_vasarlas.png`     | `e2e/tests/marketplace.spec.ts` 3. teszt                                        | Stripe-oldalig, hamis és aláírt webhook, letöltés hash-egyezéssel, értékelés            |
| `L28_23_forgatokonyv_ellenorzes.png`   | `e2e/tests/marketplace.spec.ts` 4. teszt                                        | az ellenőrző oldal három esete (hiteles, nincs, hash)                                   |
| `L28_24_forgatokonyv_admin.png`        | `e2e/tests/admin.spec.ts`                                                       | elrejtés megerősítéssel (fókusz a Mégsén), a vendég nézete, visszaállítás               |
| `L28_30_html_riport.png`               | `e2e/playwright-report/index.html` (helyi statikus kiszolgálóról)               | a Playwright HTML-riportja: 5 zöld teszt, trace-hivatkozásokkal                         |
| `L28_31_trace_viewer.png`              | a riport trace viewere (a vásárlás tesztjének nyomkövetése, valódi böngészőből) | a lépések listája, a DOM-pillanatkép az értékelés után, a hívás részletei               |

- Commit: `1878c99` – `feat(L28): end-to-end tesztek Playwrighttal – a teljes folyamat a böngészőből lokális Hardhat-lánccal, CI e2e feladat`

## L29 – A hitelesítés kiértékelése: robusztusság és költség (2026-10-12)

- Kiindulás: a terv három feladata – (1) `server/scripts/hash-experiment.ts`: saját fotók ×
  módosítások → egyezik-e az SHA-256, mekkora a dHash-távolság, CSV, táblázat, diagram, a
  küszöb indoklása, a téves egyezés vizsgálata; (2) költség: a regisztráció gázfelhasználása →
  becsült díj a főhálózaton és egy L2-n az aktuális gázáron; (3) korlátok és továbbfejlesztés
  (1.4). Az L09 mérései (kicsinyítés, JPEG, WebP, szürkeárnyalat 0–6 bit; különböző képek 25–30;
  tükrözés 11/30/30) és az L04/L11 gázmérései (72 820 lokálisan, 71 686 a Sepolián, telepítés
  325 903) a kiindulópont. Csak a három saját tesztfotó és a git-ignorált `originals/` eredetijeik
  állnak rendelkezésre (a saját-fotó szabály miatt idegen kép nem).
- Elkészült:
  - `server/scripts/hash-experiment.ts` (`npm run experiment:hash [képmappa] [kimeneti mappa]`):
    a fotók 32 változata – kategóriánként: **A** formátum, minőség, tónus (teljes felbontású
    eredeti az `originals/`-ból, kicsinyítés 50 és 25 %, JPEG q60 és q20, WebP q80, fényerő +10 %,
    szürkeárnyalat, szöveges felirat); **B** vágás (1, 2, 3, 5, 7, 10 % minden oldalról, 5 és 10 %
    csak alul; kis forgatás 0,5°, 1°, 2°, 5° a fekete sarkok levágásával); **C** a platform
    előnézete (a valódi `createPreview`-val – a tesztfotóból és a teljes felbontású eredetiből is –,
    kontroll vízjel nélkül, a vízjel átlátszatlansága 0,15 / 0,25 / 0,35 / 0,45); **D** ismert
    korlát (tükrözés, 90°-os forgatás); **E** valós módosítási lánc (üzenetküldő: 1080 px + JPEG
    q75; telefonos szűrő: kontraszt, telítettség, vinyetta; megosztás: 1200 px + vágás 2 % + JPEG
    q70). Minden változatot a sharp állít elő (a megjelenő, EXIF szerint elforgatott méretből), a
    hash ugyanazzal a modullal készül, mint a szerveren. Az összevetések: minden kép minden
    változata a másik két kép eredetijével (198 összevetés). A küszöbtábla 0–24-ig kategóriánként
    mutatja a felismert másolatokat és a téves egyezéseket; a „törékeny bitek” (szomszédos
    rácspárok legfeljebb 2 fényességnyi eltéréssel) száma képenként; a futásidő méretosztályonként
    (5 futás mediánja, bemelegítés után, a CPU nevével). Kimenet: `docs/kiertekeles/`
    `hash-experiment.csv`, `hash-experiment-comparisons.csv`, `hash-experiment.md` és `.html`
    (táblázatok, a küszöb indoklása, fenntartások), `hash-experiment-chart.html` (oszlopdiagram),
    `hash-experiment-sheet.html` (bélyegképes áttekintő).
  - `server/scripts/gas-cost.ts` (`npm run experiment:gas`): a gáz a saját mérésekből (és az
    adatbázis láncon regisztrált képeiből, ha van), a gázár a nyilvános RPC-végpontokról – a
    ténylegesen fizetett ár (alapdíj + prioritási díj) az utolsó 1024 blokk `eth_feeHistory`
    adataiból, 10/50/90. percentilissel, a díjplafon (`maxFeePerGas`) külön –, az OP Stack L2-ken az
    L1-adatdíj a `GasPriceOracle.getL1Fee` hívásból egy valódi ABI-val kódolt, véletlen adatú
    `registerPhoto` aláíratlan tranzakciójára, az operátordíj a `getOperatorFee`-ből (ha van); az
    ETH-árfolyam a CoinGecko API-ból USD-ben és forintban; forgatókönyv-sorok 10 és 30 gwei-jel,
    valamint a szerver 50 gwei-es díjplafonjával (felső korlát regisztrációnként); a telepítés
    egyszeri költsége; fenntartások. Csak nyilvános, olvasó lekérdezések, titkos kulcs nem kell (a
    `.env`-ből csak az adatbázis címét olvassa). Kimenet: `gas-cost.md`, `.html`, `.csv`.
  - `server/scripts/lib/reportHtml.ts` (a Markdown-jelentésből nyomtatható HTML: címsorok,
    bekezdések, táblázatok, felsorolás) és `lib/csv.ts` (RFC 4180 szerinti cellák) – mindkét
    script használja.
  - `image.service.ts`: a `createPreview` opcionális `watermarkOpacity` beállítást kapott (0 =
    nincs vízjel; a körvonal és a vonal átlátszatlansága arányosan változik) – a szerver mindig az
    alapértékkel (0,45) dolgozik, a kísérlet méri vele a vízjel hatását; teszt: halványabb vízjel
    kisebb eltérés, 0-nál gyakorlatilag nincs eltérés.
  - `.prettierignore`: a generált `docs/kiertekeles/` kimarad a formázás-ellenőrzésből (különben a
    CI a generált táblázatokon bukna).
  - dokumentáció: README (szerver-scriptek táblája, „A hitelesítés kiértékelése (L29)” alfejezet,
    a dokumentáció-lista `docs/kiertekeles/` sora), `server/tests/fixtures/images/README.md` (az
    `originals/` használata a kísérletben), `docs/FORRASOK.md` 233–237 (sharp-műveletek; OP Stack
    díjak; Base hálózat; CoinGecko API; ethereum.org gáz) és T7 (Zauner 2010).
- Eredmények (robusztusság, `hash-experiment.md`, 2026-10-12 09:18 UTC, sharp 0.35.5, libvips
  8.18.7):
  - az SHA-256 minden módosításnál megváltozik – csak a változatlan fájlt ismeri fel;
  - **A** (27 mérés): 0–6 bit, a 10-es küszöbnél **27/27**; a teljes felbontású eredetik 1–2 bitre
    vannak a repóban lévő, kicsinyített tesztfotótól;
  - **E** valós láncok (9): 1–7 bit, **9/9**;
  - **B** vágás: 1 %: 1–3, 2 %: 3–7, 3 %: 4–9, 5 %: 6–11, 7 %: 11–14, 10 %: 10–20 bit; csak alul
    5 %: 4–5, 10 %: 7–9; kis forgatás 0,5°: 1–3, 1°: 2–4, 2°: 3–8, 5°: 6–10 – a dHash a kb. 5 %-os
    (minden oldali) vágásnál törik, az egyoldali vágást és a néhány fokos forgatást bírja;
  - **C** a platform előnézete: tócsa 5, basszusgitár 1, **gyertyák 22** bit (az eredetiből
    készítve 19) – vízjel nélkül 0–2, az átlátszatlansággal 15 → 15 → 17 → 22 a sötét képen, a
    másik kettőn 0–5; a törékeny rácspárok száma 7 / **26** / 6: a vízjel fehér, félig átlátszó rétege
    a sötét képpontokat arányosan jobban világosítja, a csempéi nem illeszkednek a 9×8-as rácshoz,
    és a sok majdnem egyforma szomszédos cella átbillen. **Ez valódi gyengeség:** a nyilvános
    előnézet a legkönnyebben megszerezhető másolat, 1200 px-es mérete feltölthető, és a sötét
    képnél újként menne át – az ellenőrző oldal sem ismerné fel (az is csak az eredeti dHash-sel
    vet össze); enyhíti, hogy a láncon az eredeti korábbi időbélyege vitánál bizonyíték;
  - **D** tükrözés 11/31/31, forgatás 90° 20/22/38 – a várakozás szerint kívül;
  - idegen képek: az eredetik egymástól 25/29/30 bit; a változatok a másik két eredetitől legalább
    20 bitre (a tócsa 5 %-os vágása a gyertyás képtől), a telefonos szűrő is 20-ig közelít;
  - a küszöb: a 10-es küszöbnél 43/48 tartalommegőrző másolat felismerve, 0 téves egyezés; a
    10–19 küszöbök mind téves egyezés nélkül működtek, az első téves egyezés 20-nál (2 / 198); a
    legtávolabbi felismerendő másolat (22) messzebb van, mint a legközelebbi idegen változat (20),
    tehát egyetlen küszöb sem választja el őket hibátlanul. A 10-et Krawetz ajánlása alapján
    tartjuk meg: a mérés összhangban van vele, de a kis minta miatt nem jelöli ki; a jóhiszemű
    fotós téves elutasítása ellen nincs jogorvoslat, a hasonló, de különböző felvételek távolságát
    nem mértük. Fenntartás: három független idegen képpár; a téves egyezés valószínűségére
    számszerű becslés nem adható; sorozatfelvétel, azonos témájú különböző fotó és egyszínű kép
    nem szerepelt; minden változatot ugyanaz a libvips készítette; a táblázat a hash
    robusztusságát méri, nem a feltöltését (az 50/25 %-os kicsinyítés a 600 px-es minimum, a 22 és
    20 MB-os eredeti a 15 MiB-os korlát miatt eleve elutasítva);
  - futásidő (AMD Ryzen 5 7600X): 1600 px-es JPEG 3,1 ms (2,7–3,5), WebP 23,7 ms, 9–22 MB-os
    eredeti 118 ms (63–143) a fájl beolvasása nélkül.
- Eredmények (költség, `gas-cost.md`, 2026-10-12 09:18 UTC): a gáz 71 686 (Sepolia; a szerződésben
  nincs számláló, ezért képenként gyakorlatilag állandó); gázár a főhálózaton 0,109 gwei
  (1024 blokk: 0,066–0,154, medián 0,09; díjplafon 0,14), Base 0,006 gwei, OP Mainnet 0,000005
  gwei; ETH 2552 USD / 832 472 HUF. Egy regisztráció: főhálózat 0,0000078 ETH ≈ 0,02 USD ≈
  **6,5 Ft** (a 90. percentilisen 9,2 Ft); Base 0,36 Ft; OP Mainnet ≈ 0 Ft (az L1-adatdíj a teljes
  díj töredéke). Forgatókönyvek: 10 gwei → 597 Ft, 30 gwei → 1791 Ft; a szerver 50 gwei-es
  díjplafonja (`CHAIN_MAX_FEE_GWEI`, fölötte vár és újrapróbál) → legfeljebb **2984 Ft**
  regisztrációnként. A telepítés egyszeri költsége az aktuális áron 29 Ft. Fenntartások: egyetlen
  pillanatkép; az L2-díj összetétele és a sequencer más bizalmi modellje; a szerződés nincs L2-re
  telepítve (EVM-egyenértékűség); a díjat a platform fizeti; a gázütemezés változhat.
- Korlátok és továbbfejlesztés (a terv 1.4-hez, a dolgozat 7. fejezetéhez):
  - a dHash a tükrözést, a 90°-os forgatást és az erős (≥ 5–7 %-os minden oldali) vágást nem ismeri
    fel; a sötét, alacsony kontrasztú képeken a bitek „törékenyek”, ezért a platform saját vízjele
    is átbillentheti őket;
  - a vízjeles előnézet újrafeltöltése ellen olcsó, láncot nem érintő javítás: az előnézet
    SHA-256-ának és dHash-ének tárolása az adatbázisban (`previewSha256`, `previewDHash`), és a
    feltöltés meg az ellenőrzés mindkettővel összevet (sémaváltozás – külön lépésben, a szerző
    döntésére); halványabb vízjel csak enyhít; robusztusabb hash (PDQ, DCT-alapú pHash, a
    döntetlen bitek figyelmen kívül hagyása) a láncrekord formátumát változtatná;
  - „aki elsőként regisztrál” elv: a lopott képet a tolvaj is regisztrálhatja elsőként; a védelem a
    platformon belül érvényes; továbbfejlesztés: C2PA / Content Credentials [S48], a felhasználó
    saját tárcájával aláírt regisztráció, vitarendezési folyamat;
  - a téves egyezés esélye a katalógus méretével nő (minden feltöltés minden regisztrált képpel
    összevetve, lineáris keresés); nagy katalógusnál indexelt Hamming-keresés kell;
  - a költség a főhálózaton a gázár ingadozásától függ (a mért 0,1 gwei és a 30 gwei-es forgatókönyv
    között 270-szeres különbség); L2-n fillérekben mérhető, de más a bizalmi modell.
- Ellenőrzés: `tsc` és ESLint a `server/`-ben 0 hiba, a szerver `unit` tesztjei 542/542 (az
  `image.service.test.ts` új esetével), Prettier az egész repón rendben; mindkét script többször
  lefutott (a hash-kísérlet 7, a költségbecslés 5 futás a fejlesztés során), a kimenetek az
  időbélyeg és a gázár kivételével futásonként azonosak.
- Átnézések (két párhuzamos, csak olvasó). **TypeScript/kódminőség** (elutasítva → javítva; 3 magas,
  5 közepes, ~15 alacsony): a generált kimenetek miatt a CI formázás-ellenőrzése elbukott volna
  (javítva: `.prettierignore`); a `gas-cost.csv` oszlopai elcsúsztak a vesszős hálózatneveknél
  (javítva: közös `lib/csv.ts`); a díjbecslés a `maxFeePerGas` plafonnal számolt, és a jelentés
  hibásan `eth_feeHistory`-t említett (javítva: valódi `eth_feeHistory`, fizetett ár = alapdíj +
  prioritási díj, percentilisek, a plafon külön oszlop); az EXIF-tájolást a méret nem vette
  figyelembe (javítva: `autoOrient` méret); az `originals/` párosítása a mért távolsággal, körkörösen
  történt (javítva: fájlnév vagy névsorrend szerint, a távolság csak ellenőrzés, 15 bit fölött
  kihagyás); a szimmetrikus párok kétszer (javítva: az eredetik párjai egyszer, az összevetések
  külön); az RPC-hívásoknak nem volt időkorlátja (javítva: `FetchRequest.timeout`); az
  adatbázishiba üzenete üres lett volna (javítva: `DatabaseConnectionError`); a többi alacsony
  (bedrótozott CSV-fejléc, futásidő-osztályok, platform a jelentésben, `escapeHtml` idézőjel,
  `produce` ágai, hibaüzenetek fájlnévvel, a `.env` teljes betöltése helyett `parseEnv`, HIDDEN
  képek gázadata, operátordíj, elérhetetlen hálózat jelzése) javítva. **Módszertan** (külön,
  a dolgozat értékelő fejezetéhez): a „jóindulatú” címke helyett tartalommegőrző kategóriák (A–E)
  és kategóriánkénti küszöbtábla (javítva); a „képpár” helyett „összevetés”, az ábra hibás
  felirata („legkisebb távolság két különböző kép között = 20” valójában egy vágott változat
  távolsága volt) (javítva); a feltöltés méretkorlátjai és a hash-robusztusság szétválasztása
  (javítva, a jelentés kimondja); vízjel-kontroll, átlátszatlanság-sorozat, törékeny bitek, az
  előnézet az eredetiből (javítva, mérve); vágás- és forgatásgörbe, valós módosítási láncok
  (javítva, mérve); a futásidő méretosztályonként, mediánnal (javítva); a gázárnál a fizetett ár és
  a díjplafon, a forgatókönyvek forrása (Etherscan gázár-grafikon), az 50 gwei-es szerverplafon
  mint felső korlát, a fenntartások (javítva); a küszöb őszinte indoklása és a kötelező
  fenntartás szövege (beépítve a jelentésbe). Elfogadott javaslatok a dolgozathoz: a „89 %-os
  felismerés” és a „0 % téves egyezés” típusú arányállítások kerülése; a minta 3 független képpár.
- Elhalasztott, elfogadott: 10–20 további saját fotó „nehéz negatívokkal” (sorozatfelvétel, azonos
  téma más szögből, egyszínű és sötét képek) – a szerző készíti, a script változtatás nélkül
  méri (`npm run experiment:hash <mappa>`); az előnézet hash-einek tárolása (`previewSha256`,
  `previewDHash`) és a halványabb vízjel – sémaváltozás, külön lépés a szerző döntésére; más
  eszközzel (böngészős képernyőkép, telefon) készült másolatok; Hamming-keresési mikrobenchmark;
  az Etherscan gázár-grafikon és a Sepolia-tranzakció képe – bejelentkezést/robotvédelmet igénylő
  oldal, a szerző készíti; a költségbecslés újrafuttatása a dolgozat leadása előtt (friss
  pillanatkép).

| Kép                                  | Forrás                                                         | Tartalom                                                                                       |
| ------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `L29_01_hash_kiserlet_futas.png`     | `npm run experiment:hash` (`server/`)                          | a kísérlet futása: az eredetik párosítása, a gyertyás fotó változatai, az összegzés            |
| `L29_02_gazkoltseg_futas.png`        | `npm run experiment:gas` (`server/`)                           | a gázár a három hálózaton tartománnyal, a díj ETH-ban és forintban                             |
| `L29_03_gazstatisztika.png`          | `npm run test:gas` (`blockchain/`)                             | a szerződés gázstatisztikája: `registerPhoto` 72 820, telepítés 604 251, bájtkód 2418          |
| `L29_10_dhash_tavolsag_diagram.png`  | `docs/kiertekeles/hash-experiment-chart.html`                  | oszlopdiagram: a távolságok módosításonként, a küszöb és a legközelebbi idegen változat vonala |
| `L29_11_modositott_masolatok.png`    | `docs/kiertekeles/hash-experiment-sheet.html`                  | a tócsa-fotó 19 változata bélyegképpel, SHA-256-egyezéssel és dHash-távolsággal                |
| `L29_12_robusztussag_riport.png`     | `docs/kiertekeles/hash-experiment.html` (teljes oldal, Chrome) | a teljes robusztussági jelentés                                                                |
| `L29_13_robusztussag_fotablazat.png` | `docs/kiertekeles/hash-experiment.html` (felső rész)           | a fő táblázat, a kategóriák, a küszöb indoklása, a vágás- és forgatásgörbe                     |
| `L29_20_gazkoltseg_tablazat.png`     | `docs/kiertekeles/gas-cost.html`                               | a költségbecslés: gáz, díjak hálózatonként, forgatókönyvek, díjplafon, fenntartások            |
| `L29_30_modositasok.png`             | `server/scripts/hash-experiment.ts` 158–207. sor               | a változatok leírása (`Variant`, kimeneti formátum) és az első A-kategóriás sorok              |
| `L29_36_valos_lancok.png`            | `server/scripts/hash-experiment.ts` 236–267. sor               | a három valós módosítási lánc (üzenetküldő, telefonos szűrő, megosztás)                        |
| `L29_37_vagas_forgatas.png`          | `server/scripts/hash-experiment.ts` 124–149. sor               | vágás minden oldalról és csak alul, kis forgatás a sarkok levágásával                          |
| `L29_31_masolat_eloallitasa.png`     | `server/scripts/hash-experiment.ts` `produce`                  | a másolat előállítása a megjelenő méretből, JPEG vagy WebP kimenettel                          |
| `L29_32_meres.png`                   | `server/scripts/hash-experiment.ts` `measure`                  | egy változat mérése: SHA-256-egyezés, dHash, távolság, felismerés a küszöbnél                  |
| `L29_33_kuszob_kimerese.png`         | `server/scripts/hash-experiment.ts` `thresholdTable`           | a küszöbtábla kategóriánként és a téves egyezések száma                                        |
| `L29_34_osszevetesek.png`            | `server/scripts/hash-experiment.ts` `compare`                  | az összevetések: minden változat a másik képek eredetijével                                    |
| `L29_35_torekeny_bitek.png`          | `server/scripts/hash-experiment.ts` `fragileBits`              | a törékeny rácspárok számlálása a 9×8-as rácson                                                |
| `L29_40_gaz_halozatok.png`           | `server/scripts/gas-cost.ts` 43–88. sor                        | a mért gáz, a forgatókönyvek, a díjplafon, a GasPriceOracle, a hálózatok                       |
| `L29_41_gazar_mintavetel.png`        | `server/scripts/gas-cost.ts` `samplePrices`                    | a fizetett gázár az `eth_feeHistory`-ból (alapdíj + medián prioritási díj)                     |
| `L29_42_gaz_dijbecsles.png`          | `server/scripts/gas-cost.ts` `quoteNetwork`                    | a díjbecslés: percentilisek, díjplafon, L1-adatdíj és operátordíj az oracle-ből                |

- Commit: `123a4ce` – `feat(L29): a hitelesítés kiértékelése – robusztussági kísérlet (dHash × módosítások, küszöb, vízjel) és a lánc-regisztráció költségbecslése`

## L30 – Biztonsági átvizsgálás (2026-10-12)

- Kiindulás: a terv feladata – ellenőrzőlista az OWASP Top 10 szerint [S51] (hozzáférés-szabályozás,
  titkos kulcsok, injekció, XSS és CSP, fájlfeltöltés, hitelesítés, webhook-aláírás, naplózás
  érzékeny adat nélkül, `npm audit`), a szerződés (`onlyOwner`, nincs ETH-kezelés) és a
  platform-kulcs kompromittálódásának kockázata [S52]. Az OWASP Top 10 aktuális kiadása a 2025-ös
  (A01–A10). Első lépésként összegyűjtöttük az L08–L29 lépések L30-ra halasztott tételeit (e
  napló „Későbbre” pontjaiból, kb. 30 tétel), és mindegyikről döntöttünk:
  kis kódjavítás most, vagy elfogadott korlát indoklással, vagy feljegyzés az L31–L32 lépéshez.
  A két első átnézés (OWASP-lista, szerződés) eredménye után a szerző a teljes javítási listát
  választotta.
- Elkészült (teszt-elsővel; a bukó tesztek kimenete `L30_01`–`L30_03`, `L30_10`):
  - **Fiókonkénti belépési korlát** (L08): az IP-korlát mellett e-mail-címenként legfeljebb 10
    sikertelen belépés / 15 perc (`LOGIN_ACCOUNT_RATE_LIMIT_MAX`), a bcrypt-összevetés előtt; a
    sikeres belépés nem számít, a nem létező fiókra ugyanígy (nem árulja el, van-e fiók), a
    kisbetűsített cím a kulcs (`auth.routes.ts`, `rateLimit.ts`: `skip`, `skipSuccessfulRequests`).
  - **Foglalt nevek** (L08, L13): `lib/reservedNames.ts` – NFKC, a láthatatlan karakterek, a kis- és
    nagybetű, az ékezet, a szóközök és írásjelek, a latin betűre hasonlító cirill/görög betűk és a
    számjegy-helyettesítés (0 → o, 1 → i) nélküli „csontváz” alakon vet össze; a hosszú kifejezések
    (PhotoChain, adminisztrátor, moderátor, rendszergazda, ügyfélszolgálat) bárhol, a rövid szavak
    (admin, root, support, system, rendszer) önálló szóként foglaltak („Badminton Béla” szabad). A
    regisztrációnál a séma, a profilnál a szolgáltatás ellenőrzi: a már meglévő név megtartható, az
    adminisztrátor viselheti.
  - **Rejtett karakterek** (L15, L23): a név, a cím, a leírás és a bemutatkozás is a vélemény
    szabályait kapta (`withoutHiddenCharacters`, `cleanMultilineText` a `lib/schemas.ts`-ben); a
    minimális hosszt a tárolandó, megtisztított alakon mérjük.
  - **A feltöltés törzs-határideje** (L12): `UPLOAD_BODY_TIMEOUT_MS` (150 s) a meglévő
    `createBodyDeadline`-nal, a korlátok előtt.
  - **Napi feltöltési keret** (L11, tárca-kimerítés): fiókonként 30, a platformon összesen 500
    feltöltés / 24 óra (`UPLOAD_DAILY_LIMIT`, `UPLOAD_GLOBAL_DAILY_LIMIT`), az adatbázisból
    számolva, a fájl fogadása előtt (`photos.quota.ts`, 429 `DAILY_LIMIT_REACHED`). A közös keret
    az OWASP-átnézés javaslata: a fiókonkénti keretet a bábfiókok megkerülnék.
  - **`CHECK (email = lower(email))`** (L08): migráció `20261012120000_users_email_lowercase_check`,
    alkalmazva a fejlesztői adatbázison (`npm run db:migrate`, nem törlő).
  - **`npm audit fix`** (L20 és most): a gyökérben `concurrently` 10.0.6 / `shell-quote` 1.12.0
    (2 kritikus), a `server/`-ben `source-map-js` 1.2.2 (1 magas), a `blockchain/`-ben
    `hardhat-verify` 3.1.2 (8 alacsony, az ethers v5 / `elliptic` kikerül) – csak a lockfile-ok
    változtak; utána mind az öt csomagban 0 sebezhetőség.
  - **A szerződés tulajdonosi tesztjei** (szerződés-átnézés): az átruházást és a lemondást idegen
    nem hívhatja; átruházás után a régi tulajdonos nem regisztrálhat; a nulla címre nem ruházható
    át; lemondás után senki nem regisztrálhat, a rekordok olvashatók – 4 új Hardhat-teszt (a
    meglévő viselkedést rögzítik, ezért nem volt piros fázisuk).
  - **A lánc időszakos ellenőrzése** (szerződés-átnézés): `services/chainHealth.ts` – induláskor és
    a 10 percenkénti söprésben a tulajdonos, a hálózat és a szerződés hibája error szinten
    (`chain_config_problem`), a 0,05 ETH alatti egyenleg warn szinten (`chain_low_balance`).
  - **Kliens okozta 500-as válasz** (OWASP-átnézés): a sérült gzip-törzs 500-at adott és hibaként
    naplózódott (a bukó teszt igazolta); a könyvtárak `expose`-os 4xx hibái most 400-at adnak,
    hibanapló nélkül (`errorHandler.ts`).
  - **Biztonsági naplósorok** (OWASP-átnézés): `login_failed` (a fiók azonosítójával, ha van),
    `login_blocked`, `forbidden_role` (a próbálkozó azonosítójával), `cross_site_rejected` (a
    `Sec-Fetch-Site` szabványos értékével) – e-mail-cím és jelszó soha.
  - **EXIF/GPS-figyelmeztetés** a feltöltő oldalon (OWASP-átnézés): a vevő az eredeti fájlt kapja
    a metaadataival együtt.
  - **A biztonsági ellenőrzőlista**: `docs/biztonsag/owasp-ellenorzolista.md` – kategóriánként mit
    ellenőriztünk, hol (`fájl:sor`, egy szkripttel ellenőrizve), mi az eredmény; az `npm audit`
    előtte–utána; a szerződés és a platform-kulcs (mit tehet egy támadó a kulccsal, mit nem, a
    meglévő védelmek, eljárásrend kompromittálódás esetén, továbbfejlesztés: AccessControl-szerepkörök
    multisig-tulajdonossal, Ownable2Step, KMS, eseményfigyelés); az L30-ban javított 12 tétel; 23
    elfogadott kockázat indoklással; az L31–L32 feljegyzései.
  - README (fiókkorlát, foglalt nevek, napi keret, törzs-határidő, „Biztonsági átvizsgálás (L30)”),
    `server/.env.example` (4 új változó, értékek nélkül), FORRASOK 238–251.
  - Egy korábbi, ingadozó kliens-teszt (`VerifyPage.test.tsx`: fókusz egy szerverválasz utáni
    effektusban) a teljes futáson egyszer bukott – az L27-es szabály szerint `waitFor`-ba került.
- Ellenőrzés:
  - `npm run check` zöld:
    - formázás, lint, design-teszt (22) és típusellenőrzés hibátlan;
    - szerződés: 21 teszt;
    - szerver: 1185 teszt, lefedettség 99,89 / 99,33 / 100 / 99,94 %; az új fájlok 100 %-osak, az
      `errorHandler.ts`-ben csak a korábbi védekező sor maradt lefedetlen;
    - kliens: 718 teszt, 98,68 / 95,14 / 99,16 / 99,25 %.
  - E2E (Playwright): 5/5 zöld (2,0 perc).
  - `npm audit`: 0 sebezhetőség mind az öt csomagban.
  - Mutációs próba: 8 szándékos rontás a kritikus sorokban, mind a nyolcat elkapták a tesztek.
    - A rontások: a kvóta 24 órás ablaka (kétszer), a kvóta a multer mögé téve, a fiókkorlát a
      sikeres belépést is számolja, kisbetűsítés nélküli kulcs, szavankénti névvizsgálat nélkül, a
      meglévő név megtartása nélkül, `expose` nélkül.
    - Az alapállapot minden tesztparancsnál zöld; a fájlok SHA-256-tal ellenőrizve álltak vissza.
  - Élő próba a lefordított szerveren, éles módban (`NODE_ENV=production`), a tesztadatbázison, a
    lánc nélkül (zárt RPC-port):
    - a biztonsági fejlécek (CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`,
      COOP/CORP, `X-Powered-By` nélkül) a Chrome DevTools segítségével;
    - fekete dobozos próba: 10 rossz jelszó → 401, utána a helyes is 429 (nagybetűs címmel is);
      „Adminisztrátor”, „Ph0t0Chain Support”, „Admin Kati” → 400; a rejtett karakteres név
      tisztítva; sérült gzip-törzs → 400; CSRF → 403; admin-lista felhasználóként → 403;
    - a naplóban a biztonsági eseménysorok megjelentek, e-mail-cím és jelszó nincs benne (36 sor
      átnézve).
  - A bcrypt mérése ezen a gépen: 12-es költségnél 278–337 ms/hash (medián 294 ms).
  - Láthatatlan karakterek: a módosított fájlokban kettőt találtunk (egy-egy U+200B a
    megjegyzésekben); `[ZWSP]` jelölésre cserélve, az ismételt keresés tiszta. A `.env` fájlokat
    nem nyitottuk meg; a próbák jelszavai véletlenek, nem kerültek kimenetbe.
- Átnézések (csak olvasó, egymástól függetlenül):
  - **OWASP Top 10:2025** (biztonsági átnézés): kritikus és magas nem volt; 1 közepes, 7
    alacsony, 6 INFO.
    - Közepes: a bábfiókokkal kimeríthető platform-tárca → a közös napi keret.
    - Alacsony, javítva: a kliens okozta 500-as válasz; a biztonsági naplósorok hiánya; az
      EXIF/GPS-figyelmeztetés.
    - Alacsony, elfogadott (indoklás az ellenőrzőlista 6. fejezetében): e-mail-felsorolás a
      regisztrációnál; nincs gyakori jelszavak tiltólistája; GitHub Actions főverzió-címkével.
    - L31/L32-re feljegyezve: `NODE_ENV` nélkül nyitva marad az éles beállítás; TLS a
      `DATABASE_URL`-ben; `__Host-` előtag a sütin; `statement_timeout`.
  - **Szerződés és platform-kulcs** (biztonsági átnézés): a szerződés helyes, kritikus és
    magas nem volt.
    - Közepes, elfogadott: egyetlen online kulcs a tulajdonos – a szerepkörök szétválasztásához új
      telepítés kellene; az eljárásrend az ellenőrzőlista 4.2 fejezetében.
    - Alacsony, javítva: a tulajdonosi tesztek; az időszakos ellenőrzés.
    - Alacsony, javaslat a szerzőnek: a telepítő kulcsa kerüljön a Hardhat titkosított
      kulcstárolójába.
    - INFO: a díjplafon csak az egységárat korlátozza; a rekord visszavonhatatlan; az `ownerRef`
      álnevesítés.
  - **A javítások átnézése**: javításokkal elfogadható; 1 közepes, 4
    alacsony, 3 INFO.
    - Közepes, javítva: az „Admin Kati” típusú nevek átmentek, mert a rövid szavakat csak teljes
      névként vizsgáltuk → szavanként is.
    - Alacsony, javítva:
      - a minimális hosszt a tisztítás előtt mértük (a „[ZWSP] a” névből „a” lett);
      - a kvótatesztek nem rögzítették a 24 órás ablakot → a régi kép dönt, és nem multipart
        kérés igazolja, hogy a keret a fájlfogadás előtt dönt;
      - a 120 s-os határidő 1 Mbit/s-on nem elég egy 15 MiB-os fájlnak → 150 s, a felső korlát
        hatása dokumentálva;
      - egy elcsúszott tesztkomment.
    - INFO, javítva: a kvóta kommentje pontatlan volt (fiókonként legfeljebb +1 túllépés);
      az alacsony egyenleg error helyett warn szintre került.
    - INFO, L32-re feljegyezve: index a `photos.createdAt` oszlopra.
- Elhalasztott, elfogadott (részletesen az ellenőrzőlista 6–7. fejezetében):
  - a fiókzár mint szolgáltatásmegtagadás (időzített, 15 perc);
  - a bcrypt-terhelés botháló ellen;
  - `tokenVersion` (nincs jelszócsere);
  - e-mail-ellenőrzés;
  - az `ownerRef` linkelhetősége (EDPB 02/2025);
  - a verify-keret kimeríthetősége;
  - `isAnimatedPng`;
  - a pino-http szintetikus hívásláncai;
  - `pg_trgm`;
  - bábfiókos önértékelés;
  - visszatérítés és vitatott terhelés;
  - a PENDING-söprő;
  - a globális gázkeret az újrapróbálásokra;
  - a szerepkör a tiltás feltételében;
  - a tiltott felhasználó korábbi `/media` URL-jei;
  - felhasználónkénti korlát a lekérdezett és író végpontokra;
  - SHA-pin és Dependabot;
  - „aki elsőként tölti fel”;
  - a foglaltnév-szűrő csak az UTS #39 egy részét vizsgálja.

  L31/L32-re:
  - éles mód és proxyugrások;
  - CSP `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy` a kiszolgált kliensre;
  - `__Host-` süti;
  - pufferelő reverse proxy;
  - több példány (a korlátok és zárak közös tárban);
  - `APP_BASE_URL` kötelező élesben;
  - TLS a `DATABASE_URL`-ben és `statement_timeout`;
  - `photos.createdAt` index;
  - naplógyűjtés és riasztás;
  - CDN-ürítés;
  - a hálózat és a szerződés tárolása képenként;
  - code splitting, `robots.txt`/`llms.txt`.

  A `BroadcastChannel` (L19) nem biztonsági tétel.

  A szerző készíti (bejelentkezést igényel):
  - a GitHub Actions zöld futásának képe a push után;
  - Etherscan-figyelő a tárca és a szerződés címére (javaslat).

| Kép                                | Forrás                                                                                     | Tartalom                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `L30_01_piros_unit.png`            | `npx vitest run --project unit` az új és bővített tesztfájlokra (mentett kimenet, kivonat) | a javítás előtt: 17 bukó teszt és 2 betölthetetlen fájl (az új modulok még nem léteztek)                   |
| `L30_02_piros_db.png`              | `npx vitest run --project db` (auth, users, photos, schema; mentett kimenet, kivonat)      | a javítás előtt: 10 bukó adatbázis-teszt (fiókkorlát, naplózás, napi keret, határidő, CHECK, foglalt név)  |
| `L30_03_piros_kliens.png`          | `npx vitest run src/pages/UploadPage.test.tsx` (mentett kimenet, kivonat)                  | a javítás előtt: az EXIF/GPS-figyelmeztetés hiányzik                                                       |
| `L30_04_npm_audit_elotte.png`      | `npm audit --json` az öt csomagban (az L30 elején mentett kimenet)                         | 2 kritikus (shell-quote), 1 magas (source-map-js), 8 alacsony (elliptic) a tanácsadókkal                   |
| `L30_05_npm_audit_utana.png`       | `node audit-all.mjs` (jegyzetmappa; `npm audit --json` mind az öt csomagban)               | az `npm audit fix` után mind az öt csomagban 0 sebezhetőség                                                |
| `L30_06_biztonsagi_fejlecek.png`   | Chrome DevTools: `GET /api/health` az élő, éles módú szerveren                             | a válasz fejlécei: CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, COOP/CORP, RateLimit        |
| `L30_07_elo_proba.png`             | `node probe-l30-live.mjs` (jegyzetmappa) az élő szerveren                                  | fiókzár 10 hiba után, foglalt nevek, rejtett karakter, gzip → 400, CSRF → 403, admin → 403                 |
| `L30_08_naplo_esemenyek.png`       | `node log-events-l30.mjs` a szervernaplóra                                                 | `login_failed`, `cross_site_rejected`, `forbidden_role` sorok; e-mail-cím és jelszó a naplóban nincs       |
| `L30_09_szerzodes_tesztek.png`     | `npm test` (`blockchain/`)                                                                 | 21 teszt, köztük a négy új „tulajdonjog” teszt                                                             |
| `L30_10_piros_atnezes_utan.png`    | `npx vitest run --project unit` az átnézés találataihoz írt tesztekre (mentett kimenet)    | a második javítási kör előtt: 15 bukó teszt (Admin Kati, hossz a tisztítás után, 150 s, alacsony egyenleg) |
| `L30_11_mutacios_proba.png`        | `node mutation-l30.mjs` (jegyzetmappa)                                                     | 8 szándékos rontás a kritikus sorokban – mind elkapva, a fájlok visszaállítva                              |
| `L30_12_check.png`                 | `npm run check` (a gyökérből; kivonat)                                                     | formázás, lint, design, szerződés, típusellenőrzés, lefedettség: szerver 1185, kliens 718 teszt            |
| `L30_20_fiokonkenti_korlat.png`    | `server/src/modules/auth/auth.routes.ts` 22–60. sor                                        | `loginEmailOf` és a két korlát: IP-címenként és fiókonként (`skip`, `skipSuccessfulRequests`)              |
| `L30_21_napi_feltoltesi_keret.png` | `server/src/modules/photos/photos.quota.ts` 25–58. sor                                     | a napi keret fiókonként és összesen, az adatbázisból, 429 `DAILY_LIMIT_REACHED`                            |
| `L30_22_foglalt_nevek.png`         | `server/src/lib/reservedNames.ts` 64–119. sor                                              | a név „csontváza”, a szavankénti vizsgálat, a foglalt szavak és kifejezések                                |
| `L30_23_kliens_hibak.png`          | `server/src/middleware/errorHandler.ts` 23–65. sor                                         | `toAppError` és `isExposedClientError`: a könyvtárak 4xx hibái 400-at adnak                                |
| `L30_24_lanc_allapot.png`          | `server/src/services/chainHealth.ts` `reportChainHealth`                                   | a lánc ellenőrzése: beállítási hiba error, alacsony egyenleg warn, induláskor összegző sor                 |
| `L30_25_feltoltes_utvonala.png`    | `server/src/modules/photos/photos.routes.ts` 119–134. sor                                  | a feltöltés sorrendje: határidő → bejelentkezés → korlátok → napi keret → fájlfogadás                      |
| `L30_26_rejtett_karakterek.png`    | `server/src/lib/schemas.ts` 89–104. sor                                                    | `withoutHiddenCharacters` és `cleanMultilineText`                                                          |
| `L30_27_email_check_migracio.png`  | `server/prisma/migrations/20261012120000_users_email_lowercase_check/migration.sql`        | `CHECK ("email" = lower("email"))`                                                                         |
| `L30_30_teszt_fiokkorlat.png`      | `server/tests/db/auth.test.ts` „a fiókonkénti sikertelen belépések korlátja”               | a fiókkorlát négy tesztje (zár, sikeres nem számít, nem létező fiók, hibás bemenet)                        |
| `L30_31_teszt_napi_keret.png`      | `server/tests/db/photos.test.ts` „napi feltöltési keret”                                   | a napi keret öt tesztje (24 órás ablak, fájlfogadás előtt, közös keret)                                    |
| `L30_32_teszt_tulajdonjog.png`     | `blockchain/test/PhotoRegistry.test.ts` „tulajdonjog”                                      | átruházás, lemondás, nulla cím – a platform-kulcs kompromittálódásának következményei                      |

- Commit: `2742ff8` – `feat(L30): biztonsági átvizsgálás az OWASP Top 10:2025 szerint – ellenőrzőlista, javítások teszt-elsővel`

## L31 – Konténerizáció (Docker) (2026-10-12)

- Kiindulás: a terv feladata – többlépcsős Dockerfile (a kliens buildje; a szerver buildje
  `prisma generate`-tel; futtatókép `node:24-slim` alapon, csak a futtatási függőségekkel, nem root
  felhasználóval), az Express szolgálja ki a `client/dist`-et SPA-visszaeséssel, a
  `docker-compose.yml` bővítése (app + db), `.dockerignore` [S30], [S31], [S13]. Kész, ha a
  `docker compose up` a teljes rendszert futtatja a localhoston.
  - A szerző döntései:
    - A teljes rendszer Compose-**profillal** indul: `docker compose --profile app up -d --build`
      (`npm run docker:up`). A sima `docker compose up -d` továbbra is csak az adatbázist indítja,
      így a napi fejlesztés nem változik. Ez eltér a terv „`docker compose up`” megfogalmazásától.
    - Az alkalmazás a **fejlesztői adatokkal** fut: ugyanaz az adatbázis, a `server/uploads`
      kötetként, a beállítások a `server/.env`-ből – feltöltéskor valódi Sepolia-tranzakció megy ki.
  - Az L30-as ellenőrzőlista 7. fejezetéből az ide tartozó tételek (éles mód, proxyugrások, a
    kiszolgált kliens fejlécei) is ebben a lépésben készültek el.
- Elkészült (teszt-elsővel; a bukó tesztek kimenete `L31_01`, `L31_12`):
  - **Dockerfile**, három szakasszal:
    - `client-build`: `npm ci`, Vite-build;
    - `server-build`: OpenSSL (a Prisma sémamotorjához); a függőségek rétege csak a csomagjegyzéktől,
      a Prisma-konfigurációtól és a sémától függ (egy új migráció nem építteti újra);
      TypeScript-fordítás. Ezt a képet használja a `migrate` szolgáltatás is.
    - `runtime`: `node:24.21.0-bookworm-slim` (pontos verzió); `fontconfig` és `fonts-dejavu-core`
      a vízjel szövegéhez (nélkülük csak a vízjel vonalai látszanának);
      `npm ci --omit=dev --legacy-peer-deps --ignore-scripts` – a `@prisma/client` választható
      peer-függőségként a Prisma parancssori eszközét és a TypeScriptet is behúzná (884 → 560 MB);
      `USER node`; `HEALTHCHECK` a kép saját Node-jával, a beállított porton; a kép alapértelmezése
      `TRUST_PROXY_HOPS=0`.
  - **`.dockerignore`**: a titkok (`.env`, `.env.*` a `.env.example` kivételével, kulcsfájlok,
    `.npmrc`), a helyi függőségek és buildek, a konténerhez nem tartozó mappák.
  - **`docker-compose.yml`** (`app` profil):
    - `migrate`: egyszeri `prisma migrate deploy` a build-képpel, az egészséges adatbázis után,
      `node` felhasználóként, Linux-jogosultságok nélkül;
    - `app`: a sikeres migráció után indul; `init: true`, `restart: unless-stopped`;
      `env_file: ./server/.env`, felülírva az éles móddal, az adatbázis `db` hosttal, az
      `APP_BASE_URL`-lel, az `UPLOAD_DIR`-rel, a `CLIENT_DIST_DIR`-rel és a `TRUST_PROXY_HOPS=0`-val;
      a port csak a `127.0.0.1`-en; `mem_limit: 2g` (egy 50 MP-es kép kb. 390 MB, L12),
      `pids_limit: 256`, `cap_drop: [ALL]`, `no-new-privileges`, `stop_grace_period: 30s` (a
      lánc-regisztrációk türelmi ideje kiférjen).
  - **A webes felület kiszolgálása** (`server/src/middleware/clientApp.ts`, `CLIENT_DIST_DIR`):
    - ugyanarról az eredetről, mint az API (a `Sec-Fetch-Site` ellenőrzés és a SameSite-süti ezt
      feltételezi);
    - a hash-elt `assets/` fájlok `immutable`, minden más `no-cache`;
    - a kiterjesztés nélküli GET/HEAD útvonal az `index.html`-t kapja; az `/api` és a `/media`
      (kis- és nagybetű-függetlenül), valamint a hiányzó, kiterjesztéses fájl a központi 404-et;
    - rejtett fájl nem szolgálható ki; a hiányzó `index.html` már induláskor hibát ad.
  - **Fejlécek** (`app.ts`):
    - CSP `img-src 'self' data: blob:` (a feltöltendő kép előnézete);
    - `upgrade-insecure-requests` csak https `APP_BASE_URL` mellett – különben a
      http://localhost-on futó konténerben a böngésző https-re írná át a saját kéréseit;
    - `Permissions-Policy`: kamera, mikrofon, helyadat, fizetés és USB tiltva;
    - az API alapból `Cache-Control: no-cache`; a bejelentkezéshez kötött útvonalak továbbra is
      `no-store`.
  - **`TRUST_PROXY_HOPS`** (`env.ts`, `trustedProxyHops`): 0–10 közötti egész; alapból élesben 1,
    egyébként 0. A proxy nélküli konténerben 0 – különben a hamis `X-Forwarded-For` fejléccel
    megkerülhetők lennének az IP-alapú korlátok.
  - `client/public/robots.txt` és `llms.txt`; gyökérscriptek: `docker:up`, `docker:down`,
    `docker:logs`.
  - Dokumentáció:
    - README, „Konténer (Docker, L31)” fejezet: kép, Compose, beállítások, figyelmeztetések (valódi
      tranzakció, a Docker Desktop Inspect nézete), Linuxon `mkdir -p server/uploads`, védelmek,
      leállítás;
    - `.env.example` (`APP_PORT`, URL-biztos jelszó) és `server/.env.example` (2 új változó,
      értékek nélkül);
    - az OWASP-ellenőrzőlista 7. fejezete: mi teljesült az L31-ben, mi maradt az L32-re; a
      `fájl:sor` hivatkozások frissítve, szkripttel ellenőrizve;
    - FORRASOK 252–270.
  - Két meglévő adatbázis-teszt (`photos.detail`, `reviews`) a névtelen válaszra fejléc nélküli
    gyorsítótár-szabályt várt – most `no-cache` (a kódátnézés magas súlyosságú találata).
  - A képgenerátor (`tools/screenshot/render.mjs`) a kiterjesztés nélküli fájlok nyelvét a
    fájlnévből veszi (`Dockerfile` → `docker`, `.dockerignore` → `ignore`): a C-szerű
    alapértelmezés a `/var/lib/apt/lists/*` sort megjegyzés kezdetének vette.
- Ellenőrzés:
  - `npm run check` zöld:
    - formázás, lint, design-teszt (22) és típusellenőrzés hibátlan;
    - szerződés: 21 teszt;
    - szerver: 1211 teszt, lefedettség 99,84 / 99,12 / 100 / 99,94 %;
    - kliens: 718 teszt, 98,68 / 95,14 / 99,16 / 99,25 %.
  - E2E (Playwright): 5/5 zöld (2,7 perc), a konténer leállítása után.
  - Build gyorsítótár nélkül (`docker compose --progress plain --profile app build --no-cache`):
    - mindhárom szakasz lefut; a futtatókép 560 MB (tömörítve 131 MB), a migrációs kép 1,33 GB;
    - a futtatóképben a lefordított szerver minden modulja betölthető, a sharp a libvips
      8.18.7-et tölti be, a Prisma parancssori eszköze és a TypeScript nincs benne.
  - Próbaüzem a **tesztadatbázison**, ideiglenes Compose-felülírással (jegyzetmappa). A lánc helyén
    zárt RPC-port volt, így tranzakció nem ment ki.
    - Regisztráció: a foglalt név elutasítva; a `Secure` süti a http://localhost-on is működik.
    - Feltöltés `blob:` előnézettel, CSP-hiba nélkül a konzolban.
    - A vízjeles előnézeten látszik a „PhotoChain” felirat – a betűkészlet a slim képben is megvan.
    - A regisztráció – várhatóan – „Sikertelen” állapotba került.
    - Az ideiglenes konténerek és a kötet utána törölve.
  - dHash ugyanarra a saját fotóra Windowson és a konténerben: azonos (`989890b0e0d85820`, libvips
    8.18.7 mindkettőn) – ez az L09-ben jelzett Linux-ellenőrzés.
  - A valódi rendszer, fejlesztői adatokkal:
    - a migráció `node` felhasználóként 0-s kóddal lép ki („No pending migrations”);
    - az alkalmazás „healthy”; induláskor az adatbázis és a lánc ellenőrzése rendben (Sepolia, a
      tárca egyenlege 0,0821 ETH);
    - a galéria és a Sepolián regisztrált kép adatlapja a tanúsítvánnyal megjelenik;
    - feltöltést itt nem végeztünk (valódi tranzakció lenne).
  - A védelmek a futó konténeren: `CapEff` 0, folyamatkorlát 256, memóriakorlát 2 GB, a
    `Permissions-Policy` fejléc jelen van.
  - Titkok: a konténer környezeti változóit nem kérdeztük le (`docker inspect` és `exec env` nem
    futott), a `.env` fájlokat nem nyitottuk meg.
- Átnézések (csak olvasó, egymástól függetlenül):
  - **Biztonság**: elfogadható; kritikus, magas és közepes nem volt; 5
    alacsony, 7 INFO.
    - Javítva: `cap_drop`, `no-new-privileges`, `pids_limit`; a `migrate` `node`
      felhasználóként; pontos alapkép-verzió; `Permissions-Policy`; a kép
      alapértelmezése `TRUST_PROXY_HOPS=0`; a `.dockerignore` kiegészítése;
      `stop_grace_period`.
    - Elfogadott, dokumentálva:
      - a teljes `server/.env` a konténer környezetébe kerül – a README figyelmeztet, hogy a
        Docker Desktop Inspect/Environment nézetéről nem készülhet kép;
      - a jelszó URL-biztos karakterei (`.env.example`);
      - HSTS http-n (a böngésző ott figyelmen kívül hagyja);
      - a futtatóképben maradt, HTTP-n el nem érhető `seed.js`, `truncateAll.js` és a
        forrástérképek.
    - L32-re:
      - `APP_BASE_URL` kötelező élesben;
      - figyelmeztetés https-cím mellett nem éles módban;
      - `private` a személyre szabott GET-válaszokra CDN mögött;
      - digest-rögzítés és Dependabot;
      - opcionálisan írásvédett gyökér-fájlrendszer.
  - **Kód**: javításokkal elfogadható; 1 magas, 1 közepes, 5 alacsony, 1 INFO.
    - Magas, javítva: a két adatbázis-teszt a régi fejlécet várta.
    - Közepes, dokumentálva: Linuxon a hiányzó `server/uploads` mappát a Docker `root`
      tulajdonnal hozza létre → README: `mkdir -p server/uploads` az első indítás előtt.
    - Alacsony, javítva:
      - a függőségek rétege ne függjön a migrációktól;
      - `stop_grace_period`;
      - a `HEALTHCHECK` a `PORT` változót használja;
      - a hiányzó `index.html` induláskor hibát ad, a kliens kapcsolatbontása nem szerverhiba;
      - pontos alapkép-verzió.
    - INFO, javítva: a szerver útvonalai kis- és nagybetű-függetlenül; a `/media` ágra is van
      teszt.
  - A javítások teszt-elsővel készültek (`L31_12`: 4 bukó teszt).
- Elhalasztott, elfogadott:
  - L32: a fenti tételek, valamint az L30-as lista 7. fejezetének maradéka: `__Host-` süti,
    pufferelő proxy, több példány, TLS a `DATABASE_URL`-ben és `statement_timeout`, naplógyűjtés,
    CDN.
  - Külön `server/.env.docker` csak a futtatáshoz szükséges változókkal.
  - A `postgres:17` kép sincs pontos verzióra rögzítve (az L07 óta).

  A szerző készíti: a Docker Desktop képét a futó konténerekről – a Containers listát, **nem**
  az Inspect/Environment nézetet.

| Kép                                            | Forrás                                                                                                                   | Tartalom                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `L31_01_piros_tesztek.png`                     | `npx vitest run --project unit` az `env.test.ts`, `app.test.ts`, `clientApp.test.ts` fájlokra (mentett kimenet, kivonat) | a megvalósítás előtt: 13 bukó teszt (`CLIENT_DIST_DIR`, `TRUST_PROXY_HOPS`, CSP, `no-cache`, a kliens kiszolgálása) |
| `L31_02_build_naplo.png`                       | `docker compose --progress plain --profile app build --no-cache` (mentett kimenet, kivonat)                              | a három szakasz lépései és ideje, a rögzített alapkép, a képek mérete (560 MB, 1,33 GB)                             |
| `L31_03_compose_ps.png`                        | `docker compose --profile app ps`                                                                                        | a futó konténerek „healthy” állapotban, a portok csak a 127.0.0.1-en                                                |
| `L31_04_kontener_utvonalak.png`                | `node probe-l31.mjs` (jegyzetmappa) a konténeres alkalmazáson                                                            | útvonalanként a státusz, a típus és a `Cache-Control`; a CSP `img-src`-je; nincs inline szkript                     |
| `L31_05_kontener_regisztracio_foglalt_nev.png` | Chrome DevTools: a regisztrációs oldal a konténerből (próbaüzem, tesztadatbázis)                                         | az „Admin Kati” név foglalt – a konténerből kiszolgált felület és az API együtt működik                             |
| `L31_06_kontener_feltoltes_blob_elonezet.png`  | Chrome DevTools: a feltöltő oldal (próbaüzem)                                                                            | a kiválasztott saját fotó `blob:` előnézete – a CSP engedi                                                          |
| `L31_07_kontener_vizjeles_elonezet.png`        | Chrome DevTools: a feltöltött kép adatlapja (próbaüzem)                                                                  | a konténerben készült vízjeles előnézet „PhotoChain” felirattal; zárt RPC-port → „Sikertelen regisztráció”          |
| `L31_08_dhash_windows_kontener.png`            | a hash-modul Windowson és a konténerben, ugyanarra a fotóra (mentett kimenet)                                            | azonos SHA-256 és dHash (`989890b0e0d85820`), libvips 8.18.7 mindkettőn                                             |
| `L31_09_kontener_galeria.png`                  | Chrome DevTools: http://localhost:4000/ (valódi rendszer, fejlesztői adatok)                                             | a galéria a Sepolián regisztrált képpel, „Hitelesítve” jelvénnyel                                                   |
| `L31_10_kontener_adatlap_sepolia.png`          | Chrome DevTools: a regisztrált kép adatlapja                                                                             | „Hitelesítve a blokkláncon”: hálózat, időpont, SHA-256, dHash, blokk, tranzakció                                    |
| `L31_11_inditas_naplo.png`                     | `npm run docker:up`, majd `docker logs` a `migrate` és az `app` konténerre (kivonat)                                     | db healthy → migrate kilép → app indul; „No pending migrations”; éles mód; a lánc ellenőrzése                       |
| `L31_12_piros_atnezes_utan.png`                | `npx vitest run --project unit` az `app.test.ts`, `clientApp.test.ts` fájlokra (mentett kimenet, kivonat)                | az átnézések javításai előtt: 4 bukó teszt (`Permissions-Policy`, `/API`, `/Media`, hiányzó `index.html`)           |
| `L31_13_dockerfile_build.png`                  | `Dockerfile` 1–41. sor                                                                                                   | a rögzített alapkép, a kliens és a szerver build-szakasza                                                           |
| `L31_14_dockerfile_futtatokep.png`             | `Dockerfile` 43–74. sor                                                                                                  | a futtatókép: betűkészlet, csak futtatási függőségek, `USER node`, `HEALTHCHECK`                                    |
| `L31_15_compose_migrate_app.png`               | `docker-compose.yml` 44–104. sor                                                                                         | a `migrate` és az `app` szolgáltatás: profil, függőségek, beállítások, korlátok, védelmek                           |
| `L31_16_dockerignore.png`                      | `.dockerignore` 1–42. sor                                                                                                | a build-kontextusból kizárt titkok, függőségek, buildek és mappák                                                   |
| `L31_17_kliens_kiszolgalasa.png`               | `server/src/middleware/clientApp.ts` 1–68. sor                                                                           | `createClientAppRouter`: statikus fájlok gyorsítótár-szabállyal, SPA-visszaesés, a szerver útvonalai kizárva        |
| `L31_18_app_fejlecek_proxy.png`                | `server/src/app.ts` 70–118. sor                                                                                          | `trust proxy` a megbízható ugrásokkal; CSP-eltérések; `Permissions-Policy`; `no-cache` az API-ra                    |
| `L31_19_env_proxyugrasok.png`                  | `server/src/config/env.ts` 171–208. sor                                                                                  | `TRUST_PROXY_HOPS`, `CLIENT_DIST_DIR` sémája és a `trustedProxyHops` függvény                                       |
| `L31_20_kliens_kiszolgalas_tesztek.png`        | `server/tests/integration/clientApp.test.ts` 35–116. sor                                                                 | a kliens kiszolgálásának tesztjei (SPA, gyorsítótár, 404-ek, rejtett fájl, metódusok, hiányzó build)                |
| `L31_21_fejlec_proxy_tesztek.png`              | `server/tests/integration/app.test.ts` 60–113. sor                                                                       | CSP http és https alatt, `Permissions-Policy`, `no-cache`; a proxyugrások három esete                               |
| `L31_22_check.png`                             | `npm run check` (a gyökérből; kivonat)                                                                                   | formázás, lint, design, szerződés, típusellenőrzés, lefedettség: szerver 1211, kliens 718 teszt                     |
| `L31_23_e2e.png`                               | `npm run test:e2e` (kivonat)                                                                                             | a Playwright-tesztek: 5/5 zöld                                                                                      |

- Commit: `52f28fd` – `feat(L31): konténerizáció – többlépcsős Docker-kép, Compose-profil, a webes felület az Express-ből`

## L32 – Élesítés: Render + Supabase + Stripe (2026-10-13)

- Kiindulás: a terv feladata – Supabase PostgreSQL (`prisma migrate deploy`) és Storage
  (`SupabaseStorage`), Render Web Service a Dockerfile-ból a környezeti változókkal és a
  `/api/health` állapotellenőrzéssel, Stripe-webhook a Render címére (teszt mód), demóadatok a saját
  fotókkal [S32], [S33], [S26]. Az élő cím: **https://photochain.onrender.com**.
  - A szerző döntései:
    - **A képek a szerveren át:** mindkét bucket privát, a nyilvános előnézetet a szerver adja
      tovább (`/media`). A kliens és a CSP változatlan, és az elrejtett kép azonnal eltűnik – az
      ingyenes Supabase-CDN egy órán át gyorsítótárazná, ürítés nélkül.
    - **Memória:** közös képfeldolgozási sor és 25 MP-es korlát az ingyenes példányon (512 MB,
      0,1 CPU).
    - **A migrációt és a seedet a szerző futtatja a saját gépéről** (`production:migrate`,
      `production:seed`): a Render ingyenes csomagjában nincs migrációs lépés és parancssor.
    - **Helyi próba** a valódi Supabase ellen, a Render előtt.
    - **Két commit:** a kód (`4c98b93`), majd az élő mérés és a dokumentáció (`docs(L32)`).
  - Előzetes kutatás (elsődleges dokumentáció, ahol az hallgat, a csomagok forrása):
    - a Render ingyenes példányán nincs shell és pre-deploy parancs;
    - a Supabase Session poolere IPv4-en is elérhető;
    - a node-postgres-ben az URL `sslmode`-ja felülírja az `ssl` beállítást, így a megadott CA
      elveszne;
    - az ingyenes Supabase-CDN egy órán át gyorsítótáraz, ürítés nélkül.
- Elkészült (teszt-elsővel; a bukó tesztek kimenete `L32_01`, `L32_02`):
  - **Supabase Storage** (`server/src/services/storage/supabase.storage.ts`):
    - `save` (felülírás nélkül), `read`, `openRead` és `delete` a két privát bucketen;
    - minden hívás időkorlátos (`STORAGE_TIMEOUT_MS`, 20 s; a folyamnál csak a válasz fejlécéig);
    - az `openRead` folyamként ad (a méret a `Content-Length` fejlécből; ha hiányzik, beolvassa);
    - induláskor ellenőrzi a bucketeket: hiányzó vagy nyilvános bucket esetén a szerver nem indul,
      és a hibaüzenet a HTTP-állapotot is megadja;
    - a tárhelyet a konfiguráció választja ki (`storageFromEnv.ts`, `STORAGE_DRIVER`).
  - **`/media` a szerveren át** (`server/src/middleware/mediaProxy.ts`):
    - csak a `previews` és a `thumbnails` mappa, UUID-kulcs;
    - `Cache-Control: private, max-age=300`;
    - a hiányzó fájl 404, a megszakadt folyam bontja a kapcsolatot;
    - IP-címenkénti korlát (`MEDIA_RATE_LIMIT_MAX`, 600 / 15 perc).
  - **Adatbázis-TLS** (`server/src/lib/prisma.ts`, `server/src/config/env.ts`):
    - `DATABASE_SSL_CA_FILE` → `ssl: { ca, rejectUnauthorized: true }`;
    - élesben a távoli adatbázis ellenőrzött TLS nélkül indulási hiba;
    - a CA mellett az URL ssl-paramétere hiba;
    - helyinek csak a `localhost`, a 127.0.0.0/8, a `::1` és a Compose `db` szolgáltatása számít,
      minden más távoli;
    - a Supabase CA-tanúsítványa (nyilvános) a `server/certs/` mappában.
  - **Sorszintű védelem (RLS)** minden táblán – migráció
    (`20261013090000_enable_row_level_security`). A `_prisma_migrations` táblán csak akkor, ha
    létezik: a `migrate dev` árnyékadatbázisában nincs.
  - **Memória az ingyenes példányon:**
    - közös képfeldolgozási sor (`server/src/services/imageWork.ts`, p-queue,
      `IMAGE_PROCESSING_CONCURRENCY`) a feltöltés, a hitelesség-ellenőrzés és az admin-visszaállítás
      között;
    - beállítható képpontkorlát (`IMAGE_MAX_MEGAPIXELS`), a kliens buildjébe is
      (`VITE_IMAGE_MAX_MEGAPIXELS`, build-argumentumként);
    - `sharp.cache(false)`, `sharp.concurrency(1)`, `MALLOC_ARENA_MAX=2`.
  - **Konfiguráció:**
    - `APP_BASE_URL` élesben kötelező;
    - figyelmeztetés, ha a cím https, de a mód nem éles;
    - a két bucket neve nem lehet azonos;
    - induláskor a Supabase-kulcs, a JWT-kulcs és az adatbázis-URL is törlődik a környezetből;
    - a Supabase-kulcs a naplóban kitakarva.
  - **`/api/health`:** kimarad az általános korlátból (a Render néhány másodpercenként hívja).
  - **Proxylánc-mérés** (`server/src/middleware/proxyChain.ts`): csak a jelölt mérőkérésnél
    (`?proxy_probe`) naplózza az `X-Forwarded-For` bejegyzéseinek számát, IP-cím nélkül,
    folyamatonként legfeljebb 10-szer.
  - **Élesítési parancsok** (`server/scripts/production.ts`, `server/src/db/production.ts`):
    - csak a `server/.env.production` értékeivel futnak (a fejlesztői `.env` nélkül), shell nélkül;
    - a Prisma parancssori eszköze a `sslmode=require&sslcert=<CA>&sslaccept=strict` URL-t kapja;
    - a hibaüzenet értéket nem ír ki;
    - a seed távoli adatbázison csak a `--allow-remote-database` kapcsolóval fut.
  - **Telepítés és ellátási lánc:**
    - `render.yaml` (Blueprint) és `server/.env.production.example`;
    - az alapkép digesttel rögzítve (`Dockerfile`, `node-base`);
    - `.github/dependabot.yml`: npm öt helyen, Docker, GitHub Actions, hetente; a sharp kizárva,
      mert a dHash a láncra kerül (L09).
  - **Dokumentáció:**
    - README, „Élesítés (Render + Supabase, L32)”: felépítés, változók, telepítés lépésről
      lépésre, korlátok;
    - az OWASP-ellenőrzőlista 7. fejezete (mi teljesült, mi maradt elfogadott korlát); az
      elcsúszott `fájl:sor` hivatkozások átszámolva, szkripttel ellenőrizve;
    - FORRASOK 271–299;
    - telepítési ábra (`docs/diagramok/telepites.mmd`).
- Telepítés (a szerző, a lépésenkénti leírás szerint; titkos érték a kimenetbe nem került):
  - **Supabase-projekt** (eu-west-1, Írország):
    - két privát bucket;
    - a leírás a Data API kikapcsolását és az „Enforce SSL” bekapcsolását is tartalmazta;
    - a saját gépről `production:migrate` (8 migráció) és `production:seed` (8 kategória, 3
      felhasználó);
    - az első próba P1000-es hibát adott: a Session pooler felhasználóneve `postgres.<projekt>` –
      javítva.
  - **Render:** a Blueprint (Frankfurt, Free) „Live” állapotú; a Stripe-végpont az élő címre
    mutat.
  - **Proxyugrások:** a jelölt mérőkérés után a Render naplójában N = 3 → a szerző
    `TRUST_PROXY_HOPS=3`-ra állította, a `render.yaml` is így lett átírva.
  - A `render.yaml` régiómegjegyzése javítva: a Supabase-projekt Írországban van, a Render régiói
    közül Frankfurt a legközelebbi.
- Ellenőrzés:
  - **Memóriamérés** a futtatóképben (`docker run -m 512m`, saját fotóból készült próbaképekkel):
    - alapbeállítással (50 MP) egy 50 MP-es WebP csúcsa 501 MB, ez 512 MB-on nem fér el; 0,1
      CPU-n 20,6 s; a `VIPS_DISC_THRESHOLD` nem segít (`L32_03`);
    - az éles beállítással (25 MP, egy szál, 0,1 CPU): egy 15 MP-es JPEG 91 MB / 5,9 s, egy
      24,97 MP-es WebP 274 MB / 9,9 s; a 25 MP fölötti kép kibontás előtt elutasítva (`L32_04`).
  - **Docker-build:** a futtatókép 571 MB; a kliens buildjében a 25 MP-es korlát; a CA a képben
    (`L32_05`).
  - **Helyi próba** a valódi Supabase ellen, 512 MB / 0,1 CPU mellett:
    - az indulási napló (adatbázis, tárhely, lánc), az útvonalak, a CSP és a `/media` 404-ei –
      az eredeti fájl soha (`L32_06`);
    - rossz CA-val a szerver kilép (`L32_07`);
    - a szerző saját fotója `REGISTERED` lett, az előnézet és a bélyegkép a Supabase-ből, a
      szerveren át érkezik; a konténer memóriája 114 MiB (`L32_08`).
  - **Az élő rendszer kívülről**, bejelentkezés nélkül (`L32_09`, `L32_12`, `L32_13`):
    - az útvonalak, a galéria és a `/media`;
    - HSTS, CSP és `Permissions-Policy`; `X-Powered-By` nincs;
    - http → https 301;
    - a konzolban nincs hiba.
  - **Proxyugrások** (`L32_10`):
    - 1 ugrás mellett a korlát kulcsa egy proxy címe volt, kérésenként más – a látogatók közös
      kereten osztoztak volna;
    - 3 ugrás mellett a kulcs a saját IP-cím, a hamis fejléc hatástalan;
    - a kulcs lenyomata (`pk`) nem került a képre: egy IPv4-cím csonkolt hashe visszafejthető.
  - **`npm run check` zöld** (`L32_11`):
    - formázás, lint, design-teszt (22) és típusellenőrzés hibátlan;
    - szerződés: 21 teszt;
    - szerver: 1285 teszt, lefedettség 99,67 / 98,66 / 99,82 / 99,89 %;
    - kliens: 721 teszt, 98,69 / 95,15 / 99,16 / 99,25 %.
  - **E2E (Playwright):** 5/5 zöld, 3,3 perc (`L32_14`).
  - **Titkok:**
    - a `.env` fájlokat nem nyitottuk meg; a `server/.env.production` a mintából készült,
      és csak a nyilvános `SUPABASE_URL`, valamint egy véletlen JWT-kulcs került bele, kiírás
      nélkül;
    - a konténer környezetét nem kérdeztük le;
    - az élő oldalra nem jelentkeztünk be.
- Átnézések (csak olvasó, egymástól függetlenül):
  - **Biztonság**: kritikus nem volt; 2 magas, 2 közepes, 4 alacsony,
    néhány INFO.
    - Magas: a `/media`-nak nem volt korlátja, a Supabase `openRead` pedig egészben a
      memóriába olvasott. Lassú vagy tömeges kérésekkel az 512 MB-os példány leállítható, a kimenő
      keret kimeríthető lett volna. Javítva: IP-korlát a `/media`-n, folyamként olvasás (a méret a
      fejlécből), időkorlát a válasz fejlécéig.
    - Magas: a Supabase Data API a `public` séma tábláit a nyilvános kulccsal is kiadná. Javítva:
      RLS-migráció és teszt; a Dashboardban a Data API kikapcsolása (README).
    - Közepes: a proxylánc-mérés az első, akár hamis fejlécű kérést naplózta. Javítva: csak a jelölt
      mérőkérés, legfeljebb 10-szer; a mért érték kívülről ellenőrizve.
    - Közepes: élesben ellenőrzött TLS nélkül csak figyelmeztetés volt. Javítva: indulási hiba, és
      negatív próba rossz CA-val. Ez a futó szerverre igazolt; a migrációé nincs negatív próbával
      igazolva (elfogadva).
    - Alacsony:
      - a távoliság-ellenőrzés (IPv6-cím, egyszavas gépnév): javítva, csak a felsoroltak
        helyiek;
      - a seed jóváhagyása környezeti változóként a munkamenetben maradhatott: javítva,
        parancssori kapcsoló lett;
      - `public` gyorsítótár a `/media`-n: javítva, `private`;
      - a helyi próbánál az `--env-file` a `SEED_*` értékeket is a konténerbe tette:
        elfogadva (`--rm`-mel futott, a konténer környezetét nem kérdeztük le).
    - INFO: `sharp.concurrency(1)` – átvéve.
  - **Kód**: javításokkal elfogadható; magas nem volt; 2 közepes, 7 alacsony,
    3 INFO.
    - Közepes: érvénytelen `DATABASE_URL` (pl. kódolatlan `/` a jelszóban) esetén a seed és az
      élesítési parancs nyers `TypeError`-ral a teljes URL-t, jelszóval együtt kiírhatta. Javítva:
      `URL.canParse` védelem, értékek nélküli hiba, teszt.
    - Közepes: a `/media` korlát nélkül (ugyanaz, mint a biztonsági átnézés első magas találata) – javítva.
    - Alacsony:
      - elavult megjegyzések: javítva;
      - forrásmegjelölés: javítva (FORRASOK 271–299);
      - nem volt teszt a közös sorra: javítva – a visszaállítás és a hitelesség-ellenőrzés
        ugyanazt a sort használja;
      - a visszaállítás a hálózati műveletek alatt is foglalta a sort: javítva, csak az
        olvasás és a bontás fut a soron;
      - a bucket-ellenőrzés elnyelte a hiba okát: javítva, a HTTP-állapottal;
      - `public` gyorsítótár: javítva;
      - a tanúsítvány fájlneve: javítva (átnevezési útmutató).
    - INFO: a proxylánc-mérés (lásd a biztonsági átnézés első közepes találatát); README-fejezet (elkészült); a helyi tárhelynél
      a hiányzó fájl csak tesztbeállításban ad 500-at.
  - A javítások teszt-elsővel készültek (`L32_02`: 14 bukó teszt).
- Elhalasztott, elfogadott (részletesen: OWASP-ellenőrzőlista, 7. fejezet):
  - `__Host-` süti, pufferelő proxy, több példány, `statement_timeout`, `createdAt`-index,
    naplógyűjtés és riasztás;
  - a Prisma parancssori eszközének (`sslaccept=strict`) negatív próbája;
  - a `favicon.ico` 404-e (a naplóban figyelmeztetés);
  - a TLS-hiba üzenete élesben is a fejlesztői tippet adja (`docker compose up -d`);
  - közös Sepolia-szerződés a fejlesztéssel;
  - a Render alszik, a Supabase szünetel – a bemutató előtt mindkettőt fel kell ébreszteni.

  A szerző készíti (bejelentkezés kell; titkos érték nem látszhat rajtuk):
  - a Render sikeres telepítésének naplója (Logs vagy Events);
  - a Supabase táblái (Table Editor) és bucketjei (Storage).

| Kép                                 | Forrás                                                                                                                 | Tartalom                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `L32_01_piros_tesztek.png`          | `npx vitest run` az új és bővített tesztfájlokra, fájlonként (mentett kimenet, kivonat)                                | a megvalósítás előtt: 29 bukó teszt; a még nem létező modulok (tárhely, közös sor, élesítési parancsok) tesztfájljai el sem indultak            |
| `L32_02_piros_atnezes_utan.png`     | `npx vitest run` az átnézések találataihoz írt tesztekre (mentett kimenet, kivonat)                                    | a javítások előtt: 14 bukó teszt (érvénytelen URL, folyam, HTTP-állapot, kötelező TLS, távoli gépnevek, `/media`-korlát, mérőkérés, RLS)        |
| `L32_03_memoria_alapbeallitas.png`  | `docker run -m 512m [--cpus 0.1] photochain-app node probe-memory.mjs` (jegyzetmappa; mentett kimenet)                 | alapbeállítással: a 25 MP-es WebP csúcsa 296 MB, az 50 MP-esé 501 MB – 512 MB-on nem fér el; 0,1 CPU-n 20,6 s                                   |
| `L32_04_memoria_eles_beallitas.png` | `docker run -m 512m --memory-swap 512m --cpus 0.1 photochain-app:l32 node probe-production.mjs` (mentett kimenet)      | az éles beállítással: 15 MP-es JPEG 91 MB / 5,9 s, 24,97 MP-es WebP 274 MB / 9,9 s; a nagyobb képek kibontás előtt elutasítva                   |
| `L32_05_build_naplo.png`            | `docker build --progress plain --target runtime --build-arg IMAGE_MAX_MEGAPIXELS=25 -t photochain-app:l32 .` (kivonat) | a digesttel rögzített alapkép, a kliens buildje 25 MP-es korláttal, csak futtatási függőségek, a CA a képben; 571 MB                            |
| `L32_06_helyi_proba_supabase.png`   | `docker run --rm --env-file server/.env.production … -m 512m --cpus 0.1 photochain-app:l32` (mentett kimenet)          | helyi próba a valódi Supabase ellen: indulási napló (adatbázis, Supabase Storage, Sepolia), útvonalak, CSP, a `/media` 404-ei és korlátja       |
| `L32_07_tls_negativ_proba.png`      | ugyanaz rossz CA-val (`DATABASE_SSL_CA_FILE`; mentett kimenet)                                                         | rossz CA-val (ISRG Root X1) a szerver a TLS-kapcsolatot megtagadja, és 1-es kóddal kilép                                                        |
| `L32_08_helyi_feltoltes.png`        | ellenőrzés kívülről a szerző feltöltése után (mentett kimenet)                                                         | a feltöltött saját fotó `REGISTERED`; előnézet és bélyegkép a Supabase-ből a szerveren át, `private` gyorsítótárral; 114 MiB memória            |
| `L32_09_elo_ellenorzes.png`         | az élő rendszer ellenőrzése kívülről (mentett kimenet)                                                                 | útvonalak, galéria, `/media`, biztonsági fejlécek (HSTS, CSP, `Permissions-Policy`), http → https 301, Cloudflare                               |
| `L32_10_proxyugrasok_meres.png`     | `node proxy-pk.mjs` (jegyzetmappa) az élő szolgáltatáson                                                               | a jelölt mérőkérés naplósora (3 bejegyzés); a korlát kulcsa 1 és 3 ugrás mellett, hamis fejlécekkel – 3-nál a saját IP-cím, egyetlen keret fogy |
| `L32_11_check.png`                  | `npm run check` (a gyökérből; kivonat)                                                                                 | formázás, lint, design, szerződés, típusellenőrzés, lefedettség: szerver 1285, kliens 721 teszt                                                 |
| `L32_12_elo_galeria.png`            | Chrome DevTools: https://photochain.onrender.com/                                                                      | az élő galéria a feltöltött képpel, „Hitelesítve” jelvénnyel                                                                                    |
| `L32_13_elo_adatlap_sepolia.png`    | Chrome DevTools: a kép élő adatlapja                                                                                   | „Hitelesítve a blokkláncon” (Sepolia): hálózat, időpont, SHA-256, dHash, blokk, tranzakció                                                      |
| `L32_14_e2e.png`                    | `npm run test:e2e` (kivonat)                                                                                           | a Playwright-tesztek: 5/5 zöld                                                                                                                  |
| `L32_15_telepitesi_abra.png`        | `docs/diagramok/telepites.mmd` (Mermaid, 2000 × 780)                                                                   | a telepítés: böngésző → Cloudflare/Render → konténer → Supabase (adatbázis, Storage), Sepolia, Stripe; GitHub CI és a fejlesztői gép            |
| `L32_20_tarhely_idokorlat.png`      | `server/src/services/storage/supabase.storage.ts` 63–96. sor                                                           | `withResponseTimeout` (időkorlát a válasz fejlécéig) és `failureOf` (a hiba oka a HTTP-állapottal)                                              |
| `L32_21_tarhely_olvasas_folyam.png` | `server/src/services/storage/supabase.storage.ts` 150–181. sor                                                         | `read` (teljes időkorláttal) és `openRead` (folyamként, a méret a `Content-Length` fejlécből)                                                   |
| `L32_22_media_proxy.png`            | `server/src/middleware/mediaProxy.ts` 1–74. sor                                                                        | `createMediaRouter`: csak a két nyilvános mappa, kulcsellenőrzés, `private` gyorsítótár, folyam, 404 és kapcsolatbontás                         |
| `L32_23_kozos_kepsor.png`           | `server/src/services/imageWork.ts` 1–15. sor                                                                           | `createImageWork`: a közös képfeldolgozási sor                                                                                                  |
| `L32_24_app_media_korlat.png`       | `server/src/app.ts` 240–260. sor                                                                                       | a `/media` két ága: helyi mappa (fejlesztés) vagy a tárhely-proxy IP-korláttal (élesben)                                                        |
| `L32_25_env_szabalyok.png`          | `server/src/config/env.ts`, `checkCrossFieldRules`                                                                     | a mezők közötti szabályok: Supabase-adatok, eltérő bucketek, CA és ssl-paraméter, `APP_BASE_URL`, élesben kötelező TLS                          |
| `L32_26_env_tavoli_adatbazis.png`   | `server/src/config/env.ts` 74–99. sor                                                                                  | `isRemoteDatabaseUrl` (helyi csak a felsorolt gépnév) és `hasVerifiedDatabaseTls`                                                               |
| `L32_27_prisma_tls.png`             | `server/src/lib/prisma.ts` 33–65. sor                                                                                  | `poolConfig`: `ssl: { ca, rejectUnauthorized: true }` a megadott CA-val                                                                         |
| `L32_28_proxylanc.png`              | `server/src/middleware/proxyChain.ts` 1–37. sor                                                                        | `createProxyChainProbe`: csak a jelölt mérőkérés, IP-cím nélkül, legfeljebb 10-szer                                                             |
| `L32_29_rls_migracio.png`           | `server/prisma/migrations/20261013090000_enable_row_level_security/migration.sql` 1–25. sor                            | RLS minden táblán; a `_prisma_migrations` csak ha létezik                                                                                       |
| `L32_30_render_yaml.png`            | `render.yaml` 1–65. sor                                                                                                | a Blueprint: Docker, ingyenes csomag, Frankfurt, állapotellenőrzés, CI utáni telepítés, a mért `TRUST_PROXY_HOPS=3`, titkok `sync: false`-szal  |
| `L32_31_dockerfile_alap_kliens.png` | `Dockerfile` 15–31. sor                                                                                                | a digesttel rögzített alapkép és a kliens buildje a képpontkorláttal (build-argumentum)                                                         |
| `L32_32_dockerfile_futtatokep.png`  | `Dockerfile` 49–73. sor                                                                                                | a futtatókép: betűkészlet, `MALLOC_ARENA_MAX=2`, csak futtatási függőségek, a CA, `USER node`                                                   |
| `L32_33_elesitesi_parancsok.png`    | `server/scripts/production.ts` 1–66. sor                                                                               | a `production:migrate` és `production:seed`: csak a `.env.production`, CA kötelező, a seed kapcsolóval                                          |
| `L32_40_teszt_tarhely_folyam.png`   | `server/src/services/storage/supabase.storage.test.ts` 170–200. sor                                                    | a tárhely tesztjei: folyam a fejléc méretével, méret nélküli válasz, teljes időkorlát a `read`-re                                               |
| `L32_41_teszt_media.png`            | `server/tests/integration/media.test.ts` 55–102. sor                                                                   | a `/media` tesztjei: IP-korlát, bélyegkép és HEAD, az eredeti soha, szabálytalan útvonalak                                                      |
| `L32_42_teszt_tls_kotelezo.png`     | `server/src/config/env.test.ts`, „élesben a távoli adatbázishoz ellenőrzött TLS kell (L32)”                            | TLS nélkül élesben indulási hiba; helyi és távoli gépnevek; érvénytelen URL értékek nélküli hibával                                             |
| `L32_43_teszt_kozos_sor.png`        | `server/tests/db/admin.photos.test.ts`, „a visszaállítás és a hitelesség-ellenőrzés ugyanazt a közös sort használja”   | egy hellyel a hitelesség-ellenőrzés megvárja a folyamatban lévő visszaállítást                                                                  |
| `L32_44_teszt_rls.png`              | `server/tests/db/schema.test.ts` 279–302. sor                                                                          | az RLS a `public` séma minden tábláján be van kapcsolva                                                                                         |

- Commit: `4c98b93` – `feat(L32): élesítés – Supabase-tárhely és -adatbázis TLS-sel, Render Blueprint, közös képfeldolgozási sor`; a dokumentáció: `docs(L32)`

## Átfogó audit és hibajavítás (L01–L32) (2026-10-15)

- Cél: az L33 előtt a teljes terv (L01–L32) ellenőrzése – minden komponens, a dokumentáció és az élő
  rendszer –, és a talált hibák javítása teszt-először.
- Ellenőrzések és eredményük:
  - `npm run check`: formázás, lint (ESLint + `jsx-a11y`), design-tesztek (22), okosszerződés (21),
    típusellenőrzés mind a négy alprojektben, szerver 78 fájl / 1304 teszt (lefedettség 99,68 /
    98,59 / 99,82 / 99,90%), kliens 61 fájl / 725 teszt (98,69 / 95,17 / 99,17 / 99,25%) – zöld;
  - e2e (Playwright) 5/5 – a javítások előtt és után is;
  - Docker: a kép újraépül, a konténer `healthy` (kb. 99 MiB); a leállítás egy folyamatban lévő
    kérés mellett 0,9 s, a kérés rendben válaszol;
  - `npm audit` mind az öt helyen 0 sérülékenység; titokkeresés a követett fájlokban (értékek
    kiírása nélkül): 22 találat, mind tesztben vagy megjegyzésben álló hamis érték; láthatatlan
    karakter a forráskódban: 3 → 0;
  - élő oldal (https://photochain.onrender.com): `/api/health`, galéria, adatlap a Sepolia-
    tanúsítvánnyal, `/media`, SPA-mélylink, hitelesség-ellenőrző API, biztonsági fejlécek – rendben;
  - a szerződés verifikált forrással: Sourcify és Etherscan „exact match”, Blockscout „verified”;
  - négy független, csak olvasó átnézés párhuzamosan: terv-megfelelés (L01–L32, API-tábla,
    oldaltérkép, adatmodell, képek, FORRASOK), dokumentáció és konfiguráció (környezeti változók,
    parancsok, verziók, CI, Docker/Render, OWASP-hivatkozások, linkek), a szerver
    (TypeScript) és a kliens (React) modulokon átívelő hibái; végül a
    javítások átnézése (kód: elfogadva, 1 közepes – javítva).
  - Az eredmény: a terv minden lépése, mind a 28 API-végpont és mind a 10 oldal megvan; kritikus
    vagy súlyos hiba nem volt.
- Javítva (teszt-először; a piros kimenetek az `AUDIT_01–03` képeken):
  1. **A sikeres fizetés oldala csak a webhookra várt** (közepes): ha a Stripe webhookja késett vagy
     elmaradt (pl. az L14-es élő próbában), a rendelés függő maradt, és csak az újabb „Megveszem”
     zárta le. A Stripe ajánlása szerint a visszatérési oldal is lezárja: a `by-session` lekérdezés
     a függő rendelés munkamenetét a Stripe-tól kérdezi, és ugyanazzal a lezárással (fizetett
     munkamenet, egyező összeg és pénznem) PAID-re, a lejártat EXPIRED-re állítja; ha a Stripe nem
     érhető el, a tárolt állapot jön vissza. (`orders.service.ts` – `reconcileWithStripe`; +7 teszt;
     FORRASOK 300)
  2. **HTTP keep-alive a fordított proxy mögött** (közepes): a Node alapból 5 s üresjárat után bontja
     a kapcsolatot – a Render proxyja ilyenkor lezárt kapcsolatra küldheti a kérést (időnként 502).
     Az üresjárati időkorlát 125 s, a fejléceké 126 s, a kérésé 180 s (`lib/httpTimeouts.ts`;
     FORRASOK 301–302). Az átnézés nyomán: leállításkor a `server.close()` csak a már üresjárati
     kapcsolatokat bontja, a hosszú időkorlát miatt a leállás kb. két percig várhatott volna – a
     `closeGracefully` másodpercenként lezárja az üresjáratba kerülőket (mutációs próbával igazolva:
     nélküle a teszt időtúllépéssel bukik, `AUDIT_09`; a konténerben 0,9 s, `AUDIT_08`).
  3. **A feltöltés közben elhagyott oldal kései válasza** (közepes, kliens): a „Saját képeim” lista
     nem frissült, a „fájl elküldve” bejelentés egy másik oldalon hangzott el (`UploadPage.tsx`).
  4. **A letöltési hivatkozás hibája nyers JSON volt** (alacsony; az L22-ben az L31-re halasztott,
     lezáratlan pont): lejárt munkamenet, levett kép vagy túl sok letöltés esetén a böngésző a
     `{"error":…}` szöveget mutatta. A böngésző navigációja (`Sec-Fetch-Dest: document`) most
     olvasható, magyar nyelvű hibaoldalt kap ugyanazzal a státusszal, a kép adatlapjára (401-nél a
     belépésre is) mutató hivatkozással; a `fetch`/`curl` és minden más útvonal továbbra is JSON-t
     kap (`errorHandler.ts` – `htmlErrorPage`; FORRASOK 303).
  5. **A saját, regisztrálás alatt álló kép adatlapja nem frissült magától** (alacsony): most a
     feltöltés állapotkártyájával azonos ütemben kérdez, és a hitelesítést bemondja; az állapotváltás
     kezelése közös hook lett (`useRegistrationTransition`).
  6. **A kijelentkezés jelzője az előzményekben maradt** (alacsony): egy korábbi kijelentkezés
     bejegyzésére a Vissza gomb megerősítés nélkül hagyhatta el a feltöltést – a jelző már csak a
     kijelentkezés saját (helyettesítő) navigációjára érvényes.
  7. **Láthatatlan karakterek a forrásban** (alacsony): egy NBSP-konstans és két teszt-bemenet
     (U+200B, U+202E – ez utóbbira a GitHub „bidirectional Unicode” figyelmeztetést tesz) szó
     szerint állt a fájlban; most escape-szekvencia, mint a kódbázis többi részében.
  8. Dokumentáció és konfiguráció: a README „Első lépések” csak a gyökér függőségeit telepítette
     (most `npm run install:all`); `JWT_SECRET` a változók táblázatában; a kliens README
     ellentmondása a `jsx-a11y`-ról és a `VITE_IMAGE_MAX_MEGAPIXELS`; `MEDIA_RATE_LIMIT_MAX` a
     `server/.env.example`-ben; a `TRUST_PROXY_HOPS` elavult megjegyzései; az ER-diagram forrása
     (`hiddenBy`, CHECK-ek – `AUDIT_07`; az `L07_17` az L07-es állapotot mutatja); `engines` a
     `blockchain/package.json`-ban; hiányzó forrásmegjegyzések (Dockerfile, `supabase.storage.ts`);
     az OWASP-ellenőrzőlista `fájl:sor` hivatkozásai átszámolva; FORRASOK 300–303.
- Elfogadva, nem javítva (indoklással):
  - a lánc-regisztráció „a rekord már a miénk” ágában nem kerül tranzakció-hash az adatlapra –
    szándékos: ilyenkor nem biztos, melyik tranzakció regisztrált, és egy visszautasított
    tranzakcióra mutató link félrevezető volna;
  - a feltöltés kétértelmű adatbázis-hibájánál (a kapcsolat a véglegesítés után szakad meg) a fájlok
    törlődnek – rendkívül ritka, a fordított esetben árva fájlok maradnának;
  - a tárhely-folyam üresjárati időkorlátja (az L32-ben már elfogadva); a tárhely kiesése 500-at ad
    503 helyett (csak kiesésnél, felhasználói bemenetből nem érhető el);
  - a hosszabb fejléc- és üresjárati időkorlát a proxy nélküli konténerben szélesebb ablakot ad a
    lassú klienseknek – a Compose csak a 127.0.0.1-en hallgat, élesben a proxy véd;
  - a Supabase CA letöltési útvonala három, egymáshoz közeli megfogalmazásban szerepel (a felület
    bejelentkezés nélkül nem ellenőrizhető).
- Az L33-ra marad (a terv szerint ott): a README állapotszövege („fejlesztés alatt”, „tervezett”) és
  mappaszerkezete; a terv 5. fejezete (`/auth/me` vendégnek is 200, `/media`, lekérdezési
  paraméterek) és 13. haladáskövető táblája (a szerző jóváhagyásával); a FORRASOK üres „Lekérve”
  cellái; a napló hiányzó „Commit:” sorai és a szerző által készítendő képek (pl. L02, L03,
  L14_38–40, Render- és Supabase-felület); az eltérő képnevek (`L26_10b`, `L26_1A`); az 5 perces
  demó-forgatókönyv; egy élő tesztvásárlás és több saját fotó a demóhoz; a `docs(L32)` commit és a
  `v1.0.0` tag.
- Képek:

| Kép                                        | Forrás                                                                                                           | Tartalom                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `AUDIT_01_piros_szerver.png`               | `npx vitest run src/lib/httpTimeouts.test.ts tests/db/orders.read.test.ts` (mentett kimenet, kivonat)            | a javítás előtt: a sikeroldali lezárás 2 bukó tesztje, a hiányzó időkorlát-modul        |
| `AUDIT_02_piros_letoltes.png`              | `npx vitest run src/middleware/errorHandler.test.ts tests/db/photos.download.test.ts` (mentett kimenet, kivonat) | a javítás előtt: a hibaoldal 6 bukó tesztje                                             |
| `AUDIT_03_piros_kliens.png`                | három kliens-tesztfutás (mentett kimenet, kivonat)                                                               | a javítás előtt: a kései válasz, az adatlap lekérdezése, a Vissza gomb – bukó tesztek   |
| `AUDIT_04_check.png`                       | `npm run check` (mentett kimenet, kivonat)                                                                       | a végső teljes ellenőrzés: minden zöld, a tesztek száma és a lefedettség                |
| `AUDIT_05_e2e.png`                         | `npm run test:e2e` (mentett kimenet)                                                                             | az öt végponttól végpontig tartó forgatókönyv a javítások után                          |
| `AUDIT_06_egyeb_ellenorzesek.png`          | `npm audit`, titokkeresés, láthatatlan karakterek, élő oldal, Sourcify (mentett kimenet)                         | 0 sérülékenység, csak hamis tesztértékek, 0 láthatatlan karakter, az élő oldal válaszai |
| `AUDIT_07_er_diagram.png`                  | `docs/diagramok/adatmodell.mmd` (`mermaid` mód)                                                                  | az ER-diagram a jelenlegi sémával (`hiddenBy`, CHECK-ek)                                |
| `AUDIT_08_docker.png`                      | `docker compose --profile app up -d --build`, `curl`, a leállítás mérése (mentett kimenet, kivonat)              | a konténer, a letöltés hibaoldala navigációnál és JSON-ként, a leállítás 0,9 s alatt    |
| `AUDIT_09_mutacio_leallitas.png`           | `npx vitest run src/lib/httpTimeouts.test.ts` a takarítás nélkül (mutációs próba)                                | a leállítás tesztje a javítás nélkül időtúllépéssel bukik                               |
| `AUDIT_10_sikeroldali_lezaras.png`         | `server/src/modules/orders/orders.service.ts`, `reconcileWithStripe`                                             | a függő rendelés lezárása a Stripe szerint                                              |
| `AUDIT_11_getbysession.png`                | `server/src/modules/orders/orders.service.ts`, `getBySession`                                                    | csak a saját, függő rendelésnél kérdez a Stripe-tól                                     |
| `AUDIT_12_idokorlatok.png`                 | `server/src/lib/httpTimeouts.ts` 1–50. sor                                                                       | az időkorlátok és a `closeGracefully`                                                   |
| `AUDIT_13_hibaoldal_kero.png`              | `server/src/middleware/errorHandler.ts`, `htmlErrorPage`                                                         | az útvonal kérheti a hibaoldalt, csak navigációnál                                      |
| `AUDIT_14_hibaoldal.png`                   | `server/src/middleware/errorHandler.ts`, `renderErrorPage`                                                       | az önálló, escape-elt hibaoldal                                                         |
| `AUDIT_15_allapotvaltas.png`               | `client/src/upload/useRegistrationTransition.ts`, `useRegistrationTransition`                                    | a közös állapotváltás-kezelés (bemondás, listák frissítése)                             |
| `AUDIT_16_adatlap_lekerdezes.png`          | `client/src/pages/PhotoDetailPage.tsx` 75–91. sor                                                                | az adatlap lekérdezése függő képnél                                                     |
| `AUDIT_17_kijelentkezes_jelzo.png`         | `client/src/pages/UploadPage.tsx` 90–96. sor                                                                     | a kijelentkezés jelzője csak helyettesítő navigációnál                                  |
| `AUDIT_18_teszt_sikeroldal.png`            | `server/tests/db/orders.read.test.ts` 164–231. sor                                                               | a sikeroldali lezárás tesztjei (kifizetett, nyitott, lejárt munkamenet)                 |
| `AUDIT_19_teszt_letoltes_hibaoldal.png`    | `server/tests/db/photos.download.test.ts`, „a letöltési hivatkozás hibája a böngészőben”                         | a hibaoldal tesztjei a valódi letöltési útvonalon                                       |
| `AUDIT_20_letoltes_hibaoldal_bongeszo.png` | a konténer válasza (`curl -H "Sec-Fetch-Dest: document" …/download`), `html` mód                                 | a hibaoldal a böngészőben                                                               |

## L33 – Dokumentáció véglegesítése, demó-forgatókönyv (2026-10-15)

- Kiindulás: a terv feladata – README (telepítés, futtatás, környezeti változók), a végpont-
  dokumentáció frissítése (5. fejezet), a fejlesztési napló és a `FORRASOK.md` lezárása, 5 perces
  védési demó, `v1.0.0` tag. Az átfogó audit (lásd fent) a lezárandó pontokat már összegyűjtötte.
  - A szerző döntései (2026-10-15): a terv **5. és 13. fejezete** is frissüljön (a projekt szabálya
    szerint a terv csak kifejezett kérésre módosítható); a `FORRASOK` üres „Lekérve” cellái csak az
    **ellenőrzött** linkeknél kapjanak dátumot.
- Elkészült:
  - **README:** az állapot („elkészült”, az élő demó címe), „Fő funkciók” a „tervezett” jelző
    nélkül, a technológiák között a CI és az élesítés, a projektstruktúra (`tools/`, `.github/`,
    `Dockerfile`, `render.yaml`), a gyökérszintű scriptek táblája az elavult „Használható” oszlop
    nélkül, és a dokumentációs lista a demó-forgatókönyvvel.
  - **A terv 1.3-as változata:** az 5.1-es tábla a megvalósított API szerint (`/auth/me` vendégnek
    is 200, a lista lekérdezési paraméterei, a nem nyilvános kép láthatósága, a letöltés hibaoldala,
    a `by-session` lezárás, a webhook válasza, az admin végpontok külön sorban, a `/media` az API-n
    kívül); a 13. fejezet táblája: L01–L33 kipipálva, dátummal és commitokkal.
  - **Napló:** a hiányzó „Commit:” sorok (L10–L32) a git-előzményekből; az L02–L09 meglévő sorai a
    commit rövid hash-ével.
  - **FORRASOK – „Lekérve”:** a 114 üres cellából 111 kapott dátumot (2026-10-15) automatikus
    linkellenőrzés után: HTTP 2xx, és a lap címe megfelel a forrásnak; a cím nélküli (szkriptből
    renderelt) oldalaknál kulcsszóra ellenőrizve (npm: `overrides`; ethers: `JsonRpcProvider`,
    `getFunction`, `isError`). Üres maradt: a 44. sor (`tsx.is` – a webhely tanúsítványláncát ez a
    gép nem fogadta el, kézzel ellenőrizendő), valamint a T4 és T5 (nyomtatott folyóiratcikk, URL
    nélkül).
  - **`docs/DEMO_FORGATOKONYV.md`:** előkészítés (szolgáltatások ébresztése, tárca, saját demófotók
    – egy sehol fel nem töltött eredeti és átméretezett másolata –, a fiókok, a teszt kártya), az
    5 perces menet idősávokkal („mit mutass”, „mit mondj”), tartalékok (alvó szolgáltatás, lassú
    lánc, függő fizetés, internet nélkül a látható e2e-futás) és a bemutató utáni teendők. A
    feliratok a felület szövegeivel egyeztetve (pl. „Hiteles, regisztrált kép”, „Sikeres fizetés”).
- Döntések és indoklásuk:
  - a demó a duplikáció-szűrést a még függő képen is bemutathatja (az adatbázis minden állapotú
    képpel összevet), az ellenőrző oldalt viszont csak a „Hitelesítve” után – a hitelesség a lánc
    rekordjából jön;
  - a demó nem a vízjeles előnézetet tölti fel „lopásként” – az L29 szerint sötét képnél ez a
    dHash-t megtévesztheti (a dolgozatban tárgyalt korlát);
  - az eltérő képnevek (`L26_10b`, `L26_1A`) maradnak: a dolgozat szövege már hivatkozhat rájuk.
- A szerzőre marad: a demó előtti ellenőrzés és egy élő tesztvásárlás saját demófotókkal; a
  szerző által készítendő képek (L02_01–02, L03_01–04, L14_38–40, Render- és Supabase-felület, Etherscan,
  Prisma Studio, Docker Desktop, zöld CI); a 44. forrás ellenőrzése; a commitok, a push és a
  `v1.0.0` tag.
- Képek:

| Kép                            | Forrás                                                               | Tartalom                                                      |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `L33_01_linkellenorzes.png`    | `node check-sources.mjs docs/FORRASOK.md` (összesítés, jegyzetmappa) | a linkellenőrzés: 111 elérhető forrás, a kimaradók és az okuk |
| `L33_02_api_tabla.png`         | `docs/FEJLESZTESI_TERV.md` 347–383. sor (HTML-ként renderelve)       | a terv 5.1-es API-táblája a megvalósítás szerint              |
| `L33_03_haladas_tabla.png`     | `docs/FEJLESZTESI_TERV.md` 987–1023. sor (fejlesztői repó)           | a 13. fejezet: L01–L33 kipipálva, dátummal és commitokkal     |
| `L33_04_demo_elokeszites.png`  | `docs/DEMO_FORGATOKONYV.md` 1–50. sor (HTML-ként renderelve)         | a demó előkészítése                                           |
| `L33_05_demo_forgatokonyv.png` | `docs/DEMO_FORGATOKONYV.md` 51–63. sor (HTML-ként renderelve)        | az 5 perces menet idősávokkal                                 |
| `L33_06_demo_tartalekok.png`   | `docs/DEMO_FORGATOKONYV.md` 64–80. sor (HTML-ként renderelve)        | tartalékok és a bemutató utáni teendők                        |
| `L33_07_readme_allapot.png`    | `README.md` 1–24. sor (fejlesztői repó)                              | az állapot és a fő funkciók                                   |
| `L33_09_format_check.png`      | `npm run format:check`                                               | a formázás ellenőrzése a lezárás után                         |

- Commit: a lezáró `docs(L33)` commitban; utána a `v1.0.0` tag.

## Tiszta telepítés ellenőrzése és kipróbálási útmutató (2026-10-19)

- Kiindulás: a szerző célja – a projekt a témavezetőnek átadott példány alapján is működjön.
  A projektet egy git nélküli, tiszta mappába másolt példányon próbáltuk végig, ahogy egy külső
  ellenőrző tenné: új függőségtelepítés, `.env` a sablonokból, **külső fiókok nélkül** (helyi
  Hardhat-lánc a nyilvánosan ismert 0. fejlesztői fiókkal, helyettesítő `sk_test_…` Stripe-kulcs,
  véletlen jelszavak), saját, elkülönített adatbázis-konténer.
- Eredmény a javítások után:
  - `npm run install:all`: 0 sebezhetőség mind az öt helyen;
  - `npm run check`: formázás, lint, típusok hibátlan; 22 design-, 21 szerződésteszt; a szerveren
    78 tesztfájl, 1304 teszt (99,68 / 98,59 / 99,82 / 99,90%), a kliensen 61 tesztfájl, 725 teszt
    (98,69 / 95,17 / 99,17 / 99,25%) – ugyanaz, mint a fejlesztői gépen;
  - `npm run test:e2e`: a setup egységtesztjei (5, az átnézés után 6), majd 4 sikeres, 1 kihagyott
    (a vásárlás) teszt;
  - `npm run build`: hibátlan;
  - helyi indítás (`npm run node`, `npm run deploy:local`, `npm run dev`): belépés a seedelt demó
    fotóssal, egy saját fotó feltöltése → a helyi láncon `REGISTERED` (2. blokk), ugyanaz újra →
    409 `DUPLICATE_EXACT`, a nyilvános ellenőrzés → `VERIFIED`; az adatlap a böngészőben „Hitelesítve
    a blokkláncon” tanúsítvánnyal;
  - `npm run docker:up`: az alkalmazáskonténer egészséges, a felületet és az API-t kiszolgálja; a
    helyi lánc a konténerből nem érhető el (a README szerint várt, figyelmeztetésként naplózva).
- Talált hibák és javításuk (teszt-először, ahol a hiba kódban volt):
  - **e2e és helyettesítő Stripe-kulcs:** a szerver Stripe-kulcs nélkül el sem indul, ezért saját
    Stripe-fiók híján helyettesítő érték kerül a `server/.env`-be. Az e2e-környezet csak a kulcs
    meglétét nézte, így a vásárlás forgatókönyve nem maradt ki, hanem 45 s után időtúllépéssel
    bukott, és a soros futás miatt az utolsó teszt el sem indult (`TELEP_01`: 3 sikeres, 1 bukott,
    1 nem futott). Javítás: `e2e/setup/stripeKey.ts` – egy ingyenes, csak olvasó Stripe-lekérdezés
    (az egyenleg) dönti el, hogy a Stripe elfogadja-e a kulcsot; hiányzó, elutasított kulcsnál vagy
    elérhetetlen Stripe-nál a forgatókönyv indoklással kimarad. Előbb a bukó egységteszt
    (`stripeKey.test.ts`, `node:test` – a modul hiánya miatt piros), utána a megvalósítás (5 zöld
    teszt); az e2e `npm test` ezeket a Playwright előtt futtatja (a CI is). Utána: 4 sikeres,
    1 kihagyva (`TELEP_04`).
  - **`npm run dev` – a szerver nem indult:** a `tsx watch` ezen a gépen (Node 24.17.0, tsx 4.23.15 –
    a legfrissebb kiadás) egy egysoros próbafájlt sem futtatott le; a kliens elindult, a szerver
    nem, a Vite proxyja 502-t adott. A `node --import tsx src/server.ts` másodpercek alatt elindult.
    Javítás: a Node beépített figyelőmódja (`TELEP_05`):
    `node --watch --watch-preserve-output --import tsx src/server.ts`; próbával igazolva, hogy egy
    importált `.ts` fájl módosításakor újraindul, a `--watch-preserve-output` pedig a közös
    terminálban megtartja a kliens kiírásait (`TELEP_06`).
  - **Dokumentáció:** új [kipróbálási útmutató](KIPROBALAS.md) – telepítés, beállítások, adatbázis,
    ellenőrzések a mért eredménnyel, helyi indítás, konténer, saját Sepolia-telepítés (előbb a
    szerző Ignition-naplóját kell törölni), hibaelhárítás; a README hivatkozik rá.
    Pontosítások: a `storage.types.ts` megjegyzése a tervet rossz lépéssel
    idézte (L16 → L18); a `.vscode/settings.json` megjegyzése mind a négy alprojektnek
    ESLint-konfigurációt tulajdonított (csak a kliensnek és a szervernek van); FORRASOK
    304–305 (Stripe API, Node `--watch`).
- Átnézés a commit előtt (három független, csak olvasó átnézés – e2e-javítás, `dev` script,
  dokumentáció –, minden találatot külön ellenőrzés vizsgált):
  - e2e, teszt-először (előbb 2 bukó egységteszt, majd zöld): a szerver szabályának nem megfelelő
    kulcsot (pl. élő `sk_live_…`, ékezetes helyettesítő) a próba el sem küldi a Stripe-nak (új
    `invalid` állapot); a kihagyott teszt a tényleges okot írja ki (hiányzó, nem teszt módú vagy
    elutasított kulcs, illetve elérhetetlen Stripe) – a globalSetup adja át
    (`E2E_STRIPE_SKIP_REASON`). Végső futás az eredeti repóban, helyettesítő kulccsal: 6
    egységteszt, 4 sikeres, 1 kihagyott e2e-teszt (`TELEP_08`);
  - útmutató: a vásárláshoz kötött letöltés és értékelés Stripe-kulcs nélkül szintén nem próbálható
    ki; az `export-abi` csak a meglévő telepítési naplókból dolgozik (a helyi lánc címéhez előbb
    `npm run deploy:local` kell);
  - a `dev` script váltása: nincs rá más hivatkozás (Docker, CI, e2e a lefordított szervert
    indítja), a `.env`-et a szerver maga tölti be;
  - útmutató, a tiszta példányra: ott még 5 egységteszt futott (a hatodik az átnézés után került
    be); a saját Sepolia-telepítésnél a szerző naplója nélkül az Ignition a korábbi telepítést
    próbálná folytatni, és a más telepítő fiók miatt hibával leállna.
- Képek:

| Kép                                         | Forrás                                                                         | Tartalom                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `TELEP_01_e2e_helyettesito_kulcs_piros.png` | `npm run test:e2e` a tiszta példányon, a javítás előtt (mentett kimenet)       | a vásárlás időtúllépéssel bukik, az utolsó teszt el sem indul                     |
| `TELEP_02_stripe_kulcs_ellenorzes.png`      | `e2e/setup/stripeKey.ts` 1–50. sor                                             | a Stripe-kulcs ellenőrzése és a kimaradás indoklásai                              |
| `TELEP_03_stripe_kulcs_tesztek.png`         | `e2e/setup/stripeKey.test.ts` 1–74. sor                                        | az egységtesztek (hiányzó, nem teszt módú, elfogadott, elutasított, elérhetetlen) |
| `TELEP_04_e2e_zold.png`                     | `npm run test:e2e` a javítás után (mentett kimenet)                            | 5 egységteszt, majd 4 sikeres, 1 kihagyott e2e-teszt                              |
| `TELEP_05_dev_script.png`                   | `server/package.json` 10–13. sor                                               | a `dev` script a Node beépített figyelőmódjával                                   |
| `TELEP_06_helyi_inditas.png`                | `npm run dev` a tiszta példányon (a terminál kimenetének kivonata)             | indulás, majd feltöltés, regisztráció a helyi láncon, 409, ellenőrzés             |
| `TELEP_07_check_osszesites.png`             | `npm run check` a tiszta példányon (az összesítő sorok)                        | a formázás, a design-, szerződés-, szerver- és klienstesztek eredménye            |
| `TELEP_08_e2e_vegso.png`                    | `npm run test:e2e` az eredeti repóban, helyettesítő kulccsal (mentett kimenet) | az átnézés utáni javításokkal: 6 egységteszt, 4 sikeres, 1 kihagyott              |

- Commit: `0d79bff` – `fix(kiprobalas)` (az e2e és a `dev` script); a dokumentáció a lezáró
  `docs(kiprobalas)` commitban.

## Témavezetői észrevételek javítása: előnézet-kiszolgálás, degenerált dHash, hasonló találat (2026-10-27)

- Kiindulás: a témavezető a nyilvános példány átnézése után három hibát jelzett:
  1. **A letiltott fotós előnézeti képei közvetlen URL-en elérhetők maradtak.** A tiltás nem
     törli az előnézeti fájlokat (a feloldás után vissza kell jönniük), a `/media` útvonal pedig
     csak azt nézte, megvan-e a fájl a tárhelyen – egy egyszer megismert URL új HTTP-kérésre is
     működött. (Az OWASP-lista 6. fejezete ezt eddig elfogadott kockázatként tartotta nyilván.)
  2. **Két különböző, nem egyszínű kép duplikátumnak minősült.** Egy 600 × 600-as függőleges
     fényességátmenet és egy vízszintes sávokból álló kép: mindkettő átment az egyszínűség-szűrőn,
     az SHA-256-uk eltért, a dHash-ük mégis `0000000000000000` lett, így a második feltöltést a
     szolgáltatás `DUPLICATE_SIMILAR` hibával utasította el. Az ok: a dHash soronként a szomszédos
     cellákat veti össze, a soron belül állandó fényességű képnél minden összehasonlítás 0 –
     a kép egészének fényességtartománya ezt nem szűri ki.
  3. **Az ellenőrző kihagyhatott érvényes hasonló találatot.** A `findSimilar` a legközelebbi
     adatbázisbeli jelöltnél megállt: ha azt a lánc nem erősítette meg (vagy közben elrejtették),
     `NOT_FOUND` lett az eredmény akkor is, ha volt második, küszöbön belüli, érvényes jelölt.
- Reprodukálás és mérés (jegyzetmappa, `measure-dhash.mjs` – `JAV_13`): a két példakép mása
  9 × 8-as rácsának minden vízszintes szomszédpárja 0 különbségű (hash `0000…`), miközben a kép
  egészének fényességtartománya 168, illetve 225 – a régi szűrő (globális tartomány ≥ 16) ezért
  engedte át őket. A saját tesztfotókon (és 600 képpontos másolataikon) 5–8 sorban legalább 16 a
  soron belüli tartomány; a képpontzajban és az egyetlen folttal kiegészített átmenetben 0–2.
- Javítások, teszt-elsővel (a piros futások: `JAV_01`–`JAV_03`):
  1. **`/media` – a kép láthatóságának ellenőrzése a kiszolgálás előtt**
     (`server/src/middleware/mediaAccess.ts`, `app.ts`): a fájl neve a kép azonosítója (a
     feltöltés így nevezi el a fájlokat), ezért a kép az elsődleges kulcsán kereshető; a kért
     kulcsnak a kép saját kulcsai közt kell lennie (árva fájl nem adható ki). Ugyanaz a szabály,
     mint az adatlapon (`photos.visibility.ts`): a nyilvános képet bárki, a többit csak a
     tulajdonosa és az admin kapja meg – a munkamenetet csak a nem nyilvános képnél tölti be
     (`sessionViewer`, `auth.ts`), a letiltott tulajdonos névtelen néző –, másnak 404, ugyanaz,
     mint a nem létező képre. Csak a pontosan `/<previews|thumbnails>/<UUID>.<jpg|png|webp>` alakú
     útvonal jut az adatbázisig; a tesztek két további rést is megmutattak, amelyet az
     `express.static` eddig kiszolgált: a dupla perjeles (`//previews/…`) és a nagybetűs
     azonosítójú útvonalat (Windows alatt a fájlrendszer nem különbözteti meg a kis- és
     nagybetűt). Minden kérés adatbázis-lekérdezés, ezért az IP-címenkénti korlát
     (`MEDIA_RATE_LIMIT_MAX`) és a `Cache-Control: private, max-age=300` fejléc most helyi
     tárhelynél is érvényes (eddig csak a távolinál); a nem nyilvános kép és a 404 válasza
     `no-store`. A még regisztrációra váró (`PENDING_CHAIN`, `CHAIN_FAILED`) kép előnézete
     ezentúl szintén csak a kezelőjének jár; a vásárlásaim listában a letiltott fotós képének
     bélyegképe `null` (`orders.dto.ts` – a kliens különben, az admin vásárlót kivéve, 404-gyel
     végződő kérést küldene). Az elrejtés továbbra is törli a nyilvános fájlokat. A `/media` tesztjei a tesztadatbázisra
     kerültek (`tests/db/media.test.ts`, 36 teszt: helyi és távoli tárhely, tiltás, állapotok,
     rejtett kép senkinek (a kezelőjének sem), árva fájl, a lekérdezések száma, szabálytalan útvonalak
     munkamenettel is az adatbázis érintése nélkül, HEAD, csak olvasás, korlát), az őr
     egységtesztjei külön (`mediaAccess.test.ts`, 21 teszt); a tesztadatok (`createPhoto`)
     kulcsai a kép azonosítójából képződnek, mint a feltöltésnél.
  2. **Informatív sorok** (`imageAnalysis.ts`, `hashing.service.ts`: `rowBrightnessRanges`,
     `dHashRowBytes`): a kép egészének tartománya helyett soronként – egy sor akkor informatív,
     ha a tartománya ≥ 16, és a bájtja nem csupa 0 vagy csupa 1 bit (a balról jobbra végig
     világosodó vagy sötétedő sor – vízszintes, átlós átmenet – ugyanúgy nem különböztet meg
     képeket, mint az egyszínű); legalább 3 informatív sor kell, különben `400 LOW_DETAIL_IMAGE`
     („A kép túl kevés részletet tartalmaz (egyszínű, vagy csak egy irányban változik) – nem
     tölthető fel / ellenőrizhető”). A témavezető két példaképének mása a tesztben eltérő
     SHA-256-ot és azonos, csupa 0 dHash-t ad, utána mindkettő 400-at kap; ugyanígy a vízszintes,
     a fordított és az átlós átmenet, a képpontzaj és a folttal kiegészített átmenet; a három
     saját tesztfotó a rögzített dHash-sel átmegy, és 9 × 8 cellás határmintákon pontosan 3
     informatív sor még elfogadott, 2 – vagy 2 + egy végig világosodó, illetve 2 + egy kis
     tartományú sor – már nem.
  3. **A jelöltek vizsgálata távolság szerint sorban** (`verification.service.ts`,
     `hashing.service.ts` `rankByDistance` – stabil rendezés, egyenlő távolságnál a korábban
     feltöltött kép elöl; azonos időpontnál az azonosító dönt, a feltöltésnél is): a küszöbön
     belüli jelölteket sorban erősíti meg a láncon, az első megerősített a találat (a saját
     távolságával), utána megáll; a kieső jelölt nyoma a naplóban marad. A lánc által meg nem
     erősített, a más tulajdonosú és a közben elrejtett legközelebbi jelölt után is a következő
     jön; a küszöbön kívüli jelöltre a láncot nem kérdezi. Kérésenként legfeljebb
     `MAX_SIMILAR_CANDIDATES` (5) jelöltet erősít meg – a feltöltés a hasonló képeket elutasítja,
     így ennél több jelölt csak kivételesen lehet; ha a megvizsgáltak egyikét sem erősíti meg a
     lánc, és maradt vizsgálatlan jelölt, figyelmeztetés kerül a naplóba. A `findClosest` a
     feltöltésnél változatlan.
- Átnézés a commit előtt: négy független, csak olvasó átnézés (helyesség, biztonság,
  tesztminőség, a témavezető szemszöge: lezárt-e mindhárom észrevétel), majd a találatok külön
  ellenőrzése – az ellenőrző kör félbeszakadt, ezért a legtöbb találatot kézi ellenőrzés bírálta
  el. Javítva, teszt-elsővel: a vízszintes és átlós átmenet még átment a soronkénti tartomány
  szabályán (magas – a sor bitjei is számítanak); a 4 sor túl szigorú volt (a gyertyás tesztfotó
  20 %-kal sötétebb másolata 3 sorral kiesett volna – a küszöb 3); a tesztekben a „nem létező
  kép” azonosítója egybeesett a létezővel (a válasz önmagával volt összevetve), a feltöltés-teszt
  névtelen 404-e versenyhelyzetes volt (a regisztráció a válasz előtt indul – most a regisztráció
  megvárása után 200), a lekérdezés-számláló pozitív kontroll nélkül állt, a legközelebbi jelölt
  megerősítése utáni megállás és a küszöbön belüli jelölt olvasása nem volt rögzítve, a korlát
  tesztje a küszöbtől függött; a munkamenet minden képkérésnél betöltődött (most csak a nem
  nyilvános képnél); a nem nyilvános kép és a 404 válasza gyorsítótárazható volt (`no-store`);
  a rendelés bélyegkép-URL-je a letiltott fotós képénél; a korlát figyelmeztetése a ciklus előtt
  (akkor is, ha az első jelölt igazolt); a jelöltek sorrendje azonos időpontnál; a kommentek
  pontatlanságai. Elfogadva, indoklással: egy ellenőrzés legfeljebb 1 + 5 láncolvasás (egy
  IP-cím 20 kérése a közös 200-as keret 60 %-a; a keret kimerülése 503, nem hamis `NOT_FOUND` –
  a `MAX_SIMILAR_CANDIDATES` megjegyzése rögzíti); a `/media` IP-korlátja helyi tárhelynél
  (600 / 15 perc, a nyilvános kép 5 percig a böngésző gyorsítótárában – mint az élesítés óta);
  a láncon meg nem talált jelölt nem kerül a megjegyzett rekordok közé (bármikor
  regisztrálhatják).
- Dokumentáció: OWASP-lista (az A01 tétel „Elfogadott”-ról „Javítva”-ra, a 6. fejezet tétele
  törölve, új 8. fejezet, az `app.ts`, a `photos.catalog.ts` és a `mediaProxy.ts` elcsúszott
  sorhivatkozásai), `RESZLETES_LEIRAS.md` (feltöltés, hibakódok, `SIMILAR`, élesítés,
  `MEDIA_RATE_LIMIT_MAX`), `server/.env.example`, FORRASOK 306–307. A fejlesztési terv 5.1
  pontjának mondata (`GET /media/:folder/:file` – „helyi tárhelynél statikus fájlként”) a terv
  szabálya szerint változatlan maradt.
- Ellenőrzés: `npm run check` – formázás, lint, típusok hibátlan; 22 design-, 21 szerződésteszt;
  a szerveren 79 tesztfájl, 1375 teszt (99,47 / 98,18 / 99,83 / 99,71 %), a kliensen 61 fájl,
  725 teszt (98,69 / 95,17 / 99,17 / 99,25 %) – `JAV_14`, `JAV_15`; `npm run test:e2e`: 6
  setup-egységteszt, 4 sikeres, 1 kihagyott (Stripe-kulcs nélkül) e2e-teszt – `JAV_16`. Ugyanez a
  javítás az eredeti fejlesztői repóban is (a kód, a tesztek és a dokumentáció azonos).
- Záró audit a leadás előtt (2026-10-28), négy független, csak olvasó vizsgálattal: tiszta példány
  telepítése és teljes ellenőrzése (`install:all`, `check`, `test:e2e`, `build` – mind hibátlan);
  fekete dobozos próba a lefordított szerveren, lánc nélkül (két futás, 133 kérés a `/media` és a
  hitelesség-ellenőrzés végpontjaira: 101 a várt válasz, 29 tájékoztató, 3 eltérés – kettőt nyers
  kéréssel megismételve 404, ahogy kell: a HTTP-kliens normalizálta a `..` útvonalat, az Express
  útvonala kis- és nagybetűre érzéketlen; a harmadik a kezelő feltételes kérésére 304 helyett
  adott teljes 200, a nem nyilvános kép `no-store` válaszánál a gyorsítótárazás nem cél); mutációs
  próba a három javításon (14 szándékos hibából a tesztkészlet mind a 14-et elkapta); a kliens és a dokumentáció egyeztetése a szerverrel. Egy apró
  hiba derült ki, teszt-elsővel javítva: a rejtett kép fájljára a kezelője más választ kapott, mint
  bárki más – amíg a fájl megvolt (elrejtés vagy visszaállítás közben), 200-at, a törlése után az
  általános 404-oldalt a `/media` egyforma 404-e helyett –; most a rejtett kép fájlja senkinek nem
  jár (az adatlap sem ad rá URL-t), és a lánc végén a `mediaFileMissing` a látható kép hiányzó
  fájljára is ugyanazt a `no-store` 404-et adja (`mediaAccess.ts`, `app.ts`;
  `mediaAccess.test.ts` 21, `media.test.ts` 36 teszt). A dokumentáció elavult számai (tesztek,
  lefedettség) és elcsúszott sorhivatkozásai (OWASP-lista: `auth.ts`, `env.ts`, `app.ts`,
  `mediaProxy.ts`) frissítve.
- Függőségek (`npm audit`, 2026-10-28): az L30 óta megjelent tanácsadások – a `server/`-ben 10
  (4 magas: `zod`, `body-parser`, `multer`, `vite`; 6 mérsékelt: `@vitest/mocker`, `fast-uri`,
  `ip-address`, `qs`), a `client/`-ben 2 magas (`undici`, `zod`), a `blockchain/`-ben 15 (1 alacsony,
  14 magas: `undici`, `serialize-javascript`, `zod`). `npm audit fix` a meglévő verziótartományon
  belül (csak a lockfile-ok; a `vitest` és a `@vitest/coverage-v8` alsó határa ^5.0.5-re emelve):
  a gyökér, a `server/`, a `client/` és az `e2e/` 0; a `blockchain/`-ben 13 magas marad – egyetlen
  tanácsadás (`zod` < 4.6.6, GHSA-mrhx-c7xc-m3w5) a Hardhat 3 eszközláncán át, javítás nélkül;
  csak a szerződés fejlesztői eszköze, a futó szervert nem érinti (a szerver `zod`-ja 4.6.7) –
  elfogadva, részletezve az OWASP-lista 3.1 pontjában és a `KIPROBALAS.md`-ben. A frissített
  függőségekkel a teljes ellenőrzés újra lefutott (`JAV_14`–`JAV_16`).
- Képek:

| Kép                             | Forrás                                                                                                                              | Tartalom                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JAV_01_piros_kepelemzes.png`   | `npx vitest run --project unit …hashing.service.test.ts …imageAnalysis.test.ts` a javítás előtt (mentett kimenet)                   | 9 bukó teszt: a két új függvény hiánya, a degenerált képek elfogadása                                                                                                  |
| `JAV_02_piros_ellenorzo.png`    | `npx vitest run --project db tests/db/verification.test.ts -t "a jelöltek vizsgálata …"` a régi `findSimilar`-ral (mentett kimenet) | a második jelöltet nem vizsgálja: `NOT_FOUND` (4 bukó teszt)                                                                                                           |
| `JAV_03_piros_media.png`        | `npx vitest run --project db tests/db/media.test.ts` a régi bekötéssel (mentett kimenet)                                            | 11 bukó teszt: a letiltott fotós és a nem nyilvános kép, a dupla perjeles és a nagybetűs útvonal kiszolgálva                                                           |
| `JAV_04_media_access_or.png`    | `server/src/middleware/mediaAccess.ts` 83–143. sor                                                                                  | a lánc végének 404-e (`mediaFileMissing`) és a `/media` őre: metódus, útvonal, a kép és a kulcs, a rejtett kép, a láthatóság; a munkamenet csak a nem nyilvános képnél |
| `JAV_05_media_bekotes.png`      | `server/src/app.ts` 239–270. sor                                                                                                    | a `/media` bekötése: IP-korlát, őr, `express.static` (`private`, ha nincs `no-store`) vagy a tárhely továbbítása, a lánc végén a hiányzó fájl 404-e                    |
| `JAV_06_kepelemzes_szabaly.png` | `server/src/services/imageAnalysis.ts` 31–51. sor                                                                                   | az egységes sorbájtok és a 3 informatív sor szabálya, a mérésekkel                                                                                                     |
| `JAV_17_informativ_sorok.png`   | `server/src/services/imageAnalysis.ts` 108–115. sor                                                                                 | `hasUsableFingerprint`: tartomány ≥ 16 és nem egységes bájt                                                                                                            |
| `JAV_07_sorok_fenyessege.png`   | `server/src/services/hashing.service.ts` 185–197. sor                                                                               | `rowBrightnessRanges`                                                                                                                                                  |
| `JAV_08_rendezes_tavolsag.png`  | `server/src/services/hashing.service.ts` 157–172. sor                                                                               | `rankByDistance` (stabil rendezés)                                                                                                                                     |
| `JAV_09_ellenorzo_jeloltek.png` | `server/src/modules/verification/verification.service.ts` 329–364. sor                                                              | `findSimilar`: a jelöltek sorban, a korlát és a naplósor                                                                                                               |
| `JAV_10_teszt_media_tiltas.png` | `server/tests/db/media.test.ts` 165–192. sor                                                                                        | a letiltott fotós fájljai: 404 a tiltás alatt (`no-store`), 200 az adminnak és a feloldás után; a fájl megmarad                                                        |
| `JAV_11_teszt_degeneralt.png`   | `server/src/services/imageAnalysis.test.ts` 130–136. sor                                                                            | a témavezető két képének mása: eltérő SHA-256, azonos csupa 0 dHash                                                                                                    |
| `JAV_12_teszt_jeloltek.png`     | `server/tests/db/verification.test.ts` 502–529. sor                                                                                 | a lánc által meg nem erősített legközelebbi jelölt után a következő a találat                                                                                          |
| `JAV_13_meres_racs.png`         | `node measure-dhash.mjs` (jegyzetmappa, mentett kimenet)                                                                            | a 9 × 8-as rács statisztikái a tesztfotókon és szintetikus képeken                                                                                                     |
| `JAV_14_szerver_tesztek.png`    | `npm run coverage` a `server` mappában (az `npm run check` mentett kimenetéből)                                                     | 79 tesztfájl, 1375 teszt, a lefedettség                                                                                                                                |
| `JAV_15_check.png`              | `npm run check` (az összesítő sorok)                                                                                                | formázás, lint, design- és szerződéstesztek, típusok, a szerver és a kliens lefedettsége                                                                               |
| `JAV_16_e2e.png`                | `npm run test:e2e` (mentett kimenet)                                                                                                | 6 setup-egységteszt, 4 sikeres, 1 kihagyott e2e-teszt                                                                                                                  |

- Commit: a szerző döntése után.
