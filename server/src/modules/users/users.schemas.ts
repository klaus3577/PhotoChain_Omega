// A felhasználói végpontok bemeneti sémája (Zod): a saját profil módosítása (PATCH /api/me).
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import type { z } from 'zod';

import { cleanMultilineText, clearable, patchBody, textInput } from '../../lib/schemas.js';
import { displayNameSchema } from '../auth/auth.schemas.js';

/** A users.bio oszlop hossza */
const MAX_BIO_LENGTH = 500;

/** Csak a megjelenített név és a bemutatkozás módosítható – az e-mail, a szerepkör, a tiltás nem. */
export const updateProfileSchema = patchBody({
  displayName: displayNameSchema.optional(),
  // A rejtett karakterek kimaradnak, két bekezdés között legfeljebb egy üres sor (L30)
  bio: clearable(cleanMultilineText(textInput('szöveg kell'), MAX_BIO_LENGTH)).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
