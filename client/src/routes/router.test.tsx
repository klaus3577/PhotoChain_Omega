// Az útvonalak: a fejlesztői komponenslap csak fejlesztői módban érhető el (a produktív buildből a
// Vite a teljes ágat kihagyja), és akadálymentességi hiba nélkül mutatja be az alapkomponenseket.
import { screen } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { axeViolations } from '../test/axe';
import { renderRoute } from '../test/renderRoute';
import { createRoutes, DEV_ROUTES } from './router';

/** Az útvonalfa összes (útvonallal rendelkező) útvonala, a beágyazottakkal együtt. */
const pathsOf = (routes: RouteObject[]): string[] =>
  routes.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...pathsOf(route.children ?? []),
  ]);

describe('útvonalak', () => {
  it('fejlesztői módban (a tesztben is) van komponenslap, védett és adminpróba-oldal', () => {
    expect(pathsOf(DEV_ROUTES)).toEqual(['_komponensek', '_vedett', '_admin']);
  });

  it('a galéria, az adatlap, a fotósprofil, az ellenőrzés, a belépés, a regisztráció, a feltöltés, a vezérlőpult, a fizetés és az admin oldalai nem fejlesztői útvonalak (a produktív buildben is megvannak)', () => {
    expect(pathsOf(createRoutes([]))).toEqual([
      '/',
      'photos/:id',
      'users/:id',
      'verify',
      'login',
      'register',
      'upload',
      'dashboard',
      'checkout/success',
      'checkout/cancel',
      'admin',
      '*',
    ]);
  });

  it.each([
    '/upload',
    '/dashboard',
    '/checkout/success?session_id=cs_test_x',
    '/checkout/cancel',
    '/admin',
  ])(
    '%s védett oldal: bejelentkezés nélkül a belépésre irányít, és megjegyzi a célt (L21, L22, L25)',
    async (path) => {
      const { router } = renderRoute(path, createRoutes([]));

      expect(await screen.findByRole('heading', { level: 1, name: 'Belépés' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      const [pathname, search = ''] = path.split('?');
      expect(router.state.location.state).toMatchObject({
        from: { pathname, search: search === '' ? '' : `?${search}` },
      });
    },
  );

  it('a fejlesztői útvonalak nélkül a komponenslap és a próbaoldalak címe 404', async () => {
    for (const path of ['/_komponensek', '/_vedett', '/_admin']) {
      const view = renderRoute(path, createRoutes([]));

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' }),
      ).toBeInTheDocument();
      view.unmount();
    }
  });

  it('a komponenslap minden alapkomponenst bemutat, akadálymentességi hiba nélkül', async () => {
    const { container } = renderRoute('/_komponensek');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'UI-alapkomponensek' }),
    ).toBeInTheDocument();
    for (const name of ['Gombok', 'Űrlapmező', 'Állapotjelvények', 'Visszajelzés']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('a lusta oldal közvetlen betöltésekor betöltésjelző látszik (HydrateFallback), figyelmeztetés nélkül', async () => {
    const warn = vi.spyOn(console, 'warn');
    renderRoute('/_komponensek');

    expect(screen.getByText('Betöltés…')).toBeInTheDocument();
    await screen.findByRole('heading', { level: 1, name: 'UI-alapkomponensek' });
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('HydrateFallback'));
  });

  it('a komponenslap bejelentőgombja az élő régióba ír', async () => {
    const { user } = renderRoute('/_komponensek');

    await user.click(await screen.findByRole('button', { name: 'Bejelentés az élő régióban' }));

    expect(screen.getByRole('status')).toHaveTextContent('Próbabejelentés az élő régióban.');
  });
});
