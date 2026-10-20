// A személyes (bejelentkezéshez kötött) válaszokat se a böngésző, se egy köztes proxy ne tárolja.
// Forrás: MDN – Cache-Control (no-store),
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
import type { RequestHandler } from 'express';

export const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
