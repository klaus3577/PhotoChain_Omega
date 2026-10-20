// A munkamenet-süti (terv, D4 döntés): a JWT httpOnly sütiben utazik, így a böngészőben futó
// JavaScript nem tudja kiolvasni – egy esetleges XSS-hiba nem viszi el a tokent.
// Forrás: Express 5 API – res.cookie(), res.clearCookie(), https://expressjs.com/en/5x/api.html
// (adaptálva)
import type { CookieOptions, Response } from 'express';

import type { Env } from '../config/env.js';
import { SESSION_TTL_SECONDS } from './jwt.js';

export const SESSION_COOKIE_NAME = 'photochain_session';

type CookieEnv = Pick<Env, 'NODE_ENV'>;

/**
 * - httpOnly: JavaScriptből nem olvasható;
 * - SameSite=Lax: más webhelyről indított POST kéréshez a böngésző nem csatolja (CSRF ellen);
 * - Secure: élesben csak HTTPS-en küldi el (fejlesztéskor a szerver HTTP-n fut, ott nem állítható be).
 */
function baseCookieOptions(env: CookieEnv): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/' };
}

export function setSessionCookie(res: Response, token: string, env: CookieEnv): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(env),
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

/** A törléshez ugyanazok a beállítások kellenek, amelyekkel a süti létrejött. */
export function clearSessionCookie(res: Response, env: CookieEnv): void {
  res.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions(env));
}
