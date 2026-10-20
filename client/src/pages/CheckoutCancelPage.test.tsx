// A megszakított fizetés oldala (L22): a Stripe ide irányít vissza, ha a vásárló a fizetési oldalon
// a visszalépést választja (/checkout/cancel?photoId=…). Nem történt terhelés; a kép adatlapjára lehet
// visszatérni. Védett oldal (bejelentkezés nélkül a belépésre visz – router.test).
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axeViolations } from '../test/axe';
import { stubFetch } from '../test/fetch';
import { PHOTO_ID } from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { testUser } from '../test/users';

describe('CheckoutCancelPage', () => {
  it('„A fizetés megszakadt”: nem történt terhelés; vissza a képhez és a galériába; nincs kérés a szerverhez', async () => {
    const fetchMock = stubFetch();
    const { container } = renderRoute(`/checkout/cancel?photoId=${PHOTO_ID}`, undefined, {
      session: testUser,
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A fizetés megszakadt' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('A fizetés megszakadt · PhotoChain');
    expect(screen.getByText(/Nem történt terhelés/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vissza a képhez' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Galéria böngészése' })).toHaveAttribute('href', '/');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('hibás vagy hiányzó képazonosítóval csak a galéria hivatkozása marad', async () => {
    stubFetch();
    for (const search of ['', '?photoId=..', '?photoId=%3Cscript%3E']) {
      const view = renderRoute(`/checkout/cancel${search}`, undefined, { session: testUser });

      await screen.findByRole('heading', { level: 1, name: 'A fizetés megszakadt' });
      expect(screen.queryByRole('link', { name: 'Vissza a képhez' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Galéria böngészése' })).toHaveAttribute('href', '/');
      view.unmount();
    }
  });
});
