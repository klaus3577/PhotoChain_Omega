// A regisztrációs oldal: a szerver szabályait követő kliensoldali ellenőrzés, a szerver mezőhibái
// (foglalt e-mail-cím, validáció) a megfelelő mező mellett, sikeres regisztráció után bejelentkezve.
import { act, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { axeViolations } from '../test/axe';
import { DeferredResponse, jsonResponse, stubFetch } from '../test/fetch';
import { focusAtFirstAnnouncement } from '../test/liveRegion';
import { galleryResponses } from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testUser, userResponse } from '../test/users';

async function fillAndSubmit(
  user: UserEvent,
  values: { name: string; email: string; password: string },
) {
  if (values.name) await user.type(await screen.findByLabelText('Megjelenített név'), values.name);
  if (values.email) await user.type(screen.getByLabelText('E-mail-cím'), values.email);
  if (values.password) await user.type(screen.getByLabelText('Jelszó'), values.password);
  await user.click(screen.getByRole('button', { name: 'Regisztráció' }));
}

const valid = { name: 'Kiss Anna', email: 'anna@pelda.hu', password: 'hosszu-jelszo' };

describe('RegisterPage', () => {
  it('mezők súgóval és jelszókezelőhöz illő autocomplete-tel', async () => {
    renderRoute('/register');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Regisztráció' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Regisztráció · PhotoChain');
    const name = screen.getByLabelText('Megjelenített név');
    expect(name).toHaveAttribute('autocomplete', 'nickname');
    expect(name).toHaveAccessibleDescription(
      'Ez a név jelenik meg a képeid és az értékeléseid mellett.',
    );
    expect(screen.getByLabelText('E-mail-cím')).toHaveAttribute('autocomplete', 'email');
    const password = screen.getByLabelText('Jelszó');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toHaveAccessibleDescription(
      'Legalább 8 karakter. Jelszókezelő használatát javasoljuk.',
    );
  });

  it('hibás adatoknál minden mezőnél jelzi a hibát (a súgó megmarad), és az első hibásra ugrik', async () => {
    const fetchMock = stubFetch();
    const { user } = renderRoute('/register');

    await fillAndSubmit(user, { name: 'A', email: 'anna', password: '1234567' });

    const name = screen.getByLabelText('Megjelenített név');
    expect(name).toHaveFocus();
    expect(name).toHaveAccessibleDescription(
      'Ez a név jelenik meg a képeid és az értékeléseid mellett. A név legalább 2 karakter legyen.',
    );
    expect(screen.getByLabelText('E-mail-cím')).toHaveAccessibleDescription(
      'Az e-mail-cím formátuma nem megfelelő (pl. nev@pelda.hu).',
    );
    expect(screen.getByLabelText('Jelszó')).toHaveAccessibleDescription(
      'Legalább 8 karakter. Jelszókezelő használatát javasoljuk. A jelszó legalább 8 karakter legyen.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('foglalt e-mail-címnél (409) az e-mail mezőnél jelzi a hibát, és oda viszi a fókuszt', async () => {
    stubFetch(errorResponse(409, 'EMAIL_TAKEN', 'Ezzel az e-mail-címmel már regisztráltak'));
    const { user } = renderRoute('/register');

    await fillAndSubmit(user, valid);

    const email = screen.getByLabelText('E-mail-cím');
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAccessibleDescription('Ezzel az e-mail-címmel már regisztráltak.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ha az e-mail mezőben Enterrel küldte be (a fókusz már ott van), a foglalt címet riasztás jelzi', async () => {
    stubFetch(errorResponse(409, 'EMAIL_TAKEN', 'Ezzel az e-mail-címmel már regisztráltak'));
    const { user } = renderRoute('/register');
    await user.type(await screen.findByLabelText('Megjelenített név'), valid.name);
    await user.type(screen.getByLabelText('Jelszó'), valid.password);
    const email = screen.getByLabelText('E-mail-cím');

    await user.type(email, `${valid.email}{Enter}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail-cím: Ezzel az e-mail-címmel már regisztráltak.',
    );
    expect(email).toHaveFocus();
  });

  it('az előző hiba riasztása az új beküldéskor eltűnik (pl. hálózati hiba után foglalt e-mail-cím)', async () => {
    stubFetch(
      new TypeError('Failed to fetch'),
      errorResponse(409, 'EMAIL_TAKEN', 'Ezzel az e-mail-címmel már regisztráltak'),
    );
    const { user } = renderRoute('/register');
    await fillAndSubmit(user, valid);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Regisztráció' }));

    const email = screen.getByLabelText('E-mail-cím');
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAccessibleDescription('Ezzel az e-mail-címmel már regisztráltak.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a szerver validációs hibáit (400) a megfelelő mezőhöz rendeli', async () => {
    stubFetch(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Érvénytelen bemenet',
          details: [
            { path: 'displayName', message: 'legalább egy betűt vagy számot tartalmazzon' },
          ],
        },
      }),
    );
    const { user } = renderRoute('/register');

    await fillAndSubmit(user, valid);

    const name = screen.getByLabelText('Megjelenített név');
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAccessibleDescription(
      'Ez a név jelenik meg a képeid és az értékeléseid mellett. Legalább egy betűt vagy számot tartalmazzon.',
    );
  });

  it('egyéb hibánál (pl. hálózat) riasztást mutat', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const { user } = renderRoute('/register');

    await fillAndSubmit(user, valid);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A regisztráció nem sikerült. A szerver nem érhető el. Ellenőrizd a kapcsolatot, és próbáld újra.',
    );
  });

  it('sikeres regisztráció után bejelentkezve a kezdőlapra kerül, és bejelenti – a fókusz áthelyezése után', async () => {
    const fetchMock = stubFetch(userResponse(testUser, 201), ...galleryResponses());
    const { user, router } = renderRoute('/register');
    const focusWhenAnnounced = focusAtFirstAnnouncement();

    await fillAndSubmit(user, { ...valid, name: '  Kiss Anna ', email: ' anna@pelda.hu' });

    const heading = await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(router.state.location.pathname).toBe('/');
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'KA – fiókmenü' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Sikeres regisztráció – bejelentkeztél, Kiss Anna.',
      ),
    );
    expect(focusWhenAnnounced()).toBe(heading);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      displayName: 'Kiss Anna',
      email: 'anna@pelda.hu',
      password: 'hosszu-jelszo',
    });
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('ha a válasz előtt elhagyja az oldalt, a sikerüzenet később, egy másik oldalon sem hangzik el', async () => {
    const registerResponse = new DeferredResponse();
    stubFetch(registerResponse, ...galleryResponses());
    const { user, router } = renderRoute('/register');
    const banner = screen.getByRole('banner');
    await fillAndSubmit(user, valid);

    await user.click(within(banner).getByRole('link', { name: 'Galéria' }));
    await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    registerResponse.resolve(userResponse(testUser, 201));
    await within(banner).findByRole('button', { name: 'KA – fiókmenü' });
    await act(() => router.navigate('/nincs-ilyen'));

    await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });
    expect(screen.getByRole('status')).not.toHaveTextContent('Sikeres regisztráció');
  });

  it('a belépésre mutató hivatkozás a belépő oldalra visz', async () => {
    const { user } = renderRoute('/register');

    await user.click(await screen.findByRole('link', { name: 'Lépj be' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Belépés' })).toBeInTheDocument();
  });

  it('a hibaállapotban sincs akadálymentességi hiba (axe)', async () => {
    const { user, container } = renderRoute('/register');

    await user.click(await screen.findByRole('button', { name: 'Regisztráció' }));

    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});
