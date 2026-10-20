// A fotós publikus profilja (L23 – terv 5.2 „/users/:id”): név, csatlakozás, bemutatkozás, átlagos
// értékelés, a hitelesített képek száma és rácsa lapozással; a nem létező felhasználó saját oldalt
// kap. A saját profil szerkeszthető (párbeszédablak, PATCH /api/me): a név a fejlécben is frissül.
// A profil és a képek kérése útvonalhoz kötött választ kap (a sorrendjük nem számít).
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axeViolations } from '../test/axe';
import { DeferredResponse, forPath, requestedUrls, stubFetch } from '../test/fetch';
import { galleryResponse, OWNER_ID, PHOTO_ID, photoListItem } from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import {
  errorResponse,
  profile,
  profileResponse,
  profileUser,
  testUser,
  userResponse,
} from '../test/users';

const PATH = `/users/${OWNER_ID}`;
const USERS_PATH = `/api/users/${OWNER_ID}`;
const photosPath = (page: number) => `/api/photos?ownerId=${OWNER_ID}&page=${page}&pageSize=24`;

/** n darab kép különböző azonosítóval és címmel. */
const photos = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) =>
    photoListItem({
      id: `9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b${String(index + offset).padStart(4, '0')}`,
      title: `Kép ${index + offset + 1}`,
    }),
  );

describe('ProfilePage – publikus profil', () => {
  it('a fotós neve (h1), a csatlakozás ideje, a bemutatkozás soronként, az átlag és a darabszám, a képek száma és rácsa; a profil és a képek kérése; az oldal címe', async () => {
    const fetchMock = stubFetch(
      forPath(USERS_PATH, profileResponse()),
      forPath('/api/photos', galleryResponse([photoListItem()], { total: 3 })),
    );
    const { container } = renderRoute(PATH);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fotós Fanni' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Csatlakozott:/)).toHaveTextContent(
      'Csatlakozott: 2026. szeptember 20.',
    );
    const bio = screen.getByText(/Nyomtatott képeket is készítek/);
    expect(bio).toHaveClass('whitespace-pre-line');
    expect(bio).toHaveTextContent(
      'Tájképek és portrék, főleg Budapestről. Nyomtatott képeket is készítek.',
    );
    expect(screen.getByText(/az 5-ből/).closest('p')).toHaveTextContent(
      '4,6 az 5-ből · 12 értékelés',
    );
    expect(screen.getByText('3 hitelesített kép')).toBeInTheDocument();
    const photosSection = screen.getByRole('region', { name: 'Képek' });
    expect(await within(photosSection).findByText('Összesen 3 kép')).toBeInTheDocument();
    // A kártya címe a szakasz h2-je alá tartozik (h3)
    expect(
      within(photosSection).getByRole('heading', { level: 3, name: 'Őszi erdő ködben' }),
    ).toBeInTheDocument();
    // Keskeny képernyőn a név oszlopa az avatár alá törik, nem csuklik össze (WCAG 1.4.10)
    expect(screen.getByRole('heading', { level: 1 }).closest('div')).toHaveClass(
      'grow',
      'basis-64',
    );
    expect(within(photosSection).getByRole('link', { name: 'Őszi erdő ködben' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(screen.queryByRole('button', { name: 'Profil szerkesztése' })).toBeNull();
    expect(requestedUrls(fetchMock).sort()).toEqual([photosPath(1), USERS_PATH]);
    await waitFor(() => expect(document.title).toBe('Fotós Fanni · PhotoChain'));
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('átlag nélkül „Még nincs értékelés”, bemutatkozás nélkül a bekezdés elmarad, kép nélkül üres állapot (másnak javaslat nélkül)', async () => {
    stubFetch(
      forPath(
        USERS_PATH,
        profileResponse(profile({ bio: null, photoCount: 0, rating: { average: null, count: 0 } })),
      ),
      forPath('/api/photos', galleryResponse([])),
    );
    renderRoute(PATH);

    await screen.findByRole('heading', { level: 1, name: 'Fotós Fanni' });
    expect(screen.getByText('Még nincs értékelés.')).toBeInTheDocument();
    expect(screen.queryByText(/Tájképek/)).toBeNull();
    expect(screen.getByText('0 hitelesített kép')).toBeInTheDocument();
    expect(await screen.findByText('Még nincs hitelesített képe')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Kép feltöltése' })).toBeNull();
  });

  it('érvénytelen azonosítónál kérés nélkül, a szerver 404-ére kéréssel a „nem található” oldal', async () => {
    const fetchMock = stubFetch();
    const invalid = renderRoute('/users/nem-uuid');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A felhasználó nem található' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    invalid.unmount();

    stubFetch(
      forPath(USERS_PATH, errorResponse(404, 'NOT_FOUND', 'A felhasználó nem található')),
      forPath('/api/photos', galleryResponse([])),
    );
    renderRoute(PATH);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A felhasználó nem található' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vissza a galériába' })).toHaveAttribute('href', '/');
    await waitFor(() => expect(document.title).toBe('A felhasználó nem található · PhotoChain'));
  });

  it('más hibánál hibaüzenet és újrapróbálás; siker után a fókusz a névre kerül', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      forPath(USERS_PATH, errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath(USERS_PATH, retry),
      forPath('/api/photos', galleryResponse([])),
    );
    const { user } = renderRoute(PATH);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A profil betöltése nem sikerült. Váratlan szerverhiba.',
    );
    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));
    retry.resolve(profileResponse());

    const heading = await screen.findByRole('heading', { level: 1, name: 'Fotós Fanni' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('lapozás: a kért oldal kérése, az összesítés az oldallal, a lapozó hivatkozásai', async () => {
    const fetchMock = stubFetch(
      forPath(USERS_PATH, profileResponse(profile({ photoCount: 30 }))),
      forPath('/api/photos', galleryResponse(photos(6, 24), { page: 2, total: 30 })),
    );
    renderRoute(`${PATH}?page=2`);

    expect(await screen.findByText('Összesen 30 kép, 2. oldal')).toBeInTheDocument();
    expect(requestedUrls(fetchMock)).toContain(photosPath(2));
    const pagination = screen.getByRole('navigation', { name: 'Lapozás' });
    expect(within(pagination).getByRole('link', { name: 'Előző oldal' })).toHaveAttribute(
      'href',
      PATH,
    );
    expect(within(pagination).getByRole('link', { name: '2. oldal' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Kép 25' })).toBeInTheDocument();
  });

  it('ha a képek nem tölthetők be, a profil adatai látszanak, a hiba a képek szakaszában, újrapróbálással', async () => {
    const retry = new DeferredResponse();
    stubFetch(
      forPath(USERS_PATH, profileResponse()),
      forPath('/api/photos', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath('/api/photos', retry),
    );
    const { user } = renderRoute(PATH);

    await screen.findByRole('heading', { level: 1, name: 'Fotós Fanni' });
    const photosSection = screen.getByRole('region', { name: 'Képek' });
    expect(await within(photosSection).findByRole('alert')).toHaveTextContent(
      'A képek betöltése nem sikerült. Váratlan szerverhiba.',
    );
    await user.click(within(photosSection).getByRole('button', { name: 'Újrapróbálás' }));
    retry.resolve(galleryResponse([photoListItem()], { total: 1 }));

    expect(await within(photosSection).findByText('Összesen 1 kép')).toBeInTheDocument();
  });
});
describe('ProfilePage – saját profil', () => {
  it('a saját, kép nélküli profilon az üres állapot a feltöltésre hív', async () => {
    stubFetch(
      forPath(USERS_PATH, profileResponse(profile({ photoCount: 0 }))),
      forPath('/api/photos', galleryResponse([])),
    );
    renderRoute(PATH, undefined, { session: profileUser });

    expect(await screen.findByText('Még nincs hitelesített képed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kép feltöltése' })).toHaveAttribute('href', '/upload');
  });

  it('„Profil szerkesztése”: az ablak a meglévő adatokkal, a fókusz a néven; mentés PATCH /api/me; a név a címben és a fejlécben frissül, bemondás, a fókusz a gombra tér vissza', async () => {
    const saved = new DeferredResponse();
    const fetchMock = stubFetch(
      forPath(USERS_PATH, profileResponse()),
      forPath('/api/photos', galleryResponse([])),
      forPath('/api/me', saved),
      forPath(USERS_PATH, profileResponse(profile({ displayName: 'Kovács Fanni', bio: null }))),
    );
    const { user } = renderRoute(PATH, undefined, { session: profileUser });
    const edit = await screen.findByRole('button', { name: 'Profil szerkesztése' });

    await user.click(edit);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Profil szerkesztése');
    const name = within(dialog).getByRole('textbox', { name: 'Megjelenített név' });
    expect(name).toHaveValue('Fotós Fanni');
    expect(name).toHaveFocus();
    const bio = within(dialog).getByRole('textbox', { name: 'Bemutatkozás (nem kötelező)' });
    expect(bio).toHaveValue(profileUser.bio);
    expect(bio).toHaveAccessibleDescription(/Legfeljebb 500 karakter/);
    await user.clear(name);
    await user.type(name, 'Kovács Fanni');
    await user.clear(bio);
    await user.click(within(dialog).getByRole('button', { name: 'Mentés' }));

    expect(within(dialog).getByRole('button', { name: 'Mentés…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const [url, init] = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH')!;
    expect(String(url)).toBe('/api/me');
    expect(JSON.parse(String(init?.body))).toEqual({ displayName: 'Kovács Fanni', bio: null });
    saved.resolve(userResponse({ ...profileUser, displayName: 'Kovács Fanni', bio: null }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kovács Fanni' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tájképek és portrék/)).toBeNull();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'KF – fiókmenü' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('A profil mentve.');
    expect(edit).toHaveFocus();
    await waitFor(() => expect(document.title).toBe('Kovács Fanni · PhotoChain'));
  });

  it('üres névvel nem ment: a hiba a mezőnél, a fókusz rajta; a szerver hibája riasztás az ablakban, az ablak marad; a Mégse bezárja', async () => {
    const fetchMock = stubFetch(
      forPath(USERS_PATH, profileResponse()),
      forPath('/api/photos', galleryResponse([])),
      forPath('/api/me', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
    );
    const { user } = renderRoute(PATH, undefined, { session: profileUser });
    const edit = await screen.findByRole('button', { name: 'Profil szerkesztése' });
    await user.click(edit);
    const dialog = screen.getByRole('dialog');
    const name = within(dialog).getByRole('textbox', { name: 'Megjelenített név' });
    await user.clear(name);
    await user.click(within(dialog).getByRole('button', { name: 'Mentés' }));

    expect(name).toHaveAccessibleDescription('Add meg a megjelenített nevet.');
    expect(name).toHaveFocus();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);

    await user.type(name, 'Fanni');
    await user.click(within(dialog).getByRole('button', { name: 'Mentés' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A mentés nem sikerült. Váratlan szerverhiba.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Mégse' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(edit).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1, name: 'Fotós Fanni' })).toBeInTheDocument();
  });

  it('más felhasználó profilján bejelentkezve sincs szerkesztés', async () => {
    stubFetch(forPath(USERS_PATH, profileResponse()), forPath('/api/photos', galleryResponse([])));
    renderRoute(PATH, undefined, { session: testUser });

    await screen.findByRole('heading', { level: 1, name: 'Fotós Fanni' });
    expect(screen.queryByRole('button', { name: 'Profil szerkesztése' })).toBeNull();
  });
});

describe('ProfilePage – a mentés válasza másik fiók (L23, biztonsági átnézés)', () => {
  it('ha a mentés válasza másik fiók adatait hozza (közben másik lapon átjelentkezett), a profil gyorsítótára nem íródik felül – a munkamenet viszont az új fiók', async () => {
    stubFetch(
      forPath(USERS_PATH, profileResponse()),
      forPath('/api/photos', galleryResponse([])),
      forPath('/api/me', userResponse({ ...testUser, displayName: 'Kiss Anna' })),
      forPath(USERS_PATH, profileResponse()),
    );
    const { user } = renderRoute(PATH, undefined, { session: profileUser });
    await user.click(await screen.findByRole('button', { name: 'Profil szerkesztése' }));
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Mentés' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Fotós Fanni' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Kiss Anna' })).toBeNull();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'KA – fiókmenü' }),
    ).toBeInTheDocument();
  });
});
