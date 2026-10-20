import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createRoutes } from '../routes/router';
import { axeViolations } from '../test/axe';
import { isClientSideNavigation } from '../test/links';
import { renderRoute } from '../test/renderRoute';
import { RootErrorPage } from './RouteErrorPage';

function Boom(): never {
  throw new Error('belső részlet: adatbázis-jelszó');
}

describe('RouteErrorPage', () => {
  it('ha egy oldal hibát dob, a hibaoldal a layouton belül jelenik meg, belső részletek nélkül', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderRoute('/hiba', createRoutes([{ path: 'hiba', Component: Boom }]));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Váratlan hiba történt' });
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vissza a kezdőlapra' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/adatbázis-jelszó/)).not.toBeInTheDocument();
    expect(document.title).toBe('Hiba · PhotoChain');
    // A hiba ugyanazon az oldalon is történhet (nincs útvonalváltás): a fókusz ekkor is a címre kerül
    expect(heading).toHaveFocus();
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('a „Vissza a kezdőlapra” teljes újratöltés: a hiba után ez a biztos helyreállás', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRoute('/hiba', createRoutes([{ path: 'hiba', Component: Boom }]));
    await screen.findByRole('heading', { level: 1, name: 'Váratlan hiba történt' });

    expect(isClientSideNavigation(screen.getByRole('link', { name: 'Vissza a kezdőlapra' }))).toBe(
      false,
    );
  });

  it('ha maga a layout hibás, a gyökérszintű hibaoldal fő tartalomként (main) jelenik meg', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderRoute('/', [
      { path: '/', Component: Boom, ErrorBoundary: RootErrorPage },
    ]);

    const heading = await screen.findByRole('heading', { level: 1, name: 'Váratlan hiba történt' });
    expect(screen.getByRole('main')).toContainElement(heading);
    expect(heading).toHaveFocus();
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});
