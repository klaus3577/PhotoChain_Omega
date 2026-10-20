// A képek kliensnek küldött alakja (DTO). A Prisma-lekérdezés explicit mezőlistával (select) fut: az
// eredeti fájl kulcsa, a gázadat és a tulajdonos e-mailje így le sem jön az adatbázisból. A tanúsítvány
// (a lánc-regisztráció adatai) csak a regisztrált képnél jelenik meg; az elrejtett kép előnézete és
// bélyegképe törlődött, ezért nincs URL-je. A listák eleme a kép értékeléseinek összesítését, az
// adatlap a bejelentkezett néző jelzőjét (megvette-e) is tartalmazza (L20).
// Forrás: Prisma ORM v7 – Select fields, https://www.prisma.io/docs/orm/v7/prisma-client/queries/select-fields
// (adaptálva)
import type { HiddenBy, PhotoStatus, Prisma } from '../../generated/prisma/client.js';
import {
  addressUrl,
  transactionProof,
  type TransactionProof,
  transactionUrl,
} from '../../services/chainExplorer.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import type { RatingSummary } from '../reviews/reviews.rating.js';

/** A galéria és a saját képek listájának mezői. */
export const PHOTO_SUMMARY_SELECT = {
  id: true,
  title: true,
  priceHuf: true,
  status: true,
  width: true,
  height: true,
  thumbnailKey: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  owner: { select: { id: true, displayName: true } },
} as const satisfies Prisma.PhotoSelect;

/** Az adatlap (és a feltöltés válaszának) mezői: a lista mezői, a leírás, az ujjlenyomatok, a lánc adatai. */
export const PHOTO_DETAIL_SELECT = {
  ...PHOTO_SUMMARY_SELECT,
  description: true,
  sha256: true,
  dHash: true,
  previewKey: true,
  chainTxHash: true,
  chainBlockNumber: true,
  registeredAt: true,
} as const satisfies Prisma.PhotoSelect;

/**
 * A tulajdonos saját képeinek listája (L22): a lista mezői, és ami csak a tulajdonosnak szól – ki
 * rejtette el a képet, és a még meg nem erősített regisztrációs tranzakció hash-e.
 */
export const OWN_PHOTO_SELECT = {
  ...PHOTO_SUMMARY_SELECT,
  description: true,
  hiddenBy: true,
  chainTxHash: true,
} as const satisfies Prisma.PhotoSelect;

export type PhotoSummaryRow = Prisma.PhotoGetPayload<{ select: typeof PHOTO_SUMMARY_SELECT }>;
export type PhotoDetailRow = Prisma.PhotoGetPayload<{ select: typeof PHOTO_DETAIL_SELECT }>;
export type OwnPhotoRow = Prisma.PhotoGetPayload<{ select: typeof OWN_PHOTO_SELECT }>;

export interface PhotoSummaryDto {
  id: string;
  title: string;
  priceHuf: number;
  status: PhotoStatus;
  width: number;
  height: number;
  /** Az elrejtett kép bélyegképe törlődött: null */
  thumbnailUrl: string | null;
  category: { id: number; name: string; slug: string };
  owner: { id: string; displayName: string };
  createdAt: Date;
}

/**
 * A regisztráció tanúsítványa: a lánc szerinti idő, a lezárt tranzakció adatai, a hálózat és a
 * szerződés, amelyben a rekord van (a kliens adatlapjának tanúsítvány-panelje, L20).
 */
export interface PhotoCertificate extends TransactionProof {
  registeredAt: Date;
  /** A hálózat (CHAIN_ID): 11 155 111 – Sepolia, 31 337 – lokális Hardhat */
  chainId: number;
  /** A PhotoRegistry szerződés címe ezen a hálózaton */
  contractAddress: string;
  /** A szerződés oldala a blokklánc-böngészőben; a lokális hálózaton null */
  contractUrl: string | null;
}

export interface PhotoDetailDto extends PhotoSummaryDto {
  description: string | null;
  sha256: string;
  dHash: string;
  /** Az elrejtett kép előnézete törlődött: null */
  previewUrl: string | null;
  /** Csak a regisztrált (REGISTERED) képnél, egyébként null */
  certificate: PhotoCertificate | null;
}

/** A bejelentkezett nézőre vonatkozó jelzők az adatlapon (L20, L23). */
export interface PhotoViewerFlags {
  /** Van kifizetett (PAID) rendelése a képre – az eredeti fájlt letöltheti */
  purchased: boolean;
  /** Írhat értékelést: vásárló, a kép nyilvános, nem a sajátja, és még nem értékelte (L23) */
  canReview: boolean;
  /** A néző saját értékelésének azonosítója, ha már értékelte a képet (L23) */
  ownReviewId: string | null;
}

/**
 * A még meg nem erősített regisztrációs tranzakció (L21): a tulajdonos (és az admin) a regisztrációra
 * váró képnél látja, hogy a tranzakció már elment, és a láncböngészőben követheti.
 */
export interface PendingTransaction {
  txHash: string;
  /** A tranzakció a blokklánc-böngészőben; a lokális hálózaton null */
  txUrl: string | null;
}

/**
 * Az adatlap a néző szemszögéből (GET /api/photos/:id): bejelentkezés nélkül a viewer null; a függő
 * tranzakciót csak a tulajdonos és az admin kapja meg (más a nem nyilvános képet nem is látja).
 */
export interface PhotoDetailViewDto extends PhotoDetailDto {
  viewer: PhotoViewerFlags | null;
  pendingTransaction: PendingTransaction | null;
}

/** A lista (galéria, saját képek) eleme: a kép adatai és az értékeléseinek összesítése (L20). */
export interface PhotoListItemDto extends PhotoSummaryDto {
  rating: RatingSummary;
}

/**
 * A tulajdonos saját képeinek listaeleme (L22, vezérlőpult): a lista eleme, és ami csak neki szól –
 * ki rejtette el a képet („Te vetted le” / „Moderátor eltávolította”), és a függő tranzakció.
 */
export interface OwnPhotoListItemDto extends PhotoListItemDto {
  /** A szerkesztő űrlaphoz (a lista eleme különben nem adja) */
  description: string | null;
  /** Csak az elrejtett (HIDDEN) képnél; egyébként null */
  hiddenBy: HiddenBy | null;
  pendingTransaction: PendingTransaction | null;
}

export interface PhotoDtoContext {
  storage: Pick<StorageService, 'publicUrl'>;
  /** A blokklánc-hálózat (CHAIN_ID) – ebből készül a tranzakció és a szerződés linkje */
  chainId: number;
  /**
   * A PhotoRegistry címe ezen a hálózaton (a beállított telepítésé). Az adatbázis nem tárolja képenként:
   * a prototípusban hálózatonként egyetlen szerződés van, a csere új telepítést (és adatbázist) jelent.
   */
  contractAddress: string;
}

/** A nyilvános fájl URL-je; az elrejtett képé nincs (a fájl törlődött). */
export function publicUrlOf(
  key: string,
  status: PhotoStatus,
  storage: Pick<StorageService, 'publicUrl'>,
): string | null {
  return status === 'HIDDEN' ? null : storage.publicUrl(key);
}

export function toPhotoSummaryDto(
  photo: PhotoSummaryRow,
  storage: Pick<StorageService, 'publicUrl'>,
): PhotoSummaryDto {
  return {
    id: photo.id,
    title: photo.title,
    priceHuf: photo.priceHuf,
    status: photo.status,
    width: photo.width,
    height: photo.height,
    thumbnailUrl: publicUrlOf(photo.thumbnailKey, photo.status, storage),
    category: { id: photo.category.id, name: photo.category.name, slug: photo.category.slug },
    owner: { id: photo.owner.id, displayName: photo.owner.displayName },
    createdAt: photo.createdAt,
  };
}

export function toPhotoListItemDto(
  photo: PhotoSummaryRow,
  storage: Pick<StorageService, 'publicUrl'>,
  rating: RatingSummary,
): PhotoListItemDto {
  return { ...toPhotoSummaryDto(photo, storage), rating };
}

export function toOwnPhotoListItemDto(
  photo: OwnPhotoRow,
  storage: Pick<StorageService, 'publicUrl'>,
  rating: RatingSummary,
  chainId: number,
): OwnPhotoListItemDto {
  return {
    ...toPhotoListItemDto(photo, storage, rating),
    description: photo.description,
    hiddenBy: photo.hiddenBy,
    pendingTransaction: pendingTransactionOf(photo, chainId),
  };
}

/** A tanúsítvány – csak a regisztrált képé (a CHECK szerint annak mindig van regisztrációs ideje). */
function certificateOf(
  photo: PhotoDetailRow,
  { chainId, contractAddress }: Omit<PhotoDtoContext, 'storage'>,
): PhotoCertificate | null {
  if (photo.status !== 'REGISTERED' || photo.registeredAt === null) return null;
  return {
    registeredAt: photo.registeredAt,
    ...transactionProof(chainId, photo),
    chainId,
    contractAddress,
    contractUrl: addressUrl(chainId, contractAddress),
  };
}

/**
 * A függő tranzakció – csak a regisztrációra váró képnél, és csak ha a tranzakció már elment (a hash a
 * küldés előtt kerül az adatbázisba – L11); a lezárt tranzakciót a tanúsítvány adja.
 */
export function pendingTransactionOf(
  photo: Pick<PhotoDetailRow, 'status' | 'chainTxHash'>,
  chainId: number,
): PendingTransaction | null {
  if (photo.status !== 'PENDING_CHAIN' || photo.chainTxHash === null) return null;
  return { txHash: photo.chainTxHash, txUrl: transactionUrl(chainId, photo.chainTxHash) };
}

export function toPhotoDetailDto(
  photo: PhotoDetailRow,
  { storage, ...chain }: PhotoDtoContext,
): PhotoDetailDto {
  return {
    ...toPhotoSummaryDto(photo, storage),
    description: photo.description,
    sha256: photo.sha256,
    dHash: photo.dHash,
    previewUrl: publicUrlOf(photo.previewKey, photo.status, storage),
    certificate: certificateOf(photo, chain),
  };
}
