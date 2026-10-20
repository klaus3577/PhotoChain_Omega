// Az admin végpontok bemeneti sémái (Zod, L16): a felhasználók és a képek listájának
// query-paraméterei, valamint a tiltás és az elrejtés szigorú JSON-törzse (más mező – pl. a szerepkör
// vagy az állapot közvetlen átírása – hiba, nem csendben eldobott adat).
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import { z } from 'zod';

import { PhotoStatus } from '../../generated/prisma/enums.js';
import { paginationQuerySchema, searchQueryText, strictBody } from '../../lib/schemas.js';

const PHOTO_STATUSES = Object.values(PhotoStatus);

/** Logikai érték a JSON-törzsben (a "true" szöveg nem az). */
const jsonBoolean = () =>
  z.boolean({
    error: (issue) => (issue.input === undefined ? 'kötelező' : 'true vagy false kell'),
  });

/** A felhasználók listája (GET /api/admin/users): keresés e-mailre és névre, tiltási szűrő. */
export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: searchQueryText().optional(),
  blocked: z
    .enum(['true', 'false'], { error: 'true vagy false lehet' })
    .transform((blocked) => blocked === 'true')
    .optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** A tiltás és a feloldás (PATCH /api/admin/users/:id). */
export const updateUserSchema = strictBody({ isBlocked: jsonBoolean() });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** A képek listája (GET /api/admin/photos): minden állapotú kép, állapot szerint szűrhető. */
export const listAdminPhotosQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(PHOTO_STATUSES, {
      error: `az állapot lehetséges értékei: ${PHOTO_STATUSES.join(', ')}`,
    })
    .optional(),
});

export type ListAdminPhotosQuery = z.infer<typeof listAdminPhotosQuerySchema>;

/** Az elrejtés és a visszaállítás (PATCH /api/admin/photos/:id). */
export const updateAdminPhotoSchema = strictBody({ hidden: jsonBoolean() });

export type UpdateAdminPhotoInput = z.infer<typeof updateAdminPhotoSchema>;
