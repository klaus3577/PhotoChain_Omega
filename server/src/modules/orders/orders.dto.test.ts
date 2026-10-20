// A rendelések kliensnek küldött alakja (DTO): explicit mezőlista – a Stripe-munkamenet azonosítója
// és a kép eredetijének kulcsa le sem jön az adatbázisból –, az elrejtett kép bélyegképe nélkül. A
// vásárlásaim listához (L22) a fotós neve, a vevő saját értékelése, és hogy letölthető-e az eredeti,
// illetve írhat-e még értékelést.
import { describe, expect, it } from 'vitest';

import { createLocalStorage } from '../../services/storage/local.storage.js';
import { type OrderRow, orderSelect, toOrderDto } from './orders.dto.js';

const FILE_ID = '0b8f6c1e-2d4a-4f5b-9c3d-7e1f2a3b4c5d';
const BUYER_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const REVIEW_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const CREATED_AT = new Date('2026-10-04T10:00:00.000Z');
const PAID_AT = new Date('2026-10-04T10:01:30.000Z');

// A publicUrl csak a kulcsból számol, a lemezhez nem nyúl
const storage = createLocalStorage('nem-hasznalt-mappa');

type PhotoRow = OrderRow['photo'];

function row(overrides: Partial<OrderRow> = {}, photo: Partial<PhotoRow> = {}): OrderRow {
  return {
    id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
    status: 'PAID',
    amountHuf: 2500,
    createdAt: CREATED_AT,
    paidAt: PAID_AT,
    photo: {
      id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      title: 'Naplemente',
      status: 'REGISTERED',
      thumbnailKey: `thumbnails/${FILE_ID}.jpg`,
      hiddenBy: null,
      owner: { displayName: 'Fotós Fanni', isBlocked: false },
      reviews: [],
      ...photo,
    },
    ...overrides,
  };
}

describe('toOrderDto', () => {
  it('a rendelés állapota, összege, ideje, a kép címe, bélyegképe és fotósa; a kifizetett, nyilvános kép letölthető és értékelhető', () => {
    expect(toOrderDto(row(), storage)).toEqual({
      id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
      status: 'PAID',
      amountHuf: 2500,
      createdAt: CREATED_AT,
      paidAt: PAID_AT,
      downloadable: true,
      reviewable: true,
      review: null,
      photo: {
        id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        title: 'Naplemente',
        thumbnailUrl: `/media/thumbnails/${FILE_ID}.jpg`,
        ownerDisplayName: 'Fotós Fanni',
      },
    });
  });

  it('a vevő saját értékelése a rendelésben; aki már értékelt, nem értékelhet újra', () => {
    const dto = toOrderDto(row({}, { reviews: [{ id: REVIEW_ID, rating: 4 }] }), storage);

    expect(dto.review).toEqual({ id: REVIEW_ID, rating: 4 });
    expect(dto.reviewable).toBe(false);
  });

  it('a függő (még nem kifizetett) rendelés nem letölthető és nem értékelhető', () => {
    const dto = toOrderDto(row({ status: 'PENDING', paidAt: null }), storage);

    expect(dto).toMatchObject({ status: 'PENDING', downloadable: false, reviewable: false });
  });

  it('az elrejtett kép bélyegképe törlődött: nincs URL-je; a tulajdonos által elrejtett kép letölthető marad (a licenc nem vész el), de nem értékelhető', () => {
    const dto = toOrderDto(row({}, { status: 'HIDDEN', hiddenBy: 'OWNER' }), storage);

    expect(dto.photo.thumbnailUrl).toBeNull();
    expect(dto.downloadable).toBe(true);
    expect(dto.reviewable).toBe(false);
  });

  it('a moderátor által levett kép (ADMIN, OWNER_AND_ADMIN) nem tölthető le (L16)', () => {
    for (const hiddenBy of ['ADMIN', 'OWNER_AND_ADMIN'] as const) {
      const dto = toOrderDto(row({}, { status: 'HIDDEN', hiddenBy }), storage);

      expect(dto.downloadable).toBe(false);
      expect(dto.reviewable).toBe(false);
    }
  });

  it('a letiltott fotós képe nem nyilvános: nem értékelhető, de a megvett eredeti letölthető', () => {
    const dto = toOrderDto(
      row({}, { owner: { displayName: 'Fotós Fanni', isBlocked: true } }),
      storage,
    );

    expect(dto.reviewable).toBe(false);
    expect(dto.downloadable).toBe(true);
  });
});

describe('orderSelect', () => {
  it('a Stripe-munkamenet azonosítója, a vevő és az eredeti fájl kulcsa le sem jön; a fotósból csak a név és a tiltás; az értékelések közül csak a vevőé', () => {
    const select = orderSelect(BUYER_ID);

    expect(select).not.toHaveProperty('stripeSessionId');
    expect(select).not.toHaveProperty('buyerId');
    expect(select.photo.select).not.toHaveProperty('originalKey');
    expect(select.photo.select).not.toHaveProperty('ownerId');
    expect(select.photo.select.owner).toEqual({
      select: { displayName: true, isBlocked: true },
    });
    expect(select.photo.select.reviews).toEqual({
      where: { authorId: BUYER_ID },
      select: { id: true, rating: true },
      take: 1,
    });
  });
});
