# Tesztfotók

Ebbe a mappába **kizárólag saját készítésű fotók** kerülhetnek (a dolgozat témája a szerzői jog
védelme – idegen kép a repóban sem lehet). A `src/services/hashing.service.test.ts` az itt
található képeken ellenőrzi a dHash viselkedését.

## Mit tegyél ide?

- **Legalább 3 fotót**, egymástól jól megkülönböztethető témával (pl. tájkép, épület, közeli tárgy).
  Egymáshoz nagyon hasonló felvételek (sorozatkép, ugyanaz a jelenet) ne legyenek köztük: a teszt
  azt várja, hogy a különböző képek dHash-távolsága a küszöb (10) fölött legyen.
- Formátum: JPEG, PNG vagy WebP. Fájlnév ékezet és szóköz nélkül, pl. `01_tajkep.jpg`.
- Méret: elég a kicsinyített változat – hosszabbik oldal kb. 1600 képpont, fájlonként 1 MB alatt –,
  hogy a repó ne hízzon feleslegesen.
- **Metaadatok:** a fényképek EXIF-adatai GPS-koordinátát és a gép sorozatszámát is tartalmazhatják.
  Mielőtt a fotó a repóba kerül, érdemes ezeket eltávolítani (a kicsinyítéssel együtt megtehető).

A módosított másolatokat (felére kicsinyítés, JPEG-újratömörítés, WebP-be mentés) a teszt maga
állítja elő az eredetiből, ezért fotónként egyetlen fájl elég.

## Új fotó előkészítése

Az eredeti (nagy felbontású, metaadatokat tartalmazó) fájl az `originals/` almappába tehető – ezt a
git figyelmen kívül hagyja. A `server/` mappából:

```bash
npx tsx scripts/prepare-test-photo.ts tests/fixtures/images/originals/<eredeti> 04_nev.jpg
```

A script az EXIF szerinti állásba forgatja a képet, a hosszabbik oldalát 1600 képpontra kicsinyíti,
és sRGB JPEG-ként, minden metaadat nélkül menti ebbe a mappába. Az `originals/` mappa képeit az L29
robusztussági kísérlete (`npm run experiment:hash`) is megméri „teljes felbontású eredeti” változatként,
azonos törzsnevű fájl vagy – ha a darabszám egyezik – névsorrend szerint a tesztfotókhoz párosítva.

## A jelenlegi fotók

| Fájl                      | Téma                      | Méret     |
| ------------------------- | ------------------------- | --------- |
| `01_tocsa_tukrozodes.jpg` | tócsában tükröződő ég     | 1067×1600 |
| `02_gyertyak.jpg`         | égő gyertyák sötét térben | 1600×1067 |
| `03_basszusgitar.jpg`     | basszusgitár közelről     | 1067×1600 |

Mindhárom a szerző saját felvétele (Canon EOS 1300D, illetve 5D Mark III).
