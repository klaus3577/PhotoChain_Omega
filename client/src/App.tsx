// Az alkalmazás gyökere: szerverállapot-gyorsítótár (TanStack Query), munkamenet (AuthProvider – L19)
// és útvonalak (React Router). A router és a QueryClient kívülről érkezik, így a teszt memóriabeli
// routerrel és újrapróbálás nélküli klienssel ugyanazt az alkalmazást rendereli.
// Forrás: TanStack Query – Quick Start, https://tanstack.com/query/latest/docs/framework/react/quick-start;
// React Router – Installation (data mode), https://reactrouter.com/start/data/installation (adaptálva)
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { RouterProviderProps } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { AuthProvider } from './auth/AuthProvider';

interface AppProps {
  router: RouterProviderProps['router'];
  queryClient: QueryClient;
}

export function App({ router, queryClient }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
