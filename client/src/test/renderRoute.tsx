// Egy útvonal megjelenítése a tesztben a valódi alkalmazással (App, útvonalak, layout), memóriabeli
// routerrel és az alkalmazás QueryClient-jével – egy eltéréssel: újrapróbálás nélkül, hogy a
// hibaállapot azonnal látszódjon. A munkamenet alapból „nincs bejelentkezve” (a gyorsítótárba írva,
// így nincs /auth/me kérés); megadható bejelentkezett felhasználó, vagy 'server' – ekkor az
// alkalmazás induláskor valóban lekérdezi (a tesztnek kell rá választ adnia).
// Forrás: React Router – createMemoryRouter; TanStack Query – Testing,
// https://tanstack.com/query/latest/docs/framework/react/guides/testing (adaptálva)
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type InitialEntry, type RouteObject } from 'react-router';

import { App } from '../App';
import { authQueryKey, type AuthUser } from '../api/auth.api';
import { createQueryClient } from '../lib/queryClient';
import { createRoutes } from '../routes/router';

interface RenderOptions {
  session?: AuthUser | null | 'server';
  /** Korábbi bejegyzések az előzményekben (a path elé) – pl. a Vissza gomb tesztjéhez */
  history?: InitialEntry[];
}

export function renderRoute(
  path: string,
  routes: RouteObject[] = createRoutes(),
  { session = null, history = [] }: RenderOptions = {},
) {
  const router = createMemoryRouter(routes, {
    initialEntries: [...history, path],
    initialIndex: history.length,
  });
  const queryClient = createQueryClient();
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  if (session !== 'server') queryClient.setQueryData(authQueryKey, session);
  const user = userEvent.setup();
  const view = render(<App router={router} queryClient={queryClient} />);
  return { ...view, router, user, queryClient };
}
