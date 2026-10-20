// A webes felület (a kliens buildje, client/dist) kiszolgálása – L31. A konténerben az Express adja a
// felületet is, ugyanarról az eredetről, mint az API-t: a Sec-Fetch-Site ellenőrzés és a SameSite süti
// ezt feltételezi. Fejlesztéskor a Vite szolgálja ki (a proxyján át éri el az API-t).
// - A tartalom szerint elnevezett (hash-elt) fájlok (assets/) egy évig, változtatás nélkül tárolhatók;
//   minden más (az index.html, a robots.txt) csak újraellenőrzéssel – így egy új telepítés után a
//   böngésző a következő betöltéskor már az új verziót kéri.
// - Az ismeretlen, kiterjesztés nélküli útvonal (pl. /photos/:id, /admin) a kliens útválasztójáé: az
//   index.html-t kapja (SPA). A kiterjesztéses (hiányzó fájl) és az /api, /media alatti útvonal nem –
//   ezek a központi 404-es választ kapják.
// Forrás: Express 5 API – express.static, res.sendFile, https://expressjs.com/en/5x/api.html;
// Vite – Building for Production (hash-elt fájlnevek az assets/ mappában),
// https://vite.dev/guide/build; MDN – Cache-Control (immutable, no-cache),
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control (adaptálva)
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import express, { type RequestHandler, Router } from 'express';

/** A Vite a tartalom szerint elnevezett fájlokat ebbe a mappába teszi */
const HASHED_ASSETS_DIRECTORY = 'assets';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';
/** Az útvonal utolsó szakaszában van pont (fájlnév kiterjesztéssel, vagy rejtett fájl) */
const LOOKS_LIKE_FILE = /\/[^/]*\.[^/]*$/;
/**
 * A szerver saját útvonalai – ezek alatt nincs kliensoldali útvonal. Kis- és nagybetű-független, mint
 * az Express útválasztása (a /API/… is az API-é).
 */
const SERVER_PATH = /^\/(?:api|media)(?:\/|$)/i;

const isHashedAsset = (directory: string, filePath: string): boolean =>
  relative(directory, filePath).startsWith(`${HASHED_ASSETS_DIRECTORY}${sep}`);

/** A kliens útválasztójának oldala: GET vagy HEAD, nem a szerver útvonala, és nem fájlnév. */
const isClientRoute = (method: string, path: string): boolean =>
  (method === 'GET' || method === 'HEAD') && !SERVER_PATH.test(path) && !LOOKS_LIKE_FILE.test(path);

export function createClientAppRouter(directory: string): Router {
  // A hiányzó build már induláskor derüljön ki, ne minden oldalbetöltéskor egy 500-as válaszból
  if (!existsSync(join(directory, 'index.html'))) {
    throw new Error(`A kliens buildjében nincs index.html: ${directory} (CLIENT_DIST_DIR)`);
  }
  const router = Router();
  router.use(
    express.static(directory, {
      index: false,
      // A rejtett fájl nem létezőnek számít (a központi 404-es választ kapja)
      dotfiles: 'ignore',
      redirect: false,
      setHeaders: (res, filePath) => {
        res.set('Cache-Control', isHashedAsset(directory, filePath) ? IMMUTABLE : REVALIDATE);
      },
    }),
  );
  const serveIndex: RequestHandler = (req, res, next) => {
    if (!isClientRoute(req.method, req.path)) {
      next();
      return;
    }
    res.set('Cache-Control', REVALIDATE);
    res.sendFile('index.html', { root: directory }, (error?: NodeJS.ErrnoException) => {
      // A kliens bontotta a kapcsolatot küldés közben – ez nem szerverhiba
      if (error && error.code !== 'ECONNABORTED') next(error);
    });
  };
  router.use(serveIndex);
  return router;
}
