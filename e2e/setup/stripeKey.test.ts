// A Stripe-tesztkulcs ellenőrzésének egységtesztjei (node:test, a Node 24 TypeScript-támogatásával):
// a fizetés forgatókönyve csak akkor fut, ha a Stripe a kulcsot elfogadja.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkStripeKey, STRIPE_SKIP_REASONS } from './stripeKey.ts';

type FetchArgs = Parameters<typeof fetch>;

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: FetchArgs[] = [];
  const impl = (async (...args: FetchArgs) => {
    calls.push(args);
    return respond();
  }) as typeof fetch;
  return { impl, calls };
}

describe('checkStripeKey', () => {
  it('kulcs nélkül „missing”, és nem hívja a Stripe-ot', async () => {
    const { impl, calls } = fakeFetch(() => new Response('{}'));
    assert.equal(await checkStripeKey(undefined, impl), 'missing');
    assert.equal(await checkStripeKey('', impl), 'missing');
    assert.equal(calls.length, 0);
  });

  it('elfogadott kulcsnál „accepted” – csak olvasó lekérdezés a kulccsal, időkorláttal', async () => {
    const { impl, calls } = fakeFetch(() => new Response('{}', { status: 200 }));
    assert.equal(await checkStripeKey('sk_test_valodi', impl), 'accepted');
    assert.equal(calls.length, 1);
    const [url, init] = calls[0]!;
    assert.equal(url, 'https://api.stripe.com/v1/balance');
    assert.equal(init?.method ?? 'GET', 'GET');
    assert.deepEqual(init?.headers, { Authorization: 'Bearer sk_test_valodi' });
    assert.ok(init?.signal instanceof AbortSignal);
  });

  it('a szerver szabályának nem megfelelő kulcsnál „invalid”, és el sem küldi (pl. élő kulcs)', async () => {
    const { impl, calls } = fakeFetch(() => new Response('{}', { status: 200 }));
    for (const key of ['sk_live_valodi', 'sk_test_helyettesítő', 'sk_test_ szokoz', 'pk_test_x']) {
      assert.equal(await checkStripeKey(key, impl), 'invalid');
    }
    assert.equal(calls.length, 0);
  });

  it('a Stripe által el nem fogadott (helyettesítő) kulcsnál „rejected”', async () => {
    for (const status of [401, 403]) {
      const { impl } = fakeFetch(() => new Response('{}', { status }));
      assert.equal(await checkStripeKey('sk_test_helyettesito', impl), 'rejected');
    }
  });

  it('a Stripe más hibájánál és hálózati hibánál „unreachable”', async () => {
    for (const status of [429, 500, 503]) {
      const { impl } = fakeFetch(() => new Response('{}', { status }));
      assert.equal(await checkStripeKey('sk_test_valodi', impl), 'unreachable');
    }
    const { impl } = fakeFetch(() => Promise.reject(new TypeError('fetch failed')));
    assert.equal(await checkStripeKey('sk_test_valodi', impl), 'unreachable');
  });

  it('minden kimaradási okhoz van magyar indoklás, a kulcs értéke nélkül', () => {
    assert.deepEqual(Object.keys(STRIPE_SKIP_REASONS).sort(), [
      'invalid',
      'missing',
      'rejected',
      'unreachable',
    ]);
    for (const reason of Object.values(STRIPE_SKIP_REASONS)) {
      assert.match(reason, /stripe/i);
      assert.doesNotMatch(reason, /sk_test_/);
    }
  });
});
