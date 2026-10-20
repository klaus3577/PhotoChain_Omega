// A belépő oldal: címkézett, jelszókezelőt támogató mezők (WCAG 3.3.8), kliensoldali ellenőrzés a
// mezők mellett megjelenő hibával és az első hibás mezőre ugró fókusszal (3.3.1, 3.3.3), a szerver
// hibája riasztásként; sikeres belépés után vissza oda, ahonnan a felhasználó jött.
import { act, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { authQueryKey } from '../api/auth.api';
import { axeViolations } from '../test/axe';
import { DeferredResponse, jsonResponse, stubFetch } from '../test/fetch';
import { focusAtFirstAnnouncement } from '../test/liveRegion';
import { galleryResponses } from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testUser, userResponse } from '../test/users';

/** A kezdőlap (galéria) két kérésének válasza: üres galéria. */
const gallery = () => galleryResponses();

async function fillAndSubmit(user: UserEvent, email: string, password: string) {
  await user.type(await screen.findByLabelText('E-mail-cím'), email);
  await user.type(screen.getByLabelText('Jelszó'), password);
  await user.click(screen.getByRole('button', { name: 'Belépés' }));
}

describe('LoginPage', () => {
  it('címkézett mezők jelszókezelőhöz (autocomplete), a böngésző saját hibabuborékja nélkül', async () => {
    renderRoute('/login');

    expect(await screen.findByRole('heading', { level: 1, name: 'Belépés' })).toBeInTheDocument();
    expect(document.title).toBe('Belépés · PhotoChain');
    const email = screen.getByLabelText('E-mail-cím');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(email).toBeRequired();
    const password = screen.getByLabelText('Jelszó');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(email.closest('form')).toHaveAttribute('novalidate');
  });

  it('a jelszó megjeleníthető (kapcsológomb, aria-pressed)', async () => {
    const { user } = renderRoute('/login');
    const toggle = await screen.findByRole('button', { name: 'Jelszó megjelenítése' });

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Jelszó')).toHaveAttribute('type', 'text');
  });

  it('üres beküldésnél a mezők mellett jelzi a hibát, az első hibás mezőre ugrik, és nem küld kérést', async () => {
    const fetchMock = stubFetch();
    const { user } = renderRoute('/login');

    await user.click(await screen.findByRole('button', { name: 'Belépés' }));

    const email = screen.getByLabelText('E-mail-cím');
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Add meg az e-mail-címedet.');
    expect(screen.getByLabelText('Jelszó')).toHaveAccessibleDescription('Add meg a jelszavadat.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ha a hibás mező már fókuszban van (Enter a mezőben), a hibát riasztás jelzi – a mező nevével, ismételt Enterre újra', async () => {
    const fetchMock = stubFetch();
    const { user } = renderRoute('/login');
    const email = await screen.findByLabelText('E-mail-cím');

    await user.type(email, 'anna@pelda{Enter}');

    expect(email).toHaveFocus();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'E-mail-cím: Az e-mail-cím formátuma nem megfelelő (pl. nev@pelda.hu).',
    );
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).not.toBe(alert);
    expect(fetchMock).not.toHaveBeenCalled();

    // A javítás után a rejtett riasztás sem marad (olvasó módban elavult hibát mondana)
    await user.type(email, '.hu');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('az első beküldés után javítás közben frissül a hibaüzenet', async () => {
    const { user } = renderRoute('/login');
    await user.click(await screen.findByRole('button', { name: 'Belépés' }));
    const email = screen.getByLabelText('E-mail-cím');

    await user.type(email, 'anna@pelda');
    expect(email).toHaveAccessibleDescription(
      'Az e-mail-cím formátuma nem megfelelő (pl. nev@pelda.hu).',
    );
    await user.type(email, '.hu');

    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('gépelés közben csak a már látható hiba frissül – a hibátlan mezőben új hiba csak beküldéskor jelenik meg', async () => {
    stubFetch();
    const { user } = renderRoute('/login');
    const email = await screen.findByLabelText('E-mail-cím');
    await user.type(email, 'anna@pelda.hu');
    await user.click(screen.getByRole('button', { name: 'Belépés' }));
    expect(screen.getByLabelText('Jelszó')).toHaveAttribute('aria-invalid', 'true');

    await user.clear(email);
    await user.type(email, 'anna');

    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('hibás adatoknál a szerver üzenetét riasztásként mutatja, a beírt e-mail-cím megmarad', async () => {
    const fetchMock = stubFetch(
      errorResponse(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó'),
    );
    const { user } = renderRoute('/login');

    await fillAndSubmit(user, 'anna@pelda.hu', 'rossz-jelszo');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A belépés nem sikerült. Hibás e-mail-cím vagy jelszó.',
    );
    expect(screen.getByLabelText('E-mail-cím')).toHaveValue('anna@pelda.hu');
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      email: 'anna@pelda.hu',
      password: 'rossz-jelszo',
    });
  });

  it('a beküldött e-mail-címről a Unicode-szóközt is levágja (az e-mail-mező csak az ASCII-szóközt)', async () => {
    const fetchMock = stubFetch(
      errorResponse(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó'),
    );
    const { user } = renderRoute('/login');

    await fillAndSubmit(user, `${String.fromCodePoint(0x3000)}anna@pelda.hu`, 'jelszo-1234');

    await screen.findByRole('alert');
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).email).toBe('anna@pelda.hu');
  });

  it('ismételt sikertelen belépésnél a riasztás új elem (a képernyőolvasó újra felolvassa)', async () => {
    stubFetch(
      errorResponse(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó'),
      errorResponse(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó'),
    );
    const { user } = renderRoute('/login');
    await fillAndSubmit(user, 'anna@pelda.hu', 'rossz-jelszo');
    const first = await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Belépés' }));

    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first));
  });

  it('új beküldéskor az előző hiba riasztása eltűnik (nem marad elavult üzenet a mezőhiba mellett)', async () => {
    stubFetch(errorResponse(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó'));
    const { user } = renderRoute('/login');
    await fillAndSubmit(user, 'anna@pelda.hu', 'rossz-jelszo');
    await screen.findByRole('alert');

    await user.clear(screen.getByLabelText('Jelszó'));
    await user.click(screen.getByRole('button', { name: 'Belépés' }));

    expect(screen.getByLabelText('Jelszó')).toHaveAccessibleDescription('Add meg a jelszavadat.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('letiltott fióknál (403) a szerver üzenetét mutatja, és kijelentkezve marad', async () => {
    stubFetch(errorResponse(403, 'ACCOUNT_BLOCKED', 'A fiókot az adminisztrátor letiltotta'));
    const { user } = renderRoute('/login');

    await fillAndSubmit(user, 'anna@pelda.hu', 'jelszo-1234');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A belépés nem sikerült. A fiókot az adminisztrátor letiltotta.',
    );
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Belépés' }),
    ).toBeInTheDocument();
  });

  it('a szerver mezőhibáját (400) a mező mellé teszi, és oda viszi a fókuszt', async () => {
    stubFetch(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Érvénytelen bemenet',
          details: [{ path: 'email', message: 'érvénytelen e-mail-cím' }],
        },
      }),
    );
    const { user } = renderRoute('/login');

    await fillAndSubmit(user, 'anna@pelda.hu', 'jelszo-1234');

    const email = screen.getByLabelText('E-mail-cím');
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAccessibleDescription('Érvénytelen e-mail-cím.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('túl sok próbálkozásnál (429) azt is megmondja, mikor próbálhatja újra', async () => {
    stubFetch(
      errorResponse(429, 'RATE_LIMITED', 'Túl sok próbálkozás – próbáld újra később', {
        'Retry-After': '120',
      }),
    );
    const { user } = renderRoute('/login');

    await fillAndSubmit(user, 'anna@pelda.hu', 'jelszo-1234');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Túl sok próbálkozás – próbáld újra később. Kb. 2 perc múlva próbálhatod újra.',
    );
  });

  it('sikeres belépés után a kezdőlapra visz, a fejlécben a fiókmenü jelenik meg, és bejelenti – a fókusz áthelyezése után', async () => {
    stubFetch(userResponse(testUser), ...gallery());
    const { user, router } = renderRoute('/login');
    const focusWhenAnnounced = focusAtFirstAnnouncement();

    await fillAndSubmit(user, 'anna@pelda.hu', 'jelszo-1234');

    const heading = await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(router.state.location.pathname).toBe('/');
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'KA – fiókmenü' })).toBeInTheDocument();
    expect(within(banner).queryByRole('link', { name: 'Belépés' })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Bejelentkeztél, Kiss Anna.'),
    );
    expect(focusWhenAnnounced()).toBe(heading);
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('ha a válasz előtt elhagyja a belépő oldalt, a sikerüzenet később, egy másik oldalon sem hangzik el', async () => {
    const loginResponse = new DeferredResponse();
    stubFetch(loginResponse, ...gallery());
    const { user, router } = renderRoute('/login');
    const banner = screen.getByRole('banner');
    await fillAndSubmit(user, 'anna@pelda.hu', 'jelszo-1234');

    await user.click(within(banner).getByRole('link', { name: 'Galéria' }));
    await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    loginResponse.resolve(userResponse(testUser));
    await within(banner).findByRole('button', { name: 'KA – fiókmenü' });
    await act(() => router.navigate('/nincs-ilyen'));

    await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });
    expect(screen.getByRole('status')).not.toHaveTextContent('Bejelentkeztél');
  });

  it('a jelszó nem marad a mutációk gyorsítótárában – sem a sikertelen, sem a sikeres belépés után', async () => {
    stubFetch(
      errorResponse(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó'),
      userResponse(testUser),
      ...gallery(),
    );
    const { user, queryClient } = renderRoute('/login');
    const storedPasswords = () =>
      queryClient
        .getMutationCache()
        .getAll()
        .filter((mutation) => JSON.stringify(mutation.state.variables ?? null).includes('jelszo'));
    await fillAndSubmit(user, 'anna@pelda.hu', 'rossz-jelszo');
    await screen.findByRole('alert');

    await user.clear(screen.getByLabelText('Jelszó'));
    await user.type(screen.getByLabelText('Jelszó'), 'jelszo-1234');
    await user.click(screen.getByRole('button', { name: 'Belépés' }));
    await screen.findByRole('heading', { level: 1, name: 'Galéria' });

    await waitFor(() => expect(storedPasswords()).toEqual([]));
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('a belépés előtt elindult munkamenet-ellenőrzés késve érkező válasza (401) nem jelentkezteti ki', async () => {
    const startupCheck = new DeferredResponse();
    stubFetch(startupCheck, userResponse(testUser), ...gallery());
    const { user, queryClient } = renderRoute('/login', undefined, { session: 'server' });

    await fillAndSubmit(user, 'anna@pelda.hu', 'jelszo-1234');
    await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    startupCheck.resolve(errorResponse(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges'));

    await waitFor(() => expect(queryClient.isFetching({ queryKey: authQueryKey })).toBe(0));
    expect(queryClient.getQueryData(authQueryKey)).toEqual(testUser);
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'KA – fiókmenü' }),
    ).toBeInTheDocument();
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('a védett oldalról érkezőt belépés után visszaviszi oda', async () => {
    stubFetch(userResponse(testUser));
    const { user, router } = renderRoute('/_vedett');
    await screen.findByRole('heading', { level: 1, name: 'Belépés' });

    await fillAndSubmit(user, 'anna@pelda.hu', 'jelszo-1234');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Védett oldal' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/_vedett');
  });

  it('a már bejelentkezett felhasználót a belépő oldalról továbbirányítja', async () => {
    stubFetch(...gallery());
    const { router } = renderRoute('/login', undefined, { session: testUser });

    expect(await screen.findByRole('heading', { level: 1, name: 'Galéria' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('a védett oldalról érkezőnek közvetlenül a cím után jelzi, miért kell belépnie', async () => {
    renderRoute('/_vedett');

    const heading = await screen.findByRole('heading', { level: 1, name: 'Belépés' });

    expect(heading.nextElementSibling).toHaveTextContent('A folytatáshoz jelentkezz be.');
  });

  it('a regisztrációra mutató hivatkozás megtartja, honnan jött a felhasználó', async () => {
    const { user, router } = renderRoute('/_vedett');
    await screen.findByRole('heading', { level: 1, name: 'Belépés' });

    await user.click(screen.getByRole('link', { name: 'Regisztrálj' }));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Regisztráció' });
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/_vedett' } });
    expect(heading.nextElementSibling).toHaveTextContent(
      'A folytatáshoz regisztrálj vagy jelentkezz be.',
    );
  });

  it('a hibaállapotban sincs akadálymentességi hiba (axe)', async () => {
    const { user, container } = renderRoute('/login');

    await user.click(await screen.findByRole('button', { name: 'Belépés' }));

    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});
