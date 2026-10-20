// Az alkalmazás útvonalai (React Router, adat-mód). A layout minden oldalt keretez; a belső,
// útvonal nélküli ág ErrorBoundary-je miatt egy oldal hibájakor a fejléc és a lábléc megmarad, a
// gyökérszintű (RootErrorPage, saját main-nel) csak a layout saját hibáját fogja meg. A fejlesztői komponenslap lustán töltődik, és
// csak fejlesztői módban része a fának: a produktív buildben az import.meta.env.DEV hamis, így a Vite
// a teljes ágat (a dinamikus importtal együtt) kihagyja.
// Forrás: React Router – Route Object (Component, lazy), https://reactrouter.com/start/data/route-object;
// React Router – Error Boundaries, https://reactrouter.com/how-to/error-boundary;
// Vite – Env variables and modes, https://vite.dev/guide/env-and-mode (adaptálva)
import type { RouteObject } from 'react-router';

import { AdminRoute, ProtectedRoute } from '../auth/ProtectedRoute';
import { Layout } from '../components/layout/Layout';
import { CheckoutCancelPage } from '../pages/CheckoutCancelPage';
import { CheckoutSuccessPage } from '../pages/CheckoutSuccessPage';
import { DashboardPage } from '../pages/DashboardPage';
import { GalleryPage } from '../pages/GalleryPage';
import { LoadingPage } from '../pages/LoadingPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PhotoDetailPage } from '../pages/PhotoDetailPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RegisterPage } from '../pages/RegisterPage';
import { RootErrorPage, RouteErrorPage } from '../pages/RouteErrorPage';
import { UploadPage } from '../pages/UploadPage';
import { VerifyPage } from '../pages/VerifyPage';

// A védett útvonalak próbaoldalai (L19): a valódi védett oldalak (L21–L25) ugyanígy, a ProtectedRoute
// vagy az AdminRoute alá kerülnek
export const DEV_ROUTES: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '_komponensek',
        lazy: async () => ({
          Component: (await import('../pages/dev/ComponentsPage')).ComponentsPage,
        }),
      },
      {
        Component: ProtectedRoute,
        children: [
          {
            path: '_vedett',
            lazy: async () => ({
              Component: (await import('../pages/dev/SessionDemoPages')).ProtectedDemoPage,
            }),
          },
        ],
      },
      {
        Component: AdminRoute,
        children: [
          {
            path: '_admin',
            lazy: async () => ({
              Component: (await import('../pages/dev/SessionDemoPages')).AdminDemoPage,
            }),
          },
        ],
      },
    ]
  : [];

export function createRoutes(extraRoutes: RouteObject[] = DEV_ROUTES): RouteObject[] {
  return [
    {
      path: '/',
      Component: Layout,
      ErrorBoundary: RootErrorPage,
      // Lusta útvonal közvetlen megnyitásakor ez látszik, amíg a kód betöltődik
      HydrateFallback: LoadingPage,
      children: [
        {
          ErrorBoundary: RouteErrorPage,
          children: [
            // A kezdőlap a galéria (L20). Se loadere, se lusta betöltése nincs: a kijelentkezés erre
            // az oldalra lép, és azonnal megjelenik (useAuthActions – flushSync)
            { index: true, Component: GalleryPage },
            { path: 'photos/:id', Component: PhotoDetailPage },
            // A fotós publikus profilja (L23) – bejelentkezés nélkül is
            { path: 'users/:id', Component: ProfilePage },
            // A nyilvános hitelesség-ellenőrző (L24) – bejelentkezés nélkül is
            { path: 'verify', Component: VerifyPage },
            { path: 'login', Component: LoginPage },
            { path: 'register', Component: RegisterPage },
            // Védett oldalak (L21–L22): bejelentkezés nélkül a belépésre visznek, és utána ide térnek
            // vissza – a Stripe visszatérési oldalai is (a fizetés után lejárt munkamenetnél a belépés
            // után a rendelés állapota megjelenik)
            {
              Component: ProtectedRoute,
              children: [
                { path: 'upload', Component: UploadPage },
                { path: 'dashboard', Component: DashboardPage },
                { path: 'checkout/success', Component: CheckoutSuccessPage },
                { path: 'checkout/cancel', Component: CheckoutCancelPage },
              ],
            },
            // Az adminfelület (L25): csak adminisztrátornak; a bejelentkezett, nem admin felhasználó
            // „nincs jogosultság” oldalt kap. Lustán töltődik: a kódja csak az adminnak kell
            {
              Component: AdminRoute,
              children: [
                {
                  path: 'admin',
                  lazy: async () => ({ Component: (await import('../pages/AdminPage')).AdminPage }),
                },
              ],
            },
            ...extraRoutes,
            { path: '*', Component: NotFoundPage },
          ],
        },
      ],
    },
  ];
}
