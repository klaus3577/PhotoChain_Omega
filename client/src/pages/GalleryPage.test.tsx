// A galéria (kezdőlap, L20): keresés, kategória- és árszűrő, rendezés, lapozás – mind az URL-ben
// (megosztható, a vissza gomb is működik). A gépelés rövid késleltetéssel frissít (Enterre azonnal), egy
// gépelési sorozat egyetlen előzmény-bejegyzés; a frissült találatszámot az élő régió mondja be, lapozáskor
// pedig – az új oldal megérkezése után – a fókusz kerül a találatszámra. A képek és a kategóriák kérése
// útvonalhoz kötött választ kap (a sorrendjük nem számít).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { axeViolations } from '../test/axe';
import { DeferredResponse, forPath, requestedUrls, stubFetch } from '../test/fetch';
import {
  categoriesResponse,
  galleryResponse,
  galleryResponses,
  PHOTO_ID,
  photoListItem,
} from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse } from '../test/users';

const NBSP = String.fromCharCode(0xa0);
const SEARCH = 'Keresés cím, leírás vagy fotós alapján';

/** n darab kép különböző azonosítóval és címmel. */
const photos = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) =>
    photoListItem({
      id: `${PHOTO_ID.slice(0, -4)}${String(index + offset).padStart(4, '0')}`,
      title: `Kép ${index + offset + 1}`,
    }),
  );

/** A találatszám (az összegzés bekezdése – az élő régió bejelentése mellett). */
const summary = (text: string) => screen.getByText(text, { selector: 'p' });

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GalleryPage – betöltés', () => {
  it('a cím azonnal látszik; a képek kártyákon, a találatszámmal; a kérés 24-es oldalmérettel megy', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(2)));
    renderRoute('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Galéria' })).toBeInTheDocument();
    expect(screen.getByText('Képek betöltése…')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Kép 1' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID.slice(0, -4)}0000`,
    );
    expect(screen.getByRole('link', { name: 'Kép 2' })).toBeInTheDocument();
    expect(screen.getByText('2 találat')).toBeInTheDocument();
    // A felsorolásjel nélküli lista is lista marad (a WebKit különben nem annak mondja)
    expect(screen.getByRole('link', { name: 'Kép 1' }).closest('ul')).toHaveAttribute(
      'role',
      'list',
    );
    expect(requestedUrls(fetchMock).sort()).toEqual(['/api/categories', '/api/photos?pageSize=24']);
    await waitFor(() => expect(document.title).toBe('Galéria · PhotoChain'));
  });

  it('az URL paraméterei a szerver kérésébe, a mezőkbe és a böngészőfül címébe kerülnek; az aktív szűrők címkéi látszanak', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1), { page: 2, total: 25 }));
    renderRoute('/?q=erd%C5%91&categoryId=1&minPrice=5000&maxPrice=20000&sort=price_asc&page=2');

    await screen.findByRole('link', { name: 'Kép 1' });
    expect(requestedUrls(fetchMock)).toContain(
      '/api/photos?q=erd%C5%91&categoryId=1&minPrice=5000&maxPrice=20000&sort=price_asc&page=2&pageSize=24',
    );
    expect(screen.getByRole('searchbox', { name: SEARCH })).toHaveValue('erdő');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Kategória' })).toHaveValue('1'),
    );
    expect(screen.getByRole('textbox', { name: 'Legalacsonyabb ár' })).toHaveValue('5000');
    expect(screen.getByRole('textbox', { name: 'Legmagasabb ár' })).toHaveValue('20000');
    expect(screen.getByRole('combobox', { name: 'Rendezés' })).toHaveValue('price_asc');
    expect(screen.getByRole('button', { name: 'Tájkép – szűrő törlése' })).toBeInTheDocument();
    // A címke a magyar számformát követi (a négyjegyű szám tagolatlan), nem törő szóközökkel – a név
    // kiszámításakor ez is szóköznek számít
    const price = screen.getByRole('button', { name: /^5000 – 20\s000\sFt – szűrő törlése$/ });
    expect(price.textContent).toBe(`5000 – 20${NBSP}000${NBSP}Ft`);
    expect(screen.getByText('25 találat, 2. oldal')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Galéria – „erdő” – 2. oldal · PhotoChain'));
  });

  it('hibánál hibaüzenet és újrapróbálás: közben a gomb a helyén marad (foglalt, a fókusz rajta), siker után a fókusz a találatszámra kerül', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      forPath('/api/photos', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath('/api/categories', categoriesResponse()),
      forPath('/api/photos', retry),
    );
    const { user } = renderRoute('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A képek betöltése nem sikerült. Váratlan szerverhiba.',
    );
    const button = screen.getByRole('button', { name: 'Újrapróbálás' });
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
    // Az újrapróbálás a képernyőolvasónak is hallható (a gomb csak foglalt lesz)
    expect(screen.getByRole('status')).toHaveTextContent('Képek betöltése…');
    retry.resolve(galleryResponse(photos(1)));

    expect(await screen.findByRole('link', { name: 'Kép 1' })).toBeInTheDocument();
    await waitFor(() => expect(summary('1 találat')).toHaveFocus());
  });

  it('ha újrapróbálás közben máshová vitte a fókuszt, ott hagyja, és a sikert bejelenti', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      forPath('/api/photos', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath('/api/categories', categoriesResponse()),
      forPath('/api/photos', retry),
    );
    const { user } = renderRoute('/');
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));
    const search = screen.getByRole('searchbox', { name: SEARCH });
    act(() => search.focus());

    retry.resolve(galleryResponse(photos(1)));

    expect(await screen.findByRole('link', { name: 'Kép 1' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 találat'));
    expect(search).toHaveFocus();
  });

  it('ha az újrapróbálás is sikertelen, a hibaüzenet újra megjelenik, a fókusz a gombon marad', async () => {
    stubFetch(
      forPath('/api/photos', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath('/api/categories', categoriesResponse()),
      forPath('/api/photos', errorResponse(503, 'SERVICE_UNAVAILABLE', 'A szolgáltatás szünetel')),
    );
    const { user } = renderRoute('/');
    await screen.findByRole('alert');
    const button = screen.getByRole('button', { name: 'Újrapróbálás' });

    await user.click(button);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('A szolgáltatás szünetel'),
    );
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('ugyanaz a hiba ismétlődve is újra elhangzik (a riasztás új elem lesz)', async () => {
    stubFetch(
      forPath('/api/photos', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath('/api/categories', categoriesResponse()),
      forPath('/api/photos', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
    );
    const { user } = renderRoute('/');
    const first = await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));

    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first));
    expect(screen.getByRole('alert')).toHaveTextContent('Váratlan szerverhiba');
  });

  it('ha a szűrés utáni lekérés hibás, az újrapróbálás közben is a gomb marad (a régi találatok nem térnek vissza alá)', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      ...galleryResponses(photos(2)),
      forPath('/api/photos', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath('/api/photos', retry),
    );
    const { user } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rendezés' }), 'Legrégebbi elöl');
    expect(await screen.findByRole('alert')).toHaveTextContent('A képek betöltése nem sikerült.');
    const button = screen.getByRole('button', { name: 'Újrapróbálás' });

    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toHaveFocus();
    expect(document.querySelector('ul[aria-busy]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Kép 1' })).toBeNull();
    retry.resolve(galleryResponse(photos(1, 10)));
    expect(await screen.findByRole('link', { name: 'Kép 11' })).toBeInTheDocument();
    await waitFor(() => expect(summary('1 találat')).toHaveFocus());
  });
});

describe('GalleryPage – keresés és szűrők', () => {
  it('gépelés után rövid késleltetéssel frissül az URL és a lista; a fókusz a mezőben marad, a találatszámot bejelenti', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(3)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const search = screen.getByRole('searchbox', { name: SEARCH });

    await user.type(search, 'tó');

    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3'));
    // A gépelési sorozat első alkalmazása új bejegyzés: a vissza gomb a keresés előtti nézetre visz
    expect(router.state.historyAction).toBe('PUSH');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 találat'));
    expect(requestedUrls(fetchMock).at(-1)).toBe('/api/photos?q=t%C3%B3&pageSize=24');
    expect(search).toHaveFocus();
  });

  it('a gépelés folytatása az előző bejegyzés helyére lép; a vissza gomb a keresés előttre visz, a mező is követi', async () => {
    stubFetch(
      ...galleryResponses(photos(3)),
      galleryResponse(photos(2)),
      galleryResponse(photos(1)),
    );
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const search = screen.getByRole('searchbox', { name: SEARCH });
    await user.type(search, 'tó');
    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3'));
    await waitFor(() => expect(summary('2 találat')).toBeInTheDocument());

    await user.type(search, 'csa');

    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3csa'));
    expect(router.state.historyAction).toBe('REPLACE');
    await waitFor(() => expect(summary('1 találat')).toBeInTheDocument());
    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('');
    await waitFor(() => expect(search).toHaveValue(''));
    expect(summary('3 találat')).toBeInTheDocument();
  });

  it('ha egy másik vezérlő után visszatér a mezőbe, az új szerkesztési sorozat: új előzmény-bejegyzés', async () => {
    stubFetch(
      ...galleryResponses(photos(3)),
      galleryResponse(photos(2)),
      galleryResponse(photos(1)),
    );
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const search = screen.getByRole('searchbox', { name: SEARCH });
    await user.type(search, 'tó');
    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3'));
    await waitFor(() => expect(summary('2 találat')).toBeInTheDocument());

    await user.click(screen.getByRole('combobox', { name: 'Rendezés' }));
    await user.type(search, 'csa');

    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3csa'));
    expect(router.state.historyAction).toBe('PUSH');
    await waitFor(() => expect(summary('1 találat')).toBeInTheDocument());
  });

  it('az Enter lezárja a sorozatot: az utána gépelt szöveg új előzmény-bejegyzés', async () => {
    stubFetch(
      ...galleryResponses(photos(3)),
      galleryResponse(photos(2)),
      galleryResponse(photos(1)),
    );
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const search = screen.getByRole('searchbox', { name: SEARCH });
    await user.type(search, 'tó{Enter}');
    expect(router.state.historyAction).toBe('PUSH');
    await waitFor(() => expect(summary('2 találat')).toBeInTheDocument());

    await user.type(search, 'csa');

    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3csa'));
    expect(router.state.historyAction).toBe('PUSH');
    await waitFor(() => expect(summary('1 találat')).toBeInTheDocument());
  });

  it('Enterrel azonnal keres; a késleltetett alkalmazás utána sem navigál újra', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(3)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.type(screen.getByRole('searchbox', { name: SEARCH }), 'tó{Enter}');

    expect(router.state.location.search).toBe('?q=t%C3%B3');
    expect(router.state.historyAction).toBe('PUSH');
    const { key } = router.state.location;
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
    await wait(500);
    expect(router.state.location.key).toBe(key);
  });

  it('a beillesztett szöveg vezérlőkaraktere (pl. tabulátor) szóköz lesz – a keresés nem vész el', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(3)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.click(screen.getByRole('searchbox', { name: SEARCH }));
    await user.paste('tócsa\ttükör');

    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3csa+t%C3%BCk%C3%B6r'));
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
  });

  it('a késleltetett alkalmazás közben gépelt betű nem vész el (a saját URL-frissítés nem írja felül a mezőt)', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(3)), galleryResponse(photos(1)));
    const { router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const search = screen.getByRole('searchbox', { name: SEARCH });
    // A router frissítése a teszt jelére fut le – így a betű pontosan az alkalmazás és az URL
    // megérkezése között érkezhet
    const navigate = router.navigate.bind(router);
    const release: Array<() => void> = [];
    vi.spyOn(router, 'navigate').mockImplementation(
      ((...args: Parameters<typeof navigate>) =>
        new Promise<void>((resolve) => {
          release.push(() => resolve(navigate(...args)));
        })) as typeof router.navigate,
    );

    fireEvent.change(search, { target: { value: 'tó' } });
    await waitFor(() => expect(release).toHaveLength(1));
    fireEvent.change(search, { target: { value: 'tóc' } });
    await act(async () => {
      release[0]!();
    });

    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3'));
    expect(search).toHaveValue('tóc');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
  });

  it('a vissza gomb után a gépelés új sorozat: új előzmény-bejegyzés (a keresés előtti nézet megmarad)', async () => {
    stubFetch(
      ...galleryResponses(photos(3)),
      galleryResponse(photos(2)),
      galleryResponse(photos(1)),
    );
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const search = screen.getByRole('searchbox', { name: SEARCH });
    await user.type(search, 'tó');
    await waitFor(() => expect(router.state.location.search).toBe('?q=t%C3%B3'));
    await waitFor(() => expect(summary('2 találat')).toBeInTheDocument());
    await act(() => router.navigate(-1));
    await waitFor(() => expect(search).toHaveValue(''));

    // A fókusz a mezőben maradt (nem volt új fókuszesemény), mégis új sorozat kezdődik
    await user.type(search, 'x');

    await waitFor(() => expect(router.state.location.search).toBe('?q=x'));
    expect(router.state.historyAction).toBe('PUSH');
    await waitFor(() => expect(summary('1 találat')).toBeInTheDocument());
  });

  it('a kategória választása az első oldalra visz, és új kérést indít', async () => {
    const fetchMock = stubFetch(
      ...galleryResponses(photos(1), { page: 2, total: 30 }),
      galleryResponse(photos(1)),
    );
    const { user, router } = renderRoute('/?page=2');
    await screen.findByRole('link', { name: 'Kép 1' });
    const category = screen.getByRole('combobox', { name: 'Kategória' });
    await waitFor(() => expect(within(category).getAllByRole('option')).toHaveLength(3));

    await user.selectOptions(category, 'Portré');

    expect(router.state.location.search).toBe('?categoryId=2');
    expect(router.state.historyAction).toBe('PUSH');
    await waitFor(() =>
      expect(requestedUrls(fetchMock).at(-1)).toBe('/api/photos?categoryId=2&pageSize=24'),
    );
  });

  it('a választóban egymás után választott értékek egyetlen előzmény-bejegyzés (pl. nyilakkal lépkedve)', async () => {
    stubFetch(
      ...galleryResponses(photos(1)),
      galleryResponse(photos(1)),
      galleryResponse(photos(1)),
    );
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const category = screen.getByRole('combobox', { name: 'Kategória' });
    await waitFor(() => expect(within(category).getAllByRole('option')).toHaveLength(3));

    await user.selectOptions(category, 'Portré');
    expect(router.state.historyAction).toBe('PUSH');
    await waitFor(() => expect(summary('1 találat')).toBeInTheDocument());
    await user.selectOptions(category, 'Tájkép');

    expect(router.state.location.search).toBe('?categoryId=1');
    expect(router.state.historyAction).toBe('REPLACE');
    await waitFor(() => expect(category).toHaveValue('1'));
    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('');
  });

  it('„Minden kategória” választásával a kategóriaszűrő megszűnik', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/?categoryId=1');
    await screen.findByRole('link', { name: 'Kép 1' });
    const category = screen.getByRole('combobox', { name: 'Kategória' });
    await waitFor(() => expect(category).toHaveValue('1'));

    await user.selectOptions(category, 'Minden kategória');

    expect(router.state.location.search).toBe('');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
  });

  it('ha a szűrés után nincs találat, azt is bejelenti', async () => {
    stubFetch(...galleryResponses(photos(1)), galleryResponse([]));
    const { user } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.type(screen.getByRole('searchbox', { name: SEARCH }), 'xyz{Enter}');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nincs találat'));
    expect(screen.getByText('0 találat')).toBeInTheDocument();
  });

  it('a rendezés választása új kérést indít; az alapértelmezett rendezés nem kerül az URL-be (a betöltött nézet a gyorsítótárból jön)', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const sort = screen.getByRole('combobox', { name: 'Rendezés' });

    await user.selectOptions(sort, 'Ár szerint csökkenő');
    expect(router.state.location.search).toBe('?sort=price_desc');
    await waitFor(() =>
      expect(requestedUrls(fetchMock).at(-1)).toBe('/api/photos?sort=price_desc&pageSize=24'),
    );
    await user.selectOptions(sort, 'Legújabb elöl');

    expect(router.state.location.search).toBe('');
    expect(requestedUrls(fetchMock)).toHaveLength(3);
  });

  it('fordított ár-tartománynál riasztásként bejelentett hibaüzenet, mindkét mező hibás, a szűrés nem változik', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)));
    const { user, router } = renderRoute('/?minPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });
    const min = screen.getByRole('textbox', { name: 'Legalacsonyabb ár' });
    const max = screen.getByRole('textbox', { name: 'Legmagasabb ár' });

    await user.type(max, '5000{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A legalacsonyabb ár nem lehet nagyobb a legmagasabbnál.',
    );
    expect(min).toHaveAttribute('aria-invalid', 'true');
    expect(max).toHaveAttribute('aria-invalid', 'true');
    expect(max).toHaveFocus();
    expect(router.state.location.search).toBe('?minPrice=9000');
    expect(requestedUrls(fetchMock)).toHaveLength(2);
  });

  it('gépelés közben a fordított tartomány még nem hiba (pl. 50 000 írása közben az 5); a mezők elhagyásakor viszont igen', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/?minPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });
    const max = screen.getByRole('textbox', { name: 'Legmagasabb ár' });

    await user.type(max, '5');
    await wait(500);
    expect(screen.queryByRole('alert')).toBeNull();
    await user.type(max, '0000');
    await waitFor(() => expect(router.state.location.search).toBe('?minPrice=9000&maxPrice=50000'));
    expect(screen.queryByRole('alert')).toBeNull();

    await user.clear(max);
    await user.type(max, '5');
    await user.click(screen.getByRole('combobox', { name: 'Rendezés' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A legalacsonyabb ár nem lehet nagyobb a legmagasabbnál.',
    );
    expect(router.state.location.search).toBe('?minPrice=9000&maxPrice=50000');
    expect(requestedUrls(fetchMock)).toHaveLength(3);
  });

  it('ha az URL kívülről változik (pl. a címke törlése), az árhiba is eltűnik, a mezők az URL-t követik', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/?minPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });
    await user.type(screen.getByRole('textbox', { name: 'Legmagasabb ár' }), '5{Enter}');
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /^legalább 9000\sFt – szűrő törlése$/ }));

    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Legalacsonyabb ár' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Legmagasabb ár' })).toHaveValue('');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
  });

  it('az ármezők között lépve még nem ellenőriz (csak a mezőcsoport elhagyásakor)', async () => {
    stubFetch(...galleryResponses(photos(1)));
    const { user } = renderRoute('/?minPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.type(screen.getByRole('textbox', { name: 'Legmagasabb ár' }), '5');
    await user.click(screen.getByRole('textbox', { name: 'Legalacsonyabb ár' }));
    await wait(500);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ha mindkét ármező hibás formátumú, közös üzenet, és mindkét mező jelölt', async () => {
    stubFetch(...galleryResponses(photos(1)));
    const { user } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const min = screen.getByRole('textbox', { name: 'Legalacsonyabb ár' });
    const max = screen.getByRole('textbox', { name: 'Legmagasabb ár' });

    await user.type(min, 'x');
    await user.type(max, 'y{Enter}');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Az ár egész forintösszeg legyen (pl. 5 000).',
      ),
    );
    expect(min).toHaveAttribute('aria-invalid', 'true');
    expect(max).toHaveAttribute('aria-invalid', 'true');
  });

  it('az ármezők elhagyása nem alkalmazza az árat – az oldal nem rendeződik át, a következő kattintás nem vész el', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/?minPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.type(screen.getByRole('textbox', { name: 'Legmagasabb ár' }), '50000');
    await user.tab();

    expect(router.state.location.search).toBe('?minPrice=9000');
    // Az alkalmazás a gépelés késleltetése után jön (mint a mezőben maradva)
    await waitFor(() => expect(router.state.location.search).toBe('?minPrice=9000&maxPrice=50000'));
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
  });

  it('ha a hiba a bezárt (mobil) szűrőpanelen van, Enterre a panel kinyílik – a hiba nem marad rejtve', async () => {
    stubFetch(...galleryResponses(photos(1)));
    const { user } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const toggle = screen.getByRole('button', { name: 'Szűrők' });
    await user.click(toggle);
    await user.type(screen.getByRole('textbox', { name: 'Legalacsonyabb ár' }), '5,5');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.type(screen.getByRole('searchbox', { name: SEARCH }), '{Enter}');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A legalacsonyabb ár egész forintösszeg legyen (pl. 5 000).',
    );
  });

  it('az ár hibája gépelés közben egyszer hangzik el (ugyanaz a hiba nem ismétlődik); más hiba vagy Enter újra', async () => {
    stubFetch(...galleryResponses(photos(1)));
    const { user } = renderRoute('/?minPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });
    const max = screen.getByRole('textbox', { name: 'Legmagasabb ár' });

    await user.type(max, '5,5');
    const first = await screen.findByRole('alert');
    expect(first).toHaveTextContent('A legmagasabb ár egész forintösszeg legyen (pl. 5 000).');
    await user.type(max, '5');
    await wait(500);
    expect(screen.getByRole('alert')).toBe(first);

    await user.clear(max);
    await user.type(max, '5000');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('A legalacsonyabb ár nem lehet nagyobb'),
    );
    const second = screen.getByRole('alert');
    expect(second).not.toBe(first);
    await user.type(max, '{Enter}');

    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(second));
  });

  it('a nem egész összeget elutasítja (pl. tizedesvessző): csak a hibás mező jelölt; az ármezőknek látható címkéjük van', async () => {
    stubFetch(...galleryResponses(photos(1)));
    const { user, router, container } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    const min = screen.getByRole('textbox', { name: 'Legalacsonyabb ár' });
    const max = screen.getByRole('textbox', { name: 'Legmagasabb ár' });

    await user.type(min, '5,5{Enter}');

    // Az üzenet megnevezi a hibás mezőt (nem csak a keret színe mutatja)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A legalacsonyabb ár egész forintösszeg legyen (pl. 5 000).',
    );
    expect(min).toHaveAttribute('aria-invalid', 'true');
    expect(min).toHaveAccessibleDescription(
      'A legalacsonyabb ár egész forintösszeg legyen (pl. 5 000).',
    );
    expect(max).not.toHaveAttribute('aria-invalid');
    expect(max).not.toHaveAttribute('aria-describedby');
    expect(router.state.location.search).toBe('');
    // A név látható címkéből jön (a hangvezérlés a látott szöveggel éri el a mezőt)
    expect(screen.getByText('Legalacsonyabb ár', { selector: 'label' })).toBeInTheDocument();
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('a címke törlése után a fókusz a sor következő gombjára kerül, a sor eltűnésekor a találatszámra – a keresőmezőre nem (mobilon az a billentyűzetet nyitná fel)', async () => {
    const fetchMock = stubFetch(
      ...galleryResponses(photos(1)),
      galleryResponse(photos(1)),
      galleryResponse(photos(1)),
    );
    const { user, router } = renderRoute('/?categoryId=1&maxPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.click(await screen.findByRole('button', { name: 'Tájkép – szűrő törlése' }));

    expect(router.state.location.search).toBe('?maxPrice=9000');
    const price = screen.getByRole('button', { name: /^legfeljebb 9000\sFt – szűrő törlése$/ });
    await waitFor(() => expect(price).toHaveFocus());
    await user.click(price);

    expect(router.state.location.search).toBe('');
    await waitFor(() => expect(summary('1 találat')).toHaveFocus());
    expect(requestedUrls(fetchMock)).toHaveLength(4);
  });

  it('az ár-tartomány címkéjének törlése után (ha előtte kategóriacímke is van) a fókusz a sor következő gombjára, a törlés gombra kerül', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/?categoryId=1&maxPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.click(screen.getByRole('button', { name: /^legfeljebb 9000\sFt – szűrő törlése$/ }));

    expect(router.state.location.search).toBe('?categoryId=1');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Szűrők törlése' })).toHaveFocus(),
    );
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
  });

  it('ha a keresőszó megmarad, a címke törlése után a fókusz a „Keresés törlése” gombra kerül', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user } = renderRoute('/?q=t%C3%B3&categoryId=1');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.click(await screen.findByRole('button', { name: 'Tájkép – szűrő törlése' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Keresés törlése' })).toHaveFocus(),
    );
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
  });

  it('a „Keresés és szűrők törlése” mindent töröl (a rendezést nem); a félbehagyott gépelés és a hibaüzenet sem marad, a fókusz a találatszámra kerül', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(2)));
    const { user, router } = renderRoute('/?q=t%C3%B3&categoryId=1&sort=oldest');
    await screen.findByRole('link', { name: 'Kép 1' });
    // Mobilon kinyitott szűrőpanel: a törlés után is nyitva marad
    const toggle = screen.getByRole('button', { name: 'Szűrők, 1 aktív szűrő' });
    await user.click(toggle);
    await user.type(screen.getByRole('textbox', { name: 'Legalacsonyabb ár' }), 'abc{Enter}');
    await screen.findByRole('alert');
    // A keresőmezőben még alkalmazatlan (a késleltetésen belüli) gépelés
    await user.type(screen.getByRole('searchbox', { name: SEARCH }), 'csa');

    await user.click(screen.getByRole('button', { name: 'Keresés és szűrők törlése' }));

    expect(router.state.location.search).toBe('?sort=oldest');
    await waitFor(() => expect(summary('2 találat')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Szűrők' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('searchbox', { name: SEARCH })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Legalacsonyabb ár' })).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
    await wait(500);
    expect(router.state.location.search).toBe('?sort=oldest');
    expect(requestedUrls(fetchMock)).toHaveLength(3);
  });

  it('mobilon a szűrők a „Szűrők” gomb mögött vannak (a nevében az aktív szűrők száma); a rendezés mindig látszik', async () => {
    stubFetch(...galleryResponses(photos(1)));
    const { user } = renderRoute('/?categoryId=1&minPrice=100');
    await screen.findByRole('link', { name: 'Kép 1' });
    const toggle = screen.getByRole('button', { name: 'Szűrők, 2 aktív szűrő' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(panel).toContainElement(screen.getByRole('combobox', { name: 'Kategória' }));
    expect(panel).not.toContainElement(screen.getByRole('combobox', { name: 'Rendezés' }));
  });

  it('a keresőmező neve és látható helykitöltője ugyanaz (a hangvezérlés a látott szöveggel éri el)', async () => {
    stubFetch(...galleryResponses(photos(1)));
    renderRoute('/');

    const search = await screen.findByRole('searchbox', { name: SEARCH });
    expect(search).toHaveAttribute('placeholder', `${SEARCH}…`);
    // A szerver legfeljebb 100 karakteres keresőszót fogad: hosszabbat nem lehet beírni (nem vágódik le csendben)
    expect(search).toHaveAttribute('maxlength', '100');
    await screen.findByRole('link', { name: 'Kép 1' });
  });

  it('a „Szűrők törlése” a még alkalmazatlan gépelést is eldobja (akkor is, ha az URL-ben nincs keresőszó)', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/?categoryId=1');
    await screen.findByRole('link', { name: 'Kép 1' });
    await user.type(screen.getByRole('searchbox', { name: SEARCH }), 'csa');

    await user.click(screen.getByRole('button', { name: 'Szűrők törlése' }));

    expect(router.state.location.search).toBe('');
    await wait(600);
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: SEARCH })).toHaveValue('');
    expect(requestedUrls(fetchMock)).toHaveLength(3);
  });

  it('ismeretlen kategóriánál (pl. régi hivatkozás) a választó és a címke is ezt mutatja, nem a „Minden kategória”-t', async () => {
    stubFetch(...galleryResponses([]));
    renderRoute('/?categoryId=99');

    expect(await screen.findByText('Nincs találat')).toBeInTheDocument();
    const category = screen.getByRole('combobox', { name: 'Kategória' });
    await waitFor(() => expect(within(category).getAllByRole('option')).toHaveLength(4));
    expect(category).toHaveValue('99');
    expect(within(category).getByRole('option', { selected: true })).toHaveTextContent(
      'Ismeretlen kategória',
    );
    expect(
      screen.getByRole('button', { name: 'Ismeretlen kategória – szűrő törlése' }),
    ).toBeInTheDocument();
  });

  it('ha a kategóriák nem tölthetők be, a választó leírása ezt mondja, és újratölthetők (a képek ettől látszanak; újratöltés közben a gomb hatástalan)', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      forPath('/api/photos', galleryResponse(photos(1))),
      forPath('/api/categories', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath('/api/categories', retry),
    );
    const { user } = renderRoute('/');
    const category = await screen.findByRole('combobox', { name: 'Kategória' });

    await waitFor(() =>
      expect(category).toHaveAccessibleDescription('A kategóriák most nem tölthetők be.'),
    );
    expect(await screen.findByRole('link', { name: 'Kép 1' })).toBeInTheDocument();
    const reload = screen.getByRole('button', { name: 'Kategóriák újratöltése' });
    await user.click(reload);
    await waitFor(() => expect(reload).toHaveAttribute('aria-disabled', 'true'));
    await user.click(reload);
    retry.resolve(categoriesResponse());

    await waitFor(() => expect(within(category).getAllByRole('option')).toHaveLength(3));
    expect(category).not.toHaveAccessibleDescription();
    // Az eltűnt gomb helyett a választóra kerül a fókusz
    expect(category).toHaveFocus();
  });

  it('ha a kategóriák újratöltése sem sikerül, ezt bejelenti (a hiba szövege nem változik)', async () => {
    stubFetch(
      forPath('/api/photos', galleryResponse(photos(1))),
      forPath('/api/categories', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath(
        '/api/categories',
        errorResponse(503, 'SERVICE_UNAVAILABLE', 'A szolgáltatás szünetel'),
      ),
    );
    const { user } = renderRoute('/');
    const reload = await screen.findByRole('button', { name: 'Kategóriák újratöltése' });

    await user.click(reload);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'A kategóriák betöltése most sem sikerült.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Kategóriák újratöltése' })).toHaveFocus();
  });
});

describe('GalleryPage – üres találat és lapozás', () => {
  it('szűrt üres találatnál „Nincs találat” és a törlés gomb; a teljes lista érkezéséig nem villan fel a „Még nincs hitelesített kép”', async () => {
    const unfiltered = new DeferredResponse();
    stubFetch(...galleryResponses([]), unfiltered);
    const { user, router, container } = renderRoute('/?q=xyz');

    expect(await screen.findByText('Nincs találat')).toBeInTheDocument();
    expect(await axeViolations(container, { page: true })).toEqual([]);
    await user.click(screen.getAllByRole('button', { name: 'Keresés törlése' }).at(-1)!);

    expect(router.state.location.search).toBe('');
    await waitFor(() => expect(screen.getByText('Találatok frissítése…')).toHaveFocus());
    expect(screen.queryByText('Még nincs hitelesített kép')).toBeNull();
    unfiltered.resolve(galleryResponse(photos(1)));
    expect(await screen.findByRole('link', { name: 'Kép 1' })).toBeInTheDocument();
    expect(summary('1 találat')).toHaveFocus();
  });

  it('az ár-tartomány címkéje törli mindkét határt; a mezők is kiürülnek', async () => {
    const fetchMock = stubFetch(...galleryResponses(photos(1)), galleryResponse(photos(1)));
    const { user, router } = renderRoute('/?minPrice=100&maxPrice=9000');
    await screen.findByRole('link', { name: 'Kép 1' });

    await user.click(screen.getByRole('button', { name: /^100 – 9000\sFt – szűrő törlése$/ }));

    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('textbox', { name: 'Legalacsonyabb ár' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Legmagasabb ár' })).toHaveValue('');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));
  });

  it('a túl nagy oldalszámnál (üres oldal, de van találat) az első oldalra, az „Előző” az utolsó létező oldalra visz', async () => {
    stubFetch(...galleryResponses([], { page: 5, total: 30 }));
    renderRoute('/?q=t%C3%B3&page=5');

    expect(await screen.findByText('Ezen az oldalon nincs kép')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vissza az első oldalra' })).toHaveAttribute(
      'href',
      '/?q=t%C3%B3',
    );
    const nav = screen.getByRole('navigation', { name: 'Lapozás' });
    expect(within(nav).getByRole('link', { name: 'Előző oldal' })).toHaveAttribute(
      'href',
      '/?q=t%C3%B3&page=2',
    );
  });

  it('szűrő nélküli üres galériánál más üzenet, törlés gomb nélkül', async () => {
    stubFetch(...galleryResponses([]));
    renderRoute('/');

    expect(await screen.findByText('Még nincs hitelesített kép')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /törlése$/ })).toBeNull();
  });

  it('lapozáskor a régi kártyák foglaltként látszanak; az új oldal megérkezése után a fókusz a találatszámra kerül, külön bejelentés nélkül', async () => {
    const pageTwo = new DeferredResponse();
    const fetchMock = stubFetch(...galleryResponses(photos(24), { total: 30 }), pageTwo);
    const { user } = renderRoute('/?q=t%C3%B3');
    await screen.findByRole('link', { name: 'Kép 1' });
    const nav = screen.getByRole('navigation', { name: 'Lapozás' });
    const second = within(nav).getByRole('link', { name: '2. oldal' });
    expect(second).toHaveAttribute('href', '/?q=t%C3%B3&page=2');

    await user.click(second);

    expect(screen.getByRole('link', { name: 'Kép 1' }).closest('ul')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByText('Találatok frissítése…')).toBeInTheDocument();
    expect(second).toHaveFocus();
    pageTwo.resolve(galleryResponse(photos(6, 24), { page: 2, total: 30 }));

    expect(await screen.findByRole('link', { name: 'Kép 25' })).toBeInTheDocument();
    await waitFor(() => expect(summary('30 találat, 2. oldal')).toHaveFocus());
    expect(requestedUrls(fetchMock).at(-1)).toBe('/api/photos?q=t%C3%B3&page=2&pageSize=24');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('ha az új oldal érkezése előtt máshová vitte a fókuszt, ott hagyja, és a találatszámot bejelenti', async () => {
    const pageTwo = new DeferredResponse();
    stubFetch(...galleryResponses(photos(24), { total: 30 }), pageTwo);
    const { user } = renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });
    await user.click(screen.getByRole('link', { name: '2. oldal' }));
    const search = screen.getByRole('searchbox', { name: SEARCH });
    act(() => search.focus());

    pageTwo.resolve(galleryResponse(photos(6, 24), { page: 2, total: 30 }));

    expect(await screen.findByRole('link', { name: 'Kép 25' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('30 találat, 2. oldal'),
    );
    expect(search).toHaveFocus();
  });

  it('a lapozó legfeljebb az 1000. oldalig visz (a nagyobb oldalszámot a szerver elutasítja)', async () => {
    stubFetch(...galleryResponses(photos(24), { total: 30_000 }));
    renderRoute('/');
    await screen.findByRole('link', { name: 'Kép 1' });

    const nav = screen.getByRole('navigation', { name: 'Lapozás' });
    expect(within(nav).getByRole('link', { name: '1000. oldal' })).toHaveAttribute(
      'href',
      '/?page=1000',
    );
    expect(within(nav).queryByRole('link', { name: '1250. oldal' })).toBeNull();
  });

  it('nincs akadálymentességi hiba (oldalszinten)', async () => {
    stubFetch(...galleryResponses(photos(24), { total: 30 }));
    const { container } = renderRoute('/?categoryId=1');
    await screen.findByRole('link', { name: 'Kép 1' });
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Kategória' })).toHaveValue('1'),
    );

    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});
