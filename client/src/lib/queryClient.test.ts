// A lekérdezések újrapróbálási szabálya: csak az átmeneti hibát (hálózat, szerverhiba) érdemes
// megismételni – a kliens hibáját (4xx) és a korlátozást (429) nem.
import { MutationObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { authQueryKey } from '../api/auth.api';
import { ApiError } from '../api/http';
import { testUser } from '../test/users';
import { createQueryClient, MAX_RETRIES, retryDelay, shouldRetry } from './queryClient';

describe('shouldRetry', () => {
  it('a kliens hibáját (4xx) nem próbálja újra – ugyanaz a kérés ugyanazt adná', () => {
    for (const status of [400, 401, 403, 404, 409]) {
      expect(shouldRetry(0, new ApiError(status, 'X', 'hiba'))).toBe(false);
    }
  });

  it('a korlátozást (429) sem – a szerver kérése, hogy várjunk', () => {
    expect(shouldRetry(0, new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés'))).toBe(false);
  });

  it('hálózati és szerverhibánál legfeljebb kétszer próbál újra', () => {
    expect(MAX_RETRIES).toBe(2);
    for (const error of [
      new ApiError(0, 'NETWORK_ERROR', 'x'),
      new ApiError(500, 'INTERNAL_ERROR', 'x'),
      new ApiError(503, 'SERVER_BUSY', 'x'),
    ]) {
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(1, error)).toBe(true);
      expect(shouldRetry(2, error)).toBe(false);
    }
  });

  it('ismeretlen hibát nem próbál újra (programhiba, nem átmeneti)', () => {
    expect(shouldRetry(0, new Error('x'))).toBe(false);
  });
});

describe('retryDelay', () => {
  it('ha a szerver megadta (Retry-After), annyit vár – legfeljebb 30 másodpercet', () => {
    const busy = (seconds: number) =>
      new ApiError(503, 'SERVER_BUSY', 'x', { retryAfterSeconds: seconds });

    expect(retryDelay(0, busy(5))).toBe(5000);
    expect(retryDelay(1, busy(120))).toBe(30_000);
  });

  it('egyébként exponenciálisan növekvő várakozás (1 s, 2 s, 4 s …, legfeljebb 30 s)', () => {
    const error = new ApiError(0, 'NETWORK_ERROR', 'x');

    expect([0, 1, 2, 10].map((failureCount) => retryDelay(failureCount, error))).toEqual([
      1000, 2000, 4000, 30_000,
    ]);
  });
});

describe('createQueryClient', () => {
  it('a lekérdezések alapbeállítása ezeket a szabályokat használja', () => {
    const queries = createQueryClient().getDefaultOptions().queries;

    expect(queries?.retry).toBe(shouldRetry);
    expect(queries?.retryDelay).toBe(retryDelay);
  });

  it('lejárt vagy hiányzó munkamenet (UNAUTHORIZED) bármely kérésnél: a felület kijelentkezett állapotba kerül', async () => {
    const client = createQueryClient();
    client.setQueryData(authQueryKey, testUser);
    const unauthorized = () =>
      Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges'));

    await client.fetchQuery({ queryKey: ['vedett'], queryFn: unauthorized }).catch(() => undefined);
    expect(client.getQueryData(authQueryKey)).toBeNull();

    client.setQueryData(authQueryKey, testUser);
    await new MutationObserver(client, { mutationFn: unauthorized })
      .mutate()
      .catch(() => undefined);
    expect(client.getQueryData(authQueryKey)).toBeNull();
  });

  it('a letiltott fiók (ACCOUNT_BLOCKED) bármely kérésnél szintén kijelentkezett állapotot jelent', async () => {
    const client = createQueryClient();
    client.setQueryData(authQueryKey, testUser);

    await client
      .fetchQuery({
        queryKey: ['vedett'],
        queryFn: () =>
          Promise.reject(
            new ApiError(403, 'ACCOUNT_BLOCKED', 'A fiókot az adminisztrátor letiltotta'),
          ),
      })
      .catch(() => undefined);

    expect(client.getQueryData(authQueryKey)).toBeNull();
  });

  it('a megszűnt munkamenettel az előző felhasználó többi adata is törlődik', async () => {
    const client = createQueryClient();
    client.setQueryData(authQueryKey, testUser);
    client.setQueryData(['rendelesek'], ['Kiss Anna rendelése']);

    await client
      .fetchQuery({
        queryKey: ['vedett'],
        queryFn: () => Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges')),
      })
      .catch(() => undefined);

    expect(client.getQueryData(['rendelesek'])).toBeUndefined();
  });

  it('a hibás belépés (INVALID_CREDENTIALS) és más hiba nem érinti a munkamenetet', async () => {
    const client = createQueryClient();
    client.setQueryData(authQueryKey, testUser);

    await new MutationObserver(client, {
      mutationFn: () =>
        Promise.reject(new ApiError(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó')),
    })
      .mutate()
      .catch(() => undefined);
    await client
      .fetchQuery({
        queryKey: ['x'],
        queryFn: () => Promise.reject(new ApiError(403, 'FORBIDDEN', 'Nincs jog')),
      })
      .catch(() => undefined);

    expect(client.getQueryData(authQueryKey)).toEqual(testUser);
  });

  it('a böngésző offline jelzése nem szünetelteti a kéréseket (az API azonos originen van)', () => {
    const defaults = createQueryClient().getDefaultOptions();

    expect(defaults.queries?.networkMode).toBe('always');
    expect(defaults.mutations?.networkMode).toBe('always');
  });
});
