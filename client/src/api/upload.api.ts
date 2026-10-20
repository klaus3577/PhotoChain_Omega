// A képfeltöltés kliense (POST /api/photos, multipart/form-data – L21). XMLHttpRequest-tel megy, mert a
// fetch nem ad feltöltési haladást – a küldés az ellenőrzéssel (L24) közös (multipart.ts): a válasz
// ugyanabban a borítékban jön, és ugyanazzá a hibává lesz, mint a fetch-burkolónál; a megszakítás
// AbortError. Az onSent akkor szól, amikor a törzs hiánytalanul elment: onnantól a szerver dolgozik, a
// megszakítás a feldolgozást (a kép mentését, a regisztráció indítását) már nem állítaná meg.
import { isRecord } from './guards';
import { IMAGE_FIELD_NAME, type MultipartOptions, postMultipart } from './multipart';
import { isUploadedPhoto, type UploadedPhoto } from './photos.api';

export interface UploadInput {
  file: File;
  title: string;
  /** Üresen nem megy el (a szerveren a leírás elhagyható) */
  description: string;
  /** Számjegyek (a tagoló szóközök nélkül) */
  priceHuf: string;
  categoryId: string;
}

/** Az űrlap: előbb a szöveges mezők, utoljára a fájl – a szerver így a mezőket a fájl előtt ellenőrzi. */
function formDataOf(input: UploadInput): FormData {
  const form = new FormData();
  form.append('title', input.title);
  if (input.description !== '') form.append('description', input.description);
  form.append('priceHuf', input.priceHuf);
  form.append('categoryId', input.categoryId);
  form.append(IMAGE_FIELD_NAME, input.file);
  return form;
}

const isUploadResponse = (value: unknown): value is { photo: UploadedPhoto } =>
  isRecord(value) && isUploadedPhoto(value.photo);

/**
 * A kép feltöltése; a haladást (bájtban) az onProgress kapja, a signal megszakítja. Siker esetén a kép
 * adatai (PENDING_CHAIN állapotban – a regisztráció a háttérben indul), hibánál ApiError.
 */
export async function uploadPhoto(
  input: UploadInput,
  options: MultipartOptions = {},
): Promise<UploadedPhoto> {
  const { photo } = await postMultipart('/photos', formDataOf(input), isUploadResponse, options);
  return photo;
}
