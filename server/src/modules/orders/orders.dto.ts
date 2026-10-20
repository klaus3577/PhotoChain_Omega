// A rendelések kliensnek küldött alakja (DTO). A Prisma-lekérdezés explicit mezőlistával (select)
// fut: a Stripe-munkamenet azonosítója, a vevő azonosítója és a kép eredetijének kulcsa le sem jön
// az adatbázisból. Az elrejtett kép bélyegképe törlődött, ezért annak nincs URL-je. A vásárlásaim
// listához (L22) a rendelés megmondja a fotós nevét, a vevő saját értékelését, és hogy az eredeti
// letölthető-e (kifizetett rendelés, és a képet a moderátor nem vette le – ugyanaz a szabály, mint a
// letöltésé, photos.download.ts), illetve írhat-e még értékelést (kifizetett rendelés, nyilvános
// kép, még nincs értékelése – mint az értékelés írásánál, reviews.service.ts). Elfogadott maradék
// kockázat (biztonsági átnézés, L22): a letiltott fotós kifizetett, nem rejtett képénél a reviewable
// hamis értékéből a vevő kikövetkeztetheti a tiltást – a tiltás mezője (isBlocked) maga nem kerül a
// válaszba, és a vevő a kép adatlapjának 404-éből eddig is láthatta ugyanezt.
// Forrás: Prisma ORM v7 – Select fields (beágyazott reláció szűrése: select + where),
// https://www.prisma.io/docs/orm/v7/prisma-client/queries/select-fields (adaptálva)
import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import { publicUrlOf } from '../photos/photos.dto.js';
import { isTakenDown } from '../photos/photos.hiding.js';
import { isPublic } from '../photos/photos.visibility.js';

/**
 * A rendelés mezői a vevő szemszögéből: a kép értékelései közül csak a vevő sajátja (legfeljebb egy
 * lehet – az egyedi index miatt), a fotósból csak a név és a tiltás (a nyilvánossághoz).
 */
export function orderSelect(buyerId: string) {
  return {
    id: true,
    status: true,
    amountHuf: true,
    createdAt: true,
    paidAt: true,
    photo: {
      select: {
        id: true,
        title: true,
        status: true,
        thumbnailKey: true,
        hiddenBy: true,
        owner: { select: { displayName: true, isBlocked: true } },
        reviews: { where: { authorId: buyerId }, select: { id: true, rating: true }, take: 1 },
      },
    },
  } as const satisfies Prisma.OrderSelect;
}

export type OrderRow = Prisma.OrderGetPayload<{ select: ReturnType<typeof orderSelect> }>;

/** A vevő saját értékelése a képről (a vezérlőpult „Értékelted: 4 / 5” sorához). */
export interface OrderReviewDto {
  id: string;
  /** 1–5 csillag */
  rating: number;
}

export interface OrderDto {
  id: string;
  status: OrderStatus;
  /** A checkoutkori ár forintban */
  amountHuf: number;
  createdAt: Date;
  /** A fizetés ideje (a webhook rögzíti); a nem kifizetett rendelésnél null */
  paidAt: Date | null;
  /** Letölthető-e az eredeti: kifizetett rendelés, és a képet a moderátor nem vette le (L16) */
  downloadable: boolean;
  /** Írhat-e értékelést: kifizetett rendelés, nyilvános kép, és még nem értékelte (L15) */
  reviewable: boolean;
  /** A vevő saját értékelése, ha már írt */
  review: OrderReviewDto | null;
  photo: {
    id: string;
    title: string;
    /** Az elrejtett kép bélyegképe törlődött: null */
    thumbnailUrl: string | null;
    ownerDisplayName: string;
  };
}

export function toOrderDto(order: OrderRow, storage: Pick<StorageService, 'publicUrl'>): OrderDto {
  const paid = order.status === 'PAID';
  const review = order.photo.reviews[0] ?? null;
  return {
    id: order.id,
    status: order.status,
    amountHuf: order.amountHuf,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    downloadable: paid && !isTakenDown(order.photo.hiddenBy),
    reviewable: paid && isPublic(order.photo) && review === null,
    review: review === null ? null : { id: review.id, rating: review.rating },
    photo: {
      id: order.photo.id,
      title: order.photo.title,
      thumbnailUrl: publicUrlOf(order.photo.thumbnailKey, order.photo.status, storage),
      ownerDisplayName: order.photo.owner.displayName,
    },
  };
}
