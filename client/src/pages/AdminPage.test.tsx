// Az adminfelület (L25; L17 drótváz „Adminisztráció”): csak adminisztrátornak nyíló oldal a platform
// statisztikájával, a felhasználók (keresés, tiltási szűrő, lapozás; letiltás megerősítéssel, feloldás)
// és a képek (állapotszűrő darabszámmal, lapozás; elrejtés megerősítéssel, visszaállítás,
// újrapróbálás) táblázatával. A nézet az URL-ben van (adminParams.ts). A művelet után a sor azonnal
// frissül a szerver válaszából, majd a listák és a statisztika újratöltődnek; a fókusz egyetlen
// lépésben sem vész el – akkor sem, ha a frissített sor kikerül a szűrt listából –, az eredményt az
// élő régió mondja be.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '../api/auth.api';
import { formatInteger, formatPrice } from '../lib/format';
import {
  adminPhoto,
  adminPhotoResponse,
  adminPhotos,
  adminPhotosResponse,
  adminResponses,
  adminSelf,
  adminUser,
  adminUserResponse,
  adminUsersResponse,
  blockedUser,
  FAILED_PHOTO_ID,
  OWNER_HIDDEN_PHOTO_ID,
  PENDING_PHOTO_ID,
  platformStats,
  retryResponse,
  statsResponse,
  TAKEN_DOWN_PHOTO_ID,
} from '../test/admin';
import { axeViolations } from '../test/axe';
import {
  DeferredResponse,
  forPath,
  type Outcome,
  type QueuedOutcome,
  requestedUrls,
  stubFetch,
} from '../test/fetch';
import { galleryResponses, OWNER_ID, PHOTO_ID } from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testAdmin, testUser } from '../test/users';

const PATH = '/admin';
const STATS_PATH = '/api/admin/stats';
const USERS_PATH = '/api/admin/users';
const PHOTOS_PATH = '/api/admin/photos';
const ELEK_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';
const ADMIN_HIDDEN_ID = '5f607182-93a4-4b5c-8d6e-7f8091a2b3c4';
const SECOND_FAILED_ID = '8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f';

afterEach(() => {
  vi.useRealTimers();
});

interface AdminFixture {
  path?: string;
  stats?: Outcome;
  users?: Outcome;
  photos?: Outcome;
  /** A későbbi kérések válaszai (műveletek, újratöltés) */
  extra?: QueuedOutcome[];
  session?: AuthUser;
}

/** Az oldal adminként, a három lista válaszával (a kérések sorrendje nem számít). */
function renderAdmin({
  path = PATH,
  stats,
  users,
  photos,
  extra = [],
  session = testAdmin,
}: AdminFixture = {}) {
  const fetchMock = stubFetch(...adminResponses({ stats, users, photos }), ...extra);
  return { ...renderRoute(path, undefined, { session }), fetchMock };
}

const stats = () => screen.getByRole('region', { name: 'Statisztika' });
const statOf = (label: string) =>
  within(stats()).getByText(label, { selector: 'dt' }).closest('div') as HTMLElement;
const usersTable = () => screen.getByRole('region', { name: 'Felhasználók táblázata' });
const photosTable = () => screen.getByRole('region', { name: 'Képek táblázata' });
const userRowOf = (name: string) =>
  within(usersTable()).getByText(name).closest('tr') as HTMLElement;
const photoRowOf = (title: string) =>
  within(photosTable()).getByRole('link', { name: title }).closest('tr') as HTMLElement;
const usersSummary = () => screen.getByText(/^Összesen \d+ felhasználó/);
const photosSummary = () => screen.getByText(/^Összesen \d+ kép/);
const status = () => screen.getByRole('status');
const dialog = () => screen.getByRole('dialog');
/** A lista kérései (a lekérdezéssel) – a sor módosításának címe (…/users/:id) nem számít bele */
const requestsTo = (fetchMock: ReturnType<typeof stubFetch>, path: string) =>
  requestedUrls(fetchMock).filter((url) => url === path || url.startsWith(`${path}?`));
const sentRequest = (fetchMock: ReturnType<typeof stubFetch>, method: string) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method);
  return call && { url: String(call[0]), body: call[1]?.body };
};

describe('AdminPage – hozzáférés és áttekintés', () => {
  it('a nem admin felhasználónak „Nincs jogosultságod” oldalt mutat, kérés nélkül', async () => {
    const fetchMock = stubFetch();
    renderRoute(PATH, undefined, { session: testUser });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nincs jogosultságod' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ha a szerver mégis 403-at ad (a szerepkör közben megszűnt), mindhárom szakasz hibanézetet mutat, adat nélkül', async () => {
    const forbidden = () => errorResponse(403, 'FORBIDDEN', 'Nincs jogosultságod');
    renderAdmin({ stats: forbidden(), users: forbidden(), photos: forbidden() });

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/^Összesen/)).toBeNull();
  });

  it('a fő navigációban Admin (/admin) csak az adminisztrátornak látszik', async () => {
    stubFetch(...galleryResponses());
    const member = renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');
    const nav = () => screen.getByRole('navigation', { name: 'Fő navigáció' });
    expect(within(nav()).queryByRole('link', { name: 'Admin' })).toBeNull();
    member.unmount();

    stubFetch(...galleryResponses());
    renderRoute('/', undefined, { session: testAdmin });
    await screen.findByText('Még nincs hitelesített kép');

    const admin = within(nav()).getByRole('link', { name: 'Admin' });
    expect(admin).toHaveAttribute('href', '/admin');
    expect(admin).not.toHaveAttribute('aria-current');
  });

  it('cím, magyarázat, böngészőcím, az Admin menüpont aktív; a statisztika öt kártyája a számokkal és a bontással; akadálymentességi hiba nélkül', async () => {
    const { container } = renderAdmin();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Adminisztráció' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Felhasználók tiltása, képek moderálása és a lánc-regisztráció újrapróbálása.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Adminisztráció · PhotoChain'));
    expect(
      within(screen.getByRole('navigation', { name: 'Fő navigáció' })).getByRole('link', {
        name: 'Admin',
      }),
    ).toHaveAttribute('aria-current', 'page');

    await within(stats()).findByText('42');
    expect(statOf('Felhasználók')).toHaveTextContent('2 tiltott · 1 admin');
    expect(statOf('Képek')).toHaveTextContent(formatInteger(128));
    expect(statOf('Képek')).toHaveTextContent(
      '121 hitelesítve · 2 folyamatban · 1 sikertelen · 4 rejtett',
    );
    expect(statOf('Rendelések')).toHaveTextContent('57');
    expect(statOf('Rendelések')).toHaveTextContent(
      '51 kifizetett · 2 függő · 4 lejárt vagy sikertelen',
    );
    // A jest-dom a szövegben a nem törő szóközt is sima szóközre normalizálja
    expect(statOf('Bevétel')).toHaveTextContent(formatPrice(612_300).replace(/\s/g, ' '));
    expect(statOf('Bevétel')).toHaveTextContent('a kifizetett rendelésekből');
    expect(statOf('Hash a láncon')).toHaveTextContent('125');
    expect(statOf('Hash a láncon')).toHaveTextContent('regisztrált ujjlenyomat (a rejtetteké is)');

    await screen.findByText('Összesen 3 felhasználó');
    await screen.findByText('Összesen 5 kép');
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('a felhasználók táblázata: név (a saját fiók „(te)”), e-mail, regisztráció, képek száma, állapot; művelet: Letiltás, Feloldás, az admin „nem tiltható”', async () => {
    renderAdmin();
    await screen.findByText('Összesen 3 felhasználó');

    expect(usersTable()).toHaveAttribute('tabindex', '0');
    expect(
      within(usersTable())
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Név', 'E-mail', 'Regisztrált', 'Képek', 'Állapot', 'Művelet']);

    const fanni = userRowOf('Fotós Fanni');
    expect(within(fanni).getByRole('rowheader')).toHaveTextContent('Fotós Fanni');
    expect(within(fanni).getByText('fanni@pelda.hu')).toBeInTheDocument();
    expect(within(fanni).getByText('2026. szeptember 20.')).toBeInTheDocument();
    expect(within(fanni).getByText('3')).toBeInTheDocument();
    expect(within(fanni).getByText('Aktív')).toBeInTheDocument();
    expect(
      within(fanni).getByRole('button', { name: 'Letiltás: Fotós Fanni' }),
    ).toBeInTheDocument();

    const vera = userRowOf('Vásárló Vera');
    expect(within(vera).getByText('Tiltva')).toBeInTheDocument();
    expect(
      within(vera).getByRole('button', { name: 'Feloldás: Vásárló Vera' }),
    ).toBeInTheDocument();

    const self = userRowOf('Admin Ádám');
    expect(within(self).getByText('(te)')).toBeInTheDocument();
    expect(within(self).getByText('Admin')).toBeInTheDocument();
    expect(within(self).getByText('nem tiltható')).toBeInTheDocument();
    expect(within(self).queryByRole('button')).toBeNull();
  });

  it('a képek táblázata: a drótváz öt állapota a hozzá tartozó művelettel vagy magyarázattal; az állapotszűrő darabszámmal', async () => {
    const photos = adminPhotos();
    photos[1] = adminPhoto({
      ...photos[1],
      owner: { id: OWNER_ID, displayName: 'Fotós Fanni', isBlocked: true },
    });
    renderAdmin({ photos: adminPhotosResponse(photos) });
    await screen.findByText('Összesen 5 kép');

    expect(photosTable()).toHaveAttribute('tabindex', '0');
    expect(
      within(photosTable())
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Kép', 'Tulajdonos', 'Állapot', 'Feltöltve', 'Művelet']);

    const registered = photoRowOf('Őszi erdő ködben');
    expect(within(registered).getByRole('link', { name: 'Őszi erdő ködben' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(within(registered).getByText('Hitelesítve')).toBeInTheDocument();
    expect(within(registered).getByText('2026. október 4.')).toBeInTheDocument();
    expect(
      within(registered).getByRole('button', { name: 'Elrejtés: Őszi erdő ködben' }),
    ).toBeInTheDocument();

    const pending = photoRowOf('Hajnal a tónál');
    expect(within(pending).getByText('Regisztrálás folyamatban')).toBeInTheDocument();
    expect(within(pending).getByText('várakozás a láncra')).toBeInTheDocument();
    expect(within(pending).getByText('(tiltva)')).toBeInTheDocument();
    expect(within(pending).queryByRole('button')).toBeNull();

    const failed = photoRowOf('Városi esti fények');
    expect(within(failed).getByText('Sikertelen regisztráció')).toBeInTheDocument();
    expect(
      within(failed).getByRole('button', {
        name: 'Újrapróbálás: Városi esti fények regisztrációja',
      }),
    ).toBeInTheDocument();

    const takenDown = photoRowOf('Pipacsmező');
    expect(within(takenDown).getByText('Moderátor eltávolította')).toBeInTheDocument();
    expect(within(takenDown).getByText('A tulajdonos is elrejtette.')).toBeInTheDocument();
    expect(within(takenDown).getByText('Előnézet nem érhető el')).toBeInTheDocument();
    expect(
      within(takenDown).getByRole('button', { name: 'Visszaállítás: Pipacsmező' }),
    ).toBeInTheDocument();

    const ownerHidden = photoRowOf('Régi híd');
    expect(within(ownerHidden).getByText('Elrejtve (tulajdonos)')).toBeInTheDocument();
    expect(within(ownerHidden).getByText('a tulajdonos döntése')).toBeInTheDocument();
    expect(within(ownerHidden).queryByRole('button')).toBeNull();

    const chips = screen.getByRole('group', { name: 'Állapot szerint' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((button) => [button.textContent, button.getAttribute('aria-pressed')]),
    ).toEqual([
      ['Mind (128)', 'true'],
      ['Hitelesítve (121)', 'false'],
      ['Folyamatban (2)', 'false'],
      ['Sikertelen (1)', 'false'],
      ['Rejtett (4)', 'false'],
    ]);
  });
});

describe('AdminPage – nézet az URL-ben', () => {
  it('keresés: Enter után az URL-ben a keresőszó, a kérés q-val az első oldalról, a fókusz a találatszámra; a vissza gomb után a mező követi az URL-t', async () => {
    const { user, router, fetchMock } = renderAdmin({
      extra: [forPath(USERS_PATH, adminUsersResponse([adminUser()]))],
    });
    await screen.findByText('Összesen 3 felhasználó');

    const search = within(screen.getByRole('search', { name: 'Felhasználók keresése' })).getByRole(
      'searchbox',
      { name: 'Keresés név vagy e-mail alapján' },
    );
    expect(search).toHaveAttribute('placeholder', 'Név vagy e-mail…');
    await user.type(search, 'fanni{Enter}');

    expect(router.state.location.search).toBe('?q=fanni');
    await screen.findByText('Összesen 1 felhasználó');
    expect(requestsTo(fetchMock, USERS_PATH)).toEqual([
      `${USERS_PATH}?page=1&pageSize=20`,
      `${USERS_PATH}?q=fanni&page=1&pageSize=20`,
    ]);
    await waitFor(() => expect(usersSummary()).toHaveFocus());

    await act(() => router.navigate(-1));

    expect(router.state.location.search).toBe('');
    expect(search).toHaveValue('');
    await screen.findByText('Összesen 3 felhasználó');
  });

  it('a statisztika betöltése alatt a kártyák helyét ugyanakkora vázak foglalják (az alattuk lévő listák nem ugranak – CLS, L26); a felirat a képernyőolvasónak szól', async () => {
    const pending = new DeferredResponse();
    renderAdmin({ stats: pending });
    await screen.findByRole('heading', { level: 1, name: 'Adminisztráció' });

    const skeleton = stats().querySelector('[aria-hidden="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton!.children).toHaveLength(5);
    expect(skeleton).toHaveTextContent('Felhasználók');
    expect(skeleton).toHaveTextContent('Hash a láncon');
    expect(within(stats()).getByText('Statisztika betöltése…')).toHaveClass('sr-only');

    pending.resolve(statsResponse());

    await within(stats()).findByText('42');
    expect(stats().querySelector('[aria-hidden="true"]')).toBeNull();
    expect(within(stats()).queryByText('Statisztika betöltése…')).toBeNull();
  });

  it('a listák első betöltése alatt a táblázat helyét váz foglalja (a következő szakasz nem ugrik – CLS, L26)', async () => {
    const pending = new DeferredResponse();
    renderAdmin({ users: pending });
    const section = await screen.findByRole('region', { name: 'Felhasználók' });
    await within(section).findByText('Felhasználók betöltése…');

    // (Az ikonok is rejtettek a képernyőolvasó elől: a váz a rejtett div)
    expect(section.querySelector('div[aria-hidden="true"]')).toHaveClass('h-[30rem]');

    pending.resolve(adminUsersResponse([adminUser()]));

    await within(section).findByText('Összesen 1 felhasználó');
    expect(section.querySelector('div[aria-hidden="true"]')).toBeNull();
  });

  it('a már alkalmazott keresőszó újraküldése nem navigál és nem kér újra: a fókusz a találatszámra kerül', async () => {
    const { user, router, fetchMock } = renderAdmin({
      path: '/admin?q=fanni',
      users: adminUsersResponse([adminUser()]),
    });
    await screen.findByText('Összesen 1 felhasználó');
    const key = router.state.location.key;
    const search = screen.getByRole('searchbox', { name: 'Keresés név vagy e-mail alapján' });
    expect(search).toHaveValue('fanni');

    await user.type(search, '{Enter}');

    expect(router.state.location.key).toBe(key);
    expect(requestsTo(fetchMock, USERS_PATH)).toHaveLength(1);
    expect(usersSummary()).toHaveFocus();
  });

  it('a tiltási szűrő kapcsológombjai: Tiltott → aria-pressed, az URL-ben és a kérésben blocked=true; a lista frissülése után a fókusz a találatszámra', async () => {
    const { user, router, fetchMock } = renderAdmin({
      extra: [forPath(USERS_PATH, adminUsersResponse([blockedUser()]))],
    });
    await screen.findByText('Összesen 3 felhasználó');
    const group = screen.getByRole('group', { name: 'Tiltás szerint' });
    expect(within(group).getByRole('button', { name: 'Mind' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(group).getByRole('button', { name: 'Tiltott' }));

    expect(router.state.location.search).toBe('?blocked=true');
    expect(within(group).getByRole('button', { name: 'Tiltott' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Mind' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await screen.findByText('Összesen 1 felhasználó');
    expect(requestsTo(fetchMock, USERS_PATH).at(-1)).toBe(
      `${USERS_PATH}?blocked=true&page=1&pageSize=20`,
    );
    await waitFor(() => expect(usersSummary()).toHaveFocus());
  });

  it('a képek állapotszűrője: Rejtett → az URL-ben és a kérésben status=HIDDEN, a Mind gomb nem nyomott; a fókusz a találatszámra', async () => {
    const { user, router, fetchMock } = renderAdmin({
      extra: [forPath(PHOTOS_PATH, adminPhotosResponse(adminPhotos().slice(3)))],
    });
    await screen.findByText('Összesen 5 kép');
    const chips = screen.getByRole('group', { name: 'Állapot szerint' });

    await user.click(within(chips).getByRole('button', { name: 'Rejtett (4)' }));

    expect(router.state.location.search).toBe('?status=HIDDEN');
    expect(within(chips).getByRole('button', { name: 'Rejtett (4)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(chips).getByRole('button', { name: 'Mind (128)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await screen.findByText('Összesen 2 kép');
    expect(requestsTo(fetchMock, PHOTOS_PATH).at(-1)).toBe(
      `${PHOTOS_PATH}?status=HIDDEN&page=1&pageSize=20`,
    );
    await waitFor(() => expect(photosSummary()).toHaveFocus());
  });

  it('ha mindkét lista üres, a szűrő váltása után a fókusz a saját szakasz üres állapotának címére kerül', async () => {
    const { user } = renderAdmin({
      path: '/admin?q=zz',
      users: adminUsersResponse([]),
      photos: adminPhotosResponse([adminPhoto()]),
      extra: [forPath(PHOTOS_PATH, adminPhotosResponse([]))],
    });
    await screen.findByText('Nincs ilyen felhasználó');
    await screen.findByText('Összesen 1 kép');

    await user.click(
      within(screen.getByRole('group', { name: 'Állapot szerint' })).getByRole('button', {
        name: 'Rejtett (4)',
      }),
    );

    expect(await screen.findByText('Nincs ilyen kép')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Nincs ilyen kép')).toHaveFocus());
  });

  it('a két lista lapozója egymástól független (usersPage, photosPage), a többi paraméter megmarad', async () => {
    const { fetchMock } = renderAdmin({
      path: '/admin?q=fa&status=HIDDEN',
      users: adminUsersResponse([adminUser()], { total: 45 }),
      photos: adminPhotosResponse([adminPhoto()], { total: 25 }),
    });
    await screen.findByText('Összesen 45 felhasználó');
    await screen.findByText('Összesen 25 kép');

    expect(requestsTo(fetchMock, USERS_PATH)).toEqual([`${USERS_PATH}?q=fa&page=1&pageSize=20`]);
    expect(requestsTo(fetchMock, PHOTOS_PATH)).toEqual([
      `${PHOTOS_PATH}?status=HIDDEN&page=1&pageSize=20`,
    ]);
    const usersPager = screen.getByRole('navigation', { name: 'Felhasználók lapozása' });
    expect(within(usersPager).getByRole('link', { name: 'Következő oldal' })).toHaveAttribute(
      'href',
      '/admin?q=fa&usersPage=2&status=HIDDEN',
    );
    expect(within(usersPager).getByRole('link', { name: '3. oldal' })).toHaveAttribute(
      'href',
      '/admin?q=fa&usersPage=3&status=HIDDEN',
    );
    const photosPager = screen.getByRole('navigation', { name: 'Képek lapozása' });
    expect(within(photosPager).getByRole('link', { name: 'Következő oldal' })).toHaveAttribute(
      'href',
      '/admin?q=fa&status=HIDDEN&photosPage=2',
    );
  });

  it('a hibás URL-paraméterek az alapértelmezést adják; a szűrő nélküli üres képlista „Még nincs feltöltött kép”', async () => {
    const { fetchMock } = renderAdmin({
      path: '/admin?blocked=maybe&usersPage=0&status=FOO&photosPage=abc',
      users: adminUsersResponse([adminSelf()]),
      photos: adminPhotosResponse([]),
    });
    await screen.findByText('Összesen 1 felhasználó');

    expect(requestsTo(fetchMock, USERS_PATH)).toEqual([`${USERS_PATH}?page=1&pageSize=20`]);
    expect(requestsTo(fetchMock, PHOTOS_PATH)).toEqual([`${PHOTOS_PATH}?page=1&pageSize=20`]);
    expect(
      within(screen.getByRole('group', { name: 'Tiltás szerint' })).getByRole('button', {
        name: 'Mind',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('group', { name: 'Állapot szerint' })).getByRole('button', {
        name: 'Mind (128)',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Még nincs feltöltött kép')).toBeInTheDocument();
  });

  it('üres találat keresésnél és szűrőnél: a törlés hivatkozása csak a saját lista paramétereit törli', async () => {
    renderAdmin({
      path: '/admin?q=zz&status=HIDDEN',
      users: adminUsersResponse([]),
      photos: adminPhotosResponse([]),
    });

    expect(await screen.findByText('Nincs ilyen felhasználó')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Keresés törlése' })).toHaveAttribute(
      'href',
      '/admin?status=HIDDEN',
    );
    expect(await screen.findByText('Nincs ilyen kép')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Szűrő törlése' })).toHaveAttribute(
      'href',
      '/admin?q=zz',
    );
  });

  it('túl nagy oldalszámnál „Ezen az oldalon nincs …” és hivatkozás a saját lista első oldalára', async () => {
    renderAdmin({
      path: '/admin?usersPage=9&photosPage=9',
      users: adminUsersResponse([], { page: 9, total: 3 }),
      photos: adminPhotosResponse([], { page: 9, total: 5 }),
    });

    expect(await screen.findByText('Ezen az oldalon nincs felhasználó')).toBeInTheDocument();
    expect(await screen.findByText('Ezen az oldalon nincs kép')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: 'Vissza az első oldalra' })
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/admin?photosPage=9', '/admin?usersPage=9']);
  });
});

describe('AdminPage – felhasználók tiltása és feloldása', () => {
  it('letiltás: megerősítő ablak a következményekkel (fókusz a Mégse gombon), Letiltás → PATCH {isBlocked: true}; a sor Tiltva, a gombja Feloldás lesz és rajta a fókusz; bemondás; a listák és a statisztika újratöltődnek', async () => {
    const blocked = adminUser({ isBlocked: true });
    const { user, fetchMock, container } = renderAdmin({
      extra: [
        adminUserResponse(blocked),
        ...adminResponses({ users: adminUsersResponse([adminSelf(), blocked, blockedUser()]) }),
      ],
    });
    await screen.findByText('Összesen 3 felhasználó');

    await user.click(
      within(userRowOf('Fotós Fanni')).getByRole('button', { name: 'Letiltás: Fotós Fanni' }),
    );

    const box = dialog();
    expect(
      within(box).getByRole('heading', { level: 2, name: 'Letiltod: Fotós Fanni?' }),
    ).toBeInTheDocument();
    expect(
      within(box)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'nem használhatja a fiókját;',
      'a képei a tiltás idejére eltűnnek a galériából;',
      'a folyamatban lévő fizetései lezárulnak.',
    ]);
    expect(box).toHaveAccessibleDescription(/A tiltás bármikor feloldható\./);
    expect(within(box).getByRole('button', { name: 'Mégse' })).toHaveFocus();
    expect(await axeViolations(container, { page: true })).toEqual([]);

    await user.click(within(box).getByRole('button', { name: 'Letiltás' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentRequest(fetchMock, 'PATCH')).toEqual({
      url: `${USERS_PATH}/${OWNER_ID}`,
      body: JSON.stringify({ isBlocked: true }),
    });
    const row = userRowOf('Fotós Fanni');
    expect(within(row).getByText('Tiltva')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Feloldás: Fotós Fanni' })).toHaveFocus();
    expect(status()).toHaveTextContent('„Fotós Fanni” letiltva.');
    await waitFor(() => {
      expect(requestsTo(fetchMock, USERS_PATH)).toHaveLength(2);
      expect(requestsTo(fetchMock, STATS_PATH)).toHaveLength(2);
      expect(requestsTo(fetchMock, PHOTOS_PATH)).toHaveLength(2);
    });
    expect(within(userRowOf('Fotós Fanni')).getByText('Tiltva')).toBeInTheDocument();
    expect(within(userRowOf('Fotós Fanni')).getByRole('button')).toHaveFocus();
  });

  it('a letiltás hibája (409 – közben adminisztrátor lett): a hiba az ablakban marad, a lista frissül; Escape zárja, a fókusz az eltűnt gomb helyett a sor nevére kerül', async () => {
    const { user } = renderAdmin({
      extra: [
        errorResponse(409, 'CONFLICT', 'Adminisztrátor nem tiltható le'),
        forPath(
          USERS_PATH,
          adminUsersResponse([adminSelf(), adminUser({ role: 'ADMIN' }), blockedUser()]),
        ),
      ],
    });
    await screen.findByText('Összesen 3 felhasználó');
    await user.click(
      within(userRowOf('Fotós Fanni')).getByRole('button', { name: 'Letiltás: Fotós Fanni' }),
    );

    await user.click(within(dialog()).getByRole('button', { name: 'Letiltás' }));

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('A letiltás nem sikerült. Adminisztrátor nem tiltható le.');
    expect(within(dialog()).getByRole('button', { name: 'Letiltás' })).toHaveAttribute(
      'aria-describedby',
      alert.parentElement!.id,
    );
    await within(userRowOf('Fotós Fanni')).findByText('nem tiltható');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(userRowOf('Fotós Fanni')).getByText('Fotós Fanni')).toHaveFocus();
  });

  it('feloldás: Feloldás → PATCH {isBlocked: false}, a sor Aktív, a gombja Letiltás lesz és rajta marad a fókusz, bemondás; hibánál riasztás a táblázat fölött, a gomb leírásaként', async () => {
    const elek = adminUser({
      id: ELEK_ID,
      email: 'elek@pelda.hu',
      displayName: 'Teszt Elek',
      isBlocked: true,
    });
    const vera = adminUser({ ...blockedUser(), isBlocked: false });
    const { user, fetchMock } = renderAdmin({
      users: adminUsersResponse([blockedUser(), elek]),
      extra: [
        adminUserResponse(vera),
        ...adminResponses({ users: adminUsersResponse([vera, elek]) }),
        errorResponse(500, 'INTERNAL_ERROR', 'Belső hiba'),
        forPath(USERS_PATH, adminUsersResponse([vera, elek])),
      ],
    });
    await screen.findByText('Összesen 2 felhasználó');

    await user.click(
      within(userRowOf('Vásárló Vera')).getByRole('button', { name: 'Feloldás: Vásárló Vera' }),
    );

    const row = userRowOf('Vásárló Vera');
    await within(row).findByText('Aktív');
    expect(sentRequest(fetchMock, 'PATCH')).toEqual({
      url: `${USERS_PATH}/${vera.id}`,
      body: JSON.stringify({ isBlocked: false }),
    });
    expect(within(row).getByRole('button', { name: 'Letiltás: Vásárló Vera' })).toHaveFocus();
    expect(status()).toHaveTextContent('„Vásárló Vera” tiltása feloldva.');
    await waitFor(() => expect(requestsTo(fetchMock, USERS_PATH)).toHaveLength(2));

    await user.click(
      within(userRowOf('Teszt Elek')).getByRole('button', { name: 'Feloldás: Teszt Elek' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A feloldás nem sikerült. Belső hiba.');
    const button = within(userRowOf('Teszt Elek')).getByRole('button', {
      name: 'Feloldás: Teszt Elek',
    });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-describedby', alert.parentElement!.id);
    // A szerver hibája után (a módosítás meg is történhetett) a lista újratöltődik
    await waitFor(() => expect(requestsTo(fetchMock, USERS_PATH)).toHaveLength(3));
    expect(within(userRowOf('Teszt Elek')).getByText('Tiltva')).toBeInTheDocument();
  });

  it('két sor művelete egyszerre: mindkét gomb foglalt, amíg a saját kérése fut; a később érkező hiba is megjelenik', async () => {
    const elek = adminUser({
      id: ELEK_ID,
      email: 'elek@pelda.hu',
      displayName: 'Teszt Elek',
      isBlocked: true,
    });
    const vera = adminUser({ ...blockedUser(), isBlocked: false });
    const first = new DeferredResponse();
    const { user } = renderAdmin({
      users: adminUsersResponse([blockedUser(), elek]),
      extra: [
        first,
        adminUserResponse(vera),
        ...adminResponses({ users: adminUsersResponse([vera, elek]) }),
        // Elek hibája után csak a felhasználók listája töltődik újra
        forPath(USERS_PATH, adminUsersResponse([vera, elek])),
      ],
    });
    await screen.findByText('Összesen 2 felhasználó');

    await user.click(screen.getByRole('button', { name: 'Feloldás: Teszt Elek' }));
    await user.click(screen.getByRole('button', { name: 'Feloldás: Vásárló Vera' }));

    await within(userRowOf('Vásárló Vera')).findByText('Aktív');
    expect(screen.getByRole('button', { name: 'Feloldás: Teszt Elek' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    first.resolve(errorResponse(500, 'INTERNAL_ERROR', 'Belső hiba'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A feloldás nem sikerült. Belső hiba.',
    );
    expect(screen.getByRole('button', { name: 'Feloldás: Teszt Elek' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('szűrt listában (Tiltott) a feloldott felhasználó kikerül a listából: a bemondás ezt is mondja, a fókusz az üres állapot címére kerül (nem vész el)', async () => {
    const vera = adminUser({ ...blockedUser(), isBlocked: false });
    const { user } = renderAdmin({
      path: '/admin?blocked=true',
      users: adminUsersResponse([blockedUser()]),
      extra: [adminUserResponse(vera), ...adminResponses({ users: adminUsersResponse([]) })],
    });
    await screen.findByText('Összesen 1 felhasználó');

    await user.click(screen.getByRole('button', { name: 'Feloldás: Vásárló Vera' }));

    expect(await screen.findByText('Nincs ilyen felhasználó')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Nincs ilyen felhasználó')).toHaveFocus());
    expect(status()).toHaveTextContent(
      '„Vásárló Vera” tiltása feloldva; a szűrt listából kikerült.',
    );
  });
});

describe('AdminPage – képek moderálása és újrapróbálás', () => {
  it('elrejtés: megerősítő ablak („Elrejted: …?”) a következményekkel, Elrejtés → PATCH {hidden: true}; a sor „Moderátor eltávolította” előnézet nélkül, a gombja Visszaállítás lesz és rajta a fókusz; bemondás', async () => {
    const hidden = adminPhoto({ status: 'HIDDEN', hiddenBy: 'ADMIN', thumbnailUrl: null });
    const { user, fetchMock } = renderAdmin({
      extra: [
        adminPhotoResponse(hidden),
        forPath(PHOTOS_PATH, adminPhotosResponse([hidden, ...adminPhotos().slice(1)])),
        forPath(STATS_PATH, statsResponse()),
      ],
    });
    await screen.findByText('Összesen 5 kép');

    await user.click(
      within(photoRowOf('Őszi erdő ködben')).getByRole('button', {
        name: 'Elrejtés: Őszi erdő ködben',
      }),
    );

    const box = dialog();
    expect(
      within(box).getByRole('heading', { level: 2, name: 'Elrejted: Őszi erdő ködben?' }),
    ).toBeInTheDocument();
    expect(
      within(box)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'eltűnik a galériából, és a vásárlók sem tölthetik le;',
      'a folyamatban lévő fizetései lezárulnak;',
      'a blokkláncon a rekord megmarad.',
    ]);
    expect(box).toHaveAccessibleDescription(/Az elrejtés visszaállítható\./);
    expect(within(box).getByRole('button', { name: 'Mégse' })).toHaveFocus();

    await user.click(within(box).getByRole('button', { name: 'Elrejtés' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sentRequest(fetchMock, 'PATCH')).toEqual({
      url: `${PHOTOS_PATH}/${PHOTO_ID}`,
      body: JSON.stringify({ hidden: true }),
    });
    const row = photoRowOf('Őszi erdő ködben');
    expect(within(row).getByText('Moderátor eltávolította')).toBeInTheDocument();
    expect(within(row).getByText('Előnézet nem érhető el')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Visszaállítás: Őszi erdő ködben' }),
    ).toHaveFocus();
    expect(status()).toHaveTextContent('„Őszi erdő ködben” elrejtve.');
    await waitFor(() => {
      expect(requestsTo(fetchMock, PHOTOS_PATH)).toHaveLength(2);
      expect(requestsTo(fetchMock, STATS_PATH)).toHaveLength(2);
    });
  });

  it('szűrt listában (Hitelesítve) az elrejtett kép kikerül a listából: a fókusz a helyére lépő sor címére kerül, a bemondás mondja a kikerülést', async () => {
    const second = adminPhoto({ id: ADMIN_HIDDEN_ID, title: 'Tengerpart' });
    const hidden = adminPhoto({ status: 'HIDDEN', hiddenBy: 'ADMIN', thumbnailUrl: null });
    const { user } = renderAdmin({
      path: '/admin?status=REGISTERED',
      photos: adminPhotosResponse([adminPhoto(), second]),
      extra: [
        adminPhotoResponse(hidden),
        forPath(PHOTOS_PATH, adminPhotosResponse([second])),
        forPath(STATS_PATH, statsResponse()),
      ],
    });
    await screen.findByText('Összesen 2 kép');

    await user.click(screen.getByRole('button', { name: 'Elrejtés: Őszi erdő ködben' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Elrejtés' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Őszi erdő ködben' })).toBeNull(),
    );
    await waitFor(() => expect(screen.getByRole('link', { name: 'Tengerpart' })).toHaveFocus());
    expect(status()).toHaveTextContent('„Őszi erdő ködben” elrejtve; a szűrt listából kikerült.');
    expect(screen.getByText('Összesen 1 kép')).toBeInTheDocument();
  });

  it('az elrejtés hibája (409 – közben a tulajdonos vette le): a hiba az ablakban, a lista frissül; Mégse zárja, a fókusz a kép címére kerül', async () => {
    const ownerHidden = adminPhoto({ status: 'HIDDEN', hiddenBy: 'OWNER', thumbnailUrl: null });
    const { user } = renderAdmin({
      photos: adminPhotosResponse([adminPhoto()]),
      extra: [
        errorResponse(409, 'CONFLICT', 'A kép állapota közben megváltozott'),
        forPath(PHOTOS_PATH, adminPhotosResponse([ownerHidden])),
      ],
    });
    await screen.findByText('Összesen 1 kép');
    await user.click(screen.getByRole('button', { name: 'Elrejtés: Őszi erdő ködben' }));

    await user.click(within(dialog()).getByRole('button', { name: 'Elrejtés' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Az elrejtés nem sikerült. A kép állapota közben megváltozott.',
    );
    await within(photoRowOf('Őszi erdő ködben')).findByText('a tulajdonos döntése');

    await user.click(within(dialog()).getByRole('button', { name: 'Mégse' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('link', { name: 'Őszi erdő ködben' })).toHaveFocus();
  });

  it('visszaállítás: PATCH {hidden: false} → Hitelesítve és Elrejtés gomb a fókusszal; ha a tulajdonos is elrejtette, a sor „a tulajdonos döntése” lesz, a fókusz a kép címére kerül', async () => {
    const takenDown = adminPhoto({
      id: ADMIN_HIDDEN_ID,
      title: 'Tengerpart',
      status: 'HIDDEN',
      hiddenBy: 'ADMIN',
      thumbnailUrl: null,
    });
    const restored = adminPhoto({ id: ADMIN_HIDDEN_ID, title: 'Tengerpart' });
    const both = adminPhotos()[3]!;
    const ownerOnly = adminPhoto({ ...both, hiddenBy: 'OWNER' });
    const { user, fetchMock } = renderAdmin({
      photos: adminPhotosResponse([takenDown, both]),
      extra: [
        adminPhotoResponse(restored),
        forPath(PHOTOS_PATH, adminPhotosResponse([restored, both])),
        forPath(STATS_PATH, statsResponse()),
        adminPhotoResponse(ownerOnly),
        forPath(PHOTOS_PATH, adminPhotosResponse([restored, ownerOnly])),
        forPath(STATS_PATH, statsResponse()),
      ],
    });
    await screen.findByText('Összesen 2 kép');

    await user.click(screen.getByRole('button', { name: 'Visszaállítás: Tengerpart' }));

    const row = photoRowOf('Tengerpart');
    await within(row).findByText('Hitelesítve');
    expect(sentRequest(fetchMock, 'PATCH')).toEqual({
      url: `${PHOTOS_PATH}/${ADMIN_HIDDEN_ID}`,
      body: JSON.stringify({ hidden: false }),
    });
    expect(within(row).getByRole('button', { name: 'Elrejtés: Tengerpart' })).toHaveFocus();
    expect(status()).toHaveTextContent('„Tengerpart” visszaállítva.');
    await waitFor(() => expect(requestsTo(fetchMock, PHOTOS_PATH)).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Visszaállítás: Pipacsmező' }));

    await within(photoRowOf('Pipacsmező')).findByText('a tulajdonos döntése');
    expect(within(photoRowOf('Pipacsmező')).getByText('Elrejtve (tulajdonos)')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Pipacsmező' })).toHaveFocus());
    expect(status()).toHaveTextContent(
      '„Pipacsmező” moderátori elrejtése megszűnt; a tulajdonos elrejtése érvényben marad.',
    );
    await waitFor(() => expect(requestsTo(fetchMock, PHOTOS_PATH)).toHaveLength(3));
  });

  it('újrapróbálás: POST …/retry-registration (202) → „Regisztrálás folyamatban”, várakozás a láncra, a fókusz a kép címére, bemondás; a korlátozásnál (429) riasztás a várakozás idejével, és addig az újrapróbálás gombjai foglaltak', async () => {
    const failed = adminPhotos()[2]!;
    const second = adminPhoto({ ...failed, id: SECOND_FAILED_ID, title: 'Ködös reggel' });
    const { user, fetchMock } = renderAdmin({
      photos: adminPhotosResponse([failed, second]),
      extra: [
        retryResponse(FAILED_PHOTO_ID),
        forPath(
          PHOTOS_PATH,
          adminPhotosResponse([adminPhoto({ ...failed, status: 'PENDING_CHAIN' }), second]),
        ),
        forPath(STATS_PATH, statsResponse()),
        errorResponse(429, 'RATE_LIMITED', 'Túl sok újrapróbálás', { 'Retry-After': '60' }),
      ],
    });
    await screen.findByText('Összesen 2 kép');

    await user.click(
      screen.getByRole('button', { name: 'Újrapróbálás: Városi esti fények regisztrációja' }),
    );

    const row = photoRowOf('Városi esti fények');
    await within(row).findByText('Regisztrálás folyamatban');
    expect(sentRequest(fetchMock, 'POST')).toEqual({
      url: `${PHOTOS_PATH}/${FAILED_PHOTO_ID}/retry-registration`,
      body: undefined,
    });
    expect(within(row).getByText('várakozás a láncra')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Városi esti fények' })).toHaveFocus(),
    );
    expect(status()).toHaveTextContent('„Városi esti fények” regisztrációja újraindult.');
    await waitFor(() => expect(requestsTo(fetchMock, PHOTOS_PATH)).toHaveLength(2));

    const retryButton = () =>
      screen.getByRole('button', { name: 'Újrapróbálás: Ködös reggel regisztrációja' });
    await user.click(retryButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Az újrapróbálás nem sikerült. Túl sok újrapróbálás. Kb. 1 perc múlva próbálhatod újra.',
    );
    expect(retryButton()).toHaveFocus();
    // A szerver kérte várakozás alatt nincs újabb kérés: a gomb foglalt
    expect(retryButton()).toHaveAttribute('aria-disabled', 'true');
    await user.click(retryButton());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
  });

  it('amíg van regisztrációra váró kép, a lista 3 másodpercenként frissül; a hitelesítést az élő régió bemondja, a statisztika is frissül', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pending = adminPhotos()[1]!;
    renderAdmin({ photos: adminPhotosResponse([pending]) });
    await screen.findByText('Regisztrálás folyamatban');
    const fetchMock = stubFetch(
      forPath(
        PHOTOS_PATH,
        adminPhotosResponse([
          adminPhoto({
            ...pending,
            status: 'REGISTERED',
            registeredAt: '2026-10-05T07:14:00.000Z',
          }),
        ]),
      ),
      forPath(STATS_PATH, statsResponse(platformStats({ registeredHashes: 126 }))),
    );

    act(() => vi.advanceTimersByTime(3000));

    await within(photoRowOf('Hajnal a tónál')).findByText('Hitelesítve');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(2));
    expect(requestsTo(fetchMock, PHOTOS_PATH)).toEqual([`${PHOTOS_PATH}?page=1&pageSize=20`]);
    await within(stats()).findByText('126');
    expect(status()).toHaveTextContent(
      '„Hajnal a tónál” hitelesítve a blokkláncon, és megjelent a galériában.',
    );
    // Nincs több függő kép: nincs több lekérdezés
    act(() => vi.advanceTimersByTime(6500));
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it('a Folyamatban szűrőben a hitelesített kép kikerül a listából: a statisztika frissül, a bemondás elhangzik, a fókusz az üres állapot címére kerül', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pending = adminPhotos()[1]!;
    renderAdmin({ path: '/admin?status=PENDING_CHAIN', photos: adminPhotosResponse([pending]) });
    await screen.findByText('Összesen 1 kép');
    act(() => screen.getByRole('link', { name: 'Hajnal a tónál' }).focus());
    const fetchMock = stubFetch(
      forPath(PHOTOS_PATH, adminPhotosResponse([])),
      forPath(STATS_PATH, statsResponse(platformStats({ registeredHashes: 126 }))),
    );

    act(() => vi.advanceTimersByTime(3000));

    expect(await screen.findByText('Nincs ilyen kép')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Nincs ilyen kép')).toHaveFocus());
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(2));
    expect(status()).toHaveTextContent(
      '„Hajnal a tónál” már nem vár a regisztrációra; a szűrt listából kikerült.',
    );
    // Tájékoztató tónus: nem siker és nem hiba (L26)
    expect(status()).toHaveAttribute('data-tone', 'info');
  });

  it('az újrapróbálás újraindítja a lekérdezés időkeretét: a tíz perce ismert, újra várakozó kép listája ismét 3 másodpercenként frissül', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pending = adminPhotos()[1]!;
    const failed = adminPhoto({ ...pending, status: 'CHAIN_FAILED', chainTxHash: null });
    renderAdmin({ photos: adminPhotosResponse([pending]) });
    await screen.findByText('Regisztrálás folyamatban');
    // Az első lekérdezés: a regisztráció sikertelen lett (bemondva)
    let fetchMock = stubFetch(
      forPath(PHOTOS_PATH, adminPhotosResponse([failed])),
      forPath(STATS_PATH, statsResponse()),
    );
    act(() => vi.advanceTimersByTime(3000));
    await screen.findByText('Sikertelen regisztráció');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(2));
    expect(status()).toHaveTextContent(
      '„Hajnal a tónál” regisztrációja nem sikerült – újrapróbálható.',
    );
    // Látható, figyelmeztető tónusú értesítés (nem pipás siker – L26)
    expect(status()).toHaveAttribute('data-tone', 'warning');

    // Tizenegy perc múlva (az időkeret lejárt) újrapróbálás: a lista újra 3 másodpercenként frissül
    act(() => vi.advanceTimersByTime(11 * 60_000));
    fetchMock = stubFetch(
      retryResponse(PENDING_PHOTO_ID),
      forPath(PHOTOS_PATH, adminPhotosResponse([pending])),
      forPath(STATS_PATH, statsResponse()),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Újrapróbálás: Hajnal a tónál regisztrációja' }),
    );
    await screen.findByText('Regisztrálás folyamatban');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(3));

    fetchMock = stubFetch(
      forPath(PHOTOS_PATH, adminPhotosResponse([adminPhoto({ ...pending, status: 'REGISTERED' })])),
      forPath(STATS_PATH, statsResponse()),
    );
    act(() => vi.advanceTimersByTime(3000));

    await screen.findByText('Hitelesítve');
    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(2));
  });
});

describe('AdminPage – betöltési hibák', () => {
  it('a felhasználók betöltési hibája: riasztás és Újrapróbálás; siker után a fókusz a találatszámra', async () => {
    const { user } = renderAdmin({
      users: errorResponse(500, 'INTERNAL_ERROR', 'Belső hiba'),
      extra: [forPath(USERS_PATH, adminUsersResponse([adminUser()]))],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A felhasználók betöltése nem sikerült. Belső hiba.',
    );
    await screen.findByText('Összesen 5 kép');

    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));

    await screen.findByText('Összesen 1 felhasználó');
    expect(usersSummary()).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a statisztika betöltési hibája: riasztás, az állapotszűrő darabszám nélkül; siker után a számok megjelennek, a fókusz a statisztikára', async () => {
    const { user } = renderAdmin({
      stats: errorResponse(503, 'SERVER_UNAVAILABLE', 'A szerver most nem érhető el'),
      extra: [forPath(STATS_PATH, statsResponse())],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A statisztika betöltése nem sikerült. A szerver most nem érhető el.',
    );
    await screen.findByText('Összesen 5 kép');
    const chips = screen.getByRole('group', { name: 'Állapot szerint' });
    expect(within(chips).getByRole('button', { name: 'Mind' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(chips).getByRole('button', { name: 'Rejtett' })).toBeInTheDocument();

    await user.click(within(stats()).getByRole('button', { name: 'Újrapróbálás' }));

    await within(stats()).findByText('42');
    expect(within(chips).getByRole('button', { name: 'Rejtett (4)' })).toBeInTheDocument();
    expect(stats()).toHaveFocus();
  });
});

describe('AdminPage – a képek címei a drótvázból', () => {
  it('a rejtett és a sikertelen képek a moderáláshoz is látszanak (a tulajdonos elrejtése és a lánc-hiba is)', async () => {
    renderAdmin();
    await screen.findByText('Összesen 5 kép');

    expect(screen.getByRole('link', { name: 'Pipacsmező' })).toHaveAttribute(
      'href',
      `/photos/${TAKEN_DOWN_PHOTO_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Régi híd' })).toHaveAttribute(
      'href',
      `/photos/${OWNER_HIDDEN_PHOTO_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Hajnal a tónál' })).toHaveAttribute(
      'href',
      `/photos/${PENDING_PHOTO_ID}`,
    );
  });
});
