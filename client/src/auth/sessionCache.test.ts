// A munkamenet a gyorsítótárban: a beírás megszakítja a még futó ellenőrzést (a késve érkező válasza
// nem írhatja felül), és ha a munkamenet gazdája megváltozik, az előző felhasználó többi adata nem
// marad meg – a látható lekérdezés már az új munkamenettel töltődik újra.
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { authQueryKey, type AuthUser } from '../api/auth.api';
import { testAdmin, testUser } from '../test/users';
import { PUBLIC_QUERY_META, resetUserDataOnSessionChange, setSessionUser } from './sessionCache';

const ordersKey = ['rendelesek'];

function watchedClient() {
  const client = new QueryClient();
  resetUserDataOnSessionChange(client);
  return client;
}

describe('setSessionUser', () => {
  it('a munkamenetet a gyorsítótárba írja', () => {
    const client = new QueryClient();

    setSessionUser(client, testUser);

    expect(client.getQueryData(authQueryKey)).toEqual(testUser);
  });

  it('a még futó munkamenet-ellenőrzés késve érkező válasza nem írja felül (pl. belépés közben)', async () => {
    const client = new QueryClient();
    let answer!: (user: AuthUser | null) => void;
    const check = client.fetchQuery({
      queryKey: authQueryKey,
      queryFn: () => new Promise<AuthUser | null>((resolve) => (answer = resolve)),
    });

    setSessionUser(client, testUser);
    answer(null);
    await check.catch(() => undefined);

    expect(client.getQueryData(authQueryKey)).toEqual(testUser);
  });
});

describe('resetUserDataOnSessionChange', () => {
  it('kijelentkezéskor (felhasználó → nincs) a többi lekérdezés adata törlődik', () => {
    const client = watchedClient();
    client.setQueryData(authQueryKey, testUser);
    client.setQueryData(ordersKey, ['Kiss Anna rendelése']);

    client.setQueryData(authQueryKey, null);

    expect(client.getQueryData(ordersKey)).toBeUndefined();
  });

  it('belépéskor, illetve ha az ellenőrzés másik felhasználót talál (másik lapon váltott), szintén', async () => {
    const client = watchedClient();
    client.setQueryData(authQueryKey, null);
    client.setQueryData(ordersKey, ['vendégként betöltött adat']);
    client.setQueryData(authQueryKey, testUser);
    expect(client.getQueryData(ordersKey)).toBeUndefined();

    client.setQueryData(ordersKey, ['Kiss Anna rendelése']);
    await client.fetchQuery({ queryKey: authQueryKey, queryFn: () => Promise.resolve(testAdmin) });

    expect(client.getQueryData(ordersKey)).toBeUndefined();
  });

  it('az első ellenőrzés eredménye és ugyanannak a felhasználónak a frissítése nem törli', async () => {
    const client = watchedClient();
    client.setQueryData(ordersKey, ['Kiss Anna rendelése']);

    await client.fetchQuery({ queryKey: authQueryKey, queryFn: () => Promise.resolve(testUser) });
    client.setQueryData(authQueryKey, { ...testUser, displayName: 'Kiss Anna Mária' });

    expect(client.getQueryData(ordersKey)).toEqual(['Kiss Anna rendelése']);
  });

  it('ha még egyetlen ellenőrzés sem sikerült, a belépés (kézi beírás) is váltásnak számít', () => {
    const client = watchedClient();
    client.setQueryData(ordersKey, ['vendégként betöltött adat']);

    setSessionUser(client, testUser);

    expect(client.getQueryData(ordersKey)).toBeUndefined();
  });

  it('a nyilvános (munkamenettől független) lekérdezés – pl. a galéria listája – megmarad', async () => {
    const client = watchedClient();
    const galleryKey = ['photos', 'list', '?pageSize=24'];
    client.setQueryData(authQueryKey, testUser);
    await client.prefetchQuery({
      queryKey: galleryKey,
      queryFn: () => ['mindenkinek ugyanaz'],
      meta: PUBLIC_QUERY_META,
    });
    client.setQueryData(ordersKey, ['Kiss Anna rendelése']);

    client.setQueryData(authQueryKey, null);

    expect(client.getQueryData(galleryKey)).toEqual(['mindenkinek ugyanaz']);
    expect(client.getQueryData(ordersKey)).toBeUndefined();
  });

  it('más, „auth” alá tartozó lekérdezés frissülése nem munkamenet-váltás', () => {
    const client = watchedClient();
    client.setQueryData(authQueryKey, testUser);
    client.setQueryData(ordersKey, ['Kiss Anna rendelése']);

    client.setQueryData(['auth', 'eszkozok'], ['másik böngésző']);

    expect(client.getQueryData(ordersKey)).toEqual(['Kiss Anna rendelése']);
  });

  it('a látható (figyelt) lekérdezést az új munkamenettel újratölti', async () => {
    const client = watchedClient();
    client.setQueryData(authQueryKey, testUser);
    const queryFn = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('Kiss Anna profilja')
      .mockResolvedValueOnce('vendégnézet');
    const observer = new QueryObserver(client, { queryKey: ['profil'], queryFn });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(client.getQueryData(['profil'])).toBe('Kiss Anna profilja'));

    client.setQueryData(authQueryKey, null);

    await vi.waitFor(() => expect(client.getQueryData(['profil'])).toBe('vendégnézet'));
    expect(observer.getCurrentResult().data).toBe('vendégnézet');
    unsubscribe();
  });
});
