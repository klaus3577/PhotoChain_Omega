// A munkamenet állapota (AuthProvider): ablakváltáskor – amikor a lap újra előtérbe kerül – mindig újra
// ellenőrzi a bejelentkezést, így a másik lapon történt kijelentkezést is észreveszi.
import { focusManager } from '@tanstack/react-query';
import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { requestedUrls, stubFetch } from '../test/fetch';
import { galleryResponses } from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testUser } from '../test/users';

afterEach(() => {
  focusManager.setFocused(undefined);
});

describe('AuthProvider', () => {
  it('ablakváltáskor mindig újra ellenőrzi a munkamenetet: a másik lapon történt kijelentkezést észreveszi', async () => {
    const fetchMock = stubFetch(
      ...galleryResponses(),
      errorResponse(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges'),
    );
    renderRoute('/', undefined, { session: testUser });
    await screen.findByText('Még nincs hitelesített kép');

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    const banner = screen.getByRole('banner');
    expect(await within(banner).findByRole('link', { name: 'Belépés' })).toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: 'KA – fiókmenü' })).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/auth/me');
    // A galéria nyilvános adat: a felhasználóváltás nem tölti újra (nincs fölösleges kérés)
    expect(screen.getByText('Még nincs hitelesített kép')).toBeInTheDocument();
    expect(requestedUrls(fetchMock)).toHaveLength(3);
  });
});
