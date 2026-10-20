// A kép adatlapja (L20): vízjeles előnézet, adatok, ár és a néző helyzetéhez illő művelet (vendég:
// belépés után vásárlás; vevő: az eredeti letöltése; tulajdonos: saját kép), a blokklánc-tanúsítvány
// és az értékelések. Az azonosító csak a szerver formájában (UUID) indít kérést; a nem található
// kép saját, érthető oldalt kap. A bejelentkezett néző „Megveszem” gombja fizetést indít (POST
// /api/orders/checkout), és a Stripe fizetési oldalára irányít (L22) – csak oda. A kép és az
// értékelések kérése útvonalhoz kötött választ kap (a sorrendjük nem számít).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authQueryKey } from '../api/auth.api';
import { photoKeys } from '../api/photos.api';
import { reviewKeys } from '../api/reviews.api';
import * as redirect from '../lib/redirect';
import { axeViolations } from '../test/axe';
import { DeferredResponse, forPath, jsonResponse, requestedUrls, stubFetch } from '../test/fetch';
import { CHECKOUT_URL, checkoutResponse, REVIEW_ID } from '../test/orders';
import {
  detailResponse,
  detailResponses,
  galleryResponses,
  OWNER_ID,
  pendingPhoto,
  PHOTO_ID,
  photoDetail,
  photoListItem,
  review,
  reviewsResponse,
  viewerFlags,
} from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testUser } from '../test/users';

const PATH = `/photos/${PHOTO_ID}`;
const TITLE = 'Őszi erdő ködben';

/** n darab értékelés különböző azonosítóval és szerzővel. */
const reviews = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) =>
    review({
      id: `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b${String(index + offset).padStart(4, '0')}`,
      author: {
        id: `b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c${String(index + offset).padStart(4, '0')}`,
        displayName: `Vásárló ${index + offset + 1}`,
      },
      comment: `Vélemény ${index + offset + 1}`,
    }),
  );

const valueOf = (term: string) => screen.getByText(term, { selector: 'dt' }).nextElementSibling!;

/** Az elemek a megadott sorrendben követik egymást a dokumentumban (az olvasási sorrend). */
function expectDocumentOrder(elements: Element[]) {
  for (let index = 1; index < elements.length; index += 1) {
    const position = elements[index - 1]!.compareDocumentPosition(elements[index]!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
}

describe('PhotoDetailPage – adatok', () => {
  it('a cím (h1), a vízjeles előnézet, a morzsamenü, a leírás és az adatok; a kép és az értékelések kérése', async () => {
    const fetchMock = stubFetch(...detailResponses(detailResponse(), reviewsResponse([review()])));
    renderRoute(PATH);

    expect(await screen.findByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `${TITLE} – vízjeles előnézet` })).toHaveAttribute(
      'src',
      `/media/previews/${PHOTO_ID}.webp`,
    );
    // Az előnézet kerete a kép méretarányát előre foglalja: a betöltés nem ugrasztja el az oldalt (L26)
    const figure = screen.getByRole('figure');
    expect(figure).toHaveAttribute(
      'style',
      expect.stringContaining('--preview-ratio: 1600 / 1067'),
    );
    // Legfeljebb a képernyő 70 %-a magas; a hiányzó előnézet szövege a lapos panorámánál sem vágódik le
    expect(figure).toHaveClass('aspect-(--preview-ratio)', 'max-h-[70vh]', 'min-h-32');
    const breadcrumb = screen.getByRole('navigation', { name: 'Morzsamenü' });
    expect(within(breadcrumb).getByRole('link', { name: 'Galéria' })).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByRole('link', { name: 'Tájkép' })).toHaveAttribute(
      'href',
      '/?categoryId=1',
    );
    expect(within(breadcrumb).getByText(TITLE)).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Kora reggeli köd a bükkösben, október elején.')).toBeInTheDocument();
    expect(screen.getByText('Fotós Fanni')).toBeInTheDocument();
    expect(valueOf('Kategória')).toHaveTextContent('Tájkép');
    expect(valueOf('Feltöltve')).toHaveTextContent('2026. október 4.');
    expect(valueOf('Méret')).toHaveTextContent('1600 × 1067 képpont');
    // A getByText a szóközöket egységesíti (a nem törő szóköz is sima szóköz lesz)
    expect(screen.getByText('12 500 Ft')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Hitelesítve a blokkláncon' })).toBeInTheDocument();
    expect(requestedUrls(fetchMock).sort()).toEqual([
      `/api/photos/${PHOTO_ID}`,
      `/api/photos/${PHOTO_ID}/reviews?page=1&pageSize=5`,
    ]);
    await waitFor(() => expect(document.title).toBe(`${TITLE} · PhotoChain`));
  });

  it('a kép után a vásárlás és a tanúsítvány következik, csak utána a leírás és az adatok (mobilon is ez az olvasási sorrend)', async () => {
    stubFetch(...detailResponses());
    renderRoute(PATH);

    const purchase = await screen.findByRole('region', { name: 'Vásárlás' });
    expectDocumentOrder([
      screen.getByRole('img', { name: /vízjeles előnézet/ }),
      purchase,
      screen.getByRole('region', { name: 'Hitelesítve a blokkláncon' }),
      screen.getByRole('heading', { name: 'Leírás' }),
      screen.getByRole('heading', { name: 'Adatok' }),
    ]);
    // A leírás és az adatok egyszerű szakaszok, nem tájékozódási pontok (ne legyen túl sok régió)
    expect(screen.queryByRole('region', { name: 'Leírás' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Adatok' })).toBeNull();
  });

  it('leírás és előnézet nélküli képnél a leírás elmarad, az előnézet helyén helykitöltő', async () => {
    stubFetch(
      ...detailResponses(detailResponse(photoDetail({ description: null, previewUrl: null }))),
    );
    renderRoute(PATH);

    await screen.findByRole('heading', { level: 1, name: TITLE });
    expect(screen.queryByRole('img', { name: /vízjeles előnézet/ })).toBeNull();
    expect(screen.getByText('Előnézet nem érhető el')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Leírás' })).toBeNull();
  });

  it('a galériából érkezve a fókusz a kép címére kerül, amint betöltődött', async () => {
    stubFetch(...galleryResponses([photoListItem()]), ...detailResponses());
    const { user } = renderRoute('/');

    await user.click(await screen.findByRole('link', { name: TITLE }));

    const heading = await screen.findByRole('heading', { level: 1, name: TITLE });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('érvénytelen azonosítónál kérés nélkül a „nem található” oldal', async () => {
    const fetchMock = stubFetch();
    renderRoute('/photos/nem-azonosito');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A kép nem található' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vissza a galériába' })).toHaveAttribute('href', '/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a szerver 404-ére (nem létező vagy nem nyilvános kép) is a „nem található” oldal', async () => {
    stubFetch(...detailResponses(errorResponse(404, 'NOT_FOUND', 'A kép nem található')));
    renderRoute(PATH);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A kép nem található' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('A kép nem található · PhotoChain'));
  });

  it('más hibánál hibaüzenet és újrapróbálás: közben a gomb a helyén marad (foglalt), siker után a fókusz a kép címére kerül', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      ...detailResponses(errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath(`/api/photos/${PHOTO_ID}`, retry),
    );
    const { user } = renderRoute(PATH);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A kép betöltése nem sikerült. Váratlan szerverhiba.',
    );
    const button = screen.getByRole('button', { name: 'Újrapróbálás' });
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Kép betöltése…');
    retry.resolve(detailResponse());
    const heading = await screen.findByRole('heading', { level: 1, name: TITLE });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('ha újrapróbálás közben máshová (pl. a fejlécbe) vitte a fókuszt, ott hagyja, és a sikert bejelenti', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      ...detailResponses(errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath(`/api/photos/${PHOTO_ID}`, retry),
    );
    const { user } = renderRoute(PATH);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));
    const login = within(screen.getByRole('banner')).getByRole('link', { name: 'Belépés' });
    act(() => login.focus());

    retry.resolve(detailResponse());

    expect(await screen.findByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('A kép betöltődött.'));
    expect(login).toHaveFocus();
  });

  it('ha az adatlap a gyorsítótárból jelent meg (vissza, majd előre), a munkamenet-váltás utáni újratöltéskor is a címre kerül a fókusz', async () => {
    const reloaded = new DeferredResponse();
    stubFetch(
      ...galleryResponses([photoListItem()]),
      ...detailResponses(),
      ...detailResponses(reloaded),
    );
    const { user, router, queryClient } = renderRoute('/');
    await user.click(await screen.findByRole('link', { name: TITLE }));
    await screen.findByRole('heading', { level: 1, name: TITLE });
    await act(() => router.navigate(-1));
    await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    await act(() => router.navigate(1));
    const buy = await screen.findByRole('link', { name: 'Megveszem' });
    act(() => buy.focus());

    act(() => {
      queryClient.setQueryData(authQueryKey, testUser);
    });

    // A betöltés nézete a hajtásig ér: a megérkező adatlap nem tolja el a láblécet (CLS – L26)
    expect(await screen.findByText('Kép betöltése…')).toHaveClass('min-h-[calc(100dvh-9rem)]');
    reloaded.resolve(detailResponse(photoDetail({ viewer: viewerFlags() })));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: TITLE })).toHaveFocus(),
    );
  });

  it('ha az újrapróbálás is sikertelen, a hibaüzenet újra megjelenik, a fókusz a gombon marad', async () => {
    stubFetch(
      ...detailResponses(errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath(
        `/api/photos/${PHOTO_ID}`,
        errorResponse(503, 'SERVICE_UNAVAILABLE', 'A szolgáltatás szünetel'),
      ),
    );
    const { user } = renderRoute(PATH);
    await screen.findByRole('alert');
    const button = screen.getByRole('button', { name: 'Újrapróbálás' });

    await user.click(button);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('A szolgáltatás szünetel'),
    );
    expect(button).toHaveFocus();
  });

  it('ha a háttérben induló frissítés nem sikerül, a már betöltött kép marad (nem lesz belőle hibaoldal)', async () => {
    stubFetch(
      ...detailResponses(),
      forPath(
        `/api/photos/${PHOTO_ID}`,
        errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'),
      ),
    );
    const { queryClient } = renderRoute(PATH);
    await screen.findByRole('heading', { level: 1, name: TITLE });

    await act(() =>
      queryClient.refetchQueries({ queryKey: photoKeys.detail(PHOTO_ID), exact: true }),
    );
    // A lekérdezés új állapota késleltetve (egy későbbi feladatban) jut el az oldalig: megvárjuk
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));

    expect(queryClient.getQueryState(photoKeys.detail(PHOTO_ID))?.status).toBe('error');
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Újrapróbálás' })).toBeNull();
  });

  it('ha a munkamenet a háttérben megváltozik (másik lapon belépett), az újratöltött adatlapon a fókusz a címre kerül', async () => {
    const reloaded = new DeferredResponse();
    stubFetch(...detailResponses(), ...detailResponses(reloaded));
    const { queryClient } = renderRoute(PATH);
    const buy = await screen.findByRole('link', { name: 'Megveszem' });
    act(() => buy.focus());

    act(() => {
      queryClient.setQueryData(authQueryKey, testUser);
    });

    // Az előző felhasználó adata nem marad: az adatlap újratöltődik (a fókuszban lévő elem eltűnik)
    expect(await screen.findByText('Kép betöltése…')).toBeInTheDocument();
    reloaded.resolve(detailResponse(photoDetail({ viewer: viewerFlags() })));
    expect(await screen.findByRole('button', { name: 'Megveszem' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: TITLE })).toHaveFocus(),
    );
  });

  it('nincs akadálymentességi hiba (oldalszinten)', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(),
        reviewsResponse(reviews(2), { rating: { average: 4.5, count: 2 } }),
      ),
    );
    const { container } = renderRoute(PATH);
    await screen.findByText('Vélemény 1');

    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});

describe('PhotoDetailPage – a saját, regisztrálás alatt álló kép', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('az adatlap 3 másodpercenként frissül, amíg a kép függő; a hitelesítést bemondja, a saját és a galéria listái frissülnek, a lekérdezés megáll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch(
      ...detailResponses(detailResponse(pendingPhoto())),
      forPath(`/api/photos/${PHOTO_ID}`, detailResponse(pendingPhoto())),
      forPath(`/api/photos/${PHOTO_ID}`, detailResponse(photoDetail({ viewer: viewerFlags() }))),
    );
    const { queryClient } = renderRoute(PATH, undefined, { session: testUser });
    queryClient.setQueryData(photoKeys.ownPage(1), {
      photos: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    queryClient.setQueryData(photoKeys.list('?page=1'), {
      photos: [],
      meta: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
    });
    await screen.findByRole('heading', { level: 1, name: TITLE });
    expect(screen.queryByText(/A kép hitelesítve a blokkláncon/)).toBeNull();

    act(() => vi.advanceTimersByTime(3000));
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
    act(() => vi.advanceTimersByTime(3000));

    expect(
      (await screen.findAllByText('A kép hitelesítve a blokkláncon, és megjelent a galériában.'))
        .length,
    ).toBeGreaterThan(0);
    expect(queryClient.getQueryState(photoKeys.ownPage(1))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(photoKeys.list('?page=1'))?.isInvalidated).toBe(true);
    const requests = requestedUrls(fetchMock).length;
    act(() => vi.advanceTimersByTime(6500));
    expect(requestedUrls(fetchMock)).toHaveLength(requests);
  });

  it('a már hitelesített kép adatlapja nem kérdez újra', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch(...detailResponses());
    renderRoute(PATH);
    await screen.findByRole('heading', { level: 1, name: TITLE });

    act(() => vi.advanceTimersByTime(6500));

    expect(requestedUrls(fetchMock)).toHaveLength(2);
  });
});

describe('PhotoDetailPage – vásárlás', () => {
  it('vendégnek a „Megveszem” a belépésre visz (a leírása megmondja, miért), és a belépés után ide tér vissza', async () => {
    stubFetch(...detailResponses());
    const { user, router } = renderRoute(PATH);

    const purchase = await screen.findByRole('region', { name: 'Vásárlás' });
    const buy = within(purchase).getByRole('link', { name: 'Megveszem' });
    expect(buy).toHaveAccessibleDescription(/^A vásárláshoz jelentkezz be\./);
    await user.click(buy);

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toMatchObject({ from: { pathname: PATH } });
  });

  it('ha a szerver vendégnek látja a bejelentkezett nézőt (pl. lejárt munkamenet), a kliens újraellenőrzi a munkamenetet – a „Megveszem” így a belépésre visz', async () => {
    const fetchMock = stubFetch(
      ...detailResponses(),
      forPath('/api/auth/me', errorResponse(401, 'UNAUTHORIZED', 'Nincs bejelentkezve')),
      ...detailResponses(),
    );
    const { user, router } = renderRoute(PATH, undefined, { session: testUser });

    await within(screen.getByRole('banner')).findByRole('link', { name: 'Belépés' });
    expect(requestedUrls(fetchMock)).toContain('/api/auth/me');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(5));
    await user.click(await screen.findByRole('link', { name: 'Megveszem' }));

    expect(router.state.location.pathname).toBe('/login');
  });

  it('a vevőnek „Már megvetted” és az eredeti letöltése (a védett letöltési címen)', async () => {
    stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: viewerFlags({ purchased: true }) }))),
    );
    const { container } = renderRoute(PATH, undefined, { session: testUser });

    expect(await screen.findByText('Már megvetted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Eredeti letöltése' })).toHaveAttribute(
      'href',
      `/api/photos/${PHOTO_ID}/download`,
    );
    expect(screen.queryByRole('link', { name: 'Megveszem' })).toBeNull();
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('a bejelentkezett, nem vásárló néző „Megveszem” gombja fizetést indít, és a Stripe fizetési oldalára irányít; közben (és utána is) foglalt', async () => {
    const redirectTo = vi.spyOn(redirect, 'redirectTo').mockImplementation(() => {});
    const checkout = new DeferredResponse();
    stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: viewerFlags() }))),
      forPath('/api/orders/checkout', checkout),
    );
    const { user, container } = renderRoute(PATH, undefined, { session: testUser });

    const buy = await screen.findByRole('button', { name: 'Megveszem' });
    expect(buy).not.toHaveAttribute('aria-disabled');
    expect(buy).toHaveAccessibleDescription(/A fizetés a Stripe biztonságos oldalán történik/);
    expect(await axeViolations(container, { page: true })).toEqual([]);
    await user.click(buy);

    const busy = screen.getByRole('button', { name: 'Átirányítás a fizetéshez…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    // A foglalt gomb felirata önmagában néma: az élő régió mondja be
    expect(screen.getByRole('status')).toHaveTextContent('Átirányítás a Stripe fizetési oldalára…');
    // A dupla kattintás nem indít második fizetést
    await user.click(busy);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof stubFetch>;
    const calls = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/orders/checkout');
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]![1]?.body))).toEqual({ photoId: PHOTO_ID });
    checkout.resolve(checkoutResponse());

    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith(CHECKOUT_URL));
    // Az átirányításig a gomb foglalt marad (az oldal elhagyása folyamatban)
    expect(screen.getByRole('button', { name: 'Átirányítás a fizetéshez…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('ha a „már megvette” választ az adatlap újratöltése nem igazolja (a néző még mindig nem vásárló), a hiba riasztásként látszik', async () => {
    stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: viewerFlags() }))),
      forPath(
        '/api/orders/checkout',
        errorResponse(409, 'ALREADY_PURCHASED', 'Ezt a képet már megvásároltad'),
      ),
      forPath(`/api/photos/${PHOTO_ID}`, detailResponse(photoDetail({ viewer: viewerFlags() }))),
    );
    const { user } = renderRoute(PATH, undefined, { session: testUser });

    await user.click(await screen.findByRole('button', { name: 'Megveszem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ezt a képet már megvásároltad.');
    expect(screen.getByRole('button', { name: 'Megveszem' })).not.toHaveAttribute('aria-disabled');
  });

  it('ha a böngésző a Stripe-ról visszalépve a vissza-gyorsítótárból állítja helyre az oldalt, a gomb újra használható', async () => {
    const redirectTo = vi.spyOn(redirect, 'redirectTo').mockImplementation(() => {});
    stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: viewerFlags() }))),
      forPath('/api/orders/checkout', checkoutResponse()),
    );
    const { user } = renderRoute(PATH, undefined, { session: testUser });
    await user.click(await screen.findByRole('button', { name: 'Megveszem' }));
    await waitFor(() => expect(redirectTo).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Átirányítás a fizetéshez…' })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    // A mutáció alaphelyzetbe állítását a TanStack Query ütemezve jelzi: megvárjuk
    const buy = await screen.findByRole('button', { name: 'Megveszem' });
    expect(buy).not.toHaveAttribute('aria-disabled');
  });

  it('ha a válasz címe nem a Stripe fizetési oldala, nem irányít át: riasztás a gomb leírásaként', async () => {
    const redirectTo = vi.spyOn(redirect, 'redirectTo').mockImplementation(() => {});
    stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: viewerFlags() }))),
      forPath('/api/orders/checkout', checkoutResponse('https://gonosz.hu/fizetes')),
    );
    const { user } = renderRoute(PATH, undefined, { session: testUser });

    await user.click(await screen.findByRole('button', { name: 'Megveszem' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A fizetés indítása nem sikerült.');
    expect(redirectTo).not.toHaveBeenCalled();
    const buy = screen.getByRole('button', { name: 'Megveszem' });
    expect(buy).not.toHaveAttribute('aria-disabled');
    expect(buy).toHaveAccessibleDescription(/A fizetés indítása nem sikerült\./);
  });

  it('ha a fizetés nem érhető el (503), a szerver üzenete riasztásként, a gomb újra használható', async () => {
    stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: viewerFlags() }))),
      forPath(
        '/api/orders/checkout',
        errorResponse(503, 'PAYMENT_UNAVAILABLE', 'A fizetési szolgáltatás nem érhető el'),
      ),
    );
    const { user } = renderRoute(PATH, undefined, { session: testUser });

    await user.click(await screen.findByRole('button', { name: 'Megveszem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A fizetési szolgáltatás nem érhető el.',
    );
    expect(screen.getByRole('button', { name: 'Megveszem' })).not.toHaveAttribute('aria-disabled');
  });

  it('ha a képet közben már megvette (409 ALREADY_PURCHASED), az adatlap újratöltődik – a gomb addig foglalt marad –: „Már megvetted” és a letöltés', async () => {
    const reloaded = new DeferredResponse();
    const fetchMock = stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: viewerFlags() }))),
      forPath(
        '/api/orders/checkout',
        errorResponse(409, 'ALREADY_PURCHASED', 'Ezt a képet már megvásároltad'),
      ),
      forPath(`/api/photos/${PHOTO_ID}`, reloaded),
    );
    const { user } = renderRoute(PATH, undefined, { session: testUser });

    await user.click(await screen.findByRole('button', { name: 'Megveszem' }));

    // Az újratöltésig a gomb foglalt: nem indítható még egy fizetés, és nincs riasztás
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(4));
    expect(screen.getByRole('button', { name: 'Átirányítás a fizetéshez…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    reloaded.resolve(detailResponse(photoDetail({ viewer: viewerFlags({ purchased: true }) })));

    expect(await screen.findByText('Már megvetted.')).toBeInTheDocument();
    // A gomb eltűnt a fókusszal együtt: a fókusz a letöltés hivatkozására kerül, és bemondás
    const download = screen.getByRole('link', { name: 'Eredeti letöltése' });
    await waitFor(() => expect(download).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ezt a képet már megvetted – az eredeti letölthető.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(requestedUrls(fetchMock)).toHaveLength(4);
  });

  it('a tulajdonosnak „Ez a saját képed”, vásárlás nélkül', async () => {
    stubFetch(...detailResponses(detailResponse(photoDetail({ viewer: viewerFlags() }))));
    renderRoute(PATH, undefined, { session: { ...testUser, id: OWNER_ID } });

    expect(await screen.findByText('Ez a saját képed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Megveszem' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Megveszem' })).toBeNull();
  });

  it('a nem nyilvános kép (a tulajdonos vagy az admin látja) nem vásárolható; a tanúsítvány doboza az állapotát mutatja', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(
          photoDetail({ status: 'PENDING_CHAIN', certificate: null, viewer: viewerFlags() }),
        ),
      ),
    );
    const { container } = renderRoute(PATH, undefined, { session: { ...testUser, role: 'ADMIN' } });

    expect(await screen.findByText('Ez a kép jelenleg nem vásárolható meg.')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Blokklánc-tanúsítvány: Regisztrálás folyamatban' }),
    ).toBeInTheDocument();
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});

describe('PhotoDetailPage – értékelések', () => {
  it('értékelés nélkül „Még nincs értékelés.”', async () => {
    stubFetch(...detailResponses());
    renderRoute(PATH);

    const section = await screen.findByRole('region', { name: 'Értékelések' });
    expect(await within(section).findByText('Még nincs értékelés.')).toBeInTheDocument();
    // Átlag nélkül a fejlécben nincs szám és csillagsor
    expect(section).not.toHaveTextContent('az 5-ből');
    expect(section.querySelector('svg.fill-current')).toBeNull();
  });

  it('az átlag és a darabszám, az értékelések (szerző, dátum, csillagok, szöveg); az értékelés neve a szerző és a dátum', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(),
        reviewsResponse(reviews(2), { rating: { average: 4.5, count: 2 } }),
      ),
    );
    renderRoute(PATH);

    const section = await screen.findByRole('region', { name: 'Értékelések' });
    expect(await within(section).findByText('Vélemény 1')).toBeInTheDocument();
    expect(section).toHaveTextContent('4,5 az 5-ből · 2 értékelés');
    // A fejléc csillagsora a kerekített átlag (4,5 → 5 kitöltött csillag), a képernyőolvasó elől rejtve
    const header = within(section).getByText('az 5-ből').closest('p')!;
    expect(header.querySelectorAll('svg.fill-current')).toHaveLength(5);
    expect(header.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    const first = within(section).getAllByRole('article')[0]!;
    expect(first).toHaveAccessibleName('Vásárló 1 · 2026. október 6.');
    expect(within(first).getByRole('img', { name: '5 csillag az 5-ből' })).toBeInTheDocument();
    expect(within(section).getByRole('list')).toHaveAttribute('role', 'list');
  });

  it('amíg az értékelések töltődnek, ezt jelzi; utána a lista', async () => {
    const pending = new DeferredResponse();
    stubFetch(...detailResponses(detailResponse(), pending));
    renderRoute(PATH);

    const section = await screen.findByRole('region', { name: 'Értékelések' });
    expect(within(section).getByText('Értékelések betöltése…')).toBeInTheDocument();
    pending.resolve(reviewsResponse([review()]));

    expect(await within(section).findByText(/Gyönyörű fények/)).toBeInTheDocument();
    expect(within(section).queryByText('Értékelések betöltése…')).toBeNull();
  });

  it('ha a további értékelések nem tölthetők be, hibaüzenet – a gomb marad, újrapróbálható', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(),
        reviewsResponse(reviews(5), { rating: { average: 4.5, count: 7 } }),
      ),
      errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'),
    );
    const { user } = renderRoute(PATH);

    await user.click(await screen.findByRole('button', { name: 'További értékelések (2)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A további értékelések betöltése nem sikerült. Váratlan szerverhiba.',
    );
    expect(screen.getByRole('button', { name: 'További értékelések (2)' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(5);
  });

  it('a csillagsor az értékelést mutatja (3 csillag: három kitöltött, két üres)', async () => {
    stubFetch(...detailResponses(detailResponse(), reviewsResponse([review({ rating: 3 })])));
    renderRoute(PATH);

    const stars = await screen.findByRole('img', { name: '3 csillag az 5-ből' });
    expect(stars.querySelectorAll('svg.fill-current')).toHaveLength(3);
    expect(stars.querySelectorAll('svg')).toHaveLength(5);
  });

  it('ha az értékelések nem tölthetők be, hibaüzenet és újrapróbálás (a kép adatai látszanak); siker után a fókusz az értékelések címére kerül', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      ...detailResponses(
        detailResponse(),
        errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'),
      ),
      forPath(`/api/photos/${PHOTO_ID}/reviews`, retry),
    );
    const { user } = renderRoute(PATH);

    const section = await screen.findByRole('region', { name: 'Értékelések' });
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Az értékelések betöltése nem sikerült. Váratlan szerverhiba.',
    );
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument();
    const button = within(section).getByRole('button', { name: 'Újrapróbálás' });
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Értékelések betöltése…');
    retry.resolve(reviewsResponse([review()]));
    expect(await within(section).findByText(/Gyönyörű fények/)).toBeInTheDocument();
    await waitFor(() =>
      expect(within(section).getByRole('heading', { name: 'Értékelések' })).toHaveFocus(),
    );
  });

  it('ha a „További értékelések” betöltése közben máshová vitte a fókuszt, ott hagyja', async () => {
    const nextPage = new DeferredResponse();
    stubFetch(
      ...detailResponses(
        detailResponse(),
        reviewsResponse(reviews(5), { rating: { average: 4.5, count: 7 } }),
      ),
      nextPage,
    );
    const { user } = renderRoute(PATH);
    await user.click(await screen.findByRole('button', { name: 'További értékelések (2)' }));
    const breadcrumb = screen.getByRole('navigation', { name: 'Morzsamenü' });
    const gallery = within(breadcrumb).getByRole('link', { name: 'Galéria' });
    act(() => gallery.focus());

    nextPage.resolve(
      reviewsResponse(reviews(2, 5), { rating: { average: 4.5, count: 7 }, meta: { page: 2 } }),
    );

    expect(await screen.findByText('Vélemény 6')).toBeInTheDocument();
    expect(gallery).toHaveFocus();
  });

  it('a „További értékelések” betölti a következő oldalt; a fókusz az első új értékelésre kerül', async () => {
    const fetchMock = stubFetch(
      ...detailResponses(
        detailResponse(),
        reviewsResponse(reviews(5), { rating: { average: 4.5, count: 7 } }),
      ),
      reviewsResponse(reviews(2, 5), { rating: { average: 4.5, count: 7 }, meta: { page: 2 } }),
    );
    const { user } = renderRoute(PATH);
    const more = await screen.findByRole('button', { name: 'További értékelések (2)' });

    await user.click(more);

    const sixth = (await screen.findByText('Vélemény 6')).closest('article')!;
    await waitFor(() => expect(sixth).toHaveFocus());
    expect(screen.queryByRole('button', { name: /További értékelések/ })).toBeNull();
    expect(requestedUrls(fetchMock).at(-1)).toBe(
      `/api/photos/${PHOTO_ID}/reviews?page=2&pageSize=5`,
    );
  });

  it('ha lapozás közben új értékelés érkezett (az oldalak eltolódtak), az ismétlődő értékelés egyszer látszik, és a gomb eltűnik', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(),
        reviewsResponse(reviews(5), { rating: { average: 4.5, count: 7 } }),
      ),
      // Közben egy új értékelés került az élre: a 2. oldal az előző oldal utolsójával kezdődik
      reviewsResponse(reviews(3, 4), { rating: { average: 4.5, count: 8 }, meta: { page: 2 } }),
    );
    const { user } = renderRoute(PATH);

    await user.click(await screen.findByRole('button', { name: 'További értékelések (2)' }));

    const sixth = (await screen.findByText('Vélemény 6')).closest('article')!;
    await waitFor(() => expect(sixth).toHaveFocus());
    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(screen.getAllByText('Vélemény 5')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /További értékelések/ })).toBeNull();
  });

  it('ha a további oldal csak ismétlődőt hozott, a fókusz a lista végére kerül, és egy későbbi frissítéskor sem ugrik el', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(),
        reviewsResponse(reviews(5), { rating: { average: 4.5, count: 6 } }),
      ),
      // Közben egy értékelés törlődött, egy új érkezett: a 2. oldal csak az 1. oldal utolsóját hozza
      reviewsResponse(reviews(1, 4), { rating: { average: 4.5, count: 6 }, meta: { page: 2 } }),
      // Később (pl. frissítéskor) mindkét oldal újra, már új értékelésekkel
      reviewsResponse(reviews(5), { rating: { average: 4.5, count: 7 } }),
      reviewsResponse(reviews(2, 5), { rating: { average: 4.5, count: 7 }, meta: { page: 2 } }),
    );
    const { user, queryClient } = renderRoute(PATH);

    await user.click(await screen.findByRole('button', { name: 'További értékelések (1)' }));

    const fifth = screen.getByText('Vélemény 5').closest('article')!;
    await waitFor(() => expect(fifth).toHaveFocus());
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /További értékelések/ })).toBeNull();
    await act(() => queryClient.refetchQueries({ queryKey: reviewKeys.list(PHOTO_ID) }));
    expect(await screen.findByText('Vélemény 7')).toBeInTheDocument();
    expect(fifth).toHaveFocus();
  });
});

describe('PhotoDetailPage – értékelés írása és törlése (L23)', () => {
  const REVIEWS_PATH = `/api/photos/${PHOTO_ID}/reviews`;
  const DETAIL_PATH = `/api/photos/${PHOTO_ID}`;
  /** A vevő, aki még nem értékelt */
  const buyer = () => viewerFlags({ purchased: true, canReview: true });
  /** A bejelentkezett vevő – az azonosítója a szerver formájú (az értékelés szerzője ő lesz) */
  const buyerUser = { ...testUser, id: review().author.id, displayName: 'Vásárló Vera' };
  /** A vevő saját értékelése */
  const own = review({ id: REVIEW_ID, rating: 4, comment: 'Szép fények.' });
  const other = review({
    id: 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f',
    author: { id: 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70', displayName: 'Másik Vevő' },
    comment: 'Nekem is tetszik.',
  });
  const sectionOf = () => screen.findByRole('region', { name: 'Értékelések' });
  const formOf = () => screen.findByRole('form', { name: 'Értékelés írása' });
  const methodCall = (fetchMock: ReturnType<typeof stubFetch>, method: string) =>
    fetchMock.mock.calls.find(([, init]) => init?.method === method)!;

  it('a vevő értékelő űrlapja az értékelések elején: a csillagok rádiócsoportja, a nem kötelező vélemény és a küldés; a fotós neve a profiljára mutat', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(photoDetail({ viewer: buyer() })),
        reviewsResponse([other]),
      ),
    );
    const { container } = renderRoute(PATH, undefined, { session: buyerUser });

    const section = await sectionOf();
    const form = within(section).getByRole('form', { name: 'Értékelés írása' });
    // A vásárlásaim „Értékelés írása” hivatkozásának célrészlete
    expect(form).toHaveAttribute('id', 'ertekeles');
    const stars = within(form).getByRole('radiogroup', { name: 'Értékelés' });
    expect(within(stars).getAllByRole('radio')).toHaveLength(5);
    for (const star of [1, 2, 3, 4, 5]) {
      expect(within(stars).getByRole('radio', { name: `${star} csillag` })).not.toBeChecked();
    }
    // A csillag kötelező – a rádiócsoport mondja meg a képernyőolvasónak (a vélemény mezője „nem kötelező”);
    // az egyes csillagokon nincs ilyen jelölés (egyik sem kötelező önmagában)
    expect(stars).toBeRequired();
    for (const radio of within(stars).getAllByRole('radio')) {
      expect(radio).not.toHaveAttribute('aria-required');
    }
    expect(
      within(form).getByRole('textbox', { name: 'Vélemény (nem kötelező)' }),
    ).toHaveAccessibleDescription(/Legfeljebb 1000 karakter/);
    expect(within(form).getByRole('button', { name: 'Értékelés küldése' })).toBeInTheDocument();
    // Az űrlap a lista előtt áll (a vevő nem görget a végére)
    expectDocumentOrder([form, within(section).getByRole('list')]);
    // A hivatkozás neve a célját is megmondja (a hivatkozáslistában is érthető)
    expect(screen.getByRole('link', { name: 'Fotós Fanni profilja' })).toHaveAttribute(
      'href',
      `/users/${OWNER_ID}`,
    );
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('vendégnek, a nem vásárlónak és a már értékelt vevőnek nincs űrlap', async () => {
    const cases = [
      { viewer: null, session: null },
      { viewer: viewerFlags(), session: testUser },
      { viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }), session: buyerUser },
    ];
    for (const { viewer, session } of cases) {
      stubFetch(
        ...detailResponses(detailResponse(photoDetail({ viewer })), reviewsResponse([other])),
      );
      const view = renderRoute(PATH, undefined, { session });

      const section = await sectionOf();
      await within(section).findByText('Nekem is tetszik.');
      expect(within(section).queryByRole('form')).toBeNull();
      view.unmount();
    }
  });

  it('csillag nélkül nem küld: a hiba a csillagoknál, a fókusz az első csillagon; javításkor eltűnik; a túl hosszú vélemény hibája a mezőnél', async () => {
    const fetchMock = stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: buyer() })), reviewsResponse([])),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    const form = await formOf();
    const submit = within(form).getByRole('button', { name: 'Értékelés küldése' });

    await user.click(submit);

    const first = within(form).getByRole('radio', { name: '1 csillag' });
    expect(first).toHaveFocus();
    expect(first).toHaveAccessibleDescription('Válassz csillagot: 1-től 5-ig.');
    // A kötelezőséget és a hibát a rádiócsoport hordozza (ARIA: a radiogroup tulajdonságai – L26)
    const group = within(form).getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(first).not.toHaveAttribute('aria-invalid');
    expect(requestedUrls(fetchMock)).toHaveLength(2);

    await user.click(within(form).getByRole('radio', { name: '4 csillag' }));
    expect(within(form).getByRole('radio', { name: '4 csillag' })).toBeChecked();
    expect(within(form).queryByText('Válassz csillagot: 1-től 5-ig.')).toBeNull();
    expect(group).not.toHaveAttribute('aria-invalid');
    const comment = within(form).getByRole('textbox', { name: 'Vélemény (nem kötelező)' });
    await user.click(comment);
    await user.paste('x'.repeat(1001));
    await user.click(submit);

    expect(comment).toHaveFocus();
    expect(comment).toHaveAccessibleDescription(/A vélemény legfeljebb 1000 karakter lehet\./);
    expect(requestedUrls(fetchMock)).toHaveLength(2);
  });

  it('4 csillag és vélemény: POST a szerver formájában, közben a gomb foglalt; siker után a lista és az adatlap frissül, az űrlap eltűnik, a saját értékelés jelölve (törölhető), a fókusz rajta, bemondás', async () => {
    const created = new DeferredResponse();
    const fetchMock = stubFetch(
      ...detailResponses(
        detailResponse(photoDetail({ viewer: buyer() })),
        reviewsResponse([other]),
      ),
      forPath(REVIEWS_PATH, created),
      forPath(REVIEWS_PATH, reviewsResponse([own, other], { rating: { average: 4.5, count: 2 } })),
      forPath(
        DETAIL_PATH,
        detailResponse(
          photoDetail({ viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }) }),
        ),
      ),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    const form = await formOf();

    await user.click(within(form).getByRole('radio', { name: '4 csillag' }));
    await user.type(
      within(form).getByRole('textbox', { name: 'Vélemény (nem kötelező)' }),
      'Szép fények.',
    );
    await user.click(within(form).getByRole('button', { name: 'Értékelés küldése' }));

    expect(within(form).getByRole('button', { name: 'Küldés…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const [url, init] = methodCall(fetchMock, 'POST');
    expect(String(url)).toBe(REVIEWS_PATH);
    expect(JSON.parse(String(init?.body))).toEqual({ rating: 4, comment: 'Szép fények.' });
    created.resolve(jsonResponse(201, { data: { review: own } }));

    // A szöveg a (még látható) űrlap mezőjében is ott van: a saját értékelés jelöléséről indulunk
    const article = (await screen.findByText('A te értékelésed')).closest('article')!;
    expect(within(article).getByText('Szép fények.')).toBeInTheDocument();
    await waitFor(() => expect(article).toHaveFocus());
    expect(screen.queryByRole('form', { name: 'Értékelés írása' })).toBeNull();
    expect(within(article).getByText('A te értékelésed')).toBeInTheDocument();
    expect(within(article).getByRole('button', { name: 'Értékelés törlése' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Köszönjük az értékelést!');
    expect(requestedUrls(fetchMock)).toEqual(
      expect.arrayContaining([`${REVIEWS_PATH}?page=1&pageSize=5`, DETAIL_PATH]),
    );
    // A többi vevő értékelésénél nincs törlés
    const otherArticle = screen.getByText('Nekem is tetszik.').closest('article')!;
    expect(within(otherArticle).queryByRole('button')).toBeNull();
  });

  it('vélemény nélkül csak a csillag megy; ha a szerver szerint már értékelte (409), az adatlap és a lista frissül (az űrlap eltűnik, a saját értékelés látszik), az üzenet elhangzik', async () => {
    const fetchMock = stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: buyer() })), reviewsResponse([])),
      forPath(REVIEWS_PATH, errorResponse(409, 'ALREADY_REVIEWED', 'Ezt a képet már értékelted')),
      forPath(REVIEWS_PATH, reviewsResponse([own])),
      forPath(
        DETAIL_PATH,
        detailResponse(
          photoDetail({ viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }) }),
        ),
      ),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    const form = await formOf();

    await user.click(within(form).getByRole('radio', { name: '5 csillag' }));
    await user.click(within(form).getByRole('button', { name: 'Értékelés küldése' }));

    expect(JSON.parse(String(methodCall(fetchMock, 'POST')[1]?.body))).toEqual({ rating: 5 });
    expect(await screen.findByText('A te értékelésed')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Értékelés írása' })).toBeNull();
    // Az eltűnt űrlap gombjáról a fókusz a saját értékelésre kerül, a bemondás utána
    await waitFor(() =>
      expect(screen.getByText('A te értékelésed').closest('article')).toHaveFocus(),
    );
    // A szerver elutasítása látható, figyelmeztető tónusú értesítés (nem pipás siker – L26)
    expect(screen.getByRole('status')).toHaveTextContent('Ezt a képet már értékelted.');
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'warning');
    expect(screen.getByRole('status')).not.toHaveClass('sr-only');
  });

  it('a szerver mezőhibája (400) a mezőnél, az űrlap marad; a jogosultság hiánya (403) után az adatlap frissül, az üzenet elhangzik', async () => {
    stubFetch(
      ...detailResponses(detailResponse(photoDetail({ viewer: buyer() })), reviewsResponse([])),
      forPath(
        REVIEWS_PATH,
        jsonResponse(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Hibás adatok',
            details: [{ path: 'comment', message: 'látható karakter is kell benne' }],
          },
        }),
      ),
      forPath(
        REVIEWS_PATH,
        errorResponse(403, 'FORBIDDEN', 'Csak a kép vásárlója értékelheti a képet'),
      ),
      forPath(
        DETAIL_PATH,
        detailResponse(photoDetail({ viewer: viewerFlags({ purchased: true }) })),
      ),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    const form = await formOf();
    await user.click(within(form).getByRole('radio', { name: '3 csillag' }));
    const comment = within(form).getByRole('textbox', { name: 'Vélemény (nem kötelező)' });
    await user.type(comment, 'x');

    await user.click(within(form).getByRole('button', { name: 'Értékelés küldése' }));

    await waitFor(() =>
      expect(comment).toHaveAccessibleDescription(/Látható karakter is kell benne\./),
    );
    expect(comment).toHaveFocus();
    expect(screen.getByRole('form', { name: 'Értékelés írása' })).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Értékelés küldése' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Értékelés írása' })).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Csak a kép vásárlója értékelheti a képet.',
    );
    // Az eltűnt űrlap helyett a szakasz címe kapja a fókuszt
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Értékelések' })).getByRole('heading', {
          name: 'Értékelések',
        }),
      ).toHaveFocus(),
    );
  });

  it('a saját értékelés törlése megerősítéssel: DELETE, a lista és az adatlap frissül (újra értékelhet), a fókusz az értékelések címére kerül, bemondás', async () => {
    const deleted = new DeferredResponse();
    const fetchMock = stubFetch(
      ...detailResponses(
        detailResponse(
          photoDetail({ viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }) }),
        ),
        reviewsResponse([own, other], { rating: { average: 4.5, count: 2 } }),
      ),
      forPath(`/api/reviews/${REVIEW_ID}`, deleted),
      forPath(REVIEWS_PATH, reviewsResponse([other])),
      forPath(DETAIL_PATH, detailResponse(photoDetail({ viewer: buyer() }))),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    const section = await sectionOf();
    const mine = (await within(section).findByText('A te értékelésed')).closest('article')!;

    await user.click(within(mine).getByRole('button', { name: 'Értékelés törlése' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Törlöd az értékelésedet?');
    expect(dialog).toHaveAccessibleDescription(/újra értékelheted a képet/);
    expect(within(dialog).getByRole('button', { name: 'Mégse' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Törlés' }));

    expect(within(dialog).getByRole('button', { name: 'Törlés…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(String(methodCall(fetchMock, 'DELETE')[0])).toBe(`/api/reviews/${REVIEW_ID}`);
    deleted.resolve(new Response(null, { status: 204 }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await formOf()).toBeInTheDocument();
    expect(screen.queryByText('A te értékelésed')).toBeNull();
    await waitFor(() =>
      expect(within(section).getByRole('heading', { name: 'Értékelések' })).toHaveFocus(),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Az értékelésed törölve.');
  });

  it('ha a törlés nem sikerül, a hiba az ablakban marad; a Mégse bezárja, a fókusz a Törlés gombra tér vissza', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(
          photoDetail({ viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }) }),
        ),
        reviewsResponse([own]),
      ),
      forPath(
        `/api/reviews/${REVIEW_ID}`,
        errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'),
      ),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    const remove = await screen.findByRole('button', { name: 'Értékelés törlése' });
    await user.click(remove);
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Törlés' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A törlés nem sikerült. Váratlan szerverhiba.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Mégse' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(remove).toHaveFocus();
    expect(screen.getByText('A te értékelésed')).toBeInTheDocument();
  });
});

describe('PhotoDetailPage – az értékelő űrlap elérése (L23, akadálymentesség)', () => {
  const buyerUser = { ...testUser, id: review().author.id, displayName: 'Vásárló Vera' };

  it('a vásárlásaim „Értékelés írása” hivatkozása (#ertekeles) után a fókusz az űrlap címére kerül; aki nem értékelhet, annál az értékelések címére', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(photoDetail({ viewer: viewerFlags({ purchased: true, canReview: true }) })),
        reviewsResponse([review()]),
      ),
    );
    const buyer = renderRoute(`${PATH}#ertekeles`, undefined, { session: buyerUser });

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 3, name: 'Értékelés írása' })).toHaveFocus(),
    );
    buyer.unmount();

    stubFetch(
      ...detailResponses(
        detailResponse(
          photoDetail({ viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }) }),
        ),
        reviewsResponse([review()]),
      ),
    );
    renderRoute(`${PATH}#ertekeles`, undefined, { session: buyerUser });

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Értékelések' })).toHaveFocus(),
    );
  });

  it('ha a fókusz már az első csillagon áll a beküldéskor, a rejtett riasztás a csoport nevével (nem az „1 csillag” címkével) mondja a hibát', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(photoDetail({ viewer: viewerFlags({ purchased: true, canReview: true }) })),
        reviewsResponse([]),
      ),
    );
    renderRoute(PATH, undefined, { session: buyerUser });
    const form = await screen.findByRole('form', { name: 'Értékelés írása' });
    const first = within(form).getByRole('radio', { name: '1 csillag' });
    act(() => first.focus());

    fireEvent.submit(form);

    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Értékelés: Válassz csillagot: 1-től 5-ig.',
    );
    expect(first).toHaveFocus();
  });
});

describe('PhotoDetailPage – értékelés: a szerver szerint elavult állapot (L23)', () => {
  const REVIEWS_PATH = `/api/photos/${PHOTO_ID}/reviews`;
  const DETAIL_PATH = `/api/photos/${PHOTO_ID}`;
  const buyerUser = { ...testUser, id: review().author.id, displayName: 'Vásárló Vera' };
  const own = review({ id: REVIEW_ID, rating: 4, comment: 'Szép fények.' });

  it('ha a kép az értékelés küldésekor már nem látható (404), az adatlap újratöltődik, és a „nem található” oldal jelenik meg', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(photoDetail({ viewer: viewerFlags({ purchased: true, canReview: true }) })),
        reviewsResponse([]),
      ),
      forPath(REVIEWS_PATH, errorResponse(404, 'NOT_FOUND', 'A kép nem található')),
      forPath(DETAIL_PATH, errorResponse(404, 'NOT_FOUND', 'A kép nem található')),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    const form = await screen.findByRole('form', { name: 'Értékelés írása' });
    await user.click(within(form).getByRole('radio', { name: '5 csillag' }));

    await user.click(within(form).getByRole('button', { name: 'Értékelés küldése' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A kép nem található' }),
    ).toBeInTheDocument();
  });

  it('ha a törlendő értékelés már nem létezik (404 – pl. másik lapon törölte), az ablak bezárul, a lista és az adatlap frissül, a fókusz az értékelések címére kerül, az üzenet elhangzik', async () => {
    stubFetch(
      ...detailResponses(
        detailResponse(
          photoDetail({ viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }) }),
        ),
        reviewsResponse([own]),
      ),
      forPath(
        `/api/reviews/${REVIEW_ID}`,
        errorResponse(404, 'NOT_FOUND', 'Az értékelés nem található'),
      ),
      forPath(REVIEWS_PATH, reviewsResponse([])),
      forPath(
        DETAIL_PATH,
        detailResponse(photoDetail({ viewer: viewerFlags({ purchased: true, canReview: true }) })),
      ),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    await user.click(await screen.findByRole('button', { name: 'Értékelés törlése' }));

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Törlés' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('form', { name: 'Értékelés írása' })).toBeInTheDocument();
    expect(screen.queryByText('A te értékelésed')).toBeNull();
    const section = screen.getByRole('region', { name: 'Értékelések' });
    await waitFor(() =>
      expect(within(section).getByRole('heading', { name: 'Értékelések' })).toHaveFocus(),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Az értékelés nem található.');
  });
});

describe('PhotoDetailPage – értékelés írása: a két frissítés sorrendje (L23, React-átnézés)', () => {
  const REVIEWS_PATH = `/api/photos/${PHOTO_ID}/reviews`;
  const DETAIL_PATH = `/api/photos/${PHOTO_ID}`;
  const buyerUser = { ...testUser, id: review().author.id, displayName: 'Vásárló Vera' };
  const own = review({ id: REVIEW_ID, rating: 4, comment: 'Szép fények.' });

  it('ha az adatlap frissítése később ér vissza, mint a listáé (valódi hálózaton gyakori), a fókusz akkor is az új értékelésre kerül, a köszönet egyszer hangzik el', async () => {
    const detailRefetch = new DeferredResponse();
    stubFetch(
      ...detailResponses(
        detailResponse(photoDetail({ viewer: viewerFlags({ purchased: true, canReview: true }) })),
        reviewsResponse([]),
      ),
      forPath(REVIEWS_PATH, jsonResponse(201, { data: { review: own } })),
      forPath(REVIEWS_PATH, reviewsResponse([own])),
      forPath(DETAIL_PATH, detailRefetch),
    );
    const { user } = renderRoute(PATH, undefined, { session: buyerUser });
    const form = await screen.findByRole('form', { name: 'Értékelés írása' });
    await user.click(within(form).getByRole('radio', { name: '4 csillag' }));
    await user.click(within(form).getByRole('button', { name: 'Értékelés küldése' }));

    // A lista már frissült, az űrlap még látszik (foglalt gombbal), a fókusz még nem mozdult
    const article = (await screen.findByText('Szép fények.')).closest('article')!;
    expect(within(form).getByRole('button', { name: 'Küldés…' })).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('Köszönjük');
    detailRefetch.resolve(
      detailResponse(
        photoDetail({ viewer: viewerFlags({ purchased: true, ownReviewId: REVIEW_ID }) }),
      ),
    );

    await waitFor(() => expect(article).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('Köszönjük az értékelést!');
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Értékelés írása' })).toBeNull());
    expect(within(article).getByText('A te értékelésed')).toBeInTheDocument();
  });
});
