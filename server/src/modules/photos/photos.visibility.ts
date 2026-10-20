// A képek láthatósági szabálya – minden modul (galéria, adatlap, letöltés, vásárlás, értékelések,
// hitelesség-ellenőrzés, feltöltés 409-es válasza) ezt használja:
// - nyilvános a regisztrált (REGISTERED) kép, ha a fotósa nincs letiltva (L13, L16 – a letiltott
//   felhasználó tartalma a tiltás idejére eltűnik, a feloldás után visszajön; szerzői döntés,
//   2026-10-06);
// - a többit csak a tulajdonosa és az admin látja – másnak nem létezik (404). A letiltott tulajdonos
//   a munkamenetével névtelen néző (optionalAuth), így a saját képeit sem látja.
// A szabály két alakban van: a lekérdezések szűrőjeként (PUBLIC_PHOTO_WHERE) és a már betöltött kép
// ellenőrzéseként (isPublic, canView) – a kettő ugyanazt a feltételt fejezi ki.
// Forrás: Prisma ORM v7 – Relation queries (szűrés a kapcsolódó rekord mezőjére),
// https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries (adaptálva)
import type { Prisma, Role } from '../../generated/prisma/client.js';

/** Aki a képet nézi vagy módosítja: a bejelentkezett felhasználó (a SessionUser megfelel neki). */
export interface PhotoViewer {
  id: string;
  role: Role;
}

/** A láthatóság eldöntéséhez szükséges mezők (Prisma select). */
export const VISIBILITY_SELECT = {
  status: true,
  ownerId: true,
  owner: { select: { isBlocked: true } },
} as const satisfies Prisma.PhotoSelect;

/** A láthatóság eldöntéséhez szükséges adatok – a VISIBILITY_SELECT-tel lekérdezett kép. */
export type PhotoVisibility = Prisma.PhotoGetPayload<{ select: typeof VISIBILITY_SELECT }>;

/** A nyilvános képek szűrője a lekérdezésekhez: regisztrált kép, nem letiltott fotós. */
export const PUBLIC_PHOTO_WHERE = {
  status: 'REGISTERED',
  owner: { isBlocked: false },
} as const satisfies Prisma.PhotoWhereInput;

/** Nyilvános-e a kép (ugyanaz a szabály, mint a PUBLIC_PHOTO_WHERE szűrőé). */
export function isPublic(photo: Pick<PhotoVisibility, 'status' | 'owner'>): boolean {
  return photo.status === 'REGISTERED' && !photo.owner.isBlocked;
}

/**
 * A kép kezelője a tulajdonosa és az admin: ők látják a nem nyilvános képet, ők rejthetik el, és ők
 * kapják meg a regisztrációra váró kép függő tranzakciójának adatát (L21). Egy helyen, hogy a
 * láthatóság (get), az elrejtés (hide) és a tranzakció adata ne térhessen el egymástól.
 */
export function canManage(
  photo: Pick<PhotoVisibility, 'ownerId'>,
  viewer: PhotoViewer | null,
): boolean {
  return viewer !== null && (viewer.id === photo.ownerId || viewer.role === 'ADMIN');
}

/**
 * A nyilvános képet bárki, a többit csak a kezelője (tulajdonos, admin) láthatja (a vásárlás, a
 * letöltés és az értékelések is ezt a szabályt követik: a nem látható kép létezését nem árulják el).
 */
export function canView(photo: PhotoVisibility, viewer: PhotoViewer | null): boolean {
  return isPublic(photo) || canManage(photo, viewer);
}
