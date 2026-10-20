// Az /api/auth végpontok (L08) kliense: belépés, regisztráció, kijelentkezés és a bejelentkezett
// felhasználó lekérdezése. A munkamenet httpOnly sütiben van – a kliens nem látja és nem tárolja a
// tokent, csak a szerver válaszából tudja, ki van bejelentkezve. A felhasználó adatait futás közben is
// ellenőrizzük (külső adat).
import { isIsoDate, isUuid } from './guards';
import { ApiError, apiRequest, unexpectedResponseError, type RequestOptions } from './http';

export type Role = 'USER' | 'ADMIN';

/** A bejelentkezett felhasználó (server/src/lib/sessionUser.ts – a jelszó-hash és a tiltás nélkül). */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  role: Role;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

/** A munkamenet (bejelentkezett felhasználó vagy null) helye a TanStack Query gyorsítótárában. */
export const authQueryKey = ['auth', 'me'] as const;

const ROLES: readonly unknown[] = ['USER', 'ADMIN'] satisfies Role[];

/** A felhasználó alakja (a profil módosításának válasza is ez – users.api.ts). */
export const isAuthUser = (value: unknown): value is AuthUser => {
  if (typeof value !== 'object' || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    isUuid(user.id) &&
    typeof user.email === 'string' &&
    typeof user.displayName === 'string' &&
    (user.bio === null || typeof user.bio === 'string') &&
    ROLES.includes(user.role) &&
    isIsoDate(user.createdAt)
  );
};

/** A válasz user mezője (ha a válasz objektum). */
const userFieldOf = (data: unknown): unknown =>
  typeof data === 'object' && data !== null ? (data as { user?: unknown }).user : undefined;

/** A { user } válaszból a felhasználó – ellenőrizve. */
async function requestUser(path: string, options?: RequestOptions): Promise<AuthUser> {
  const user = userFieldOf(await apiRequest<unknown>(path, options));
  if (!isAuthUser(user)) throw unexpectedResponseError(200);
  return user;
}

/** Nincs bejelentkezett felhasználó: hiányzó vagy lejárt munkamenet, illetve letiltott fiók. */
const NO_SESSION_CODES = new Set(['UNAUTHORIZED', 'ACCOUNT_BLOCKED']);

/**
 * A szerver szerint nincs (érvényes) munkamenet – bármely kérésre érkezhet: hiányzó vagy lejárt
 * munkamenet (401 UNAUTHORIZED), illetve közben letiltott fiók (403 ACCOUNT_BLOCKED). A hibás belépés
 * (INVALID_CREDENTIALS) és a jogosultsághiány (FORBIDDEN) nem ilyen.
 */
export function isSessionEndError(error: unknown): boolean {
  return error instanceof ApiError && NO_SESSION_CODES.has(error.code);
}

/**
 * A bejelentkezett felhasználó (GET /api/auth/me), vagy null, ha nincs munkamenet: a szerver ilyenkor
 * 200-at ad user: null-lal (L26 – a vendég induló ellenőrzése nem hiba, nem kerül a böngésző
 * konzoljába); a 401 (régebbi szerver) és a letiltott fiók 403-a is „nincs munkamenet”.
 */
export async function fetchSessionUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const user = userFieldOf(await apiRequest<unknown>('/auth/me', { signal }));
    if (user === null) return null;
    if (!isAuthUser(user)) throw unexpectedResponseError(200);
    return user;
  } catch (error) {
    if (isSessionEndError(error)) return null;
    throw error;
  }
}

export function login(input: LoginInput): Promise<AuthUser> {
  return requestUser('/auth/login', { method: 'POST', body: input });
}

/** Regisztráció – a szerver egyben be is jelentkeztet. */
export function register(input: RegisterInput): Promise<AuthUser> {
  return requestUser('/auth/register', { method: 'POST', body: input });
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' });
}
