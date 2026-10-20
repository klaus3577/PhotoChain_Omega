// A fejléc fiókrésze: kijelentkezve Belépés és Regisztráció; bejelentkezve monogramos fiókmenü
// (a drótváz „FN – fiókmenü” gombja, lenyíló panel – WAI-ARIA disclosure minta) a névvel, az
// e-mail-címmel és a kijelentkezéssel.
import { focusManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { authQueryKey } from '../../api/auth.api';
import { axeViolations } from '../../test/axe';
import { DeferredResponse, forPath, stubFetch } from '../../test/fetch';
import { focusAtFirstAnnouncement } from '../../test/liveRegion';
import { purchasesResponse } from '../../test/orders';
import {
  categoriesResponse,
  galleryResponse,
  galleryResponses,
  OWNER_ID,
  ownPhotosResponse,
} from '../../test/photos';
import { renderRoute } from '../../test/renderRoute';
import {
  errorResponse,
  profileResponse,
  profileUser,
  testUser,
  userResponse,
} from '../../test/users';
const noContent = () => new Response(null, { status: 204 });
const banner = () => screen.getByRole('banner');
const panelOf = (toggle: HTMLElement) =>
  document.getElementById(toggle.getAttribute('aria-controls')!)!;

afterEach(() => {
  focusManager.setFocused(undefined);
});

describe('a fejléc fiókrésze', () => {
  it('kijelentkezve Belépés és Regisztráció hivatkozás', async () => {
    stubFetch(...galleryResponses());
    renderRoute('/');

    expect(within(banner()).getByRole('link', { name: 'Belépés' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(within(banner()).getByRole('link', { name: 'Regisztráció' })).toHaveAttribute(
      'href',
      '/register',
    );
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('a Belépés hivatkozás megjegyzi az aktuális oldalt (belépés után oda tér vissza)', async () => {
    const { user, router } = renderRoute('/nincs-ilyen');
    await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });

    await user.click(within(banner()).getByRole('link', { name: 'Belépés' }));

    await screen.findByRole('heading', { level: 1, name: 'Belépés' });
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/nincs-ilyen' } });
  });

  it('a belépő oldalon a fejléc Regisztráció hivatkozása is megtartja, honnan jött a felhasználó', async () => {
    const { user, router } = renderRoute('/_vedett');
    await screen.findByRole('heading', { level: 1, name: 'Belépés' });

    await user.click(within(banner()).getByRole('link', { name: 'Regisztráció' }));

    await screen.findByRole('heading', { level: 1, name: 'Regisztráció' });
    expect(router.state.location.state).toMatchObject({
      from: { pathname: '/_vedett' },
      required: true,
    });
  });

  it('ha a munkamenet ellenőrzése nem sikerül (szerverhiba), a belépési lehetőség akkor is látszik', async () => {
    stubFetch(...galleryResponses(), errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'));
    renderRoute('/', undefined, { session: 'server' });

    expect(await within(banner()).findByRole('link', { name: 'Belépés' })).toBeInTheDocument();
    expect(within(banner()).getByRole('link', { name: 'Regisztráció' })).toBeInTheDocument();
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('bejelentkezve monogramos fiókmenü-gomb (a látható felirat a név elején), lenyitva név, e-mail, kijelentkezés', async () => {
    stubFetch(...galleryResponses());
    const { user } = renderRoute('/', undefined, { session: testUser });
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });

    expect(toggle).toHaveTextContent('KA');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panelOf(toggle)).not.toBeVisible();
    expect(within(banner()).queryByRole('link', { name: 'Belépés' })).toBeNull();
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = panelOf(toggle);
    expect(panel).toBeVisible();
    // A fehér panel a fehér oldal fölött: jól látható szegéllyel (4,74:1)
    expect(panel).toHaveClass('border-line-strong');
    expect(within(panel).getByText('Kiss Anna')).toBeInTheDocument();
    expect(within(panel).getByText('anna@pelda.hu')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Kijelentkezés' })).toBeInTheDocument();
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('bejelentkezve a fejlécben Feltöltés hivatkozás (/upload), a fiókmenüben is; vendégnek egyik sem (L21)', async () => {
    stubFetch(...galleryResponses());
    const guest = renderRoute('/');
    await screen.findByText('Még nincs hitelesített kép');
    expect(within(banner()).queryByRole('link', { name: 'Feltöltés' })).toBeNull();
    guest.unmount();

    stubFetch(...galleryResponses());
    const { user } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');

    expect(within(banner()).getByRole('link', { name: 'Feltöltés' })).toHaveAttribute(
      'href',
      '/upload',
    );
    await user.click(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));
    const panel = panelOf(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));
    expect(within(panel).getByRole('link', { name: 'Kép feltöltése' })).toHaveAttribute(
      'href',
      '/upload',
    );
  });

  it('bejelentkezve a fő navigációban Vezérlőpult (/dashboard), a fiókmenüben is; vendégnek nem (L22)', async () => {
    stubFetch(...galleryResponses());
    const guest = renderRoute('/');
    await screen.findByText('Még nincs hitelesített kép');
    const nav = () => screen.getByRole('navigation', { name: 'Fő navigáció' });
    expect(within(nav()).queryByRole('link', { name: 'Vezérlőpult' })).toBeNull();
    guest.unmount();

    stubFetch(...galleryResponses());
    const { user } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');

    const dashboard = within(nav()).getByRole('link', { name: 'Vezérlőpult' });
    expect(dashboard).toHaveAttribute('href', '/dashboard');
    expect(dashboard).not.toHaveAttribute('aria-current');
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });
    await user.click(toggle);
    expect(within(panelOf(toggle)).getByRole('link', { name: 'Vezérlőpult' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('a fiókmenü Vezérlőpult hivatkozása a vezérlőpult másik nézetéről (fül, oldal) az alapnézetre visz – csak az alapnézeten zárja be a panelt navigáció nélkül', async () => {
    stubFetch(
      forPath('/api/me/photos', ownPhotosResponse([])),
      forPath('/api/me/purchases', purchasesResponse([])),
    );
    const { user, router } = renderRoute('/dashboard?tab=vasarlasaim', undefined, {
      session: testUser,
    });
    await screen.findByText('Még nem vásároltál képet');
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });

    await user.click(toggle);
    await user.click(within(panelOf(toggle)).getByRole('link', { name: 'Vezérlőpult' }));

    expect(router.state.location.pathname).toBe('/dashboard');
    expect(router.state.location.search).toBe('');
    await screen.findByText('Még nincs feltöltött képed');
    await user.click(toggle);
    await user.click(within(panelOf(toggle)).getByRole('link', { name: 'Vezérlőpult' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();

    // Az alapnézet nem kanonikus címe (?tab=kepeim, ?page=1) is az alapnézet: nincs navigáció
    await act(() => router.navigate('/dashboard?tab=kepeim&page=1'));
    await user.click(toggle);
    await user.click(within(panelOf(toggle)).getByRole('link', { name: 'Vezérlőpult' }));
    expect(router.state.location.search).toBe('?tab=kepeim&page=1');
    expect(toggle).toHaveFocus();
  });

  it('a Feltöltés gomb keskeny képernyőn rejtett, a feltöltés oldalon az aktuális oldalt jelzi; a panel hivatkozása ugyanazon az oldalon bezárja a panelt, a fókusz a gombra kerül (L21)', async () => {
    stubFetch(forPath('/api/categories', categoriesResponse()));
    const { user } = renderRoute('/upload', undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'Kép feltöltése' });

    const upload = within(banner()).getByRole('link', { name: 'Feltöltés' });
    // Tailwind-variáns: a gomb saját inline-flex osztályát a sima „hidden” nem írná felül
    expect(upload).toHaveClass('max-sm:hidden');
    expect(upload).toHaveAttribute('aria-current', 'page');

    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });
    await user.click(toggle);
    await user.click(within(panelOf(toggle)).getByRole('link', { name: 'Kép feltöltése' }));

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1, name: 'Kép feltöltése' })).toBeInTheDocument();
  });

  it('Escape-re bezárul, és a fókusz visszakerül a gombra; kívülre kattintva is bezárul', async () => {
    stubFetch(...galleryResponses());
    const { user } = renderRoute('/', undefined, { session: testUser });
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });

    await user.click(toggle);
    await user.tab();
    expect(within(panelOf(toggle)).getByRole('link', { name: 'Profilom' })).toHaveFocus();
    await user.tab();
    expect(within(panelOf(toggle)).getByRole('link', { name: 'Vezérlőpult' })).toHaveFocus();
    await user.tab();
    expect(within(panelOf(toggle)).getByRole('link', { name: 'Kép feltöltése' })).toHaveFocus();
    await user.tab();
    expect(within(panelOf(toggle)).getByRole('button', { name: 'Kijelentkezés' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    await user.click(screen.getByRole('main'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('akkor is bezárul kívülre kattintva és Escape-re, ha a gomb kattintásra nem kapott fókuszt (Safari)', async () => {
    stubFetch(...galleryResponses());
    renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });

    fireEvent.click(toggle);
    expect(toggle).not.toHaveFocus();
    fireEvent.pointerDown(panelOf(toggle));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(screen.getByRole('main'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('Escape-re bezárul, de ha a fókusz máshol van, nem veszi el; a más által már kezelt Escape-et figyelmen kívül hagyja', async () => {
    stubFetch(...galleryResponses());
    renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });
    const search = screen.getByRole('searchbox', { name: /Keresés/ });

    fireEvent.click(toggle);
    act(() => search.focus());
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(search).toHaveFocus();

    // Egy saját Escape-kezelésű elem (pl. párbeszédablak) már feldolgozta
    fireEvent.click(toggle);
    search.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('oldalváltáskor a nyitva hagyott menü bezárul (pl. a böngésző Vissza gombjára)', async () => {
    stubFetch(...galleryResponses());
    const { router } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });
    fireEvent.click(toggle);

    await act(() => router.navigate('/nincs-ilyen'));

    await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('ha a fejléc belépési hivatkozásán áll a fókusz, amikor a munkamenet megjelenik (másik lapon lépett be), a fókusz az oldal címére kerül', async () => {
    stubFetch(...galleryResponses());
    const { queryClient } = renderRoute('/');
    await screen.findByText('Még nincs hitelesített kép');
    act(() => within(banner()).getByRole('link', { name: 'Belépés' }).focus());

    act(() => {
      queryClient.setQueryData(authQueryKey, testUser);
    });

    const heading = screen.getByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(heading).toHaveFocus());
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('kijelentkezés: a szerver törli a munkamenetet, a kezdőlapra visz, a fókusz az oldal címére kerül, és bejelenti', async () => {
    const fetchMock = stubFetch(noContent(), ...galleryResponses());
    const { user, router } = renderRoute('/_vedett', undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'Védett oldal' });

    await user.click(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));
    await user.click(screen.getByRole('button', { name: 'Kijelentkezés' }));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(router.state.location.pathname).toBe('/');
    // A kezdőlap a védett oldal helyére lép az előzményekben (a Vissza nem oda visz)
    expect(router.state.historyAction).toBe('REPLACE');
    expect(within(banner()).getByRole('link', { name: 'Belépés' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Kijelentkeztél.');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/logout');
    expect(fetchMock.mock.calls[0]![1]!.method).toBe('POST');
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('a kezdőlapon (útvonalváltás nélkül) is előbb az oldal címére kerül a fókusz, és csak utána hangzik el a bejelentés; a nyilvános galéria nem töltődik újra', async () => {
    const fetchMock = stubFetch(...galleryResponses(), noContent());
    const { user } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    const focusWhenAnnounced = focusAtFirstAnnouncement();

    await user.click(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));
    await user.click(screen.getByRole('button', { name: 'Kijelentkezés' }));

    const heading = screen.getByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(within(banner()).getByRole('link', { name: 'Belépés' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Kijelentkeztél.'));
    expect(focusWhenAnnounced()).toBe(heading);
    // A galéria (képek, kategóriák) mindenkinek ugyanaz: a felhasználóváltás nem kéri le újra
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.slice(urls.indexOf('/api/auth/logout'))).toEqual(['/api/auth/logout']);
    expect(screen.getByText('Még nincs hitelesített kép')).toBeInTheDocument();
  });

  it('a kijelentkezés előtt elindult munkamenet-ellenőrzés késve érkező válasza nem állítja vissza a munkamenetet', async () => {
    const recheck = new DeferredResponse();
    stubFetch(...galleryResponses(), recheck, noContent());
    const { user, queryClient } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    // A lap újra előtérbe kerül (a munkamenet adata már régebbi): újraellenőrzés indul
    act(() => {
      queryClient.setQueryData(authQueryKey, testUser, { updatedAt: Date.now() - 60_000 });
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(queryClient.isFetching({ queryKey: authQueryKey })).toBe(1));

    await user.click(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));
    await user.click(screen.getByRole('button', { name: 'Kijelentkezés' }));
    await within(banner()).findByRole('link', { name: 'Belépés' });
    recheck.resolve(userResponse(testUser));

    await waitFor(() => expect(queryClient.isFetching({ queryKey: authQueryKey })).toBe(0));
    expect(queryClient.getQueryData(authQueryKey)).toBeNull();
    expect(within(banner()).queryByRole('button', { name: 'KA – fiókmenü' })).toBeNull();
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('ha a munkamenet a háttérben szűnik meg, miközben a fókusz a fiókmenüben van, a fókusz az oldal címére kerül', async () => {
    stubFetch(...galleryResponses());
    const { user, queryClient } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    await user.click(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));

    act(() => {
      queryClient.setQueryData(authQueryKey, null);
    });

    const heading = screen.getByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(heading).toHaveFocus());
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('ha a kijelentkezés nem sikerül, miután a menüt bezárta, a menü újra kinyílik, és a fókusz a Kijelentkezés gombra kerül', async () => {
    const logoutResponse = new DeferredResponse();
    stubFetch(logoutResponse);
    const { user } = renderRoute('/_vedett', undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'Védett oldal' });
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Kijelentkezés' }));
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    logoutResponse.resolve(errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'));

    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    const panel = panelOf(toggle);
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Kijelentkezés' })).toHaveFocus(),
    );
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'A kijelentkezés nem sikerült. Váratlan szerverhiba.',
    );
  });

  it('ha a kijelentkezés nem sikerül, miközben a fókuszt máshová vitte, a menü kinyílik, de a fókuszt nem veszi el; a gomb leírása a hiba', async () => {
    const logoutResponse = new DeferredResponse();
    stubFetch(...galleryResponses(), logoutResponse);
    const { user } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    const toggle = within(banner()).getByRole('button', { name: 'KA – fiókmenü' });
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Kijelentkezés' }));
    await user.keyboard('{Escape}');
    const search = screen.getByRole('searchbox', { name: /Keresés/ });
    act(() => search.focus());

    logoutResponse.resolve(errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'));

    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    expect(search).toHaveFocus();
    expect(
      within(panelOf(toggle)).getByRole('button', { name: 'Kijelentkezés' }),
    ).toHaveAccessibleDescription('A kijelentkezés nem sikerült. Váratlan szerverhiba.');
  });

  it('ha a kijelentkezés sikerül, miközben a fókuszt máshová vitte, ott hagyja, és bejelenti', async () => {
    const logoutResponse = new DeferredResponse();
    stubFetch(...galleryResponses(), logoutResponse);
    const { user } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    await user.click(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));
    await user.click(screen.getByRole('button', { name: 'Kijelentkezés' }));
    await user.keyboard('{Escape}');
    const search = screen.getByRole('searchbox', { name: /Keresés/ });
    act(() => search.focus());

    logoutResponse.resolve(noContent());

    await within(banner()).findByRole('link', { name: 'Belépés' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Kijelentkeztél.'));
    expect(search).toHaveFocus();
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('ha a kijelentkezés nem sikerül, a menüben hibát mutat, és bejelentkezve marad', async () => {
    stubFetch(errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'));
    const { user, router } = renderRoute('/_vedett', undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'Védett oldal' });

    await user.click(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));
    await user.click(screen.getByRole('button', { name: 'Kijelentkezés' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A kijelentkezés nem sikerült. Váratlan szerverhiba.',
    );
    expect(router.state.location.pathname).toBe('/_vedett');
    expect(within(banner()).getByRole('button', { name: 'KA – fiókmenü' })).toBeInTheDocument();
  });

  it('a lenyitott menüvel sincs akadálymentességi hiba (axe)', async () => {
    stubFetch(...galleryResponses());
    const { user, container } = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');

    await user.click(within(banner()).getByRole('button', { name: 'KA – fiókmenü' }));

    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});

describe('a fiókmenü profil-hivatkozása (L23)', () => {
  it('bejelentkezve „Profilom” a saját profilra (/users/:id); a saját profilon az aktuális oldalt jelzi, és navigáció nélkül zárja a panelt, a fókusz a gombra kerül', async () => {
    stubFetch(
      forPath(`/api/users/${OWNER_ID}`, profileResponse()),
      forPath('/api/photos', galleryResponse([])),
    );
    const { user, router } = renderRoute(`/users/${OWNER_ID}`, undefined, {
      session: profileUser,
    });
    await screen.findByRole('heading', { level: 1, name: 'Fotós Fanni' });
    const toggle = within(banner()).getByRole('button', { name: 'FF – fiókmenü' });

    await user.click(toggle);

    const profileLink = within(panelOf(toggle)).getByRole('link', { name: 'Profilom' });
    expect(profileLink).toHaveAttribute('href', `/users/${OWNER_ID}`);
    expect(profileLink).toHaveAttribute('aria-current', 'page');
    // A fő navigációban nincs profil-hivatkozás (a fiókmenüé elég)
    expect(
      within(screen.getByRole('navigation', { name: 'Fő navigáció' })).queryByRole('link', {
        name: 'Profilom',
      }),
    ).toBeNull();
    await user.click(profileLink);

    expect(router.state.location.pathname).toBe(`/users/${OWNER_ID}`);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('másik oldalról a „Profilom” a profilra navigál (a panel az oldalváltással zárul)', async () => {
    stubFetch(
      ...galleryResponses(),
      forPath(`/api/users/${OWNER_ID}`, profileResponse()),
      forPath('/api/photos', galleryResponse([])),
    );
    const { user, router } = renderRoute('/', undefined, { session: profileUser });
    await screen.findByText('Még nincs hitelesített kép');
    const toggle = within(banner()).getByRole('button', { name: 'FF – fiókmenü' });
    await user.click(toggle);
    const profileLink = within(panelOf(toggle)).getByRole('link', { name: 'Profilom' });
    expect(profileLink).not.toHaveAttribute('aria-current');

    await user.click(profileLink);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fotós Fanni' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/users/${OWNER_ID}`);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
