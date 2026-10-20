// A felhasználók végpontjainak kliense (server/src/modules/users): a publikus fotósprofil
// (GET /api/users/:id – e-mail, szerepkör és tiltás soha nincs benne) és a saját profil módosítása
// (PATCH /api/me – a válasz a munkamenet alakja, mint a GET /api/auth/me-é). A válasz külső adat:
// futás közben is ellenőrizzük. Az azonosító csak UUID lehet: más alakú érték (pl. „..”) más
// API-címre sem vihet – kérés nélkül hiba.
import { type AuthUser, isAuthUser } from './auth.api';
import {
  expectValid,
  isInteger,
  isIsoDate,
  isNullableString,
  isRatingSummary,
  isRecord,
  isString,
  isUuid,
  type RatingSummary,
} from './guards';
import { apiRequest, pathSegment } from './http';

/** A publikus fotósprofil (PublicProfileDto). */
export interface PublicProfile {
  id: string;
  displayName: string;
  bio: string | null;
  createdAt: string;
  /** A nyilvános (hitelesített) képek száma */
  photoCount: number;
  /** A nyilvános képek értékeléseinek átlaga és száma */
  rating: RatingSummary;
}

/** A saját profil módosítása: a név és a bemutatkozás (üresen null). */
export interface ProfileUpdate {
  displayName: string;
  bio: string | null;
}

/** A profilok a „users” előtag alatt: az értékelés írása és törlése ezeket is érvényteleníti (átlag). */
export const userKeys = {
  all: () => ['users'] as const,
  profile: (id: string) => ['users', 'profile', id] as const,
};

/** A felhasználó azonosítója a szerver formájában (UUID). */
export const isUserId = (value: string): boolean => isUuid(value);

const isPublicProfile = (value: unknown): value is PublicProfile =>
  isRecord(value) &&
  isUuid(value.id) &&
  isString(value.displayName) &&
  isNullableString(value.bio) &&
  isIsoDate(value.createdAt) &&
  isInteger(value.photoCount, 0) &&
  isRatingSummary(value.rating);

const isProfileResponse = (value: unknown): value is { user: PublicProfile } =>
  isRecord(value) && isPublicProfile(value.user);

const isUserResponse = (value: unknown): value is { user: AuthUser } =>
  isRecord(value) && isAuthUser(value.user);

/** A fotós publikus profilja; a nem létező (vagy letiltott) felhasználóra 404. */
export async function getProfile(id: string, signal?: AbortSignal): Promise<PublicProfile> {
  if (!isUserId(id)) throw new RangeError('Érvénytelen felhasználó-azonosító');
  const data = await apiRequest<unknown>(`/users/${pathSegment(id)}`, { signal });
  return expectValid(data, isProfileResponse).user;
}

/** A saját profil módosítása – a válasz a bejelentkezett felhasználó új adatai. */
export async function updateProfile(input: ProfileUpdate): Promise<AuthUser> {
  const data = await apiRequest<unknown>('/me', { method: 'PATCH', body: input });
  return expectValid(data, isUserResponse).user;
}
