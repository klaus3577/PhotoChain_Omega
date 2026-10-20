// Egy lekérdezés megjelenítendő állapota. A már betöltött adat egy sikertelen háttérfrissítés (pl.
// ablakváltáskor) után is megmarad – nem lesz belőle hibaoldal. A hibás első betöltés utáni
// újrapróbáláskor a TanStack Query a lekérdezést ideiglenesen „pending” állapotba teszi, a hibát pedig
// törli; a hibanézet (és benne a fókuszban lévő Újrapróbálás gomb) ilyenkor sem tűnhet el – az
// errorUpdateCount ezt is megmutatja (mint az AuthProvider-ben, L19).
// Forrás: TanStack Query – useQuery (errorUpdateCount),
// https://tanstack.com/query/latest/docs/framework/react/reference/useQuery (adaptálva)

/** loading: első betöltés; ready: van adat; failed: hiba; retrying: hiba utáni újrapróbálás */
export type LoadState = 'loading' | 'ready' | 'failed' | 'retrying';

interface QueryState {
  data: unknown;
  error: unknown;
  errorUpdateCount: number;
}

export function loadStateOf({ data, error, errorUpdateCount }: QueryState): LoadState {
  if (data !== undefined) return 'ready';
  if (error) return 'failed';
  return errorUpdateCount > 0 ? 'retrying' : 'loading';
}

/** A hibanézet látszik: hiba, vagy hiba utáni újrapróbálás. */
export const showsLoadError = (state: LoadState): state is 'failed' | 'retrying' =>
  state === 'failed' || state === 'retrying';
