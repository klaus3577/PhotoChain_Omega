// A vezérlőpult (L22; L17 drótváz „Vezérlőpult”): védett oldal két füllel – a fül és az oldal az
// URL-ben (?tab=, ?page=), ezért a fülek hivatkozások (nav + aria-current), nem ARIA-fülsor. Saját
// képeim: a sorok a kép állapotjelvényével (a függő kép tranzakciójának linkjével, a sikertelen és a
// levett kép magyarázatával), árral és műveletekkel (szerkesztés párbeszédablakban, levétel
// megerősítéssel – natív <dialog>); amíg van regisztrációra váró kép, a lista 3 másodpercenként
// frissül. Vásárlásaim: letöltés (a védett címen), a saját értékelés vagy az értékelés írása, a
// moderátor által levett kép letiltott letöltéssel. A fókusz egyetlen lépésben sem vész el.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { photoKeys } from '../api/photos.api';
import { axeViolations } from '../test/axe';
import {
  DeferredResponse,
  forPath,
  jsonResponse,
  requestedUrls,
  stubFetch,
  type QueuedOutcome,
} from '../test/fetch';
import { order, ORDER_ID, purchasesResponse, REVIEW_ID } from '../test/orders';
import {
  categoriesResponse,
  OWNER_ID,
  ownPhotoListItem,
  ownPhotosResponse,
  PENDING_TX_HASH,
  PHOTO_ID,
  uploadResponse,
} from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testUser } from '../test/users';

const PATH = '/dashboard';
const OWN_PATH = '/api/me/photos';
const PURCHASES_PATH = '/api/me/purchases';
const DETAIL_PATH = `/api/photos/${PHOTO_ID}`;
const TITLE = 'Őszi erdő ködben';
const owner = { ...testUser, id: OWNER_ID };
const PENDING_ID = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9';
const FAILED_ID = '2c3d4e5f-6071-4829-93a4-b5c6d7e8f901';
const HIDDEN_ID = '3d4e5f60-7182-493a-a4b5-c6d7e8f90112';
const TAKEN_DOWN_ID = '4e5f6071-8293-4a4b-b5c6-d7e8f9011223';

afterEach(() => {
  vi.useRealTimers();
});

/** A saját képek a drótváz öt állapotában. */
function ownPhotos() {
  return [
    ownPhotoListItem(),
    ownPhotoListItem({
      id: PENDING_ID,
      title: 'Hajnal a tónál',
      status: 'PENDING_CHAIN',
      pendingTransaction: {
        txHash: PENDING_TX_HASH,
        txUrl: `https://sepolia.etherscan.io/tx/${PENDING_TX_HASH}`,
      },
    }),
    ownPhotoListItem({ id: FAILED_ID, title: 'Városi esti fények', status: 'CHAIN_FAILED' }),
    ownPhotoListItem({
      id: HIDDEN_ID,
      title: 'Régi híd',
      status: 'HIDDEN',
      hiddenBy: 'OWNER',
      thumbnailUrl: null,
    }),
    ownPhotoListItem({
      id: TAKEN_DOWN_ID,
      title: 'Pipacsmező',
      status: 'HIDDEN',
      hiddenBy: 'OWNER_AND_ADMIN',
      thumbnailUrl: null,
    }),
  ];
}

interface DashboardFixture {
  path?: string;
  photos?: unknown[];
  photosMeta?: { page?: number; total?: number; pageSize?: number };
  orders?: unknown[];
  ordersMeta?: { page?: number; total?: number; pageSize?: number };
  extra?: QueuedOutcome[];
}

/** Az oldal bejelentkezve, a két lista válaszával (a kérések sorrendje nem számít). */
function renderDashboard({
  path = PATH,
  photos = [ownPhotoListItem()],
  photosMeta = {},
  orders = [order()],
  ordersMeta = {},
  extra = [],
}: DashboardFixture = {}) {
  const fetchMock = stubFetch(
    forPath(OWN_PATH, ownPhotosResponse(photos, photosMeta)),
    forPath(PURCHASES_PATH, purchasesResponse(orders, ordersMeta)),
    ...extra,
  );
  return { ...renderRoute(path, undefined, { session: owner }), fetchMock };
}

const tabs = () => screen.getByRole('navigation', { name: 'Vezérlőpult nézetei' });
const ownRegion = () => screen.getByRole('region', { name: 'Saját képeim' });
const purchasesRegion = () => screen.getByRole('region', { name: 'Vásárlásaim' });
const rowOf = (title: string) =>
  screen.getByRole('link', { name: title }).closest('li') as HTMLElement;
const status = () => screen.getByRole('status');
const dialog = () => screen.getByRole('dialog');

describe('DashboardPage – az oldal és a fülek', () => {
  it('cím, magyarázat, két fül hivatkozásként darabszámmal (az aktuális aria-current), a saját képek listája', async () => {
    const { fetchMock } = renderDashboard({ photos: ownPhotos() });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vezérlőpult' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Vezérlőpult – Saját képeim · PhotoChain');
    expect(
      screen.getByText('A feltöltött képeid állapota és a vásárlásaid egy helyen.'),
    ).toBeInTheDocument();
    const own = await within(tabs()).findByRole('link', { name: 'Saját képeim (5)' });
    expect(own).toHaveAttribute('href', '/dashboard');
    expect(own).toHaveAttribute('aria-current', 'page');
    const purchases = await within(tabs()).findByRole('link', { name: 'Vásárlásaim (1)' });
    expect(purchases).toHaveAttribute('href', '/dashboard?tab=vasarlasaim');
    expect(purchases).not.toHaveAttribute('aria-current');
    expect(within(ownRegion()).getByText('Összesen 5 kép')).toBeInTheDocument();
    expect(
      within(ownRegion())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining(TITLE),
      expect.stringContaining('Hajnal a tónál'),
      expect.stringContaining('Városi esti fények'),
      expect.stringContaining('Régi híd'),
      expect.stringContaining('Pipacsmező'),
    ]);
    expect(screen.queryByRole('region', { name: 'Vásárlásaim' })).toBeNull();
    expect(requestedUrls(fetchMock).sort()).toEqual([
      '/api/me/photos?page=1&pageSize=20',
      '/api/me/purchases?page=1&pageSize=20',
    ]);
  });

  it('a Vásárlásaim fülre lépve az URL változik, a fül aktuális lesz, és a vásárlások látszanak; a főnavigáció a vezérlőpultot jelöli', async () => {
    const { user, router } = renderDashboard();
    await screen.findByRole('link', { name: 'Vásárlásaim (1)' });

    await user.click(screen.getByRole('link', { name: 'Vásárlásaim (1)' }));

    expect(router.state.location.search).toBe('?tab=vasarlasaim');
    expect(document.title).toBe('Vezérlőpult – Vásárlásaim · PhotoChain');
    expect(within(tabs()).getByRole('link', { name: 'Vásárlásaim (1)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs()).getByRole('link', { name: 'Saját képeim (1)' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(purchasesRegion()).getByText('Összesen 1 vásárlás')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Saját képeim' })).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Fő navigáció' });
    expect(within(nav).getByRole('link', { name: 'Vezérlőpult' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('lapozás: a ?page=2 a második oldalt kéri; a lapozó hivatkozásai a fület is megtartják', async () => {
    const { fetchMock } = renderDashboard({
      path: '/dashboard?tab=vasarlasaim&page=2',
      ordersMeta: { page: 2, total: 21 },
      photosMeta: { total: 45 },
    });

    await screen.findByText('Összesen 21 vásárlás, 2. oldal');
    expect(requestedUrls(fetchMock)).toContain('/api/me/purchases?page=2&pageSize=20');
    const pagination = within(purchasesRegion()).getByRole('navigation', { name: 'Lapozás' });
    expect(within(pagination).getByRole('link', { name: '1. oldal' })).toHaveAttribute(
      'href',
      '/dashboard?tab=vasarlasaim',
    );
    expect(within(pagination).getByRole('link', { name: '2. oldal' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // A saját képek füle az első oldalára mutat (a lapozás fülenként külön)
    expect(within(tabs()).getByRole('link', { name: 'Saját képeim (45)' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('a saját képek lapozója a tab nélküli címet használja', async () => {
    renderDashboard({ photosMeta: { total: 30 } });

    await screen.findByText('Összesen 30 kép');
    const pagination = within(ownRegion()).getByRole('navigation', { name: 'Lapozás' });
    expect(within(pagination).getByRole('link', { name: '2. oldal' })).toHaveAttribute(
      'href',
      '/dashboard?page=2',
    );
  });

  it('üres állapotok: nincs feltöltött kép → a feltöltés hivatkozása; nincs vásárlás → a galériáé; az üres fülre váltva a fókusz az üres állapot címére kerül', async () => {
    const empty = renderDashboard({ photos: [], orders: [] });

    expect(await screen.findByText('Még nincs feltöltött képed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kép feltöltése' })).toHaveAttribute('href', '/upload');
    expect(within(tabs()).getByRole('link', { name: 'Saját képeim (0)' })).toBeInTheDocument();
    expect(screen.queryByText(/Összesen/)).toBeNull();
    await empty.user.click(within(tabs()).getByRole('link', { name: 'Vásárlásaim (0)' }));
    const emptyTitle = await screen.findByText('Még nem vásároltál képet');
    await waitFor(() => expect(emptyTitle).toHaveFocus());
    empty.unmount();

    renderDashboard({ path: '/dashboard?tab=vasarlasaim', orders: [] });

    expect(await screen.findByText('Még nem vásároltál képet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Galéria böngészése' })).toHaveAttribute('href', '/');
  });

  it('ha a bélyegkép nem tölthető be, semleges helykitöltő áll a helyén (a sor nem esik szét)', async () => {
    renderDashboard();
    const region = await screen.findByRole('region', { name: 'Saját képeim' });
    const thumbnail = await within(region).findByRole('presentation');

    fireEvent.error(thumbnail);

    expect(within(region).queryByRole('presentation')).toBeNull();
    expect(within(region).getByText('Előnézet nem érhető el')).toBeInTheDocument();
  });

  it('a nem létező oldalon (túl nagy oldalszám) a visszalépés az első oldalra', async () => {
    renderDashboard({ path: '/dashboard?page=9', photos: [], photosMeta: { page: 9, total: 3 } });

    expect(await screen.findByText('Ezen az oldalon nincs kép')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vissza az első oldalra' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('ha a saját képek betöltése nem sikerül, riasztás és újrapróbálás; siker után a lista', async () => {
    stubFetch(
      forPath(OWN_PATH, errorResponse(500, 'INTERNAL_ERROR', 'Váratlan hiba')),
      forPath(PURCHASES_PATH, purchasesResponse([order()])),
      forPath(OWN_PATH, ownPhotosResponse([ownPhotoListItem()])),
    );
    const { user } = renderRoute(PATH, undefined, { session: owner });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A képek betöltése nem sikerült.');
    // A fül darabszáma hibánál nem látszik, a fül attól még használható
    expect(within(tabs()).getByRole('link', { name: 'Saját képeim' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));

    expect(await screen.findByRole('link', { name: TITLE })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('nincs akadálymentességi hiba (axe) – a saját képek listájával és a vásárlásokkal', async () => {
    const own = renderDashboard({ photos: ownPhotos() });
    await screen.findByText('Összesen 5 kép');
    expect(await axeViolations(own.container, { page: true })).toEqual([]);
    own.unmount();

    const purchases = renderDashboard({
      path: '/dashboard?tab=vasarlasaim',
      orders: [order(), order({ id: REVIEW_ID, review: { id: REVIEW_ID, rating: 4 } })],
    });
    await screen.findByText('Összesen 2 vásárlás');
    expect(await axeViolations(purchases.container, { page: true })).toEqual([]);
  });
});

describe('DashboardPage – Saját képeim', () => {
  it('a sor: bélyegkép, a cím hivatkozás az adatlapra, dátum, állapotjelvény, ár (rejtett címkével), műveletek a kép nevével', async () => {
    renderDashboard();

    const region = await screen.findByRole('region', { name: 'Saját képeim' });
    const row = await within(region).findByRole('listitem');
    expect(within(row).getByRole('presentation')).toHaveAttribute(
      'src',
      `/media/thumbnails/${PHOTO_ID}.webp`,
    );
    expect(within(row).getByRole('link', { name: TITLE })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    // A dátum rejtett címkével (a lista cellái címke nélkül nem érthetők a képernyőolvasónak)
    expect(within(row).getByText(/2026\. október 4\./)).toHaveTextContent(
      'Feltöltve: 2026. október 4.',
    );
    expect(within(row).getByText('Hitelesítve')).toBeInTheDocument();
    // A rejtett „Ár:” címke és az ár együtt (a nem törő szóközök sima szóközként)
    expect(within(row).getByText(/Ft$/)).toHaveTextContent('Ár: 12 500 Ft');
    expect(within(row).getByRole('button', { name: `Szerkesztés: ${TITLE}` })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: `Levétel: ${TITLE}` })).toBeInTheDocument();
  });

  it('állapotok: függő kép a függő tranzakció linkjével (új lapon), sikertelen regisztráció megjegyzéssel, saját levétel, moderátori levétel magyarázattal (Miért?); a rejtett képnek nincs művelete, a függőnek nincs levétele', async () => {
    const { user } = renderDashboard({ photos: ownPhotos() });
    await screen.findByText('Összesen 5 kép');

    const pending = rowOf('Hajnal a tónál');
    expect(within(pending).getByText('Regisztrálás folyamatban')).toBeInTheDocument();
    const txLink = within(pending).getByRole('link', {
      name: '0x7a1c…2d9b – a függő tranzakció megnyitása az Etherscanen (új lapon)',
    });
    expect(txLink).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${PENDING_TX_HASH}`);
    expect(txLink).toHaveAttribute('target', '_blank');
    expect(
      within(pending).getByRole('button', { name: 'Szerkesztés: Hajnal a tónál' }),
    ).toBeInTheDocument();
    expect(within(pending).queryByRole('button', { name: /^Levétel/ })).toBeNull();

    const failed = rowOf('Városi esti fények');
    expect(within(failed).getByText('Sikertelen regisztráció')).toBeInTheDocument();
    expect(within(failed).getByText('Az adminisztrátor újrapróbálja.')).toBeInTheDocument();
    expect(within(failed).queryByRole('button', { name: /^Levétel/ })).toBeNull();

    const hidden = rowOf('Régi híd');
    expect(within(hidden).getByText('Elrejtve')).toBeInTheDocument();
    expect(within(hidden).getByText('Te vetted le a galériából.')).toBeInTheDocument();
    expect(within(hidden).getByText('Előnézet nem érhető el')).toBeInTheDocument();
    expect(within(hidden).queryByRole('button')).toBeNull();

    const takenDown = rowOf('Pipacsmező');
    expect(within(takenDown).getByText('Moderátor eltávolította')).toBeInTheDocument();
    expect(within(takenDown).getByText('A vásárlók sem tölthetik le.')).toBeInTheDocument();
    // A gomb neve a kép címét is tartalmazza (több levett sor esetén is megkülönböztethető)
    const why = within(takenDown).getByRole('button', { name: 'Miért? – „Pipacsmező” levétele' });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    const explanation = within(takenDown).getByText(/A moderátor a szabályzat megsértése/);
    expect(explanation).not.toBeVisible();
    await user.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    expect(explanation).toBeVisible();
    expect(within(takenDown).queryByRole('button', { name: /Szerkesztés|Levétel/ })).toBeNull();
  });

  it('amíg van regisztrációra váró kép, a lista 3 másodpercenként frissül; a hitelesítést bemondja, a galéria listái érvénytelenednek, és az eltűnő tranzakció-link fókusza a kép címére kerül', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pending = ownPhotos()[1]!;
    const { queryClient } = renderDashboard({ photos: [pending] });
    queryClient.setQueryData(photoKeys.list('?page=1'), {
      photos: [],
      meta: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
    });
    await screen.findByText('Regisztrálás folyamatban');
    const txLink = screen.getByRole('link', { name: /a függő tranzakció megnyitása/ });
    act(() => txLink.focus());
    const fetchMock = stubFetch(
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ id: PENDING_ID, title: 'Hajnal a tónál', status: 'REGISTERED' }),
        ]),
      ),
    );

    act(() => vi.advanceTimersByTime(3000));

    expect(await screen.findByText('Hitelesítve')).toBeInTheDocument();
    expect(requestedUrls(fetchMock)).toEqual(['/api/me/photos?page=1&pageSize=20']);
    expect(status()).toHaveTextContent(
      '„Hajnal a tónál” hitelesítve a blokkláncon, és megjelent a galériában.',
    );
    expect(queryClient.getQueryState(photoKeys.list('?page=1'))?.isInvalidated).toBe(true);
    // A tranzakció hivatkozása eltűnt a fókusszal együtt: a fókusz a kép címére kerül
    await waitFor(() => expect(screen.getByRole('link', { name: 'Hajnal a tónál' })).toHaveFocus());
    // Nincs több függő kép: nincs több lekérdezés
    act(() => vi.advanceTimersByTime(6500));
    expect(requestedUrls(fetchMock)).toHaveLength(1);
  });

  it('a Vásárlásaim fülön is figyeli a saját képek regisztrációját: a hitelesítést bemondja, a galéria listái érvénytelenednek', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { queryClient } = renderDashboard({
      path: '/dashboard?tab=vasarlasaim',
      photos: [ownPhotos()[1]!],
    });
    queryClient.setQueryData(photoKeys.list('?page=1'), {
      photos: [],
      meta: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
    });
    await screen.findByText('Összesen 1 vásárlás');
    stubFetch(
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ id: PENDING_ID, title: 'Hajnal a tónál', status: 'REGISTERED' }),
        ]),
      ),
    );

    act(() => vi.advanceTimersByTime(3000));

    await waitFor(() =>
      expect(status()).toHaveTextContent(
        '„Hajnal a tónál” hitelesítve a blokkláncon, és megjelent a galériában.',
      ),
    );
    expect(queryClient.getQueryState(photoKeys.list('?page=1'))?.isInvalidated).toBe(true);
  });

  it('ha a tízperces időkeret lejárta után új függő kép jelenik meg (pl. ablakváltáskori frissítéskor), a lekérdezés újraindul', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { queryClient } = renderDashboard({ photos: [ownPhotos()[1]!] });
    await screen.findByText('Regisztrálás folyamatban');
    // Az első kép hitelesítve: nincs több lekérdezés
    stubFetch(
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ id: PENDING_ID, title: 'Hajnal a tónál', status: 'REGISTERED' }),
        ]),
      ),
    );
    act(() => vi.advanceTimersByTime(3000));
    await screen.findByText('Hitelesítve');
    act(() => vi.advanceTimersByTime(11 * 60_000));

    // Egy külső frissítés (pl. ablakváltás) új függő képet hoz
    const fetchMock = stubFetch(
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ id: PENDING_ID, title: 'Hajnal a tónál', status: 'REGISTERED' }),
          ownPhotoListItem({ id: FAILED_ID, title: 'Új kép', status: 'PENDING_CHAIN' }),
        ]),
      ),
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ id: PENDING_ID, title: 'Hajnal a tónál', status: 'REGISTERED' }),
          ownPhotoListItem({ id: FAILED_ID, title: 'Új kép', status: 'REGISTERED' }),
        ]),
      ),
    );
    await act(() => queryClient.refetchQueries({ queryKey: photoKeys.own() }));
    await screen.findByText('Regisztrálás folyamatban');

    act(() => vi.advanceTimersByTime(3000));

    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(2));
    expect(await screen.findAllByText('Hitelesítve')).toHaveLength(2);
  });

  it('ha egy lekérdezésben több kép lesz hitelesítve, egyetlen bemondás sorolja fel őket (az élő régió a következő üzenettel az előzőt felülírná)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const second = ownPhotoListItem({
      id: FAILED_ID,
      title: 'Városi esti fények',
      status: 'PENDING_CHAIN',
    });
    renderDashboard({ photos: [ownPhotos()[1]!, second] });
    await screen.findByText('Összesen 2 kép');
    stubFetch(
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ id: PENDING_ID, title: 'Hajnal a tónál', status: 'REGISTERED' }),
          ownPhotoListItem({ id: FAILED_ID, title: 'Városi esti fények', status: 'REGISTERED' }),
        ]),
      ),
    );

    act(() => vi.advanceTimersByTime(3000));

    await waitFor(() =>
      expect(status()).toHaveTextContent(
        '2 kép hitelesítve a blokkláncon, és megjelent a galériában: „Hajnal a tónál”, „Városi esti fények”.',
      ),
    );
  });

  it('a sikertelen regisztrációt is bemondja (a jelvény pirosra váltása önmagában néma)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderDashboard({ photos: [ownPhotos()[1]!] });
    await screen.findByText('Regisztrálás folyamatban');
    stubFetch(
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ id: PENDING_ID, title: 'Hajnal a tónál', status: 'CHAIN_FAILED' }),
        ]),
      ),
    );

    act(() => vi.advanceTimersByTime(3000));

    expect(await screen.findByText('Sikertelen regisztráció')).toBeInTheDocument();
    expect(status()).toHaveTextContent(
      '„Hajnal a tónál” regisztrációja nem sikerült – az adminisztrátor újrapróbálja.',
    );
    // Látható, figyelmeztető tónusú értesítés (nem pipás siker – L26)
    expect(status()).toHaveAttribute('data-tone', 'warning');
    expect(status()).not.toHaveClass('sr-only');
  });

  it('lapozáskor és fülváltáskor az új lista megérkezése után a fókusz a találatszámra kerül (az eltűnő lapozó-hivatkozásról sem vész el)', async () => {
    const { user } = renderDashboard({
      photosMeta: { total: 40 },
      extra: [forPath(OWN_PATH, ownPhotosResponse([ownPhotoListItem()], { page: 2, total: 40 }))],
    });
    await screen.findByText('Összesen 40 kép');

    // Az utolsó oldalra lépve a „Következő oldal” hivatkozás eltűnik
    await user.click(screen.getByRole('link', { name: 'Következő oldal' }));
    const pageTwo = await screen.findByText('Összesen 40 kép, 2. oldal');
    await waitFor(() => expect(pageTwo).toHaveFocus());
    expect(screen.queryByRole('link', { name: 'Következő oldal' })).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Vásárlásaim (1)' }));
    const purchasesSummary = await screen.findByText('Összesen 1 vásárlás');
    await waitFor(() => expect(purchasesSummary).toHaveFocus());
  });
});

describe('DashboardPage – szerkesztés', () => {
  const openEdit = async (user: ReturnType<typeof renderRoute>['user']) => {
    const button = await screen.findByRole('button', { name: `Szerkesztés: ${TITLE}` });
    await user.click(button);
    return button;
  };

  it('a Szerkesztés párbeszédablakot nyit a kitöltött mezőkkel (a fókusz a címen); mentéskor PATCH a szerver formájában, a lista frissül, az ablak bezárul, a fókusz a gombra tér vissza, bemondás', async () => {
    const { user, fetchMock } = renderDashboard({
      photos: [ownPhotoListItem({ description: 'Kora reggeli köd.' })],
      extra: [forPath('/api/categories', categoriesResponse())],
    });
    const button = await openEdit(user);

    const editDialog = dialog();
    expect(editDialog).toHaveAccessibleName('Kép adatainak szerkesztése');
    expect(editDialog).toHaveAccessibleDescription(/„Őszi erdő ködben”/);
    const title = within(editDialog).getByRole('textbox', { name: 'Cím' });
    expect(title).toHaveValue(TITLE);
    expect(title).toHaveFocus();
    const description = within(editDialog).getByRole('textbox', { name: /Leírás/ });
    expect(description).toHaveValue('Kora reggeli köd.');
    await within(editDialog).findByRole('option', { name: 'Tájkép' });
    expect(within(editDialog).getByRole('combobox', { name: 'Kategória' })).toHaveValue('1');
    expect(within(editDialog).getByRole('textbox', { name: 'Ár (Ft)' })).toHaveValue('12500');

    stubFetch(
      forPath(
        DETAIL_PATH,
        jsonResponse(200, uploadResponse({ title: 'Őszi erdő', priceHuf: 9900 })),
      ),
      forPath(
        OWN_PATH,
        ownPhotosResponse([ownPhotoListItem({ title: 'Őszi erdő', priceHuf: 9900 })]),
      ),
    );
    await user.clear(title);
    await user.type(title, 'Őszi erdő');
    await user.clear(description);
    await user.type(description, 'Köd a bükkösben.');
    const price = within(editDialog).getByRole('textbox', { name: 'Ár (Ft)' });
    await user.clear(price);
    await user.type(price, '9 900');
    await user.click(within(editDialog).getByRole('button', { name: 'Mentés' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const patch = globalThis.fetch as unknown as ReturnType<typeof stubFetch>;
    const call = patch.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(String(call![0])).toBe(DETAIL_PATH);
    expect(JSON.parse(String(call![1]?.body))).toEqual({
      title: 'Őszi erdő',
      description: 'Köd a bükkösben.',
      priceHuf: 9900,
      categoryId: 1,
    });
    const updatedRow = rowOf('Őszi erdő');
    expect(within(updatedRow).getByText(/Ft$/)).toHaveTextContent('Ár: 9900 Ft');
    expect(status()).toHaveTextContent('A kép adatai frissültek.');
    await waitFor(() => expect(button).toHaveFocus());
    expect(button).toHaveAccessibleName('Szerkesztés: Őszi erdő');
    void fetchMock;
  });

  it('a Mégse és az Escape kérés nélkül bezárja az ablakot; a fókusz a Szerkesztés gombra tér vissza', async () => {
    const { user } = renderDashboard({
      extra: [forPath('/api/categories', categoriesResponse())],
    });
    const button = await openEdit(user);
    await within(dialog()).findByRole('option', { name: 'Tájkép' });

    await user.click(within(dialog()).getByRole('button', { name: 'Mégse' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();

    await user.click(button);
    const title = within(dialog()).getByRole('textbox', { name: 'Cím' });
    await user.type(title, ' (vázlat)');
    await user.keyboard('{Escape}');
    // A böngésző a close eseményt a bezárás után külön küldi: az ablak ezután tűnik el
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
    // A félbehagyott módosítás nem maradt meg
    await user.click(button);
    expect(within(dialog()).getByRole('textbox', { name: 'Cím' })).toHaveValue(TITLE);
  });

  it('ha a kategóriák nem töltődtek be, az újratöltés hibája az ablakban hangzik el (a nyitott ablak alatt az oldal élő régiója nem érhető el)', async () => {
    const { user } = renderDashboard({
      extra: [
        forPath('/api/categories', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan hiba')),
        forPath('/api/categories', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan hiba')),
        forPath('/api/categories', categoriesResponse()),
      ],
    });
    await openEdit(user);
    const reload = await within(dialog()).findByRole('button', { name: 'Kategóriák újratöltése' });
    expect(
      within(dialog()).getByRole('combobox', { name: 'Kategória' }),
    ).toHaveAccessibleDescription('A kategóriák listája nem töltődött be.');

    await user.click(reload);

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'A kategóriák betöltése most sem sikerült.',
    );
    await user.click(reload);
    await within(dialog()).findByRole('option', { name: 'Tájkép' });
    expect(within(dialog()).getByRole('combobox', { name: 'Kategória' })).toHaveFocus();
    expect(within(dialog()).queryByRole('alert')).toBeNull();
  });

  it('üres cím: a hiba a mezőnél, a fókusz rajta, nincs kérés; a szerver 409-e (közben elrejtett kép) riasztás az ablakban', async () => {
    const { user } = renderDashboard({
      extra: [forPath('/api/categories', categoriesResponse())],
    });
    await openEdit(user);
    const title = within(dialog()).getByRole('textbox', { name: 'Cím' });
    await within(dialog()).findByRole('option', { name: 'Tájkép' });

    await user.clear(title);
    await user.click(within(dialog()).getByRole('button', { name: 'Mentés' }));

    expect(title).toHaveAccessibleDescription('Add meg a kép címét.');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveFocus();

    const fetchMock = stubFetch(
      forPath(
        DETAIL_PATH,
        errorResponse(409, 'CONFLICT', 'Az elrejtett kép adatai nem módosíthatók'),
      ),
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ status: 'HIDDEN', hiddenBy: 'ADMIN', thumbnailUrl: null }),
        ]),
      ),
    );
    await user.type(title, 'Új cím');
    await user.click(within(dialog()).getByRole('button', { name: 'Mentés' }));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('A mentés nem sikerült.');
    expect(alert).toHaveTextContent('Az elrejtett kép adatai nem módosíthatók.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // A lista frissül: a sor már a valós állapotot (moderátori levétel) mutatja az ablak mögött
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(2));
    expect(await screen.findByText('Moderátor eltávolította')).toBeInTheDocument();
    // A megnyitó gomb (Szerkesztés) eltűnt: a Mégse után a fókusz az oldal címére kerül
    await user.click(within(dialog()).getByRole('button', { name: 'Mégse' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Vezérlőpult' })).toHaveFocus();
  });

  it('a nyitott párbeszédablakkal sincs akadálymentességi hiba (axe)', async () => {
    const { user, container } = renderDashboard({
      extra: [forPath('/api/categories', categoriesResponse())],
    });
    await openEdit(user);
    await within(dialog()).findByRole('option', { name: 'Tájkép' });

    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});

describe('DashboardPage – levétel', () => {
  it('a Levétel megerősítést kér a következménnyel (a fókusz a Mégse gombon); Levétel után DELETE, a sor Elrejtve lesz, a fókusz a kép címére kerül, bemondás', async () => {
    const { user } = renderDashboard();
    await user.click(await screen.findByRole('button', { name: `Levétel: ${TITLE}` }));

    const confirm = dialog();
    expect(confirm).toHaveAccessibleName('Leveszed a képet a galériából?');
    expect(confirm).toHaveAccessibleDescription(
      /„Őszi erdő ködben” nem lesz nyilvános, és ezt később nem tudod visszavonni/,
    );
    expect(within(confirm).getByRole('button', { name: 'Mégse' })).toHaveFocus();

    const fetchMock = stubFetch(
      forPath(DETAIL_PATH, new Response(null, { status: 204 })),
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ status: 'HIDDEN', hiddenBy: 'OWNER', thumbnailUrl: null }),
        ]),
      ),
    );
    await user.click(within(confirm).getByRole('button', { name: 'Levétel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(DETAIL_PATH);
    expect(init?.method).toBe('DELETE');
    const row = rowOf(TITLE);
    expect(within(row).getByText('Elrejtve')).toBeInTheDocument();
    expect(within(row).getByText('Te vetted le a galériából.')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).toBeNull();
    expect(within(row).getByRole('link', { name: TITLE })).toHaveFocus();
    expect(status()).toHaveTextContent('„Őszi erdő ködben” lekerült a galériából.');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(2));
  });

  it('amíg a levétel kérése fut, az ablak nem zárható (a Mégse foglalt, az Escape hatástalan) – a kép nem kerülhet le úgy, hogy a felhasználó meggondolta magát', async () => {
    const { user } = renderDashboard();
    await user.click(await screen.findByRole('button', { name: `Levétel: ${TITLE}` }));
    const deleting = new DeferredResponse();
    stubFetch(
      forPath(DETAIL_PATH, deleting),
      forPath(
        OWN_PATH,
        ownPhotosResponse([
          ownPhotoListItem({ status: 'HIDDEN', hiddenBy: 'OWNER', thumbnailUrl: null }),
        ]),
      ),
    );

    await user.click(within(dialog()).getByRole('button', { name: 'Levétel' }));

    const cancel = within(dialog()).getByRole('button', { name: 'Mégse' });
    expect(cancel).toHaveAttribute('aria-disabled', 'true');
    // A böngésző saját bezárási kérése (ismételt Escape) sem zárja be: closedby="none"
    expect(screen.getByRole('dialog')).toHaveAttribute('closedby', 'none');
    await user.click(cancel);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    deleting.resolve(new Response(null, { status: 204 }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Elrejtve')).toBeInTheDocument();
  });

  it('Mégse és Escape: nincs kérés, a fókusz a Levétel gombra tér vissza', async () => {
    const { user, fetchMock } = renderDashboard();
    const button = await screen.findByRole('button', { name: `Levétel: ${TITLE}` });

    await user.click(button);
    await user.click(within(dialog()).getByRole('button', { name: 'Mégse' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
    expect(requestedUrls(fetchMock)).toHaveLength(2);
  });

  it('ha a levétel nem sikerül (409 – a kép közben megváltozott), a hiba az ablakban marad, a fókusz a Levétel gombon; a lista frissül, hogy a sor a valós állapotot mutassa', async () => {
    const { user } = renderDashboard();
    await user.click(await screen.findByRole('button', { name: `Levétel: ${TITLE}` }));
    const fetchMock = stubFetch(
      forPath(DETAIL_PATH, errorResponse(409, 'CONFLICT', 'A kép állapota közben megváltozott')),
      forPath(OWN_PATH, ownPhotosResponse([ownPhotoListItem({ status: 'CHAIN_FAILED' })])),
    );

    const hide = within(dialog()).getByRole('button', { name: 'Levétel' });
    await user.click(hide);

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('A levétel nem sikerült.');
    expect(alert).toHaveTextContent('A kép állapota közben megváltozott.');
    expect(hide).toHaveFocus();
    expect(hide).not.toHaveAttribute('aria-disabled');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(2));
    expect(await screen.findByText('Sikertelen regisztráció')).toBeInTheDocument();
    // A megnyitó gomb (Levétel) a frissült sorból eltűnt: Escape után a fókusz nem veszhet el
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('heading', { level: 1, name: 'Vezérlőpult' })).toHaveFocus();
  });
});

describe('DashboardPage – Vásárlásaim', () => {
  it('a vásárlás sora: bélyegkép, cím, fotós · dátum · ár, Letöltés a védett címen, Értékelés írása az adatlapra; az értékelt képnél a saját értékelés', async () => {
    renderDashboard({
      path: '/dashboard?tab=vasarlasaim',
      orders: [
        order(),
        order({
          id: ORDER_ID.replace('5d4c', '6e5d'),
          photo: { ...order().photo, id: PENDING_ID, title: 'Erdei ösvény hajnalban' },
          review: { id: REVIEW_ID, rating: 4 },
          reviewable: false,
        }),
      ],
    });

    await screen.findByText('Összesen 2 vásárlás');
    const row = rowOf(TITLE);
    expect(within(row).getByRole('presentation')).toHaveAttribute(
      'src',
      `/media/thumbnails/${PHOTO_ID}.webp`,
    );
    expect(within(row).getByRole('link', { name: TITLE })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    // A fotós, a dátum és az ár rejtett címkével; a hivatkozás neve ugyanaz, mint az adatlapon
    expect(within(row).getByText(/Fotós Fanni/)).toHaveTextContent(
      'Fotós: Fotós Fanni · Fizetve: 2026. október 6. · Ár: 12 500 Ft',
    );
    expect(within(row).getByRole('link', { name: `Eredeti letöltése: ${TITLE}` })).toHaveAttribute(
      'href',
      `/api/photos/${PHOTO_ID}/download`,
    );
    // Az adatlap értékelő űrlapjához (L23)
    expect(within(row).getByRole('link', { name: `Értékelés írása: ${TITLE}` })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}#ertekeles`,
    );

    const reviewed = rowOf('Erdei ösvény hajnalban');
    // Láthatóan „4 / 5”, a képernyőolvasónak „4 csillag az 5-ből”
    expect(within(reviewed).getByText(/Értékelted:/)).toHaveTextContent('Értékelted: 4 / 5');
    expect(within(reviewed).getByText('4 csillag az 5-ből')).toHaveClass('sr-only');
    expect(within(reviewed).queryByRole('link', { name: /Értékelés írása/ })).toBeNull();
  });

  it('a moderátor által levett kép sora megmarad, de nem tölthető le és nem értékelhető', async () => {
    renderDashboard({
      path: '/dashboard?tab=vasarlasaim',
      orders: [
        order({
          downloadable: false,
          reviewable: false,
          photo: { ...order().photo, thumbnailUrl: null },
        }),
      ],
    });

    const row = (await screen.findByRole('link', { name: TITLE })).closest('li') as HTMLElement;
    // Rövid jelvény és külön megjegyzés (egy hosszú, nem törhető jelvény 320 px-en kilógna)
    expect(within(row).getByText('Moderátor eltávolította')).toBeInTheDocument();
    expect(within(row).getByText('Most nem tölthető le.')).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: /letöltése/ })).toBeNull();
    expect(within(row).queryByRole('link', { name: /Értékelés írása/ })).toBeNull();
    expect(within(row).getByText('Előnézet nem érhető el')).toBeInTheDocument();
  });

  it('ha a vásárlások betöltése nem sikerül, riasztás és újrapróbálás', async () => {
    stubFetch(
      forPath(OWN_PATH, ownPhotosResponse([])),
      forPath(PURCHASES_PATH, errorResponse(503, 'SERVER_UNAVAILABLE', 'A szerver nem érhető el')),
      forPath(PURCHASES_PATH, purchasesResponse([order()])),
    );
    const { user } = renderRoute('/dashboard?tab=vasarlasaim', undefined, { session: owner });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A vásárlások betöltése nem sikerült.',
    );
    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));

    expect(await screen.findByRole('link', { name: TITLE })).toBeInTheDocument();
  });
});
