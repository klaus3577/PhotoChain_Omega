// Az admin felületnek küldött felhasználó- és kép-adatok (DTO, L16). Az admin látja az e-mail-címet,
// a szerepkört és a tiltást, a képeknél azt, ki rejtette el, és a lánc-regisztráció adatait (a
// CHAIN_FAILED képek újrapróbálásához) – a jelszó-hash, az eredeti fájl kulcsa és a gázadat viszont
// itt sem kerül a válaszba: a Prisma-lekérdezés explicit mezőlistával (select) fut, és a leképezés is
// csak a felsorolt mezőket viszi át.
// Forrás: Prisma ORM v7 – Select fields, https://www.prisma.io/docs/orm/v7/prisma-client/queries/select-fields
// (adaptálva)
import type { HiddenBy, Prisma, Role } from '../../generated/prisma/client.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import {
  PHOTO_SUMMARY_SELECT,
  type PhotoSummaryDto,
  toPhotoSummaryDto,
} from '../photos/photos.dto.js';

/** A felhasználók listájának mezői; a képek száma minden állapotban. */
export const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isBlocked: true,
  createdAt: true,
  _count: { select: { photos: true } },
} as const satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_SELECT }>;

export interface AdminUserDto {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isBlocked: boolean;
  createdAt: Date;
  /** A felhasználó képeinek száma (minden állapotban) */
  photoCount: number;
}

export function toAdminUserDto(user: AdminUserRow): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isBlocked: user.isBlocked,
    createdAt: user.createdAt,
    photoCount: user._count.photos,
  };
}

/** A képek listájának mezői: a galéria mezői, kiegészítve a moderáláshoz szükségesekkel. */
export const ADMIN_PHOTO_SELECT = {
  ...PHOTO_SUMMARY_SELECT,
  hiddenBy: true,
  chainTxHash: true,
  registeredAt: true,
  owner: { select: { id: true, displayName: true, isBlocked: true } },
} as const satisfies Prisma.PhotoSelect;

export type AdminPhotoRow = Prisma.PhotoGetPayload<{ select: typeof ADMIN_PHOTO_SELECT }>;

export interface AdminPhotoDto extends Omit<PhotoSummaryDto, 'owner'> {
  owner: { id: string; displayName: string; isBlocked: boolean };
  /** Ki rejtette el (csak HIDDEN állapotban): a visszaállítás csak az ADMIN-nál engedélyezett */
  hiddenBy: HiddenBy | null;
  /** A regisztrációs tranzakció hash-e (a CHAIN_FAILED képnél is lehet – pl. időtúllépés után) */
  chainTxHash: string | null;
  registeredAt: Date | null;
}

export function toAdminPhotoDto(
  photo: AdminPhotoRow,
  storage: Pick<StorageService, 'publicUrl'>,
): AdminPhotoDto {
  return {
    ...toPhotoSummaryDto(photo, storage),
    owner: {
      id: photo.owner.id,
      displayName: photo.owner.displayName,
      isBlocked: photo.owner.isBlocked,
    },
    hiddenBy: photo.hiddenBy,
    chainTxHash: photo.chainTxHash,
    registeredAt: photo.registeredAt,
  };
}
