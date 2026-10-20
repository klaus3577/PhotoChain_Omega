// A Stripe-tesztkulcs ellenőrzése a fizetés forgatókönyve előtt. A szerver Stripe-kulcs nélkül el sem
// indul, ezért a projekt kipróbálásakor saját Stripe-fiók híján gyakran helyettesítő érték
// (sk_test_…) kerül a server/.env-be – azzal a Checkout munkamenete nem hozható létre, és a vásárlás
// forgatókönyve időtúllépéssel bukna. Egy ingyenes, csak olvasó lekérdezés (az egyenleg) eldönti, hogy
// a Stripe elfogadja-e a kulcsot; ha nem, vagy a Stripe nem érhető el, a forgatókönyv kimarad, ahogy
// kulcs nélkül is. A kulcs értéke sehova nem kerül ki.
// Forrás: Stripe API Reference – Authentication, https://docs.stripe.com/api/authentication;
// Retrieve balance, https://docs.stripe.com/api/balance/balance_retrieve (adaptálva)

export type StripeKeyStatus = 'accepted' | 'missing' | 'invalid' | 'rejected' | 'unreachable';

const BALANCE_URL = 'https://api.stripe.com/v1/balance';
const CHECK_TIMEOUT_MS = 10_000;
/**
 * Ugyanaz a szabály, mint a szerveré (server/src/config/env.ts, STRIPE_SECRET_KEY): csak teszt módú
 * kulcs. Ami ennek nem felel meg (pl. élő kulcs), azt a szerver sem fogadná el – el sem küldjük.
 */
const TEST_KEY_PATTERN = /^sk_test_\w+$/;

/** A kimaradás oka a futás elején kiírt üzenethez és a kihagyott teszt indoklásához */
export const STRIPE_SKIP_REASONS: Record<Exclude<StripeKeyStatus, 'accepted'>, string> = {
  missing: 'Nincs STRIPE_SECRET_KEY a server/.env-ben',
  invalid:
    'A server/.env STRIPE_SECRET_KEY-e nem teszt módú vagy hibás formátumú kulcs (a szerver sem fogadná el)',
  rejected:
    'A server/.env STRIPE_SECRET_KEY-ét a Stripe nem fogadta el (helyettesítő vagy érvénytelen kulcs)',
  unreachable: 'A Stripe API nem érhető el (hálózati hiba vagy a Stripe hibája)',
};

/**
 * Elfogadja-e a Stripe a kulcsot: a szerver szabályának nem megfelelő kulcs el sem megy; különben
 * 2xx → igen, 401/403 → nem, minden más → nem érhető el.
 */
export async function checkStripeKey(
  key: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<StripeKeyStatus> {
  if (!key) return 'missing';
  if (!TEST_KEY_PATTERN.test(key)) return 'invalid';
  try {
    const response = await fetchImpl(BALANCE_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (response.ok) return 'accepted';
    return response.status === 401 || response.status === 403 ? 'rejected' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
