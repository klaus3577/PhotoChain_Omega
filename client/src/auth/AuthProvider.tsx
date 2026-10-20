// A munkamenet (AuthContext): induláskor lekérdezi a bejelentkezett felhasználót (GET /api/auth/me),
// és az egész alkalmazásnak megadja az állapotot. Az adat a TanStack Query gyorsítótárában él
// (authQueryKey): a belépés, a regisztráció és a kijelentkezés oda írja az új állapotot, a megszűnt
// munkamenetet (UNAUTHORIZED, ACCOUNT_BLOCKED) a QueryClient állítja vissza – így egyetlen forrás van.
// Ablakváltáskor (amikor a lap újra előtérbe kerül) mindig újra ellenőrzi – nem csak 30 s után –, így a
// másik lapon történt ki- vagy bejelentkezést is észreveszi. Ha viszont az ellenőrzés nem sikerült, nem
// próbálja újra magától (mint a kezdőlap állapotkártyája): a hibaüzenet ne ugorjon fel újra, a
// felhasználó az Újrapróbálás gombbal dönt.
// Forrás: React – createContext, use, https://react.dev/reference/react/createContext;
// TanStack Query – Updates from Mutation Responses, https://tanstack.com/query/latest/docs/framework/react/guides/updates-from-mutation-responses;
// TanStack Query – useQuery (refetchOnWindowFocus: 'always'), https://tanstack.com/query/latest/docs/framework/react/reference/useQuery (adaptálva)
import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';

import { authQueryKey, fetchSessionUser } from '../api/auth.api';
import { AuthContext, type AuthState } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, error, errorUpdateCount, errorUpdatedAt, refetch } = useQuery({
    queryKey: authQueryKey,
    queryFn: ({ signal }) => fetchSessionUser(signal),
    // Mindig újra ellenőriz – kivéve, ha még egyszer sem sikerült (hibaállapot)
    refetchOnWindowFocus: ({ state }) =>
      state.data === undefined && state.errorUpdateCount > 0 ? false : 'always',
  });

  const state = useMemo<AuthState>(() => {
    if (data !== undefined)
      return data ? { status: 'authenticated', user: data } : { status: 'anonymous' };
    const retry = () => void refetch();
    if (error) return { status: 'error', retrying: false, error, failedAt: errorUpdatedAt, retry };
    // Hibás első ellenőrzés utáni újrapróbáláskor a lekérdezés ideiglenesen „pending” (a hiba törlődik)
    if (errorUpdateCount > 0) return { status: 'error', retrying: true, retry };
    return { status: 'loading' };
  }, [data, error, errorUpdateCount, errorUpdatedAt, refetch]);

  return <AuthContext value={state}>{children}</AuthContext>;
}
