// A munkamenet a TanStack Query gyorsítótárában (authQueryKey). Két szabály:
// 1. A beírás (belépés, regisztráció, kijelentkezés, megszűnt munkamenet) előbb megszakítja a még futó
//    ellenőrzést (GET /api/auth/me): a késve érkező válasza – amely a beírás előtti állapotot tükrözi –
//    különben felülírná az újat (pl. kijelentkezés után visszahozná a felhasználót).
// 2. Ha a munkamenet gazdája megváltozik, a többi lekérdezés az előző felhasználó (vagy a vendég)
//    adatait tartja: alapállapotba kerülnek – a látható oldalé az új munkamenettel azonnal újratöltődik,
//    a többi a következő megnyitáskor. Így közös gépen a következő felhasználó nem látja az előző
//    adatait, és a másik lapon történt váltást (az ablakváltáskori ellenőrzés észleli) is követi. A
//    nyilvános, mindenkinek azonos adat (PUBLIC_QUERY_META – pl. a galéria) kivétel: az marad.
// A törlés helyett alaphelyzet (resetQueries): a látható lekérdezés így újratöltődik – a törölt
// (removeQueries) lekérdezést figyelő oldal a régi adaton, töltés közben pedig „töltődik” állapotban
// ragadna.
// Forrás: TanStack Query – Optimistic Updates (cancelQueries a kézi beírás előtt),
// https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates;
// TanStack Query – QueryClient: resetQueries, QueryCache: subscribe,
// https://tanstack.com/query/latest/docs/reference/QueryClient (adaptálva)
import { hashKey, type Query, type QueryClient } from '@tanstack/react-query';

import { authQueryKey, type AuthUser } from '../api/auth.api';

/** A munkamenet lekérdezése (pontosan az authQueryKey) – csak ennek a változása felhasználóváltás. */
const SESSION_QUERY_HASH = hashKey(authQueryKey);
/** Az „auth” alá tartozó lekérdezések nem felhasználói adatok – a váltáskor sem törlődnek. */
const isAuthQuery = (queryKey: readonly unknown[]) => queryKey[0] === authQueryKey[0];

/**
 * A nyilvános, munkamenettől független lekérdezések jelölése (meta): mindenkinek ugyanazt adják (pl.
 * a galéria listája, a kategóriák – L20), ezért felhasználóváltáskor sem kell újratölteni őket.
 */
export const PUBLIC_QUERY_META = Object.freeze({ publicData: true });

const isPublicQuery = (query: Query) => query.meta?.publicData === true;

/**
 * A munkamenet beírása a gyorsítótárba. A futó ellenőrzés megszakítása azonnal érvényes (a késve
 * érkező válasz már nem íródik be), ezért nem kell rá várni.
 */
export function setSessionUser(client: QueryClient, user: AuthUser | null): void {
  void client.cancelQueries({ queryKey: authQueryKey });
  client.setQueryData(authQueryKey, user);
}

/**
 * Felhasználóváltáskor (belépés, kijelentkezés, megszűnt munkamenet, másik felhasználó a másik lapon)
 * a többi lekérdezést alapállapotba teszi. Az első ellenőrzés eredménye nem váltás (addig minden
 * kérés ugyanazzal a sütivel ment); a kézi beírás (belépés, kijelentkezés) viszont akkor is az, ha
 * még egyetlen ellenőrzés sem sikerült – a süti ilyenkor megváltozott. A visszatérési érték leiratkozik.
 */
export function resetUserDataOnSessionChange(client: QueryClient): () => void {
  /** A munkamenet gazdája: felhasználó-azonosító, null (vendég), undefined (még nem ismert) */
  let owner: string | null | undefined;
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    if (event.query.queryHash !== SESSION_QUERY_HASH) return;
    const next = (event.query.state.data as AuthUser | null)?.id ?? null;
    const changed = owner === undefined ? event.action.manual === true : next !== owner;
    owner = next;
    if (changed) {
      void client.resetQueries({
        predicate: (query) => !isAuthQuery(query.queryKey) && !isPublicQuery(query),
      });
    }
  });
}
