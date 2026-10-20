// A libvips (a sharp képkönyvtára) a nagy, nem soronként bontható képet (pl. WebP) 100 MB fölött
// ideiglenes fájlba bontja ki – a feltöltött vagy ellenőrzött kép képpontjai így a lemezre
// kerülnének. A küszöböt ezért a sharp első használata ELŐTT megemeljük: ezt a modult a server.ts
// importálja elsőként (a tesztekben a Vitest setupFiles-a). A legnagyobb megengedett kép
// (MAX_IMAGE_PIXELS, 50 megapixel) kibontva (legfeljebb 200 MB) is belefér, és a memóriában marad.
// Memóriaigény: egy ilyen kép feldolgozása alatt a folyamat memóriája (mérve) kb. 360–390 MB-tal
// nő; egyszerre legfeljebb IMAGE_PROCESSING_CONCURRENCY (alapból 4) kép bontása fut a feltöltés, az
// ellenőrzés és az admin-visszaállítás között (L32, services/imageWork.ts) – a konténer memóriakeretét
// (L31) ehhez kell méretezni (legalább 2 GB); az ingyenes Render-példányon (512 MB) egy, 25 MP-es
// korláttal (L32).
// A küszöböt csak a folyamat környezete (pl. a shell vagy a Docker ENV) írhatja felül: a
// server/.env később töltődik be, mint ez a modul.
// Forrás: libvips – vips_get_disc_threshold() (VIPS_DISC_THRESHOLD; alapból 100 MB; k/m/g utótag),
// https://www.libvips.org/API/8.17/func.get_disc_threshold.html

/** A lemezre bontás küszöbe (a libvips formátumában) */
export const VIPS_DISC_THRESHOLD = '256m';

/** Ugyanez bájtban */
export const VIPS_DISC_THRESHOLD_BYTES = 256 * 1024 * 1024;

/**
 * Beállítja a küszöböt – a környezetben kifejezetten megadott értéket nem írja felül. Az üresen
 * hagyott értéket igen: a libvips annak 0-t venne, és minden képet a lemezre bontana.
 */
export function raiseVipsDiscThreshold(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.VIPS_DISC_THRESHOLD) env.VIPS_DISC_THRESHOLD = VIPS_DISC_THRESHOLD;
}

raiseVipsDiscThreshold();
