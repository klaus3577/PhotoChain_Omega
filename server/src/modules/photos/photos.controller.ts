// A képek végpontjainak HTTP-rétege: feltöltés (L10), galéria, adatlap, módosítás, elrejtés (L13),
// az eredeti védett letöltése (L14).
import { finished } from 'node:stream';

import type { RequestHandler } from 'express';

import { sendStream } from '../../lib/download.js';
import { AppError } from '../../lib/errors.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { getSessionUser } from '../../middleware/auth.js';
import { IMAGE_FIELD_NAME } from '../../middleware/upload.js';
import { withValidatedBody } from '../../middleware/validate.js';
import type { PhotoCatalog } from './photos.catalog.js';
import type { PhotoDownloads } from './photos.download.js';
import { createPhotoSchema, listPhotosQuerySchema, updatePhotoSchema } from './photos.schemas.js';
import type { PhotosService } from './photos.service.js';

export interface PhotosController {
  create: RequestHandler;
  list: RequestHandler;
  get: RequestHandler;
  update: RequestHandler;
  hide: RequestHandler;
  download: RequestHandler;
}

export function createPhotosController(
  photosService: PhotosService,
  catalog: PhotoCatalog,
  downloads: PhotoDownloads,
): PhotosController {
  return {
    // A fájlt a multer (middleware/upload.ts) már beolvasta a req.file-ba
    create: withValidatedBody(createPhotoSchema, async (fields, req, res) => {
      if (!req.file) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', [
          { path: IMAGE_FIELD_NAME, message: 'képfájl kötelező' },
        ]);
      }
      // Ha a kliens a válasz előtt bontja a kapcsolatot, a sorban álló feltöltését eldobjuk. A
      // finished akkor is jelez, ha a kapcsolat már korábban megszakadt; a válasz elküldése után
      // is jelez – akkor már nincs mit megszakítani.
      const clientGone = new AbortController();
      finished(res, () => clientGone.abort());

      const photo = await photosService.upload({
        ownerId: getSessionUser(req).id,
        file: req.file.buffer,
        fields,
        signal: clientGone.signal,
      });
      res.status(201).json({ data: { photo } });
    }),

    // Express 5-ben a req.query csak olvasható: a sémával ellenőrzött másolatával dolgozunk. Hibás
    // paraméternél a séma ZodError-t dob, ebből a hibakezelő 400-as VALIDATION_ERROR-t készít.
    list: async (req, res) => {
      const { photos, meta } = await catalog.list(listPhotosQuerySchema.parse(req.query));
      res.json({ data: { photos }, meta });
    },

    // Nyilvános végpont, opcionális bejelentkezéssel: a tulajdonos és az admin a nem nyilvános képet
    // is látja – a nekik szóló választ semmilyen gyorsítótár nem tárolhatja
    get: async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      const viewer = req.user ?? null;
      // A válasz a munkamenet-sütitől is függ: egy köztes gyorsítótár a névtelen nézőnek szóló
      // változatot ne adja ki a bejelentkezettnek (és fordítva)
      res.vary('Cookie');
      if (viewer) res.set('Cache-Control', 'no-store');
      res.json({ data: { photo: await catalog.get(id, viewer) } });
    },

    update: withValidatedBody(updatePhotoSchema, async (input, req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      res.json({ data: { photo: await catalog.update(id, getSessionUser(req), input) } });
    }),

    hide: async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      await catalog.hide(id, getSessionUser(req));
      res.status(204).end();
    },

    // Az eredeti fájl letöltendő mellékletként, folyamként (nem kerül egészben a memóriába). A HEAD
    // kérésre (az Express a GET kezelőjével szolgálja ki) csak a fejlécek mennek, a fájl nem olvasódik.
    download: async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      const file = await downloads.open(id, getSessionUser(req));
      try {
        res.set({
          'Content-Type': file.contentType,
          'Content-Length': String(file.size),
          'Content-Disposition': file.contentDisposition,
        });
        if (req.method === 'HEAD') res.end();
        else await sendStream(file.stream, res);
      } finally {
        // A megnyitott fájl minden úton lezárul (HEAD-nél olvasás nélkül, hibánál is)
        file.stream.destroy();
      }
    },
  };
}
