// A képek végpontjainak kliense (galéria, adatlap): a válasz futásidejű ellenőrzése – a szerver adata
// külső adat. A képek és a blokklánc-böngésző linkjei csak a várt formában jutnak át (a médiafájl
// saját, /media/ alatti útvonal; a böngészőlink az Etherscan Sepolia-oldala), így egy hibás válasz se
// tehet az oldalra idegen forrást vagy javascript:-linket.
import { describe, expect, it } from 'vitest';

import { jsonResponse, stubFetch } from '../test/fetch';
import { REVIEW_ID } from '../test/orders';
import {
  certificate,
  detailResponse,
  galleryResponse,
  ownPhotoListItem,
  ownPhotosResponse,
  PENDING_TX_HASH,
  pendingPhoto,
  PHOTO_ID,
  photoDetail,
  photoListItem,
  uploadResponse,
  viewerFlags,
} from '../test/photos';
import {
  detailOfUploaded,
  getPhoto,
  hidePhoto,
  isPhotoId,
  listOwnPhotos,
  listPhotos,
  photoDownloadUrl,
  updatePhoto,
} from './photos.api';

const unexpected = { code: 'UNEXPECTED_RESPONSE' };

describe('listPhotos', () => {
  it('a GET /api/photos válaszából a képeket és a lapozás adatait adja', async () => {
    const fetchMock = stubFetch(galleryResponse([photoListItem()], { total: 1 }));

    await expect(listPhotos('?q=erd%C5%91&pageSize=24')).resolves.toEqual({
      photos: [photoListItem()],
      meta: { page: 1, pageSize: 24, total: 1, totalPages: 1 },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/photos?q=erd%C5%91&pageSize=24');
  });

  it('a hiányzó bélyegkép (null) és az értékelés nélküli kép (átlag null) is érvényes', async () => {
    const photo = photoListItem({ thumbnailUrl: null, rating: { average: null, count: 0 } });
    stubFetch(galleryResponse([photo]));

    await expect(listPhotos('')).resolves.toMatchObject({ photos: [photo] });
  });

  it('a hibás listaelemet és a hiányzó lapozási adatot váratlan válasznak tekinti', async () => {
    const responses = [
      galleryResponse([photoListItem({ priceHuf: '12500' })]),
      galleryResponse([photoListItem({ rating: { average: 6, count: 1 } })]),
      galleryResponse([photoListItem({ owner: null })]),
      galleryResponse([photoListItem({ owner: { id: '42', displayName: 'Fotós Fanni' } })]),
      galleryResponse([photoListItem({ status: 'DELETED' })]),
      galleryResponse([photoListItem({ createdAt: 'tegnap' })]),
      galleryResponse([photoListItem({ width: 0 })]),
      jsonResponse(200, { data: { photos: [] } }),
      jsonResponse(200, {
        data: { photos: [] },
        meta: { page: 0, pageSize: 24, total: 0, totalPages: 0 },
      }),
      jsonResponse(200, { data: { photos: 'nincs' }, meta: { page: 1 } }),
    ];
    stubFetch(...responses);

    for (let i = 0; i < responses.length; i += 1) {
      await expect(listPhotos('')).rejects.toMatchObject(unexpected);
    }
  });

  it('a lekérdezés csak „?”-lel kezdődhet: más API-útvonalra nem vihet, kérés sem indul', async () => {
    const fetchMock = stubFetch();

    for (const query of ['/../admin/users', '/1', 'pageSize=24', '?q=1#x']) {
      await expect(listPhotos(query)).rejects.toThrow(RangeError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a bélyegkép csak saját, /media/ alatti útvonal lehet (idegen forrás, javascript: nem jut át)', async () => {
    const urls = [
      'https://gonosz.hu/kep.jpg',
      '//gonosz.hu/kep.jpg',
      'javascript:alert(1)',
      '/api/admin',
      '/media/../api/admin',
      '/media/thumbnails/a b.webp',
    ];
    stubFetch(...urls.map((thumbnailUrl) => galleryResponse([photoListItem({ thumbnailUrl })])));

    for (let i = 0; i < urls.length; i += 1) {
      await expect(listPhotos('')).rejects.toMatchObject(unexpected);
    }
  });
});

describe('getPhoto', () => {
  it('a GET /api/photos/:id válaszából az ellenőrzött adatlapot adja', async () => {
    const fetchMock = stubFetch(detailResponse());

    await expect(getPhoto(PHOTO_ID)).resolves.toEqual(photoDetail());
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/photos/${PHOTO_ID}`);
  });

  it('a tanúsítvány nélküli (nem nyilvános) kép, a lokális lánc és a néző jelzője is érvényes', async () => {
    const photos = [
      photoDetail({ status: 'PENDING_CHAIN', certificate: null, viewer: viewerFlags() }),
      photoDetail({
        certificate: certificate({ txUrl: null, contractUrl: null, chainId: 31_337 }),
        viewer: viewerFlags({ purchased: true }),
      }),
      // Regisztrált, de elveszett nyugtájú kép: a tranzakció adatai nem ismertek
      photoDetail({ certificate: certificate({ blockNumber: null, txHash: null, txUrl: null }) }),
      photoDetail({ description: null, previewUrl: null }),
      // A tulajdonos regisztrációra váró képe a függő tranzakcióval (L21) – Sepolián linkkel, lokálisan nélküle
      pendingPhoto(),
      pendingPhoto({ pendingTransaction: { txHash: PENDING_TX_HASH, txUrl: null } }),
    ];
    stubFetch(...photos.map((photo) => detailResponse(photo)));

    for (const photo of photos) {
      await expect(getPhoto(PHOTO_ID)).resolves.toEqual(photo);
    }
  });

  it('a hibás tanúsítványt és a hibás néző-jelzőt váratlan válasznak tekinti', async () => {
    const photos = [
      photoDetail({ certificate: certificate({ txUrl: 'javascript:alert(1)' }) }),
      photoDetail({ certificate: certificate({ txUrl: 'https://gonosz.hu/tx/0x1' }) }),
      photoDetail({ certificate: certificate({ contractUrl: 'http://sepolia.etherscan.io/x' }) }),
      photoDetail({ certificate: certificate({ txHash: 'nem-hash' }) }),
      photoDetail({ certificate: certificate({ contractAddress: '0x123' }) }),
      photoDetail({ certificate: certificate({ blockNumber: -1 }) }),
      photoDetail({ certificate: certificate({ chainId: 0 }) }),
      photoDetail({ sha256: 'ab' }),
      photoDetail({ dHash: 'f0e4c8d0b0a0908' }),
      photoDetail({ viewer: { purchased: 'igen' } }),
      photoDetail({ certificate: 'nincs' }),
      photoDetail({ previewUrl: 'https://gonosz.hu/kep.jpg' }),
      // A függő tranzakció linkje is csak a kiírt hash Etherscan-oldala lehet; a hash hexa
      pendingPhoto({
        pendingTransaction: { txHash: PENDING_TX_HASH, txUrl: 'javascript:alert(1)' },
      }),
      pendingPhoto({ pendingTransaction: { txHash: 'nem-hash', txUrl: null } }),
      pendingPhoto({ pendingTransaction: 'nincs' }),
      photoDetail({ pendingTransaction: undefined }),
    ];
    stubFetch(...photos.map((photo) => detailResponse(photo)));

    for (let i = 0; i < photos.length; i += 1) {
      await expect(getPhoto(PHOTO_ID)).rejects.toMatchObject(unexpected);
    }
  });

  it('a szerver hibáját (pl. 404) továbbadja', async () => {
    stubFetch(jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'A kép nem található' } }));

    await expect(getPhoto(PHOTO_ID)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('isPhotoId', () => {
  it('csak a szerver azonosítóinak formája (UUID) érvényes – más címre kérés sem indul', () => {
    expect(isPhotoId(PHOTO_ID)).toBe(true);
    expect(isPhotoId(PHOTO_ID.toUpperCase())).toBe(true);
    for (const value of ['', '..', '123', `${PHOTO_ID}/download`, `${PHOTO_ID} `]) {
      expect(isPhotoId(value)).toBe(false);
    }
  });

  it('a szerver (Zod) szabálya szerint: a verziójel 1–8, a variáns 8–b; a nil és a max UUID is érvényes', () => {
    expect(isPhotoId('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isPhotoId('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true);
    // A szerver ezekre 400-at adna – a kliens kérés nélkül a „nem található” oldalt mutatja
    for (const value of [
      '00000000-0000-0000-0000-000000000001',
      '9a1b2c3d-4e5f-0a6b-8c7d-9e0f1a2b3c4d',
      '9a1b2c3d-4e5f-9a6b-8c7d-9e0f1a2b3c4d',
      '9a1b2c3d-4e5f-4a6b-7c7d-9e0f1a2b3c4d',
    ]) {
      expect(isPhotoId(value)).toBe(false);
    }
  });
});

describe('listOwnPhotos (L22)', () => {
  it('GET /api/me/photos lapozva; a tulajdonosnak szóló mezők (leírás, hiddenBy, függő tranzakció) is érvényesek', async () => {
    const photos = [
      ownPhotoListItem({ description: 'Eső után.' }),
      ownPhotoListItem({
        id: '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9',
        status: 'PENDING_CHAIN',
        pendingTransaction: {
          txHash: PENDING_TX_HASH,
          txUrl: `https://sepolia.etherscan.io/tx/${PENDING_TX_HASH}`,
        },
      }),
      ownPhotoListItem({
        id: '2c3d4e5f-6071-4829-93a4-b5c6d7e8f901',
        status: 'HIDDEN',
        hiddenBy: 'OWNER_AND_ADMIN',
        thumbnailUrl: null,
      }),
    ];
    const fetchMock = stubFetch(ownPhotosResponse(photos, { total: 3 }));

    await expect(listOwnPhotos(2)).resolves.toEqual({
      photos,
      meta: { page: 1, pageSize: 20, total: 3, totalPages: 1 },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/me/photos?page=2&pageSize=20');
  });

  it.each([
    ['ismeretlen hiddenBy', { status: 'HIDDEN', hiddenBy: 'MODERATOR', thumbnailUrl: null }],
    ['rejtett kép hiddenBy nélkül', { status: 'HIDDEN', hiddenBy: null, thumbnailUrl: null }],
    ['nem rejtett kép hiddenBy-jal', { status: 'REGISTERED', hiddenBy: 'OWNER' }],
    ['hibás függő tranzakció', { pendingTransaction: { txHash: 'nem-hash', txUrl: null } }],
    ['hiányzó leírás-mező', { description: undefined }],
  ])('a nem a várt formájú elem váratlan válasz: %s', async (_name, overrides) => {
    stubFetch(ownPhotosResponse([ownPhotoListItem(overrides)]));

    await expect(listOwnPhotos(1)).rejects.toMatchObject(unexpected);
  });
});

describe('updatePhoto és hidePhoto (L22)', () => {
  it('PATCH /api/photos/:id a módosítható mezőkkel; a válasz a kép ellenőrzött adatai', async () => {
    const fetchMock = stubFetch(jsonResponse(200, uploadResponse({ title: 'Új cím' })));

    const photo = await updatePhoto(PHOTO_ID, {
      title: 'Új cím',
      description: null,
      priceHuf: 9900,
      categoryId: 2,
    });

    expect(photo.title).toBe('Új cím');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`/api/photos/${PHOTO_ID}`);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Új cím',
      description: null,
      priceHuf: 9900,
      categoryId: 2,
    });
  });

  it('a módosítás hibás alakú válasza váratlan válasz', async () => {
    stubFetch(jsonResponse(200, { data: { photo: { id: PHOTO_ID } } }));

    await expect(
      updatePhoto(PHOTO_ID, { title: 'x', description: null, priceHuf: 1, categoryId: 1 }),
    ).rejects.toMatchObject(unexpected);
  });

  it('DELETE /api/photos/:id – a 204 válasz érték nélkül; a szerver hibája továbbmegy', async () => {
    const fetchMock = stubFetch(
      new Response(null, { status: 204 }),
      jsonResponse(409, { error: { code: 'CONFLICT', message: 'A kép állapota megváltozott' } }),
    );

    await expect(hidePhoto(PHOTO_ID)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('DELETE');
    await expect(hidePhoto(PHOTO_ID)).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
  });
});

describe('photoDownloadUrl', () => {
  it('az eredeti fájl védett letöltése (a szerver a munkamenet alapján dönt)', () => {
    expect(photoDownloadUrl(PHOTO_ID)).toBe(`/api/photos/${PHOTO_ID}/download`);
  });
});

describe('a néző jelzői (L23)', () => {
  it('a canReview és az ownReviewId kötelező: a régi, csak purchased alak és a hibás érték váratlan válasz', async () => {
    stubFetch(
      detailResponse(photoDetail({ viewer: { purchased: true } })),
      detailResponse(photoDetail({ viewer: viewerFlags({ canReview: 'igen' }) })),
      detailResponse(photoDetail({ viewer: viewerFlags({ ownReviewId: 'x' }) })),
      detailResponse(
        photoDetail({ viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }) }),
      ),
    );

    await expect(getPhoto(PHOTO_ID)).rejects.toMatchObject(unexpected);
    await expect(getPhoto(PHOTO_ID)).rejects.toMatchObject(unexpected);
    await expect(getPhoto(PHOTO_ID)).rejects.toMatchObject(unexpected);
    await expect(getPhoto(PHOTO_ID)).resolves.toMatchObject({
      viewer: { purchased: true, canReview: false, ownReviewId: REVIEW_ID },
    });
  });

  it('a feltöltés válasza adatlapként: a feltöltő nem vásárló, nem értékelhet (viewer), függő tranzakció nélkül', () => {
    expect(detailOfUploaded(uploadResponse().data.photo as never)).toMatchObject({
      viewer: viewerFlags(),
      pendingTransaction: null,
    });
  });
});

describe('a néző jelzőinek összefüggése (L23, biztonsági átnézés)', () => {
  it('a lehetetlen jelzőpár – értékelhet, de már értékelt, vagy nem is vásárló – váratlan válasz', async () => {
    stubFetch(
      detailResponse(
        photoDetail({
          viewer: viewerFlags({ purchased: true, canReview: true, ownReviewId: REVIEW_ID }),
        }),
      ),
      detailResponse(photoDetail({ viewer: viewerFlags({ canReview: true }) })),
    );

    await expect(getPhoto(PHOTO_ID)).rejects.toMatchObject(unexpected);
    await expect(getPhoto(PHOTO_ID)).rejects.toMatchObject(unexpected);
  });
});
