# A hitelesítés robusztussága (L29)

Mérés ideje: 2026-10-12T09:18:26.822Z (`npm run experiment:hash`, `server/scripts/hash-experiment.ts`; sharp
0.35.5, libvips 8.18.7, Node v24.17.0, win32). Fotók: 01_tocsa_tukrozodes.jpg (1067×1600), 02_gyertyak.jpg (1600×1067), 03_basszusgitar.jpg (1067×1600) – a
szerző saját felvételei, a teljes felbontású eredetikkel (pci1.jpg, pic2.jpg, pic3.jpg – az `originals/` mappa nincs a repóban).
A módosított másolatokat a script állítja elő (JPEG q85-tel mentve, ahol a módosítás mást nem mond); a
hash ugyanazzal a modullal készül, mint a szerveren. A ✗ jel: a 10-es küszöbnél a rendszer nem ismerné fel
másolatnak. Kategóriák: A – formátum, minőség, tónus; B – vágás; C – a platform előnézete; D – ismert korlát
(tükrözés, forgatás); E – valós módosítási lánc.

**A táblázat a hash robusztusságát méri, nem a feltöltés viselkedését:** a feltöltés a 600 képpontnál
kisebb oldalú képet (itt a kicsinyítés 50 % és kicsinyítés 25 %) és a 15 MiB-nál nagyobb fájlt (pic2.jpg, pic3.jpg)
mérete miatt eleve elutasítja; az ellenőrző oldal a kisebb képet is elfogadja.

## dHash-távolság az eredetitől (bit a 64-ből)

| Módosítás | Kategória | 01_tocsa_tukrozodes.jpg | 02_gyertyak.jpg | 03_basszusgitar.jpg | SHA-256 egyezik |
| --- | --- | --- | --- | --- | --- |
| ugyanaz a fájl | – | 0 | 0 | 0 | igen |
| teljes felbontású eredeti (originals/) | A | 2 | 1 | 1 | nem |
| kicsinyítés 50 % | A | 2 | 2 | 2 | nem |
| kicsinyítés 25 % | A | 2 | 1 | 2 | nem |
| JPEG-újratömörítés q60 | A | 1 | 1 | 1 | nem |
| JPEG-újratömörítés q20 | A | 1 | 1 | 0 | nem |
| WebP-konverzió q80 | A | 6 | 4 | 1 | nem |
| fényerő +10 % | A | 1 | 1 | 0 | nem |
| szürkeárnyalat | A | 1 | 3 | 1 | nem |
| szöveges felirat (alsó sáv) | A | 1 | 2 | 2 | nem |
| vágás 5 % (minden oldalról) | B | 11 ✗ | 7 | 6 | nem |
| vágás 10 % (minden oldalról) | B | 20 ✗ | 10 | 20 ✗ | nem |
| üzenetküldőn át: 1080 px + JPEG q75 | E | 2 | 2 | 1 | nem |
| telefonos szűrő: kontraszt +15 %, telítettség +20 %, vinyetta | E | 2 | 5 | 5 | nem |
| megosztás: 1200 px + vágás 2 % + JPEG q70 | E | 7 | 2 | 2 | nem |
| a platform vízjeles előnézete | C | 5 | 22 ✗ | 1 | nem |
| a platform előnézete a teljes felbontású eredetiből (az eredetihez mérve) | C | 3 | 19 ✗ | 1 | nem |
| tükrözés (vízszintes) | D | 11 ✗ | 31 ✗ | 31 ✗ | nem |
| forgatás 90° | D | 20 ✗ | 22 ✗ | 38 ✗ | nem |

Az SHA-256 minden módosításnál megváltozik (bájtpontos ujjlenyomat) – csak a változatlan fájlt
ismeri fel. Kategóriánként a 10-es küszöbnél:

| Kategória | Felismert | Távolság |
| --- | --- | --- |
| A – formátum, minőség, tónus | 27 / 27 | 0–6 |
| B – vágás (5 és 10 % minden oldalról) | 3 / 6 | 6–20 |
| C – a platform előnézete | 4 / 6 | 1–22 |
| E – valós módosítási lánc | 9 / 9 | 1–7 |
| D – ismert korlát (nem várt felismerés) | 0 / 6 | 11–38 |

A küszöb fölé került tartalommegőrző másolatok: 01_tocsa_tukrozodes.jpg – vágás 5 % (minden oldalról) (11); 01_tocsa_tukrozodes.jpg – vágás 10 % (minden oldalról) (20); 02_gyertyak.jpg – a platform vízjeles előnézete (22); 02_gyertyak.jpg – a platform előnézete a teljes felbontású eredetiből (az eredetihez mérve) (19); 03_basszusgitar.jpg – vágás 10 % (minden oldalról) (20).

**A küszöb indoklása.** A dHash-küszöb alapértékét (10 bit) Krawetz ajánlása alapján választottuk [S40]; a saját
mérés ezzel összhangban van, de – a kis minta miatt – nem jelöli ki. A három fotón a formátum-, minőség- és
tónusmódosítások (A) legfeljebb 6 bittel tértek el az eredetitől, a három különböző fotó pedig
egymástól 25–30 bitre esett. A vágás és a platform vízjeles előnézete a küszöb körül szóródott (B: 6–20,
C: 1–22 bit), a tükrözés és a 90°-os forgatás (11–38 bit) a várakozásnak megfelelően kívül esik.
A legtávolabbi felismerendő másolat (22 bit) messzebb volt, mint a legközelebbi idegen kép valamelyik
változata (20 bit: 01_tocsa_tukrozodes.jpg – vágás 5 % (minden oldalról) → 02_gyertyak.jpg), így egyetlen küszöb sem választja el őket hibátlanul.
A mintán a 10 és 19 közötti küszöbök mind téves egyezés nélkül működtek; a 10-et azért tartjuk meg, mert a
jóhiszemű fotós téves elutasítása ellen a rendszerben nincs jogorvoslat, a hasonló, de különböző felvételek
távolságát pedig nem mértük.

**Fenntartás.** A minta három független idegen képpár; a 198 összevetés ezek változataiból adódik (minden
kép minden változata a másik két kép eredetijével). A téves egyezés valószínűségére ezért nem adható
számszerű becslés; a sorozatfelvételek, az azonos témájú különböző fotók és az egyszínű képek nem
szerepeltek. Mivel minden feltöltést az összes regisztrált képpel összevetünk, a téves egyezés esélye a
katalógus méretével nő. Minden változatot ugyanaz a libvips készítette, amely a hash-t is számolja (más
eszközzel készült másolat nincs a mintában).

## A vágás és a kis forgatás törési görbéje (bit, B kategória)

| Módosítás | 01_tocsa_tukrozodes.jpg | 02_gyertyak.jpg | 03_basszusgitar.jpg |
| --- | --- | --- | --- |
| vágás 1 % (minden oldalról) | 2 | 1 | 3 |
| vágás 2 % (minden oldalról) | 7 | 3 | 3 |
| vágás 3 % (minden oldalról) | 9 | 4 | 6 |
| vágás 5 % (minden oldalról) | 11 ✗ | 7 | 6 |
| vágás 7 % (minden oldalról) | 12 ✗ | 11 ✗ | 14 ✗ |
| vágás 10 % (minden oldalról) | 20 ✗ | 10 | 20 ✗ |
| vágás 5 % (csak alul) | 4 | 5 | 4 |
| vágás 10 % (csak alul) | 9 | 9 | 7 |
| forgatás 0,5° (a sarkok levágva) | 3 | 2 | 1 |
| forgatás 1° (a sarkok levágva) | 3 | 4 | 2 |
| forgatás 2° (a sarkok levágva) | 3 | 8 | 3 |
| forgatás 5° (a sarkok levágva) | 6 | 8 | 10 |
| forgatás 90° | 20 ✗ | 22 ✗ | 38 ✗ |

## A vízjel hatása (C kategória)

| Módosítás | 01_tocsa_tukrozodes.jpg | 02_gyertyak.jpg | 03_basszusgitar.jpg |
| --- | --- | --- | --- |
| előnézet vízjel nélkül (1200 px, kontroll) | 2 | 2 | 0 |
| előnézet, a vízjel átlátszatlansága 0,15 | 3 | 15 ✗ | 1 |
| előnézet, a vízjel átlátszatlansága 0,25 | 4 | 15 ✗ | 0 |
| előnézet, a vízjel átlátszatlansága 0,35 | 5 | 17 ✗ | 2 |
| előnézet, a vízjel átlátszatlansága 0,45 (a platform alapértéke) | 5 | 22 ✗ | 1 |
| a platform előnézete a teljes felbontású eredetiből (az eredetihez mérve) | 3 | 19 ✗ | 1 |
| törékeny rácspárok száma a 64-ből (a két szomszéd eltérése legfeljebb 2) | 7 | 26 | 6 |

A vízjel fehér, félig átlátszó rétege a sötét képpontokat arányosan jobban világosítja, és a csempéi nem
illeszkednek a dHash 9×8-as rácsához: ahol sok a szomszédos, majdnem egyforma fényességű rácspár
(„törékeny bit”), ott a vízjel több bitet billent át. Az SHA-256 az előnézetnél is más; az eltérést a
dHash-távolság mutatja.

## Idegen képek

A három fotó eredetije egymástól:

| Első kép | Második kép | dHash-távolság |
| --- | --- | --- |
| 01_tocsa_tukrozodes.jpg | 02_gyertyak.jpg | 25 |
| 01_tocsa_tukrozodes.jpg | 03_basszusgitar.jpg | 29 |
| 02_gyertyak.jpg | 03_basszusgitar.jpg | 30 |

A változatok a másik két kép eredetijétől (a legkisebb érték mutatja, mennyire tolja el a módosítás a
képet egy idegen felé):

| Módosítás | legkisebb | legnagyobb |
| --- | --- | --- |
| teljes felbontású eredeti (originals/) | 24 | 31 |
| kicsinyítés 50 % | 25 | 30 |
| kicsinyítés 25 % | 24 | 31 |
| JPEG-újratömörítés q60 | 24 | 31 |
| JPEG-újratömörítés q20 | 24 | 31 |
| WebP-konverzió q80 | 25 | 31 |
| fényerő +10 % | 24 | 30 |
| szürkeárnyalat | 24 | 33 |
| szöveges felirat (alsó sáv) | 25 | 32 |
| vágás 5 % (minden oldalról) | 20 | 30 |
| vágás 10 % (minden oldalról) | 23 | 34 |
| üzenetküldőn át: 1080 px + JPEG q75 | 25 | 31 |
| telefonos szűrő: kontraszt +15 %, telítettség +20 %, vinyetta | 20 | 33 |
| megosztás: 1200 px + vágás 2 % + JPEG q70 | 23 | 32 |
| tükrözés (vízszintes) | 22 | 33 |
| forgatás 90° | 23 | 38 |
| vágás 1 % (minden oldalról) | 23 | 31 |
| vágás 2 % (minden oldalról) | 22 | 33 |
| vágás 3 % (minden oldalról) | 22 | 34 |
| vágás 7 % (minden oldalról) | 21 | 30 |
| vágás 5 % (csak alul) | 22 | 33 |
| vágás 10 % (csak alul) | 22 | 33 |
| forgatás 0,5° (a sarkok levágva) | 23 | 30 |
| forgatás 1° (a sarkok levágva) | 23 | 30 |
| forgatás 2° (a sarkok levágva) | 23 | 34 |
| forgatás 5° (a sarkok levágva) | 21 | 32 |
| a platform vízjeles előnézete | 25 | 31 |
| a platform előnézete a teljes felbontású eredetiből (az eredetihez mérve) | 25 | 32 |
| előnézet vízjel nélkül (1200 px, kontroll) | 25 | 30 |
| előnézet, a vízjel átlátszatlansága 0,15 | 26 | 31 |
| előnézet, a vízjel átlátszatlansága 0,25 | 26 | 31 |
| előnézet, a vízjel átlátszatlansága 0,35 | 26 | 32 |
| előnézet, a vízjel átlátszatlansága 0,45 (a platform alapértéke) | 25 | 31 |

## A küszöb kimérése

Felismert másolatok kategóriánként (a fő táblázat tartalommegőrző változatai) és a téves egyezések száma
a lehetséges küszöbértékeknél:

| Küszöb | A – formátum, minőség, tónus (27) | B – vágás (6) | C – a platform előnézete (6) | E – valós módosítási lánc (9) | téves egyezés (198 összevetés) |
| --- | --- | --- | --- | --- | --- |
| 0 | 2 / 27 | 0 / 6 | 0 / 6 | 0 / 9 | 0 |
| 1 | 16 / 27 | 0 / 6 | 2 / 6 | 1 / 9 | 0 |
| 2 | 24 / 27 | 0 / 6 | 2 / 6 | 6 / 9 | 0 |
| 3 | 25 / 27 | 0 / 6 | 3 / 6 | 6 / 9 | 0 |
| 4 | 26 / 27 | 0 / 6 | 3 / 6 | 6 / 9 | 0 |
| 5 | 26 / 27 | 0 / 6 | 4 / 6 | 8 / 9 | 0 |
| 6 | 27 / 27 | 1 / 6 | 4 / 6 | 8 / 9 | 0 |
| 7 | 27 / 27 | 2 / 6 | 4 / 6 | 9 / 9 | 0 |
| 8 | 27 / 27 | 2 / 6 | 4 / 6 | 9 / 9 | 0 |
| 9 | 27 / 27 | 2 / 6 | 4 / 6 | 9 / 9 | 0 |
| 10 | 27 / 27 | 3 / 6 | 4 / 6 | 9 / 9 | 0 |
| 11 | 27 / 27 | 4 / 6 | 4 / 6 | 9 / 9 | 0 |
| 12 | 27 / 27 | 4 / 6 | 4 / 6 | 9 / 9 | 0 |
| 13 | 27 / 27 | 4 / 6 | 4 / 6 | 9 / 9 | 0 |
| 14 | 27 / 27 | 4 / 6 | 4 / 6 | 9 / 9 | 0 |
| 15 | 27 / 27 | 4 / 6 | 4 / 6 | 9 / 9 | 0 |
| 16 | 27 / 27 | 4 / 6 | 4 / 6 | 9 / 9 | 0 |
| 17 | 27 / 27 | 4 / 6 | 4 / 6 | 9 / 9 | 0 |
| 18 | 27 / 27 | 4 / 6 | 4 / 6 | 9 / 9 | 0 |
| 19 | 27 / 27 | 4 / 6 | 5 / 6 | 9 / 9 | 0 |
| 20 | 27 / 27 | 6 / 6 | 5 / 6 | 9 / 9 | 2 |
| 21 | 27 / 27 | 6 / 6 | 5 / 6 | 9 / 9 | 5 |
| 22 | 27 / 27 | 6 / 6 | 6 / 6 | 9 / 9 | 13 |
| 23 | 27 / 27 | 6 / 6 | 6 / 6 | 9 / 9 | 26 |
| 24 | 27 / 27 | 6 / 6 | 6 / 6 | 9 / 9 | 38 |

## Futásidő

A dHash kiszámítása (a fájl beolvasása nélkül, képenként 5 futás mediánja, bemelegítés után; AMD Ryzen 5 7600X 6-Core Processor):

| Méretosztály | Képek | Medián (ms) | Tartomány (ms) |
| --- | --- | --- | --- |
| tesztfotó (1600 px JPEG) | 3 | 3,1 | 2,7–3,5 |
| teljes felbontású eredeti (9–22 MB JPEG) | 3 | 118,2 | 63,3–143,1 |
| WebP-változat (1600 px) | 3 | 23,7 | 21,1–25,3 |

## Megjegyzések

- Az L09-es naplóban mért értékektől (tükrözés 11/30/30, szürkeárnyalat 1–2) néhány eset 1 bittel eltér:
  ott a változatok tömörítetlen képpontokból, itt JPEG q85-tel mentett fájlból számoltak.
- A felirat és a vízjel SVG-szövegét a rendszer betűkészlete rajzolja; más rendszeren 1–2 bites eltérés
  lehetséges.
