// A felhasználói végpontok HTTP-rétege: a publikus fotósprofil, a saját profil módosítása és a saját
// képek listája.
import type { RequestHandler } from 'express';

import { idParamsSchema, paginationQuerySchema } from '../../lib/schemas.js';
import { getSessionUser } from '../../middleware/auth.js';
import { withValidatedBody } from '../../middleware/validate.js';
import type { PhotoCatalog } from '../photos/photos.catalog.js';
import { updateProfileSchema } from './users.schemas.js';
import type { UsersService } from './users.service.js';

export interface UsersController {
  getProfile: RequestHandler;
  updateProfile: RequestHandler;
  listOwnPhotos: RequestHandler;
}

export function createUsersController(
  usersService: UsersService,
  photoCatalog: Pick<PhotoCatalog, 'listOwn'>,
): UsersController {
  return {
    // Hibás azonosító: a séma ZodError-t dob, ebből a hibakezelő 400-as VALIDATION_ERROR-t készít
    getProfile: async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      res.json({ data: { user: await usersService.getProfile(id) } });
    },

    updateProfile: withValidatedBody(updateProfileSchema, async (input, req, res) => {
      res.json({ data: { user: await usersService.updateProfile(getSessionUser(req), input) } });
    }),

    // Express 5-ben a req.query csak olvasható: a sémával ellenőrzött másolatával dolgozunk
    listOwnPhotos: async (req, res) => {
      const pagination = paginationQuerySchema.parse(req.query);
      const { photos, meta } = await photoCatalog.listOwn(getSessionUser(req).id, pagination);
      res.json({ data: { photos }, meta });
    },
  };
}
