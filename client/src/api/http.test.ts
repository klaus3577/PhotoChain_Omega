// A fetch-wrapper (http.ts) tesztjei: az /api alatti kérés formája, a szerver { data } és { error }
// borítéka, a váratlan válasz, a hálózati hiba és a megszakítás.
import { describe, expect, it } from 'vitest';

import { jsonResponse, stubFetch } from '../test/fetch';
import { ApiError, apiRequest, apiRequestEnvelope, pathSegment, type RequestOptions } from './http';

const headerOf = (init: RequestInit | undefined, name: string) =>
  new Headers(init?.headers).get(name);

describe('apiRequest', () => {
  it('az /api alatti címre kér, azonos eredetű sütikkel, és a válasz data mezőjét adja', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { status: 'ok' } }));

    await expect(apiRequest('/health')).resolves.toEqual({ status: 'ok' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/health');
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin' });
    expect(headerOf(init, 'Accept')).toBe('application/json');
    expect(init?.body).toBeUndefined();
  });

  it('a törzset JSON-ként küldi', async () => {
    const fetchMock = stubFetch(jsonResponse(201, { data: { id: 'r1' } }));

    await expect(
      apiRequest('/reviews', { method: 'POST', body: { rating: 5, comment: 'Szép' } }),
    ).resolves.toEqual({ id: 'r1' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"rating":5,"comment":"Szép"}');
    expect(headerOf(init, 'Content-Type')).toBe('application/json');
  });

  it('a megszakító jelzést (signal) továbbadja – így a TanStack Query le tudja mondani a kérést', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: null }));
    const controller = new AbortController();

    await apiRequest('/health', { signal: controller.signal });

    expect(fetchMock.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it('a 204-es (törzs nélküli) válasznál undefined az eredmény', async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(apiRequest('/photos/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('a szerver hibaborítékából ApiError lesz: státusz, kód, magyar üzenet, részletek', async () => {
    const details = [{ path: 'priceHuf', message: 'legalább 175 legyen' }];
    stubFetch(
      jsonResponse(400, {
        error: { code: 'VALIDATION_ERROR', message: 'Érvénytelen bemenet', details },
      }),
    );

    const error = await apiRequest('/photos', { method: 'POST', body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Érvénytelen bemenet',
      details,
    });
  });

  it('a Retry-After fejlécet másodpercben adja (pl. 429-nél)', async () => {
    stubFetch(
      jsonResponse(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Túl sok kérés – próbáld újra később' } },
        { 'Retry-After': '30' },
      ),
    );

    const error = await apiRequest('/health').catch((e) => e);

    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 30 });
  });

  it.each([502, 503, 504])(
    'a proxy/átjáró nem JSON %i-es hibája elérhetetlenség (a szerver nem fut vagy nem válaszol)',
    async (status) => {
      stubFetch(
        new Response('<html>Bad Gateway</html>', {
          status,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      const error = (await apiRequest('/health').catch((e: unknown) => e)) as ApiError;

      expect(error).toMatchObject({ status, code: 'SERVER_UNAVAILABLE' });
      expect(error.message).toBe(
        `A szerver most nem érhető el (HTTP ${status}). Próbáld újra később.`,
      );
    },
  );

  it('a többi nem JSON hibaválasz (pl. egy 500-as HTML-oldal) váratlan válasz', async () => {
    stubFetch(
      new Response('<html>Hiba</html>', { status: 500, headers: { 'Content-Type': 'text/html' } }),
    );

    const error = (await apiRequest('/health').catch((e: unknown) => e)) as ApiError;

    expect(error).toMatchObject({ status: 500, code: 'UNEXPECTED_RESPONSE' });
    expect(error.message).toBe('A szerver váratlan választ adott (HTTP 500).');
  });

  it('a boríték nélküli JSON-válasz is váratlan válasz (nem csúszik át csendben)', async () => {
    stubFetch(jsonResponse(200, { status: 'ok' }));

    await expect(apiRequest('/health')).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('hibás státusz mellett a „siker” boríték sem adat (nem csúszik át csendben)', async () => {
    stubFetch(jsonResponse(500, { data: { status: 'ok' } }));

    await expect(apiRequest('/health')).rejects.toMatchObject({
      status: 500,
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('sikeres státusz mellett a hibaboríték váratlan válasz (nem a szerver hibakódja)', async () => {
    stubFetch(jsonResponse(200, { error: { code: 'NOT_FOUND', message: 'Nincs ilyen' } }));

    await expect(apiRequest('/health')).rejects.toMatchObject({
      status: 200,
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('a hiányos hibaboríték (nem szöveges kód) váratlan válasz', async () => {
    stubFetch(jsonResponse(400, { error: { code: 42, message: 'Hiba' } }));

    await expect(apiRequest('/health')).rejects.toMatchObject({
      status: 400,
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('a dátum formájú Retry-After fejlécet nem értelmezi (a szerver másodpercet küld)', async () => {
    stubFetch(
      jsonResponse(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Túl sok kérés' } },
        { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
      ),
    );

    const error = (await apiRequest('/health').catch((e: unknown) => e)) as ApiError;

    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('a JSON-nak jelölt, de hibás törzs is váratlan válasz (nem SyntaxError)', async () => {
    stubFetch(
      new Response('{hibás', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await expect(apiRequest('/health')).rejects.toMatchObject({
      status: 200,
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('a hálózati hibát NETWORK_ERROR kódú, 0 státuszú ApiError-ra fordítja (az eredeti ok megmarad)', async () => {
    const cause = new TypeError('Failed to fetch');
    stubFetch(cause);

    const error = (await apiRequest('/health').catch((e: unknown) => e)) as ApiError;

    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR', cause });
    expect(error.message).toBe(
      'A szerver nem érhető el. Ellenőrizd a kapcsolatot, és próbáld újra.',
    );
  });

  it('a megszakítást (AbortError) változatlanul továbbadja', async () => {
    const abort = new DOMException('A kérés megszakadt', 'AbortError');
    stubFetch(abort);

    await expect(apiRequest('/health')).rejects.toBe(abort);
  });

  it('a törzs olvasása közbeni megszakítást is változatlanul továbbadja (nem „váratlan válasz”)', async () => {
    const abort = new DOMException('A kérés megszakadt', 'AbortError');
    const response = jsonResponse(200, { data: {} });
    Object.defineProperty(response, 'json', { value: () => Promise.reject(abort) });
    stubFetch(response);

    await expect(apiRequest('/health')).rejects.toBe(abort);
  });

  it('GET-kérésnek nem adható törzs – típushiba (a fetch futás közben elutasítaná)', () => {
    // @ts-expect-error – a GET (alapértelmezett metódus) törzs nélküli
    const options: RequestOptions = { body: { title: 'x' } };
    const post: RequestOptions = { method: 'POST', body: { title: 'x' } };

    expect([options, post]).toHaveLength(2);
  });
});

describe('apiRequestEnvelope', () => {
  it('a teljes sikerborítékot adja: az adatot és a lapozás adatait (meta)', async () => {
    const meta = { page: 2, pageSize: 24, total: 30, totalPages: 2 };
    stubFetch(jsonResponse(200, { data: { photos: [] }, meta }));

    await expect(apiRequestEnvelope('/photos?page=2')).resolves.toEqual({
      data: { photos: [] },
      meta,
    });
  });

  it('meta nélküli válasznál és 204-nél a hiányzó rész undefined; a hiba ugyanúgy ApiError', async () => {
    stubFetch(
      jsonResponse(200, { data: { ok: true } }),
      new Response(null, { status: 204 }),
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'A kép nem található' } }),
    );

    await expect(apiRequestEnvelope('/a')).resolves.toEqual({
      data: { ok: true },
      meta: undefined,
    });
    await expect(apiRequestEnvelope('/b')).resolves.toEqual({ data: undefined, meta: undefined });
    await expect(apiRequestEnvelope('/c')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('pathSegment', () => {
  it('az útvonal egyetlen szakaszaként kódolja az értéket (perjel, kérdőjel, kettőskereszt sem törheti ki)', () => {
    expect(pathSegment('9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d')).toBe(
      '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    );
    expect(pathSegment('../admin')).toBe('..%2Fadmin');
    expect(pathSegment('a?b#c')).toBe('a%3Fb%23c');
  });

  it('a „.” és a „..” szakaszt (és az üreset) elutasítja – a böngésző ezeket feloldaná', () => {
    for (const value of ['.', '..', '']) {
      expect(() => pathSegment(value)).toThrow(RangeError);
    }
  });
});
