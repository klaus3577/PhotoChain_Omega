// A galéria és az adatlap tesztadatai a szerver válaszainak formájában (server/src/modules/photos/
// photos.dto.ts, reviews/reviews.dto.ts, categories). Az oldal egyszerre induló kérései (a galéria képei
// és kategóriái, az adatlap képe és értékelései) útvonalhoz kötött választ kapnak (galleryResponses,
// detailResponses): a kérések sorrendje így nem számít.
import { forPath, jsonResponse, type Outcome } from './fetch';

export const PHOTO_ID = '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const OWNER_ID = '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e';
export const SHA256 = `5a1f9c3e${'ab'.repeat(24)}8b20d47e`;
export const DHASH = 'f0e4c8d0b0a09080';
export const TX_HASH = `0x9c4e${'cd'.repeat(28)}1b7a`;
export const CONTRACT = '0x6eF681b51da3c7E7E5d59ac96b7d80e9A59e97C7';
export const SEPOLIA_CHAIN_ID = 11_155_111;

export const CATEGORIES = [
  { id: 1, name: 'Tájkép', slug: 'tajkep' },
  { id: 2, name: 'Portré', slug: 'portre' },
];

/** A lista és az adatlap közös mezői (PhotoSummaryDto). */
function photoSummary() {
  return {
    id: PHOTO_ID,
    title: 'Őszi erdő ködben',
    priceHuf: 12500,
    status: 'REGISTERED',
    width: 1600,
    height: 1067,
    thumbnailUrl: `/media/thumbnails/${PHOTO_ID}.webp`,
    category: CATEGORIES[0],
    owner: { id: OWNER_ID, displayName: 'Fotós Fanni' },
    createdAt: '2026-10-04T12:30:00.000Z',
  };
}

/** A galéria listaeleme (PhotoListItemDto). */
export function photoListItem(overrides: Record<string, unknown> = {}) {
  return { ...photoSummary(), rating: { average: 4.63, count: 12 }, ...overrides };
}

/** A tulajdonos saját képeinek listaeleme (OwnPhotoListItemDto, L22): ki rejtette el, függő tranzakció. */
export function ownPhotoListItem(overrides: Record<string, unknown> = {}) {
  return {
    ...photoListItem(),
    description: null,
    hiddenBy: null,
    pendingTransaction: null,
    ...overrides,
  };
}

/** GET /api/me/photos válasza: a saját képek és a lapozás adatai. */
export function ownPhotosResponse(photos: unknown[] = [], meta: MetaOverrides = {}) {
  const pageSize = meta.pageSize ?? 20;
  const total = meta.total ?? photos.length;
  return jsonResponse(200, {
    data: { photos },
    meta: { page: 1, pageSize, total, totalPages: Math.ceil(total / pageSize), ...meta },
  });
}

/** A regisztráció tanúsítványa (Sepolián, Etherscan-linkekkel). */
export function certificate(overrides: Record<string, unknown> = {}) {
  return {
    registeredAt: '2026-10-04T12:32:15.000Z',
    blockNumber: 11_820_993,
    txHash: TX_HASH,
    txUrl: `https://sepolia.etherscan.io/tx/${TX_HASH}`,
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: CONTRACT,
    contractUrl: `https://sepolia.etherscan.io/address/${CONTRACT}`,
    ...overrides,
  };
}

/** Az adatlap (PhotoDetailViewDto) – alapból névtelen nézőnek. */
export function photoDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...photoSummary(),
    description: 'Kora reggeli köd a bükkösben, október elején.',
    sha256: SHA256,
    dHash: DHASH,
    previewUrl: `/media/previews/${PHOTO_ID}.webp`,
    certificate: certificate(),
    viewer: null,
    pendingTransaction: null,
    ...overrides,
  };
}

/** A bejelentkezett néző jelzői (PhotoViewerFlags) – alapból nem vásárló, nem értékelhet (L20, L23). */
export function viewerFlags(overrides: Record<string, unknown> = {}) {
  return { purchased: false, canReview: false, ownReviewId: null, ...overrides };
}

/** A tulajdonos regisztrációra váró képe, a már elküldött (függő) tranzakcióval (L21). */
export const PENDING_TX_HASH = `0x7a1c${'ef'.repeat(28)}2d9b`;
export function pendingPhoto(overrides: Record<string, unknown> = {}) {
  return photoDetail({
    status: 'PENDING_CHAIN',
    certificate: null,
    viewer: viewerFlags(),
    pendingTransaction: {
      txHash: PENDING_TX_HASH,
      txUrl: `https://sepolia.etherscan.io/tx/${PENDING_TX_HASH}`,
    },
    ...overrides,
  });
}

/** A feltöltés (POST /api/photos) 201-es válasza: adatlap a néző jelzője és függő tranzakció nélkül. */
export function uploadResponse(overrides: Record<string, unknown> = {}) {
  const detail = photoDetail({ status: 'PENDING_CHAIN', certificate: null, ...overrides });
  const photo = Object.fromEntries(
    Object.entries(detail).filter(([key]) => key !== 'viewer' && key !== 'pendingTransaction'),
  );
  return { data: { photo } };
}

interface MetaOverrides {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

/** GET /api/photos válasza: a képek és a lapozás adatai. */
export function galleryResponse(photos: unknown[] = [], meta: MetaOverrides = {}) {
  const pageSize = meta.pageSize ?? 24;
  const total = meta.total ?? photos.length;
  return jsonResponse(200, {
    data: { photos },
    meta: { page: 1, pageSize, total, totalPages: Math.ceil(total / pageSize), ...meta },
  });
}

/** GET /api/categories válasza. */
export const categoriesResponse = () => jsonResponse(200, { data: { categories: CATEGORIES } });

/** A galéria (kezdőlap) két kérésének válasza – útvonalhoz kötve, a sorrendjük nem számít. */
export const galleryResponses = (photos: unknown[] = [], meta: MetaOverrides = {}) => [
  forPath('/api/photos', galleryResponse(photos, meta)),
  forPath('/api/categories', categoriesResponse()),
];

/** GET /api/photos/:id válasza. */
export const detailResponse = (photo: unknown = photoDetail()) =>
  jsonResponse(200, { data: { photo } });

/** Egy értékelés (ReviewDto). */
export function review(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    rating: 5,
    comment: 'Gyönyörű fények, a nyomtatott változat is remek lett.',
    createdAt: '2026-10-06T09:15:00.000Z',
    author: { id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', displayName: 'Vásárló Vera' },
    ...overrides,
  };
}

/** GET /api/photos/:id/reviews válasza. */
export function reviewsResponse(
  reviews: unknown[] = [],
  {
    rating = { average: reviews.length > 0 ? 4.63 : null, count: reviews.length },
    meta = {},
  }: { rating?: { average: number | null; count: number }; meta?: MetaOverrides } = {},
) {
  const pageSize = meta.pageSize ?? 5;
  const total = meta.total ?? rating.count;
  return jsonResponse(200, {
    data: { reviews, rating },
    meta: { page: 1, pageSize, total, totalPages: Math.ceil(total / pageSize), ...meta },
  });
}

/**
 * Az adatlap két kérésének válasza – útvonalhoz kötve, a sorrendjük nem számít: a kép (vagy a helyette
 * adott hiba) és az értékelések első oldala.
 */
export const detailResponses = (
  detail: Outcome = detailResponse(),
  reviews: Outcome = reviewsResponse(),
) => [
  forPath(`/api/photos/${PHOTO_ID}`, detail),
  forPath(`/api/photos/${PHOTO_ID}/reviews`, reviews),
];
