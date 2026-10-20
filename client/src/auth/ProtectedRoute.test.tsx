// Védett útvonalak: bejelentkezés nélkül a belépésre irányít (és megjegyzi, honnan jött), az
// adminoldalt a nem admin felhasználónak „nincs jogosultság” oldallal zárja el; amíg a munkamenet
// ellenőrzése tart, ezt jelzi, és ha az ellenőrzés nem sikerül, nem dobja ki a felhasználót.
// A próbához a fejlesztői /_vedett és /_admin oldalt használja (a valódi védett oldalak – feltöltés,
// vezérlőpult, admin – az L21–L25-ben készülnek).
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ApiError } from '../api/http';
import { axeViolations } from '../test/axe';
import { DeferredResponse, stubFetch } from '../test/fetch';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testAdmin, testUser, userResponse } from '../test/users';

const serverError = () => errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba');

afterEach(() => {
  focusManager.setFocused(undefined);
  // A böngészőfül címe tesztről tesztre megmaradna (a címre váró tesztek az előzőét látnák)
  document.title = '';
});

describe('ProtectedRoute', () => {
  it('az első betöltéskor (közvetlen hivatkozás) az ellenőrzés után sem mozdítja a fókuszt', async () => {
    const check = new DeferredResponse();
    stubFetch(check);
    renderRoute('/_vedett', undefined, { session: 'server' });
    await screen.findByText('A bejelentkezés ellenőrzése…');

    check.resolve(userResponse(testUser));

    await screen.findByRole('heading', { level: 1, name: 'Védett oldal' });
    // Az oldal címét beállító effekt lefutott – a fókuszkezelő effekt ugyanebben a körben fut
    await waitFor(() => expect(document.title).toBe('Védett oldal · PhotoChain'));
    expect(document.body).toHaveFocus();
  });

  it('hibaállapotban ablakváltáskor nem próbálja újra magától – az Újrapróbálás gomb kéznél van', async () => {
    const fetchMock = stubFetch(serverError());
    renderRoute('/_vedett', undefined, { session: 'server' });
    await screen.findByRole('alert');
    const callsBefore = fetchMock.mock.calls.length;

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(screen.getByRole('button', { name: 'Újrapróbálás' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('ha újrapróbálás közben máshová vitte a fókuszt, ott hagyja, és bejelenti, hogy az oldal betöltődött', async () => {
    const retried = new DeferredResponse();
    stubFetch(serverError(), retried);
    const { user } = renderRoute('/_vedett', undefined, { session: 'server' });
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));
    const gallery = within(screen.getByRole('banner')).getByRole('link', { name: 'Galéria' });
    act(() => gallery.focus());

    retried.resolve(userResponse(testUser));

    await screen.findByRole('heading', { level: 1, name: 'Védett oldal' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Az oldal betöltődött.'),
    );
    expect(gallery).toHaveFocus();
  });

  it('bejelentkezés nélkül a belépő oldalra irányít, és megjegyzi, honnan jött', async () => {
    const { router } = renderRoute('/_vedett');

    expect(await screen.findByRole('heading', { level: 1, name: 'Belépés' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/_vedett' } });
    expect(screen.getByText('A folytatáshoz jelentkezz be.')).toBeInTheDocument();
  });

  it('bejelentkezve a védett tartalmat mutatja', async () => {
    renderRoute('/_vedett', undefined, { session: testUser });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Védett oldal' }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText(/Kiss Anna/)).toBeInTheDocument();
  });

  it('a munkamenet ellenőrzése közben ezt jelzi, a válasz után dönt (induláskor GET /api/auth/me)', async () => {
    const me = new DeferredResponse();
    const fetchMock = stubFetch(me);
    const { router } = renderRoute('/_vedett', undefined, { session: 'server' });

    // Az ellenőrzés nézete a hajtásig ér: a megjelenő oldal nem tolja el a láblécet (CLS – L26)
    expect(await screen.findByText('A bejelentkezés ellenőrzése…')).toHaveClass(
      'min-h-[calc(100dvh-9rem)]',
    );
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/me');
    me.resolve(errorResponse(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges'));

    expect(await screen.findByRole('heading', { level: 1, name: 'Belépés' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('ha az ellenőrzés nem sikerül (szerverhiba), hibát és újrapróbálást mutat – nem dobja ki', async () => {
    stubFetch(errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba'), userResponse(testUser));
    const { user, router } = renderRoute('/_vedett', undefined, { session: 'server' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A bejelentkezés ellenőrzése nem sikerült. Váratlan szerverhiba',
    );
    expect(router.state.location.pathname).toBe('/_vedett');
    await user.click(screen.getByRole('button', { name: 'Újrapróbálás' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Védett oldal' }),
    ).toBeInTheDocument();
  });

  it('újrapróbáláskor a gomb a helyén marad (foglalt, rajta a fókusz), bejelenti az ellenőrzést, siker után a fókusz az oldal címére kerül', async () => {
    const retried = new DeferredResponse();
    stubFetch(serverError(), retried);
    const { user } = renderRoute('/_vedett', undefined, { session: 'server' });
    await screen.findByRole('alert');
    const retry = screen.getByRole('button', { name: 'Újrapróbálás' });

    await user.click(retry);

    await waitFor(() => expect(retry).toHaveAttribute('aria-disabled', 'true'));
    expect(retry).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Ellenőrzés folyamatban…');
    retried.resolve(userResponse(testUser));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Védett oldal' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('ha az újrapróbálás sem sikerül, a fókusz a gombon marad, és az új hiba riasztásként hangzik el', async () => {
    const retried = new DeferredResponse();
    stubFetch(serverError(), retried);
    const { user } = renderRoute('/_vedett', undefined, { session: 'server' });
    const firstAlert = await screen.findByRole('alert');
    const retry = screen.getByRole('button', { name: 'Újrapróbálás' });

    await user.click(retry);
    await waitFor(() => expect(retry).toHaveAttribute('aria-disabled', 'true'));
    retried.resolve(serverError());

    await waitFor(() => expect(retry).not.toHaveAttribute('aria-disabled'));
    expect(retry).toHaveFocus();
    const alert = screen.getByRole('alert');
    expect(alert).not.toBe(firstAlert);
    expect(alert).toHaveTextContent(
      'A bejelentkezés ellenőrzése nem sikerült. Váratlan szerverhiba.',
    );
  });

  it('az ellenőrzés közben és a hibájakor is beszédes a böngészőfül címe', async () => {
    const check = new DeferredResponse();
    stubFetch(check);
    renderRoute('/_vedett', undefined, { session: 'server' });

    // A címet effekt állítja be – a lusta útvonal betöltése utáni (átmenetként futó) renderelésnél ez
    // a tartalom megjelenése után kicsivel futhat le, ezért várunk rá
    await screen.findByText('A bejelentkezés ellenőrzése…');
    await waitFor(() => expect(document.title).toBe('A bejelentkezés ellenőrzése · PhotoChain'));
    check.resolve(serverError());

    await screen.findByRole('alert');
    await waitFor(() => expect(document.title).toBe('Az oldal most nem nyitható meg · PhotoChain'));
  });

  it('ha az ellenőrzés alatt nyitott meg védett oldalt (a fókusz a fő tartalomra került), az oldal megjelenésekor a címére kerül', async () => {
    const check = new DeferredResponse();
    stubFetch(check);
    const { router } = renderRoute('/login', undefined, { session: 'server' });
    await screen.findByRole('heading', { level: 1, name: 'Belépés' });

    await act(() => router.navigate('/_vedett'));
    await screen.findByText('A bejelentkezés ellenőrzése…');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    check.resolve(userResponse(testUser));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Védett oldal' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('ha a munkamenet a védett oldalon közben megszűnik (egy kérésre 401), a belépésre irányít, és megjegyzi az oldalt', async () => {
    const { router, queryClient } = renderRoute('/_vedett', undefined, { session: testUser });
    await screen.findByRole('heading', { level: 1, name: 'Védett oldal' });

    await act(() =>
      queryClient
        .fetchQuery({
          queryKey: ['rendelesek'],
          queryFn: () =>
            Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges')),
        })
        .catch(() => undefined),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Belépés' })).toBeInTheDocument();
    expect(router.state.location.state).toMatchObject({
      from: { pathname: '/_vedett' },
      required: true,
    });
  });
});

describe('AdminRoute', () => {
  it('bejelentkezés nélkül a belépésre irányít', async () => {
    const { router } = renderRoute('/_admin');

    expect(await screen.findByRole('heading', { level: 1, name: 'Belépés' })).toBeInTheDocument();
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/_admin' } });
  });

  it('a nem admin felhasználónak „nincs jogosultság” oldalt mutat (nem irányítja a belépésre)', async () => {
    const { router, container } = renderRoute('/_admin', undefined, { session: testUser });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nincs jogosultságod' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/_admin');
    await waitFor(() => expect(document.title).toBe('Nincs jogosultság · PhotoChain'));
    expect(screen.getByRole('link', { name: 'Vissza a kezdőlapra' })).toHaveAttribute('href', '/');
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('az adminnak megnyílik', async () => {
    renderRoute('/_admin', undefined, { session: testAdmin });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Adminoldal' }),
    ).toBeInTheDocument();
  });

  it('első betöltéskor a „nincs jogosultság” oldal megjelenésekor sem mozdítja a fókuszt', async () => {
    const check = new DeferredResponse();
    stubFetch(check);
    renderRoute('/_admin', undefined, { session: 'server' });
    await screen.findByText('A bejelentkezés ellenőrzése…');

    check.resolve(userResponse(testUser));

    await screen.findByRole('heading', { level: 1, name: 'Nincs jogosultságod' });
    await waitFor(() => expect(document.title).toBe('Nincs jogosultság · PhotoChain'));
    expect(document.body).toHaveFocus();
  });
});
