// A képek végpontjainak kliense (server/src/modules/photos): a galéria (GET /api/photos – lapozva, az
// értékelések összesítésével) és az adatlap (GET /api/photos/:id – a tanúsítvánnyal és a néző
// jelzőjével). A válasz külső adat: futás közben is ellenőrizzük. A képcím csak saját /media/ útvonal
// lehet, a blokklánc-böngésző linkje pedig csak a megjelenített hash Etherscan-oldala – így a link
// célja sem térhet el attól, amit a felület kiír.
import { type Category, isCategory } from './categories.api';
import {
  EXPLORER_BASE_URL,
  expectQueryString,
  expectValid,
  type Fields,
  hasTransactionProof,
  isAddress,
  isDHash,
  isInteger,
  isIsoDate,
  isMediaPath,
  isNullableString,
  isPageMeta,
  isRatingSummary,
  isRecord,
  isSha256,
  isString,
  isTransactionUrl,
  isTxHash,
  isUuid,
  type PageMeta,
  type RatingSummary,
} from './guards';
import { API_PREFIX, apiRequest, apiRequestEnvelope, pathSegment } from './http';

export type PhotoStatus = 'PENDING_CHAIN' | 'REGISTERED' | 'CHAIN_FAILED' | 'HIDDEN';

export interface PhotoOwner {
  id: string;
  displayName: string;
}

/** A galéria listaeleme (PhotoListItemDto). */
export interface PhotoListItem {
  id: string;
  title: string;
  priceHuf: number;
  status: PhotoStatus;
  width: number;
  height: number;
  /** Az elrejtett kép bélyegképe törlődött: null */
  thumbnailUrl: string | null;
  category: Category;
  owner: PhotoOwner;
  createdAt: string;
  rating: RatingSummary;
}

/** A regisztráció tanúsítványa – csak a regisztrált (REGISTERED) képé. */
export interface PhotoCertificate {
  registeredAt: string;
  /** A lezárt tranzakció adatai; ha nem ismertek (elveszett nyugta), mind null */
  blockNumber: number | null;
  txHash: string | null;
  /** A tranzakció az Etherscanen; a lokális hálózaton null */
  txUrl: string | null;
  chainId: number;
  contractAddress: string;
  contractUrl: string | null;
}

/** A bejelentkezett nézőre vonatkozó jelzők (bejelentkezés nélkül a viewer null). */
export interface PhotoViewer {
  /** Van kifizetett rendelése a képre – az eredetit letöltheti */
  purchased: boolean;
  /** Írhat értékelést: vásárló, nyilvános kép, nem a sajátja, még nem értékelte (L23) */
  canReview: boolean;
  /** A saját értékelésének azonosítója, ha már értékelte a képet (L23) */
  ownReviewId: string | null;
}

/** A még meg nem erősített regisztrációs tranzakció – a tulajdonos látja a regisztrációra váró képnél (L21). */
export interface PendingTransaction {
  txHash: string;
  /** A tranzakció az Etherscanen; a lokális hálózaton null */
  txUrl: string | null;
}

/** A kép adatai a néző jelzői nélkül – a feltöltés (POST /api/photos) válasza (L21). */
export interface UploadedPhoto extends Omit<PhotoListItem, 'rating'> {
  description: string | null;
  sha256: string;
  dHash: string;
  /** Az elrejtett kép előnézete törlődött: null */
  previewUrl: string | null;
  certificate: PhotoCertificate | null;
}

/** Az adatlap (PhotoDetailViewDto). */
export interface PhotoDetail extends UploadedPhoto {
  viewer: PhotoViewer | null;
  pendingTransaction: PendingTransaction | null;
}

/** A feltöltés válasza adatlapként: a feltöltő még nem vásárló, a tranzakció hash-e a következő lekérdezéssel jön (L21). */
export const detailOfUploaded = (photo: UploadedPhoto): PhotoDetail => ({
  ...photo,
  viewer: { purchased: false, canReview: false, ownReviewId: null },
  pendingTransaction: null,
});

export interface PhotoPage {
  photos: PhotoListItem[];
  meta: PageMeta;
}

/** Ki rejtette el a képet (server/src/modules/photos/photos.hiding.ts): a tulajdonos, a moderátor (admin), vagy mindkettő. */
export type HiddenBy = 'OWNER' | 'ADMIN' | 'OWNER_AND_ADMIN';

/**
 * A tulajdonos saját képeinek listaeleme (OwnPhotoListItemDto, L22): a galéria eleme, a leírás (a
 * szerkesztéshez), és ami csak neki szól – ki rejtette el a képet, és a függő regisztrációs tranzakció.
 */
export interface OwnPhotoListItem extends PhotoListItem {
  description: string | null;
  /** Csak az elrejtett (HIDDEN) képnél; egyébként null */
  hiddenBy: HiddenBy | null;
  pendingTransaction: PendingTransaction | null;
}

export interface OwnPhotoPage {
  photos: OwnPhotoListItem[];
  meta: PageMeta;
}

/** A kép módosítható adatai (PATCH /api/photos/:id): a kép maga nem cserélhető. */
export interface PhotoUpdate {
  title: string;
  /** null: a leírás törlése */
  description: string | null;
  priceHuf: number;
  categoryId: number;
}

/** Egy oldalon ennyi saját kép (a szerver alapértelmezése) */
export const OWN_PHOTOS_PAGE_SIZE = 20;

/**
 * A lekérdezések helye a gyorsítótárban (az adatlap alatt az értékelései is – reviews.api.ts). A saját
 * képek listája felhasználói adat: a munkamenet váltásakor alaphelyzetbe kerül (auth/sessionCache.ts).
 */
export const photoKeys = {
  /** Minden galérialista (pl. érvénytelenítéshez, amikor egy új kép nyilvános lett) */
  lists: () => ['photos', 'list'] as const,
  list: (query: string) => ['photos', 'list', query] as const,
  /** Minden adatlap (érvénytelenítéshez, pl. a fotós nevének változásakor – L23) */
  details: () => ['photos', 'detail'] as const,
  detail: (id: string) => ['photos', 'detail', id] as const,
  /** A saját képek minden oldala (érvénytelenítéshez, pl. módosítás vagy levétel után) */
  own: () => ['photos', 'own'] as const,
  ownPage: (page: number) => ['photos', 'own', page] as const,
};

const PHOTO_STATUSES: readonly unknown[] = [
  'PENDING_CHAIN',
  'REGISTERED',
  'CHAIN_FAILED',
  'HIDDEN',
] satisfies PhotoStatus[];

/** A szerver képazonosítóinak formája (UUID) – más értékre kérés sem indul. */
export const isPhotoId = (value: string): boolean => isUuid(value);

export const isPhotoStatus = (value: unknown): value is PhotoStatus =>
  PHOTO_STATUSES.includes(value);

const isOwner = (value: unknown): value is PhotoOwner =>
  isRecord(value) && isUuid(value.id) && isString(value.displayName);

/** A lista és az adatlap közös mezői. */
const hasPhotoFields = (photo: Fields): boolean =>
  isUuid(photo.id) &&
  isString(photo.title) &&
  isInteger(photo.priceHuf) &&
  isPhotoStatus(photo.status) &&
  isInteger(photo.width, 1) &&
  isInteger(photo.height, 1) &&
  (photo.thumbnailUrl === null || isMediaPath(photo.thumbnailUrl)) &&
  isCategory(photo.category) &&
  isOwner(photo.owner) &&
  isIsoDate(photo.createdAt);

const isPhotoListItem = (value: unknown): value is PhotoListItem =>
  isRecord(value) && hasPhotoFields(value) && isRatingSummary(value.rating);

/**
 * A tanúsítvány: a tranzakció adatai együtt ismertek vagy együtt hiányoznak (guards – hasTransactionProof),
 * és a linkek pontosan a kiírt hash, illetve cím Etherscan-oldalára mutatnak.
 */
function isCertificate(value: unknown): value is PhotoCertificate {
  if (!isRecord(value)) return false;
  const { contractAddress, contractUrl } = value;
  return (
    isIsoDate(value.registeredAt) &&
    isInteger(value.chainId, 1) &&
    isAddress(contractAddress) &&
    hasTransactionProof(value) &&
    (contractUrl === null || contractUrl === `${EXPLORER_BASE_URL}/address/${contractAddress}`)
  );
}

const isViewer = (value: unknown): value is PhotoViewer =>
  isRecord(value) &&
  typeof value.purchased === 'boolean' &&
  typeof value.canReview === 'boolean' &&
  (value.ownReviewId === null || isUuid(value.ownReviewId)) &&
  // Értékelni csak a vásárló tud, aki még nem értékelt (a szerver szabálya)
  (!value.canReview || (value.purchased && value.ownReviewId === null));

/** A függő tranzakció: hexa hash, a linkje pontosan a hash Etherscan-oldala. */
const isPendingTransaction = (value: unknown): value is PendingTransaction =>
  isRecord(value) && isTxHash(value.txHash) && isTransactionUrl(value.txUrl, value.txHash);

/** A feltöltés válasza: a kép adatai a néző jelzői nélkül. */
export const isUploadedPhoto = (value: unknown): value is UploadedPhoto =>
  isRecord(value) &&
  hasPhotoFields(value) &&
  isNullableString(value.description) &&
  isSha256(value.sha256) &&
  isDHash(value.dHash) &&
  (value.previewUrl === null || isMediaPath(value.previewUrl)) &&
  (value.certificate === null || isCertificate(value.certificate));

const isPhotoDetail = (value: unknown): value is PhotoDetail =>
  isRecord(value) &&
  isUploadedPhoto(value) &&
  (value.viewer === null || isViewer(value.viewer)) &&
  (value.pendingTransaction === null || isPendingTransaction(value.pendingTransaction));

const isPhotoList = (value: unknown): value is { photos: PhotoListItem[] } =>
  isRecord(value) && Array.isArray(value.photos) && value.photos.every(isPhotoListItem);

const isPhotoResponse = (value: unknown): value is { photo: PhotoDetail } =>
  isRecord(value) && isPhotoDetail(value.photo);

/** A módosítás (PATCH) válasza: a kép adatai a néző jelzői nélkül (PhotoDetailDto). */
const isUploadedPhotoResponse = (value: unknown): value is { photo: UploadedPhoto } =>
  isRecord(value) && isUploadedPhoto(value.photo);

const HIDDEN_BY: readonly unknown[] = ['OWNER', 'ADMIN', 'OWNER_AND_ADMIN'] satisfies HiddenBy[];

export const isHiddenBy = (value: unknown): value is HiddenBy => HIDDEN_BY.includes(value);

/** A saját kép eleme: ki rejtette el – pontosan a rejtett képnél (a szerver CHECK-je is ezt mondja). */
const isOwnPhotoListItem = (value: unknown): value is OwnPhotoListItem =>
  isRecord(value) &&
  isPhotoListItem(value) &&
  isNullableString(value.description) &&
  (value.hiddenBy === null || isHiddenBy(value.hiddenBy)) &&
  (value.status === 'HIDDEN') === (value.hiddenBy !== null) &&
  (value.pendingTransaction === null || isPendingTransaction(value.pendingTransaction));

const isOwnPhotoList = (value: unknown): value is { photos: OwnPhotoListItem[] } =>
  isRecord(value) && Array.isArray(value.photos) && value.photos.every(isOwnPhotoListItem);

/**
 * A galéria egy oldala; a query a kérés teljes lekérdezése („?q=…&pageSize=24” – galleryParams.ts). Más
 * alakú szöveg (pl. „/../admin”) nem viheti a kérést másik API-útvonalra: kérés nélkül RangeError
 * (guards – expectQueryString).
 */
export async function listPhotos(query: string, signal?: AbortSignal): Promise<PhotoPage> {
  const { data, meta } = await apiRequestEnvelope(`/photos${expectQueryString(query)}`, { signal });
  return { photos: expectValid(data, isPhotoList).photos, meta: expectValid(meta, isPageMeta) };
}

/** A kép adatlapja – a nem nyilvános képet csak a tulajdonos és az admin kapja meg (másnak 404). */
export async function getPhoto(id: string, signal?: AbortSignal): Promise<PhotoDetail> {
  const data = await apiRequest<unknown>(`/photos/${pathSegment(id)}`, { signal });
  return expectValid(data, isPhotoResponse).photo;
}

/** Az eredeti fájl védett letöltése (a szerver a munkamenet alapján dönt – L14). */
export const photoDownloadUrl = (id: string): string =>
  `${API_PREFIX}/photos/${pathSegment(id)}/download`;

/** A bejelentkezett felhasználó saját képei minden állapotban, a legújabb elöl (GET /api/me/photos). */
export async function listOwnPhotos(page: number, signal?: AbortSignal): Promise<OwnPhotoPage> {
  const { data, meta } = await apiRequestEnvelope(
    `/me/photos?page=${page}&pageSize=${OWN_PHOTOS_PAGE_SIZE}`,
    { signal },
  );
  return { photos: expectValid(data, isOwnPhotoList).photos, meta: expectValid(meta, isPageMeta) };
}

/** A kép adatainak módosítása – csak a tulajdonosnak; az elrejtett kép nem módosítható (409). */
export async function updatePhoto(id: string, input: PhotoUpdate): Promise<UploadedPhoto> {
  const data = await apiRequest<unknown>(`/photos/${pathSegment(id)}`, {
    method: 'PATCH',
    body: input,
  });
  return expectValid(data, isUploadedPhotoResponse).photo;
}

/** A kép levétele a galériából (elrejtés – DELETE /api/photos/:id); ismételve is sikeres (204). */
export async function hidePhoto(id: string): Promise<void> {
  await apiRequest<void>(`/photos/${pathSegment(id)}`, { method: 'DELETE' });
}
