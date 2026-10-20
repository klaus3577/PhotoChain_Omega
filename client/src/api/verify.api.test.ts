// A hitelesség-ellenőrző kliense (L24): POST /api/verify a fájllal (XMLHttpRequest, haladással – mint a
// feltöltés), GET /api/verify/:sha256 a hash-sel. A válasz külső adat: a három eredmény mezői csak
// egymással összhangban fogadhatók el (NOT_FOUND-nál nincs regisztráció, SIMILAR-nál van távolság), a
// tranzakció linkje csak a kiírt hash Etherscan-oldala lehet, a bélyegkép csak saját /media/ útvonal.
import { describe, expect, it, vi } from 'vitest';

import { requestedUrls, stubFetch } from '../test/fetch';
import { SHA256 } from '../test/photos';
import { errorResponse } from '../test/users';
import {
  notFoundResult,
  registration,
  similarResult,
  UNKNOWN_SHA256,
  verifiedPhoto,
  verifiedResult,
  verifyResponse,
} from '../test/verify';
import { lastXhr, sentFields, stubXhr } from '../test/xhr';
import { ApiError } from './http';
import {
  isVerificationResult,
  normalizeSha256,
  VERIFY_FILE_NAME,
  verifyFile,
  verifyHash,
} from './verify.api';

const image = new File([new Uint8Array(2048)], 'tocsa.jpg', { type: 'image/jpeg' });

describe('normalizeSha256', () => {
  it('a 64 hexa karaktert kisbetűs, előtag nélküli alakra hozza (az Etherscanről másolva 0x előtaggal, nagybetűvel jöhet), a széleit levágja', () => {
    expect(normalizeSha256(SHA256)).toBe(SHA256);
    expect(normalizeSha256(`  0x${SHA256.toUpperCase()} `)).toBe(SHA256);
    expect(normalizeSha256(`0X${SHA256}`)).toBe(SHA256);
  });

  it('más szövegre null (üres, rövid, hosszú, nem hexa, belső szóköz)', () => {
    for (const text of [
      '',
      'nem-hash',
      SHA256.slice(1),
      `${SHA256}0`,
      SHA256.replace('a', 'g'),
      `${SHA256.slice(0, 32)} ${SHA256.slice(32)}`,
    ]) {
      expect(normalizeSha256(text)).toBeNull();
    }
  });
});

describe('verifyHash', () => {
  it('GET /api/verify/:sha256 a normalizált hash-sel; a válasz az ellenőrzött eredmény (dHash nélkül)', async () => {
    const fetchMock = stubFetch(verifyResponse(verifiedResult({ dHash: null })));

    const result = await verifyHash(`0x${SHA256.toUpperCase()}`);

    expect(requestedUrls(fetchMock)).toEqual([`/api/verify/${SHA256}`]);
    expect(result).toMatchObject({ result: 'VERIFIED', sha256: SHA256, dHash: null });
  });

  it('hibás hash-sel kérés sem indul (RangeError)', async () => {
    await expect(verifyHash('nem-hash')).rejects.toThrow(RangeError);
  });

  it('a válasznak a kért hash-ről kell szólnia (dHash nélkül) – más hash vagy fájl-eredmény váratlan', async () => {
    stubFetch(verifyResponse(verifiedResult({ sha256: UNKNOWN_SHA256, dHash: null })));
    await expect(verifyHash(SHA256)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });

    stubFetch(verifyResponse(verifiedResult()));
    await expect(verifyHash(SHA256)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('a megszakító jelzés megszakítja a kérést (AbortError)', async () => {
    stubFetch();
    const controller = new AbortController();

    const pending = verifyHash(SHA256, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('a nem a várt alakú válasz váratlan (UNEXPECTED_RESPONSE)', async () => {
    stubFetch(verifyResponse(verifiedResult({ registration: null })));

    await expect(verifyHash(SHA256)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('a szerver hibája ApiError a Retry-After másodperceivel (503 – a lánc nem érhető el)', async () => {
    stubFetch(
      errorResponse(
        503,
        'CHAIN_UNAVAILABLE',
        'A blokklánc most nem érhető el – az ellenőrzés később megismételhető',
        { 'Retry-After': '60' },
      ),
    );

    await expect(verifyHash(SHA256)).rejects.toMatchObject({
      status: 503,
      code: 'CHAIN_UNAVAILABLE',
      retryAfterSeconds: 60,
    });
  });
});

describe('verifyFile', () => {
  it('POST /api/verify multipart űrlappal, a kép az „image” mezőben; a válasz az ellenőrzött eredmény', async () => {
    stubXhr();

    const pending = verifyFile(image);
    const xhr = lastXhr();

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/verify');
    expect(xhr.requestHeaders).toEqual({ Accept: 'application/json' });
    // A fájl neve nem megy el (adattakarékosság: a szervernek nem kell, a kép tartalma dönt)
    expect(sentFields(xhr)).toEqual({ image: { name: VERIFY_FILE_NAME, type: 'image/jpeg' } });
    xhr.respond(200, { data: similarResult() });
    await expect(pending).resolves.toMatchObject({ result: 'SIMILAR', distance: 3 });
  });

  it('a haladást és a törzs elküldését továbbadja; a jelzés megszakítja (AbortError, nem ApiError)', async () => {
    stubXhr();
    const onProgress = vi.fn();
    const onSent = vi.fn();
    const controller = new AbortController();

    const pending = verifyFile(image, { onProgress, onSent, signal: controller.signal });
    lastXhr().progress(1024, 2048);
    lastXhr().sent();
    controller.abort();

    expect(onProgress).toHaveBeenCalledWith({ loaded: 1024, total: 2048 });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(lastXhr().aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });

  it('a szerver hibája ApiError (400 – túl kicsi kép; 429 a Retry-After másodperceivel); hálózati hiba NETWORK_ERROR', async () => {
    stubXhr();

    const tooSmall = verifyFile(image);
    lastXhr().respond(400, { error: { code: 'IMAGE_TOO_SMALL', message: 'a kép túl kicsi' } });
    await expect(tooSmall).rejects.toMatchObject({
      status: 400,
      code: 'IMAGE_TOO_SMALL',
      message: 'a kép túl kicsi',
    });

    const limited = verifyFile(image);
    lastXhr().respond(
      429,
      { error: { code: 'RATE_LIMITED', message: 'Túl sok ellenőrzés' } },
      { 'Retry-After': '30' },
    );
    await expect(limited).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 30 });

    const failed = verifyFile(image);
    lastXhr().fail();
    await expect(failed).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('a nem a várt alakú 200-as válasz váratlan', async () => {
    stubXhr();

    const pending = verifyFile(image);
    lastXhr().respond(200, { data: { result: 'TALAN' } });

    await expect(pending).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE', status: 200 });
  });
});

describe('isVerificationResult', () => {
  it('a három eredmény a szerver alakjában elfogadott (hash alapján dHash nélkül; rejtett képnél a kép adatai és a tranzakció nélkül; lokális láncon link nélkül)', () => {
    expect(isVerificationResult(verifiedResult())).toBe(true);
    expect(isVerificationResult(verifiedResult({ dHash: null }))).toBe(true);
    expect(
      isVerificationResult(
        verifiedResult({
          photo: null,
          registration: registration({ blockNumber: null, txHash: null, txUrl: null }),
        }),
      ),
    ).toBe(true);
    expect(
      isVerificationResult(verifiedResult({ registration: registration({ txUrl: null }) })),
    ).toBe(true);
    expect(isVerificationResult(similarResult())).toBe(true);
    expect(isVerificationResult(similarResult({ photo: null }))).toBe(true);
    expect(isVerificationResult(notFoundResult())).toBe(true);
    expect(isVerificationResult(notFoundResult({ dHash: null }))).toBe(true);
  });

  it('az eredménnyel ellentmondó mezők elutasítva', () => {
    expect(isVerificationResult(notFoundResult({ registration: registration() }))).toBe(false);
    expect(isVerificationResult(notFoundResult({ photo: verifiedPhoto() }))).toBe(false);
    expect(isVerificationResult(notFoundResult({ distance: 0 }))).toBe(false);
    expect(isVerificationResult(verifiedResult({ registration: null }))).toBe(false);
    expect(isVerificationResult(verifiedResult({ distance: 0 }))).toBe(false);
    expect(isVerificationResult(similarResult({ distance: null }))).toBe(false);
    expect(isVerificationResult(similarResult({ distance: 65 }))).toBe(false);
    expect(isVerificationResult(similarResult({ distance: -1 }))).toBe(false);
    expect(isVerificationResult(similarResult({ distance: 2.5 }))).toBe(false);
    expect(isVerificationResult(similarResult({ dHash: null }))).toBe(false);
    expect(isVerificationResult(similarResult({ registration: null }))).toBe(false);
    expect(isVerificationResult(verifiedResult({ result: 'TALAN' }))).toBe(false);
    expect(isVerificationResult(null)).toBe(false);
  });

  it('a hash-ek alakja, a tranzakció és a kép adatai is ellenőrzöttek', () => {
    expect(isVerificationResult(verifiedResult({ sha256: SHA256.toUpperCase() }))).toBe(false);
    expect(isVerificationResult(verifiedResult({ dHash: 'rövid' }))).toBe(false);
    // A tranzakció adatai együtt ismertek vagy együtt hiányoznak; a link pontosan a hash oldala
    expect(
      isVerificationResult(verifiedResult({ registration: registration({ blockNumber: null }) })),
    ).toBe(false);
    expect(
      isVerificationResult(
        verifiedResult({
          registration: registration({ txUrl: 'https://sepolia.etherscan.io/tx/0x1234' }),
        }),
      ),
    ).toBe(false);
    expect(
      isVerificationResult(
        verifiedResult({ registration: registration({ registeredAt: 'tegnap' }) }),
      ),
    ).toBe(false);
    // A bélyegkép csak saját médiafájl lehet; a fotós azonosítója UUID
    expect(
      isVerificationResult(
        verifiedResult({
          photo: verifiedPhoto({ thumbnailUrl: 'https://gonosz.example/kep.jpg' }),
        }),
      ),
    ).toBe(false);
    expect(
      isVerificationResult(
        verifiedResult({ photo: verifiedPhoto({ photographer: { id: 'u1', displayName: 'X' } }) }),
      ),
    ).toBe(false);
    expect(isVerificationResult(verifiedResult({ photo: verifiedPhoto({ title: 3 }) }))).toBe(
      false,
    );
  });
});
