// A képfeltöltés kliense (POST /api/photos, multipart űrlap, L21): XMLHttpRequest-tel, mert a fetch nem
// ad feltöltési haladást. A válasz ugyanabban a borítékban jön, mint a többi végponté – a hibából
// ApiError lesz (a 409 részleteivel együtt), a hálózati hiba és a megszakítás a fetch-burkolóval azonos
// módon jelenik meg. A 201 válasz a kép adatlapja a néző jelzője nélkül – ezt is ellenőrizzük.
import { describe, expect, it, vi } from 'vitest';

import { uploadResponse } from '../test/photos';
import { lastXhr, sentFields, stubXhr } from '../test/xhr';
import { ApiError } from './http';
import { uploadPhoto, type UploadInput } from './upload.api';

const image = new File([new Uint8Array(2048)], 'tocsa.jpg', { type: 'image/jpeg' });

const input = (overrides: Partial<UploadInput> = {}): UploadInput => ({
  file: image,
  title: 'Tócsa tükröződéssel',
  description: 'Eső után az udvaron.',
  priceHuf: '12500',
  categoryId: '2',
  ...overrides,
});

describe('uploadPhoto', () => {
  it('POST /api/photos multipart űrlappal: előbb a szöveges mezők, utána a kép („image”); a leírás csak ha van', async () => {
    stubXhr();

    const pending = uploadPhoto(input());
    const xhr = lastXhr();

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/photos');
    expect(xhr.requestHeaders).toEqual({ Accept: 'application/json' });
    expect(sentFields(xhr)).toEqual({
      title: 'Tócsa tükröződéssel',
      description: 'Eső után az udvaron.',
      priceHuf: '12500',
      categoryId: '2',
      image: { name: 'tocsa.jpg', type: 'image/jpeg' },
    });
    expect([...(xhr.body as FormData).keys()].at(-1)).toBe('image');
    xhr.respond(201, uploadResponse());
    await expect(pending).resolves.toMatchObject({ status: 'PENDING_CHAIN', certificate: null });

    uploadPhoto(input({ description: '' }));
    expect(sentFields(lastXhr())).not.toHaveProperty('description');
  });

  it('a feltöltés haladását továbbadja (bájt és összesen)', async () => {
    stubXhr();
    const onProgress = vi.fn();

    const pending = uploadPhoto(input(), { onProgress });
    lastXhr().progress(1024, 2048);
    lastXhr().progress(2048, 2048);
    lastXhr().respond(201, uploadResponse());
    await pending;

    expect(onProgress.mock.calls).toEqual([
      [{ loaded: 1024, total: 2048 }],
      [{ loaded: 2048, total: 2048 }],
    ]);
  });

  it('jelzi, amikor a törzs hiánytalanul elment (onSent) – onnantól a megszakítás a feldolgozást már nem állítja meg', async () => {
    stubXhr();
    const onSent = vi.fn();

    const pending = uploadPhoto(input(), { onSent });
    lastXhr().progress(2048, 2048);
    expect(onSent).not.toHaveBeenCalled();
    lastXhr().sent();
    lastXhr().respond(201, uploadResponse());
    await pending;

    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('a 201 válasz ellenőrzött adatlap (a néző jelzője nélkül); a hibás válasz váratlan', async () => {
    stubXhr();

    const valid = uploadPhoto(input());
    lastXhr().respond(201, uploadResponse());
    await expect(valid).resolves.toMatchObject({
      title: 'Őszi erdő ködben',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
    });

    const invalid = uploadPhoto(input());
    lastXhr().respond(201, uploadResponse({ sha256: 'rövid' }));
    await expect(invalid).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE', status: 201 });

    const noPhoto = uploadPhoto(input());
    lastXhr().respond(200, { data: {} });
    await expect(noPhoto).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('a szerver hibája ApiError a kóddal, az üzenettel és a részletekkel (409 – már feltöltött kép)', async () => {
    stubXhr();
    const details = {
      photoId: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      title: 'Őszi erdő ködben',
      ownerDisplayName: 'Fotós Fanni',
      uploadedAt: '2026-10-04T12:30:00.000Z',
      distance: 3,
    };

    const pending = uploadPhoto(input());
    lastXhr().respond(409, {
      error: {
        code: 'DUPLICATE_SIMILAR',
        message: 'Ehhez nagyon hasonló képet már feltöltöttek',
        details,
      },
    });

    await expect(pending).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_SIMILAR',
      message: 'Ehhez nagyon hasonló képet már feltöltöttek',
      details,
    });
  });

  it('a Retry-After fejléc másodpercei a hibába kerülnek (429, 503)', async () => {
    stubXhr();

    const pending = uploadPhoto(input());
    lastXhr().respond(
      503,
      { error: { code: 'SERVER_BUSY', message: 'Túl sok egyidejű feltöltés' } },
      { 'Retry-After': '30' },
    );

    await expect(pending).rejects.toMatchObject({ code: 'SERVER_BUSY', retryAfterSeconds: 30 });
  });

  it('hálózati hiba: NETWORK_ERROR (0); boríték nélküli 502: SERVER_UNAVAILABLE', async () => {
    stubXhr();

    const failed = uploadPhoto(input());
    lastXhr().fail();
    await expect(failed).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });

    const gateway = uploadPhoto(input());
    lastXhr().respond(502, '<html>Bad Gateway</html>', { 'content-type': 'text/html' });
    await expect(gateway).rejects.toMatchObject({ status: 502, code: 'SERVER_UNAVAILABLE' });
  });

  it('a megszakító jelzés megszakítja a kérést; az eredmény megszakítás (AbortError), nem ApiError', async () => {
    stubXhr();
    const controller = new AbortController();

    const pending = uploadPhoto(input(), { signal: controller.signal });
    controller.abort();

    expect(lastXhr().aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });

  it('a már megszakított jelzéssel kérés sem indul', async () => {
    stubXhr();
    const controller = new AbortController();
    controller.abort();

    await expect(uploadPhoto(input(), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(lastXhr).toThrow();
  });
});
