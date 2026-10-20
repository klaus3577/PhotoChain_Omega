// A TanStack Query kliense (L18). Újrapróbálás csak átmeneti hibánál: hálózati hiba (0) és szerverhiba
// (5xx), legfeljebb kétszer. A kliens hibája (4xx) újra küldve is ugyanaz maradna, a korlátozásnál
// (429) pedig a szerver éppen azt kéri, hogy várjunk – ezeket nem ismétli. Ha a szerver megmondja,
// mennyit várjunk (Retry-After, pl. túlterhelt szervernél), annyit vár; különben exponenciálisan.
// Forrás: TanStack Query – Query Retries, https://tanstack.com/query/latest/docs/framework/react/guides/query-retries;
// MDN – Retry-After, https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After (adaptálva)
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { isSessionEndError } from '../api/auth.api';
import { ApiError } from '../api/http';
import { resetUserDataOnSessionChange, setSessionUser } from '../auth/sessionCache';

export const MAX_RETRIES = 2;

/** A friss adat ennyi ideig nem kérődik le újra (pl. ablakváltáskor). */
const STALE_TIME_MS = 30_000;

const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30_000;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const transient = error.status === 0 || error.status >= 500;
  return transient && failureCount < MAX_RETRIES;
}

/** Várakozás az újrapróbálás előtt: a szerver Retry-After értéke, különben 1 s, 2 s, 4 s … (max. 30 s). */
export function retryDelay(failureCount: number, error: unknown): number {
  const requested =
    error instanceof ApiError && error.retryAfterSeconds !== undefined
      ? error.retryAfterSeconds * 1000
      : BASE_RETRY_DELAY_MS * 2 ** failureCount;
  return Math.min(requested, MAX_RETRY_DELAY_MS);
}

// A böngésző offline jelzése (pl. leszakadó Wi-Fi) nem szünetelteti a kéréseket: az API azonos
// originen van (fejlesztéskor a localhost akkor is elérhető), valódi kapcsolathiánynál pedig a kérés
// azonnal NETWORK_ERROR-ral, érthető üzenettel bukik – nem marad végtelen „folyamatban” állapot.
// Ha bármely kérésre a szerver azt feleli, hogy nincs (vagy lejárt) a munkamenet (UNAUTHORIZED), vagy
// a fiókot közben letiltották (ACCOUNT_BLOCKED), a felület kijelentkezett állapotba kerül – a védett
// oldal ekkor a belépésre irányít. A hibás belépés (INVALID_CREDENTIALS) és a jogosultsághiány
// (FORBIDDEN) nem érinti a munkamenetet. Felhasználóváltáskor az előző felhasználó többi adata
// alapállapotba kerül (auth/sessionCache.ts).
// Forrás: TanStack Query – Network Mode, https://tanstack.com/query/latest/docs/framework/react/guides/network-mode;
// Dorfmeister, D. (TkDodo): React Query Error Handling – globális onError a QueryCache-en,
// https://tkdodo.eu/blog/react-query-error-handling (adaptálva)
export function createQueryClient(): QueryClient {
  const endSessionOnError = (error: unknown) => {
    if (isSessionEndError(error)) setSessionUser(client, null);
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: endSessionOnError }),
    mutationCache: new MutationCache({ onError: endSessionOnError }),
    defaultOptions: {
      queries: { retry: shouldRetry, retryDelay, staleTime: STALE_TIME_MS, networkMode: 'always' },
      mutations: { networkMode: 'always' },
    },
  });
  resetUserDataOnSessionChange(client);
  return client;
}
