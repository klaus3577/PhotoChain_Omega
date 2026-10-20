// A layout tesztjei: tájékozódási pontok (fejléc, navigáció, fő tartalom, lábléc), ugrólink, az
// aktuális oldal jelölése, és az útvonalváltás akadálymentes kezelése (WCAG 2.4.1, 2.4.2, 2.4.3).
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createRoutes } from '../../routes/router';
import { axeViolations } from '../../test/axe';
import { DeferredResponse, forPath, jsonResponse, stubFetch } from '../../test/fetch';
import { galleryResponses } from '../../test/photos';
import { renderRoute } from '../../test/renderRoute';

/** A kezdőlap (galéria) két kérésének válasza: üres galéria. */
const stubGallery = () => stubFetch(...galleryResponses());

describe('Layout', () => {
  it('ugrólink, fejléc, fő navigáció, fő tartalom és lábléc', async () => {
    stubGallery();
    renderRoute('/');

    expect(screen.getByRole('link', { name: 'Ugrás a tartalomra' })).toHaveAttribute(
      'href',
      '#tartalom',
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Fő navigáció' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'tartalom');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('az ugrólink a fő tartalomra viszi a fókuszt; a main csak addig fókuszálható, amíg ott a fókusz', async () => {
    stubGallery();
    const { user } = renderRoute('/');
    await screen.findByText('Még nincs hitelesített kép');
    const main = screen.getByRole('main');
    expect(main).not.toHaveAttribute('tabindex');

    await user.click(screen.getByRole('link', { name: 'Ugrás a tartalomra' }));

    expect(main).toHaveFocus();
    await user.tab();
    expect(main).not.toHaveFocus();
    expect(main).not.toHaveAttribute('tabindex');
  });

  it('a logó a kezdőlapra visz, a navigáció jelöli az aktuális oldalt (aria-current)', async () => {
    stubGallery();
    renderRoute('/');

    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'PhotoChain – kezdőlap' })).toHaveAttribute(
      'href',
      '/',
    );
    const nav = screen.getByRole('navigation', { name: 'Fő navigáció' });
    expect(within(nav).getByRole('link', { name: 'Galéria' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await screen.findByText('Még nincs hitelesített kép');
  });

  it('a munkamenet ellenőrzése alatt a fiókrész helyét a belépési hivatkozások rejtett mása foglalja (nem ugrik az elrendezés – L26); a válasz után a valódi hivatkozások látszanak', async () => {
    const check = new DeferredResponse();
    stubFetch(forPath('/api/auth/me', check), ...galleryResponses());
    renderRoute('/', undefined, { session: 'server' });
    await screen.findByText('Még nincs hitelesített kép');
    const banner = screen.getByRole('banner');

    expect(within(banner).queryByRole('link', { name: 'Belépés' })).toBeNull();
    const placeholder = within(banner).getByText('Belépés').closest('[aria-hidden="true"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveClass('invisible');

    // A vendég ellenőrzésének válasza (L26): 200, user: null
    check.resolve(jsonResponse(200, { data: { user: null } }));

    expect(await within(banner).findByRole('link', { name: 'Belépés' })).toBeInTheDocument();
    expect(
      within(banner).queryByText('Belépés', { selector: '[aria-hidden="true"] *' }),
    ).toBeNull();
  });

  it('más oldalon a Galéria nem aktuális', async () => {
    renderRoute('/nincs-ilyen');

    await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });
    const nav = screen.getByRole('navigation', { name: 'Fő navigáció' });
    expect(within(nav).getByRole('link', { name: 'Galéria' })).not.toHaveAttribute('aria-current');
  });

  it('oda-vissza navigáláskor (a kiinduló oldalra visszatérve) is az új oldal címére kerül a fókusz', async () => {
    stubGallery();
    const { router } = renderRoute('/');
    await screen.findByText('Még nincs hitelesített kép');

    await act(() => router.navigate('/nincs-ilyen'));
    const notFound = await screen.findByRole('heading', {
      level: 1,
      name: 'Az oldal nem található',
    });
    await waitFor(() => expect(notFound).toHaveFocus());
    await act(() => router.navigate('/'));

    const home = await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(home).toHaveFocus());
  });

  it('az első betöltéskor nem mozdítja a fókuszt', async () => {
    stubGallery();
    renderRoute('/');

    await screen.findByText('Még nincs hitelesített kép');
    expect(document.body).toHaveFocus();
  });

  it('oldalváltáskor a fókusz az új oldal címére kerül, és a böngészőfül címe frissül', async () => {
    stubGallery();
    const { user } = renderRoute('/nincs-ilyen');
    await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });
    expect(document.title).toBe('Az oldal nem található · PhotoChain');

    await user.click(screen.getByRole('link', { name: 'Vissza a kezdőlapra' }));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(document.title).toBe('Galéria · PhotoChain');
  });

  it('a fókusz görgetés nélkül kerül a címre (a ScrollRestoration helyzete – pl. vissza-navigációnál – megmarad)', async () => {
    stubGallery();
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    const { user } = renderRoute('/nincs-ilyen');
    await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });

    await user.click(screen.getByRole('link', { name: 'Vissza a kezdőlapra' }));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    await waitFor(() => expect(heading).toHaveFocus());
    const call = focusSpy.mock.contexts.lastIndexOf(heading);
    expect(focusSpy.mock.calls[call]).toEqual([{ preventScroll: true }]);
  });

  it('ha az új oldalnak nincs h1-e, a fókusz a fő tartalomra kerül', async () => {
    stubGallery();
    const untitled = { path: 'cim-nelkul', Component: () => <p>Cím nélküli oldal</p> };
    const { router } = renderRoute('/', createRoutes([untitled]));
    await screen.findByText('Még nincs hitelesített kép');

    await act(() => router.navigate('/cim-nelkul'));

    await screen.findByText('Cím nélküli oldal');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('nincs akadálymentességi hiba (axe)', async () => {
    stubGallery();
    const { container } = renderRoute('/');
    await screen.findByText('Még nincs hitelesített kép');

    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});
