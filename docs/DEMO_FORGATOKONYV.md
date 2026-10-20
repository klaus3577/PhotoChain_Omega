# PhotoChain – 5 perces védési demó

A bemutató az élő rendszeren fut: **https://photochain.onrender.com** (Ethereum Sepolia
teszthálózat, Stripe teszt mód). A menet a fejlesztési terv L33-as lépését követi: regisztráció →
feltöltés → hitelesítés az Etherscanen → „lopási kísérlet” másik fiókkal (ugyanaz és átméretezett
kép) → elutasítás → ellenőrző oldal → vásárlás → letöltés.

## 1. Előkészítés

### Egy-két nappal előtte

- **Supabase:** egy hét tétlenség után a projekt szünetel – a Dashboardon ellenőrizd, hogy aktív
  (szükség esetén _Resume project_).
- **Render:** a szolgáltatás él, az utolsó telepítés sikeres (Dashboard → Events).
- **Platform-tárca:** van elég Sepolia ETH-ja – a szerver induláskor és tíz percenként ellenőrzi, és
  alacsony egyenlegnél figyelmeztet a naplóban (`chain_low_balance`); a tárca egyenlege az
  Etherscanen is látszik. Egy regisztráció kb. 73 000 gáz (L29).
- **Stripe:** teszt módban a webhook-végpont az élő címre mutat (a fizetés a webhook nélkül is
  lezárul – a sikeroldal maga is lekérdezi a Stripe-ot).
- **Képek** (csak saját fotók – a dolgozat szerzői jogi témája miatt is), a repón kívüli mappában,
  pl. `D:\szakdolgozat\demo\`:
  1. `eredeti.jpg` – egy saját fotó, amelyet **sehol nem töltöttél még fel** (sem a fejlesztői, sem
     az éles rendszerbe: mindkettő ugyanazt a Sepolia-szerződést használja, így a máshol már
     regisztrált kép „már regisztrált” lenne). JPEG/PNG/WebP, a rövidebb oldal legalább 600 px,
     legfeljebb 25 megapixel és 15 MB. Készíts egy tartalékot is.
  2. `atmeretezett.jpg` – ugyanennek kicsinyített, újratömörített másolata. A `server/` mappából:

     ```bash
     node -e "require('sharp')('D:/szakdolgozat/demo/eredeti.jpg').resize({ width: 1600 }).jpeg({ quality: 80 }).toFile('D:/szakdolgozat/demo/atmeretezett.jpg').then(() => console.log('kész'))"
     ```

     (Ne a platform vízjeles előnézetét használd: az L29-es mérés szerint sötét képnél a vízjel
     annyira megváltoztathatja a dHash-t, hogy a másolat újként menne át – ez a dolgozatban tárgyalt
     korlát, nem a bemutató célja.)

  3. `ismeretlen.jpg` – egy másik saját fotó, amely nincs a rendszerben (az ellenőrző oldalhoz).

- **Fiókok:** a bemutató elején új fiókot regisztrálsz (pl. „Védés Fotós”). A második fiók a
  seedelt **Demó Vásárló** (`vasarlo@photochain.test`, jelszava a `SEED_DEMO_PASSWORD`) – ezzel a
  „lopási kísérlet” és a vásárlás. Próbáld ki előtte, hogy be tudsz lépni.
- **Stripe teszt kártya:** `4242 4242 4242 4242`, bármely jövőbeli lejárat, bármely CVC.

### A bemutató előtt 10 perccel

- Nyisd meg az oldalt (az ingyenes Render-szolgáltatás kb. 1 perc alatt ébred); a
  `https://photochain.onrender.com/api/health` válasza: `{"data":{"status":"ok"}}`.
- **A ablak:** a galéria (ide regisztrálsz). **B ablak** (privát ablak): belépve a Demó Vásárlóval.
  **C fül:** a `sepolia.etherscan.io`.
- Zárd be a felesleges lapokat, kapcsold ki az értesítéseket, nagyítsd a böngészőt 125 %-ra.

## 2. Forgatókönyv

| Idő       | Lépés                | Mit mutass                                                                                                                                                                                                   | Mit mondj (röviden)                                                                                                                                                                 |
| --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:30 | Bevezetés            | A ablak: a galéria, egy kép adatlapja a „Hitelesítve” jelvénnyel                                                                                                                                             | Fotó-piactér, ahol minden kép ujjlenyomata a blokkláncon rögzül, így ugyanaz vagy módosított másolata nem tölthető fel újra.                                                        |
| 0:30–1:00 | Regisztráció         | A ablak: „Regisztráció” → név, e-mail, jelszó → belépve                                                                                                                                                      | A jelszó bcrypt-hash-ként tárolódik, a munkamenet HttpOnly sütiben van.                                                                                                             |
| 1:00–2:00 | Feltöltés            | „Feltöltés” → `eredeti.jpg` behúzása, cím, kategória, ár (legalább 175 Ft) → haladásjelző → az állapotkártya: „Regisztrálás folyamatban”, majd a függő tranzakció linkje → „Hitelesítve” (15–60 s)           | Feltöltéskor SHA-256 és 64 bites dHash készül; az adatbázis és a lánc is ellenőrzi, nincs-e már ilyen. A tranzakciót a platform-tárca küldi, a felhasználónak nem kell kriptotárca. |
| 2:00–2:30 | Etherscan            | Az adatlap tanúsítványán a tranzakció linkje → C fül: a tranzakció, a „Logs” fülön a `PhotoRegistered` esemény                                                                                               | A láncon csak hash és álnevesített tulajdonos-azonosító van – személyes adat nincs (GDPR).                                                                                          |
| 2:30–3:15 | „Lopási kísérlet”    | B ablak (Demó Vásárló): „Feltöltés” → `eredeti.jpg` → elutasítva: „A fájl bitre azonos egy már feltöltött képpel.”; majd `atmeretezett.jpg` → elutasítva: „A két kép szinte teljesen egyezik: … bit tér el.” | Az SHA-256 a bitre azonos fájlt, a dHash az átméretezett, újratömörített másolatot ismeri fel (a 10-es küszöb alatt).                                                               |
| 3:15–3:45 | Ellenőrző oldal      | Bárki (bejelentkezés nélkül is): „Ellenőrzés” → `eredeti.jpg` → „Hiteles, regisztrált kép” a regisztráció idejével és az Etherscan-linkkel; `ismeretlen.jpg` → „Nincs a nyilvántartásban”                    | Bárki ellenőrizheti egy kép eredetét; a feltöltött fájl nem tárolódik.                                                                                                              |
| 3:45–4:40 | Vásárlás és letöltés | B ablak: a kép adatlapja → „Megveszem” → Stripe fizetési oldal → teszt kártya → vissza: „Sikeres fizetés” → „Eredeti letöltése”                                                                              | A kártyaadat a szerverhez el sem jut (hosztolt Checkout); a fizetést a Stripe igazolja. Az eredeti csak a tulajdonosnak és a vásárlónak érhető el.                                  |
| 4:40–5:00 | Összegzés, korlátok  | –                                                                                                                                                                                                            | Az „első regisztráló” elve; a tükrözés, forgatás, erős vágás és a vízjeles előnézet megtévesztheti a dHash-t; a védelem a platformon belül érvényes. Továbblépés: C2PA.             |

## 3. Ha valami elakad

| Helyzet                                                    | Teendő                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Az oldal lassan tölt be vagy 502-t ad                      | Az ingyenes Render-szolgáltatás ébred – egy perc múlva frissíts. Ezért kell 10 perccel előtte megnyitni.                                                                                                                                    |
| A lánc-regisztráció lassú (a Sepolia-blokk késik)          | Folytasd a „lopási kísérlettel”: a duplikáció-szűrés a még függő képre is működik (az adatbázisban már ott van). Az ellenőrző oldalt és az Etherscant mutasd a végén, amikor már „Hitelesítve”.                                             |
| A lánc-regisztráció sikertelen („Sikertelen regisztráció”) | Az adminisztrátor a felületén újrapróbálhatja; a valószínű ok a tárca egyenlege – ezt előtte ellenőrizd.                                                                                                                                    |
| A fizetés után a rendelés függőben marad                   | A sikeroldal pár másodpercenként a Stripe-ot is lekérdezi – várj, vagy nyomd meg a „Frissítés” gombot.                                                                                                                                      |
| A feltöltés elutasítva: „már regisztrált” az _új_ képre    | A képet korábban már feltöltötted valahol (fejlesztés, e2e, éles) – válts a tartalék képre.                                                                                                                                                 |
| Nincs internet, vagy az élő rendszer nem érhető el         | Helyi tartalék: `npm run test:headed --prefix e2e` – a Playwright látható böngészőben, kb. egy perc alatt végigjátssza a regisztrációt, a feltöltést (lokális Hardhat-lánccal), a másolat elutasítását, a vásárlást és az ellenőrző oldalt. |
| Minden más                                                 | A dolgozat képernyőképei (`docs/screenshots/`, pl. `L20_*`, `L24_*`, `L32_12`, `L32_13`) és a fejlesztési napló.                                                                                                                            |

## 4. A bemutató után

- A demófeltöltések az éles adatbázisban és a láncon maradnak; az adatbázisban a kép elrejthető (a
  lánc rekordja megmarad – ez maga a megmásíthatatlanság).
- A Stripe teszt módú fizetései valódi terhelést nem jelentenek.
