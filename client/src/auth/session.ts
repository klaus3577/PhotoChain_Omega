// A munkamenethez tartozó kis segédek: a belépés utáni visszairányítás célja és a fiókmenü monogramja.
// Forrás: WHATWG URL Standard – basic URL parser (a bemenetből minden tabulátor és sortörés törlődik),
// https://url.spec.whatwg.org/#concept-basic-url-parser
import type { Location } from 'react-router';

/** Ahová belépés után nem irányítunk vissza (körbeirányítás ellen). */
const AUTH_PAGES = new Set(['/login', '/register']);

/** Belépő vagy regisztrációs oldal – a router kis- és nagybetűtől, záró perjeltől függetlenül illeszt. */
function isAuthPage(pathname: string): boolean {
  let end = pathname.length;
  while (end > 1 && pathname[end - 1] === '/') end -= 1;
  return AUTH_PAGES.has(pathname.slice(0, end).toLowerCase());
}

/** Vezérlőkarakter: a böngésző a címből a tabulátort és a sortörést kihagyja („/[tab]/x” → „//x”). */
const CONTROL_CHARACTER = /\p{Cc}/u;

/** A védett oldal, ahonnan a felhasználó a belépésre került (a ProtectedRoute teszi az állapotba). */
export interface AuthRedirectState {
  from: { pathname: string; search?: string; hash?: string };
  /** A belépést a megnyitott oldal kérte (nem a fejléc hivatkozásából jött) */
  required?: boolean;
}

const field = (value: unknown, prefix: string) =>
  typeof value === 'string' && value.startsWith(prefix) ? value : '';

/**
 * A belépés utáni visszairányítás célja az útvonal-állapotból – csak az alkalmazás saját, relatív
 * útvonala lehet: a protokollrelatív („//…”), a fordított perjeles, a vezérlőkaraktert tartalmazó és a
 * teljes cím nyílt átirányítás volna. Érvénytelen állapotnál null (ilyenkor a kezdőlapra megy).
 */
export function redirectTarget(state: unknown): string | null {
  const from =
    typeof state === 'object' && state !== null ? (state as { from?: unknown }).from : undefined;
  if (typeof from !== 'object' || from === null) return null;
  const { pathname, search, hash } = from as Record<string, unknown>;
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//'))
    return null;
  if (pathname.includes('\\') || isAuthPage(pathname)) return null;
  const target = `${pathname}${field(search, '?')}${field(hash, '#')}`;
  return CONTROL_CHARACTER.test(target) ? null : target;
}

/**
 * Az útvonal-állapot a belépés és a regisztráció hivatkozásához: a felhasználó oda tér vissza, ahol a
 * hivatkozásra kattintott. A belépő és a regisztrációs oldalon a már meglévő célt viszi tovább – így a
 * védett oldalról érkező a két oldal közt váltva sem veszíti el.
 */
export function returnTo(location: Pick<Location, 'pathname' | 'state'>): unknown {
  return isAuthPage(location.pathname) ? location.state : { from: location };
}

/** A belépést egy védett oldal megnyitása kérte-e (ilyenkor a belépő oldal ezt jelzi is). */
export function isAuthRequired(state: unknown): boolean {
  return redirectTarget(state) !== null && (state as Partial<AuthRedirectState>).required === true;
}

/** A fiókmenü monogramja: az első két szó kezdőbetűje (kódpontonként), betű nélküli névnél „?”. */
export function monogram(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]!.toLocaleUpperCase('hu-HU'));
  return initials.join('') || '?';
}
