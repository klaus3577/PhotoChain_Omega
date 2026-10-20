# A szakdolgozat írott részének vázlata – PhotoChain

Ez a vázlat a dolgozat szövegének **szerkezetét és tartalmi pontjait** adja: fejezetenként mit érdemes
leírni, és a repóban mi szolgál hozzá alapanyagként (napló, mérések, ábrák, képernyőképek, források).
A dolgozat szövege ebből, saját megfogalmazásban készül; a fejezetszámozás és a terjedelem a kar
formai előírásaihoz igazodik, az oldalszámok csak arányjavaslatok.

Jelölések: **Alapanyag** – a repó fájljai; **Ábra** – meglévő kép vagy diagram (`docs/screenshots/`,
`docs/diagramok/`); **Forrás** – a `docs/FORRASOK.md` sora, illetve a terv [Sxx] jelölése.

---

## Előrészek

- Címlap, eredetiségi nyilatkozat (a kar sablonja szerint).
- Tartalomjegyzék, ábrajegyzék, táblázatjegyzék.
- **Kivonat** magyarul és angolul (fél–egy oldal): probléma (képlopás, eredetigazolás), megoldás
  (SHA-256 + dHash ujjlenyomat, Ethereum-okosszerződés, webes piactér), eredmények (működő, élesített
  prototípus; robusztussági és költségmérés), korlátok.

## 1. Bevezetés _(2–3 oldal – a meglévő szöveg kiegészítése)_

- A probléma: digitális fotók másolása és újrafeltöltése piactereken; a szerző nehezen igazolja az
  elsőbbségét.
- A cél: demonstrációs piactér, amely feltöltéskor ujjlenyomatot készít, a duplikátumot és a
  módosított másolatot elutasítja, és az eredetet nyilvános blokkláncon rögzíti.
- A dolgozat felépítése (egy bekezdés fejezetenként).
- **Alapanyag:** `docs/FEJLESZTESI_TERV.md` fejléc és 1. fejezet.

## 2. Elméleti háttér _(10–14 oldal – a meglévő szöveg ellenőrzése a hivatkozásokkal)_

### 2.1 Kriptográfiai hash-függvények

- Az SHA-256 tulajdonságai (determinisztikus, lavinahatás, ütközésállóság); miért csak a bitre azonos
  fájlt ismeri fel. **Forrás:** T1 (FIPS 180-4) [S39], Node.js crypto (74. sor).

### 2.2 Perceptuális hash-ek és a Hamming-távolság

- aHash, dHash, pHash röviden; a dHash lépései (szürkeárnyalat → 9×8 → szomszédos pixelek
  összevetése → 64 bit); a Hamming-távolság és a küszöb szerepe.
- **Ábra:** `L09_05_dhash_lepesek_gitar.png`, `L09_06_dhash_lepesek_gyertyak.png`,
  `L09_10_dhash_bitek.png`, `L09_11_hamming_kuszob.png`.
- **Forrás:** T2, T3 (Krawetz 2013, 2011) [S40, S41], T7 (Zauner 2010) [S42], T4 (Hamming 1950)
  [S43], T5 (Wegner 1960) [S44].

### 2.3 Blokklánc és okosszerződések

- Elosztott főkönyv, konszenzus röviden; Ethereum, okosszerződés, gáz és díj; tesztháló (Sepolia),
  főhálózat és L2; a megmásíthatatlanság következményei.
- **Forrás:** a terv [S45]–[S47] (Nakamoto, Buterin, Wood), ethereum.org (13. és 97. sor), a
  Solidity- és az OpenZeppelin-dokumentáció.

### 2.4 Adatvédelem a blokkláncon

- Miért nem kerülhet személyes adat a láncra (törölhetetlenség); álnevesítés (`keccak256(userId)`).
- **Forrás:** T6 (EDPB 02/2025) [S49].

### 2.5 Kapcsolódó megoldások

- C2PA / Content Credentials, stockfotó-oldalak vízjelezése; miben más a PhotoChain (platformon belüli,
  feltöltéskori ellenőrzés, nyilvános bizonyíték). **Forrás:** a terv [S48].

## 3. Rendszerterv _(8–12 oldal)_

### 3.1 Követelmények

- Funkcionális (10 pont) és nem funkcionális követelmények (biztonság, adatvédelem, használhatóság,
  karbantarthatóság, hordozhatóság). **Alapanyag:** terv 1.2, 1.3.

### 3.2 Szereplők és használati esetek

- Vendég, regisztrált felhasználó (fotós és vásárló), adminisztrátor, külső rendszerek.
- **Ábra (új, javasolt):** használati eset diagram. **Alapanyag:** terv 1.1, 5.2.

### 3.3 Architektúra és tervezési döntések

- SPA + REST API, rétegzett backend, egy origin (az Express szolgálja ki a klienst), platform-tárca, csak
  hash a láncon, kettős hash, háttérben futó lánc-regisztráció, tárhely-absztrakció.
- **Táblázat:** a D1–D12 döntések indoklással és az elvetett alternatívákkal (terv 3.4).
- **Ábra:** architektúra (terv 3.1, Mermaid), telepítési ábra (`L32_15_telepitesi_abra.png`).

### 3.4 Technológiaválasztás

- Rétegenként a választás és az indoklás (terv 2.1); a pontos verziók a `package.json` fájlokból.

### 3.5 Adatmodell

- Táblák, kapcsolatok, egyedi megszorítások, CHECK-ek (pl. kisbetűs hex hash, `hiddenBy` csak rejtett
  képnél), a részleges egyedi index (egy élő rendelés vevőnként és képenként).
- **Ábra:** `AUDIT_07_er_diagram.png` (a végleges séma; forrás: `docs/diagramok/adatmodell.mmd`).

### 3.6 A hitelesítési mechanizmus

- Feltöltés → SHA-256 + dHash → adatbázis- és láncellenőrzés → 409 vagy mentés → háttérben
  regisztráció → `REGISTERED`; a `PhotoRegistry` interfésze (terv 4.1).
- **Ábra:** a feltöltés szekvenciadiagramja (terv 3.2), a vásárlásé (terv 3.3).

### 3.7 A felhasználói felület terve

- Drótvázak (asztali és mobil), design tokenek, a „bizalom” vizuális nyelve, WCAG 2.2 AA kontraszt.
- **Ábra:** `L17_13_stilusutmutato.png`, `L17_14_drotvaz_galeria.png`, `L17_16_drotvaz_adatlap.png`,
  `L17_04_kontraszt_ellenorzes.png`. **Alapanyag:** `docs/design/README.md`.

## 4. Megvalósítás _(15–22 oldal)_

### 4.1 Fejlesztési módszertan és környezet

- **Lépésenkénti terv:** 8 fázis, 33 lépés (L01–L33); minden lépésnek ellenőrizhető „Kész, ha”
  feltétele volt; a haladás a terv 13. fejezetében és a fejlesztői repó git-előzményeiben követhető.
- **Tesztvezérelt fejlesztés:** minden funkcióhoz előbb bukó teszt (a „piros” kimenetek a
  képernyőképeken, pl. `L32_01_piros_tesztek.png`), majd a megvalósítás.
- **Ellenőrzés:** az L07–L32 lépések után **független kódátnézések** ellenőrizték a változásokat –
  általános kód- és TypeScript/React-átnézés, biztonsági átnézés, akadálymentességi átnézés –, a
  talált hibák javítása teszt-először történt, a változtatásokat a szerző nézte át és fogadta el. A
  lépéseket automatikus ellenőrzések zárták (formázás, lint, típusellenőrzés, tesztek
  lefedettséggel); egyes lépéseknél ehhez mutációs, fekete dobozos és fuzz-próba is társult. A
  fejlesztés végén egy **átfogó audit** a teljes rendszert ellenőrizte (terv-megfelelés,
  dokumentáció, szerver, kliens), és hét hibát talált – mindegyik javítása teszt-először történt
  (lásd 5.5).
- Fejlesztői környezet, verziókezelés, konvenciók (Conventional Commits), CI (GitHub Actions).
- **Ábra (új, javasolt):** egy lépés munkafolyamata (terv → bukó teszt → megvalósítás → átnézések
  → javítás → ellenőrzések → képek, napló → commit).
- **Alapanyag:** `docs/fejlesztesi-naplo.md` (az L07–L32 lépések átnézési pontjai).

### 4.2 Az okosszerződés (L04–L05)

- A `PhotoRegistry` szerkezete: rekord (tulajdonos-azonosító, dHash, időbélyeg), `registerPhoto`
  (csak a tulajdonos), egyedi hibák (`AlreadyRegistered`, nulla hash), esemény; tesztek; telepítés és
  verifikáció a Sepolián (`0x6eF681b51da3c7E7E5d59ac96b7d80e9A59e97C7`; Sourcify és Etherscan „exact
  match”).
- **Ábra:** `L04_03_tesztek_zold.png`, `L04_05_gazstatisztika.png`, `L05_04_ellenorzes_sepolia.png`;
  az Etherscan-oldalról saját kép (a terv L05 javaslata).

### 4.3 Backend alapok (L06–L08)

- Rétegzett felépítés, Zod-validálás a rendszerhatáron, egységes hibaválasz, biztonsági fejlécek,
  sebességkorlát; Prisma-séma és migrációk; regisztráció és bejelentkezés (bcrypt, JWT HttpOnly
  sütiben, tiltott felhasználó kizárása).
- **Ábra:** `L07_17_er_diagram.png` (az L07-es állapot), `L08_02_auth_tesztek_zold.png`.

### 4.4 Képkezelés és hitelesítés (L09–L12) – _a dolgozat gyakorlati magja_

- A hash-modul (SHA-256, saját dHash, Hamming-távolság, küszöb); képfeltöltés (valódi típusellenőrzés
  dekódolással, vízjeles előnézet, EXIF törlése, tárhely); duplikáció-szűrés (409 `DUPLICATE_EXACT` /
  `DUPLICATE_SIMILAR`); háttérben futó lánc-regisztráció egyetlen tranzakció-sorral (nonce-ütközés
  ellen), a tranzakció hash-e a küldés előtt mentve (újraindítás után folytatható); a nyilvános
  hitelesség-ellenőrző (`VERIFIED` / `SIMILAR` / `NOT_FOUND`).
- **Ábra:** `L10_11_vizjeles_elonezet.png`, `L10_07_duplikacio_409.png`, `L11_36_sepolia_feltoltes.png`,
  `L12_17_ellenorzes_menete.png`.

### 4.5 Piactér-funkciók (L13–L16)

- Galéria szűréssel és lapozással, adatlap tanúsítvánnyal; Stripe Checkout teszt módban (a kártyaadat
  nem éri el a szervert), aláírt webhook, idempotens feldolgozás, a sikeroldal maga is lezárja a
  függő rendelést; védett letöltés; értékelések (csak vásárló); admin API (tiltás, elrejtés,
  újrapróbálás, statisztika).
- **Ábra:** `L13_23_adatlap_tanusitvany.png`, `L14_15_kifizetes_ellenorzese.png`,
  `L15_21_tiltott_nem_vasarlo_403.png`, `L16_21_nem_admin_403.png`.

### 4.6 A felhasználói felület (L17–L26)

- Projektváz és közös komponensek; hitelesítés és védett útvonalak; galéria és adatlap a
  **tanúsítvány-panellel**; feltöltés haladásjelzővel és állapotkövetéssel; vásárlás és vezérlőpult;
  profil és értékelések; ellenőrző oldal; admin felület; reszponzivitás és akadálymentesség
  (Lighthouse akadálymentesség: 100).
- **Ábra:** `L20_34_adatlap.png` és `L20_39_tanusitvany_panel.png` (a dolgozat kulcsképe),
  `L21_26_feltoltes_folyamatban.png`, `L21_27_409_hasonlo_kep.png`, `L24_20_ellenorzo_oldal.png`,
  `L25_21_admin_attekinto.png`, `L26_20_mobil_galeria.png`, `L26_09_lighthouse_utan.png`; drótváz és
  kész oldal összevetése: `L17_14_drotvaz_galeria.png` ↔ `L20_30_galeria.png`.

## 5. Tesztelés és értékelés _(8–12 oldal)_

### 5.1 Automatizált tesztek és lefedettség (L27)

- Tesztpiramis: unit, integrációs (Supertest, tesztadatbázis), komponenstesztek (React Testing
  Library, axe), okosszerződés-tesztek; CI minden pushra.
- **Számok (a végleges állapot):** szerver 78 tesztfájl, 1304 teszt, utasítás-lefedettség 99,68 %;
  kliens 61 fájl, 725 teszt, 98,69 %; okosszerződés 21 teszt; design-tesztek 22.
- **Ábra:** `AUDIT_04_check.png`, `L27_30_szerver_lefedettseg_html.png`.

### 5.2 Végponttól végpontig tartó tesztek (L28)

- Öt forgatókönyv böngészőből, lokális Hardhat-lánccal: regisztráció → feltöltés → hitelesítés;
  ugyanaz a kép másik fiókkal → elutasítás; vásárlás aláírt teszt-webhookkal → letöltés, értékelés;
  ellenőrző oldal; admin elrejtés.
- **Ábra:** `L28_30_html_riport.png`, `L28_31_trace_viewer.png`, `AUDIT_05_e2e.png`.

### 5.3 A hitelesítés robusztussága (L29)

- A kísérlet: saját fotók × módosítások (átméretezés, újratömörítés, formátumváltás, vágás,
  fényerő, szürkeárnyalat, tükrözés, forgatás, felirat, a platform vízjeles előnézete); SHA-256 és
  dHash-távolság.
- **Eredmények (mérés: 2026-10-12):** az SHA-256 minden módosításnál megváltozik; a tartalommegőrző
  módosítások 0–6 bitre maradnak (a 10-es küszöbnél 27/27 felismerve), a valós szerkesztési láncok
  9/9; a minden oldali kb. 5 %-os vágásnál a dHash már nem ismeri fel a másolatot, a néhány fokos
  forgatást bírja; a tükrözés és a 90°-os forgatás – a várakozásnak megfelelően – kívül esik; a
  10-es küszöbnél 43/48 tartalommegőrző másolat felismerve, téves egyezés nélkül; az első téves
  egyezés a 20-as küszöbnél (2/198 pár).
- **Fontos korlát:** sötét képnél a vízjeles előnézet dHash-e akár 22 bitre is eltérhet, így újként
  feltölthető – ez valódi gyengeség, a dolgozatban őszintén tárgyalandó (enyhíti: a lánc korábbi
  időbélyege vitában bizonyíték).
- Fogalmazási szabály: kis minta (három független képpár) → általános arányok („100 %
  felismerés”, „0 % téves egyezés”) helyett a mért esetszámok.
- **Ábra:** `L29_10_dhash_tavolsag_diagram.png`, `L29_13_robusztussag_fotablazat.png`,
  `L29_33_kuszob_kimerese.png`. **Alapanyag:** `docs/kiertekeles/hash-experiment.md`.

### 5.4 A lánc-regisztráció költsége (L29)

- Egy regisztráció kb. 71 700 gáz (Sepolia-mérés); a díj a mérés pillanatában (2026-10-12): Ethereum
  főhálózat kb. 6,5 Ft (90. percentilis áron kb. 9,2 Ft), Base kb. 0,4 Ft, OP Mainnet 1 Ft alatt;
  forgatókönyvként 10 gwei-nél kb. 600 Ft, 30 gwei-nél kb. 1790 Ft; a szerver díjplafonja (50 gwei)
  mellett legfeljebb kb. 2984 Ft.
- Fenntartás: egyetlen pillanatkép – a gázár és az árfolyam változik.
- **Ábra:** `L29_20_gazkoltseg_tablazat.png`, `L29_42_gaz_dijbecsles.png`. **Alapanyag:**
  `docs/kiertekeles/gas-cost.md`.

### 5.5 Biztonsági átvizsgálás (L30) és lezáró audit (2026-10-15)

- **OWASP Top 10:2025 ellenőrzőlista** (L30): pontonként a védelem és a kódhivatkozás; javítások
  (pl. fiókalapú belépési korlát, napi feltöltési keret, a törzs beérkezési határideje, a lánc
  állapotának figyelése); elfogadott kockázatok; `npm audit`: 0 sérülékenység.
- **A lezáró átfogó audit** (2026-10-15): négy független átnézés (terv-megfelelés,
  dokumentáció és konfiguráció, szerver, kliens) és automatikus ellenőrzések (teljes tesztcsomag,
  e2e, Docker, `npm audit`, titokkeresés, láthatatlan karakterek, élő oldal, a szerződés
  verifikációja). Kritikus vagy súlyos hiba nem volt; hét javítás, mindegyik teszt-először:
  1. a sikeres fizetés oldala a függő rendelést a Stripe szerint maga is lezárja (a webhook késhet);
  2. hosszabb üresjárati időkorlát a fordított proxy mögött (időszakos 502 ellen) és gyors leállítás;
  3. a feltöltés közben elhagyott oldal kései válasza is frissíti a „Saját képeim” listát;
  4. a letöltési hivatkozás hibája olvasható oldal, nem nyers JSON;
  5. a regisztrálás alatt álló saját kép adatlapja magától frissül;
  6. a kijelentkezés jelzője nem kerülheti meg a feltöltés védelmét;
  7. láthatatlan karakterek a forrásban.
- Érdemes kiemelni a **módszertani tanulságot**: a független átnézések olyan, modulokon átívelő
  hibákat is megtaláltak, amelyeket a lépésenkénti tesztek nem fogtak meg – de minden leletet
  reprodukáló teszt és a szerző döntése zárt le.
- **Ábra:** `AUDIT_01_piros_szerver.png` → `AUDIT_04_check.png` (piros → zöld),
  `AUDIT_06_egyeb_ellenorzesek.png`, `AUDIT_09_mutacio_leallitas.png`. **Alapanyag:**
  `docs/biztonsag/owasp-ellenorzolista.md`, a napló L30-as és „Átfogó audit” bejegyzése.

## 6. Üzembe helyezés _(4–6 oldal)_

### 6.1 Konténerizálás (L31)

- Többlépcsős Docker-kép (kliens-build, szerver-build, futtatókép nem root felhasználóval); Compose
  `app` profil; rögzített alapkép.
- **Ábra:** `L31_03_compose_ps.png`, `L31_13_dockerfile_build.png`, `AUDIT_08_docker.png`.

### 6.2 Élesítés: Render + Supabase + Stripe (L32)

- Render ingyenes webszolgáltatás (512 MB, 0,1 CPU, Frankfurt), Supabase PostgreSQL (ellenőrzött TLS)
  és privát Storage-bucketek (a képeket a szerver adja tovább), Stripe webhook az élő címre; a mért
  proxylánc (3 ugrás) és a sebességkorlát kulcsa.
- **Memóriamérés:** alapbeállítással egy 50 MP-es WebP csúcsa 501 MB (nem fér el); éles beállítással
  (25 MP-es korlát, egy szál, gyorsítótár nélkül, `MALLOC_ARENA_MAX=2`) egy 15 MP-es JPEG 91 MB /
  5,9 s, egy 24,97 MP-es WebP 274 MB / 9,9 s; a futó konténer kb. 114 MiB.
- Az ingyenes keretek következményei (alvás, hideg indítás, a Supabase heti szüneteltetése).
- **Ábra:** `L32_15_telepitesi_abra.png`, `L32_12_elo_galeria.png`, `L32_13_elo_adatlap_sepolia.png`;
  saját képek a Render deploy-naplóról és a Supabase-felületről (titok nélkül).

## 7. Összegzés és továbbfejlesztés _(3–4 oldal)_

- A célok teljesülése a követelményekhez mérve (pontonként); a működő, élesített prototípus és a
  mérések fő számai.
- **Korlátok:** az „első regisztráló” elve (a tolvaj is regisztrálhat elsőként); a tükrözés,
  forgatás, erős vágás és a vízjeles előnézet megtévesztheti a dHash-t; a védelem a platformon belül
  érvényes; a platform-tárca kulcsa egyetlen bizalmi pont; prototípus-méretű hasonlóság-keresés.
- **Továbbfejlesztés:** C2PA / Content Credentials; a felhasználó saját tárcájával aláírt regisztráció;
  vitarendezési folyamat; indexelt hasonlóság-keresés (pl. BK-fa); L2-hálózat a költség miatt; több
  saját fotóval megismételt robusztussági mérés.
- Személyes tapasztalat: a lépésenkénti, tesztvezérelt, független átnézésekkel kísért fejlesztés
  előnyei és buktatói.

## Irodalomjegyzék

- A `docs/FORRASOK.md` sorai (a „Lekérve” dátummal), a kar által előírt hivatkozási stílusban (pl.
  APA); a terv 12. fejezetének [Sxx] forrásai közül a ténylegesen felhasználtak.

## Mellékletek

- A. A GitHub-repó és az élő demó címe; a `v1.0.0` verzió.
- B. Telepítési és futtatási útmutató (a `docs/KIPROBALAS.md` és a `docs/RESZLETES_LEIRAS.md` alapján, rövidítve).
- C. A REST API végpontjai (terv 5.1).
- D. Az 5 perces demó forgatókönyve (`docs/DEMO_FORGATOKONYV.md`).
- E. Az OWASP-ellenőrzőlista összefoglaló táblázata.

---

## Írási ellenőrzőlista

- [ ] Minden kódrészlet rövid, magyarázott, és a forrására hivatkozik (`fájl:sor` vagy a kép neve).
- [ ] Minden átvett minta forrása szerepel (FORRASOK; a generált projektvázak: terv 11. fejezet).
- [ ] A mérési eredményeknél a dátum, a minta mérete és a fenntartások is ott vannak.
- [ ] A képernyőképeken nincs titkos kulcs, jelszó vagy személyes adat.
- [ ] A védés előtt: a demó-forgatókönyv előkészítő listája végigjárva.
