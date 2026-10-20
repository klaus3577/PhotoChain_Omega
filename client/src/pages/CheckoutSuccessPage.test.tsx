// A sikeres fizetés oldala (L22, terv 3.3): a Stripe ide irányít vissza (/checkout/success?session_id=…);
// az oldal a rendelés állapotát kérdezi (GET /api/orders/by-session/:id) 3 másodpercenként, amíg a
// webhook be nem fut (PENDING → PAID), majd az eredeti letöltését kínálja. Csak a szerver formájú
// munkamenet-azonosítóval indul kérés; más fiók rendelése (404), lejárt vagy sikertelen fizetés és a
// betöltési hiba saját, érthető nézetet kap. Védett oldal (router.test).
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { orderKeys } from '../api/orders.api';
import { photoKeys } from '../api/photos.api';
import { axeViolations } from '../test/axe';
import { DeferredResponse, forPath, requestedUrls, stubFetch } from '../test/fetch';
import { order, orderResponse, SESSION_ID } from '../test/orders';
import { PHOTO_ID, photoDetail, viewerFlags } from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testUser } from '../test/users';

const PATH = `/checkout/success?session_id=${SESSION_ID}`;
const BY_SESSION = `/api/orders/by-session/${SESSION_ID}`;
const TITLE = 'Őszi erdő ködben';

afterEach(() => {
  vi.useRealTimers();
});

const pendingOrder = () =>
  order({ status: 'PENDING', paidAt: null, downloadable: false, reviewable: false });

const valueOf = (term: string) =>
  screen.getByText(term, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('CheckoutSuccessPage', () => {
  it('függő rendelés: a feldolgozás folyamatban, 3 másodpercenként újra kérdez; PAID után a rendelés adatai, az eredeti letöltése, bemondás; az adatlap és a vásárlásaim gyorsítótára érvénytelenedik', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(forPath(BY_SESSION, orderResponse(pendingOrder())));
    const { queryClient, container } = renderRoute(PATH, undefined, { session: testUser });
    queryClient.setQueryData(photoKeys.detail(PHOTO_ID), photoDetail({ viewer: viewerFlags() }));
    queryClient.setQueryData(orderKeys.purchasesPage(1), {
      orders: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'A fizetés feldolgozása folyamatban',
    });
    expect(document.title).toBe('A fizetés feldolgozása folyamatban · PhotoChain');
    // A Stripe-tól teljes oldalbetöltéssel érkezünk: amikor az eredmény megjelenik, a fókusz a címre
    // kerül (a képernyőolvasó az eredménnyel kezd)
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText(/Várakozás a Stripe visszaigazolására/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Eredeti letöltése' })).toBeNull();
    const fetchMock = stubFetch(forPath(BY_SESSION, orderResponse(order())));

    act(() => vi.advanceTimersByTime(3000));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sikeres fizetés' })).toHaveFocus();
    expect(requestedUrls(fetchMock)).toEqual([BY_SESSION]);
    expect(within(valueOf('Kép')).getByRole('link', { name: TITLE })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(valueOf('Fotós')).toHaveTextContent('Fotós Fanni');
    expect(valueOf('Összeg')).toHaveTextContent('12 500 Ft');
    expect(valueOf('Fizetve')).toHaveTextContent('2026. 10. 06. 11:13');
    expect(screen.getByRole('link', { name: 'Eredeti letöltése' })).toHaveAttribute(
      'href',
      `/api/photos/${PHOTO_ID}/download`,
    );
    expect(screen.getByRole('link', { name: 'Vásárlásaim' })).toHaveAttribute(
      'href',
      '/dashboard?tab=vasarlasaim',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'A fizetés sikerült, az eredeti letölthető.',
    );
    expect(queryClient.getQueryState(photoKeys.detail(PHOTO_ID))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(orderKeys.purchasesPage(1))?.isInvalidated).toBe(true);
    // Kifizetve: nincs több lekérdezés
    act(() => vi.advanceTimersByTime(6500));
    expect(requestedUrls(fetchMock)).toHaveLength(1);
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('ha a függő nézet hivatkozásán áll a fókusz, amikor a rendelés kifizetetté válik, a fókusz a címre kerül (a hivatkozás eltűnt)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(forPath(BY_SESSION, orderResponse(pendingOrder())));
    const { user } = renderRoute(PATH, undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'A fizetés feldolgozása folyamatban' });
    const link = screen.getByRole('link', { name: 'Vásárlásaim' });
    act(() => link.focus());
    stubFetch(forPath(BY_SESSION, orderResponse(order())));

    act(() => vi.advanceTimersByTime(3000));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Sikeres fizetés' });
    await waitFor(() => expect(heading).toHaveFocus());
    void user;
  });

  it('ha a fizetés függés közben lejár vagy nem sikerül, azt is bemondja', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(forPath(BY_SESSION, orderResponse(pendingOrder())));
    renderRoute(PATH, undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'A fizetés feldolgozása folyamatban' });
    stubFetch(
      forPath(
        BY_SESSION,
        orderResponse(
          order({ status: 'EXPIRED', paidAt: null, downloadable: false, reviewable: false }),
        ),
      ),
    );

    act(() => vi.advanceTimersByTime(3000));

    await screen.findByRole('heading', { level: 1, name: 'A fizetés nem sikerült' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'A fizetés nem sikerült – nem történt terhelés.',
    );
  });

  it('tíz perc függés után a lekérdezés leáll: a töltésjelző eltűnik, a szöveg megmondja, hol nézhető meg később, és a „Frissítés” gomb kézzel kérdez', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(forPath(BY_SESSION, orderResponse(pendingOrder())));
    const { user } = renderRoute(PATH, undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'A fizetés feldolgozása folyamatban' });
    // Az első ismételt lekérdezés válasza sosem érkezik meg (a többi lekérdezés addig nem indul)
    const hanging = new DeferredResponse();
    stubFetch(forPath(BY_SESSION, hanging));
    act(() => vi.advanceTimersByTime(3000));

    act(() => vi.advanceTimersByTime(10 * 60_000));

    // Az élő régió ugyanezt mondja: a látható bekezdést keressük
    expect(
      await screen.findByText(/A visszaigazolás a szokásosnál tovább tart/, { selector: 'p' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'A visszaigazolás a szokásosnál tovább tart',
    );
    expect(screen.queryByText(/Várakozás a Stripe visszaigazolására/)).toBeNull();
    const refresh = screen.getByRole('button', { name: 'Frissítés' });
    hanging.resolve(orderResponse(pendingOrder()));
    await waitFor(() => expect(refresh).not.toHaveAttribute('aria-disabled'));
    // A kézi frissítés eredménye is elhangzik: még függő, aztán hiba, végül a siker
    stubFetch(
      forPath(BY_SESSION, orderResponse(pendingOrder())),
      forPath(BY_SESSION, errorResponse(500, 'INTERNAL_ERROR', 'Váratlan hiba')),
      forPath(BY_SESSION, orderResponse(order())),
    );
    await user.click(refresh);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('A rendelés még feldolgozás alatt áll.'),
    );
    await user.click(refresh);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'A rendelés állapotának lekérdezése nem sikerült.',
      ),
    );
    expect(
      screen.getByText(/A rendelés állapotának lekérdezése nem sikerült/, { selector: 'p' }),
    ).toBeInTheDocument();
    await user.click(refresh);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sikeres fizetés' }),
    ).toBeInTheDocument();
  });

  it('már kifizetett rendelésnél azonnal a siker; ha a képet a moderátor közben levette, a letöltés helyett magyarázat', async () => {
    stubFetch(
      forPath(BY_SESSION, orderResponse(order({ downloadable: false, reviewable: false }))),
    );
    renderRoute(PATH, undefined, { session: testUser });

    await screen.findByRole('heading', { level: 1, name: 'Sikeres fizetés' });
    expect(screen.getByText(/A képet a moderátor eltávolította/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Eredeti letöltése' })).toBeNull();
    // Nincs mit bemondani: az oldal címe mondja a sikert (az élő régió üres)
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('ha a lekérdezés függés közben nem sikerül, a nézet marad, és a megjegyzés megmondja, hogy újra próbáljuk', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(forPath(BY_SESSION, orderResponse(pendingOrder())));
    renderRoute(PATH, undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'A fizetés feldolgozása folyamatban' });
    stubFetch(forPath(BY_SESSION, errorResponse(500, 'INTERNAL_ERROR', 'Váratlan hiba')));

    act(() => vi.advanceTimersByTime(3000));

    expect(await screen.findByText(/Az állapot lekérdezése most nem sikerült/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'A fizetés feldolgozása folyamatban' }),
    ).toBeInTheDocument();
  });

  it('érvénytelen vagy hiányzó session_id: kérés nélkül érthető oldal a vásárlásaim hivatkozásával', async () => {
    const fetchMock = stubFetch();
    for (const search of ['', '?session_id=abc', '?session_id=cs_live_a1b2', '?session_id=..']) {
      const view = renderRoute(`/checkout/success${search}`, undefined, { session: testUser });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Érvénytelen hivatkozás' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Vásárlásaim' })).toHaveAttribute(
        'href',
        '/dashboard?tab=vasarlasaim',
      );
      view.unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404 (ismeretlen vagy más fiók rendelése): „A rendelés nem található”', async () => {
    stubFetch(forPath(BY_SESSION, errorResponse(404, 'NOT_FOUND', 'A rendelés nem található')));
    renderRoute(PATH, undefined, { session: testUser });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A rendelés nem található' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vásárlásaim' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['EXPIRED', 'FAILED'])(
    '%s: a fizetés nem sikerült, nem történt terhelés, vissza a képhez',
    async (orderStatus) => {
      stubFetch(
        forPath(
          BY_SESSION,
          orderResponse(
            order({ status: orderStatus, paidAt: null, downloadable: false, reviewable: false }),
          ),
        ),
      );
      renderRoute(PATH, undefined, { session: testUser });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'A fizetés nem sikerült' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/nem történt terhelés/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Vissza a képhez' })).toHaveAttribute(
        'href',
        `/photos/${PHOTO_ID}`,
      );
    },
  );

  it('betöltés közben is van oldalcím; ha az első lekérdezés nem sikerül, riasztás és újrapróbálás; siker után a rendelés, a fókusz a címen (a gomb eltűnt)', async () => {
    const first = new DeferredResponse();
    stubFetch(forPath(BY_SESSION, first), forPath(BY_SESSION, orderResponse(order())));
    const { user } = renderRoute(PATH, undefined, { session: testUser });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A rendelés ellenőrzése' }),
    ).toBeInTheDocument();
    first.resolve(errorResponse(500, 'INTERNAL_ERROR', 'Váratlan hiba'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'A rendelés most nem ellenőrizhető' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('A rendelés ellenőrzése nem sikerült.');
    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Sikeres fizetés' });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});
