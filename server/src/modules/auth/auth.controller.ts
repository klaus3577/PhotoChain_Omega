// Az auth-végpontok HTTP-rétege: ellenőrzi a bemenetet (Zod-séma), átadja a service-nek, kezeli a
// munkamenet-sütit, és az egységes { data: … } formában válaszol.
import type { RequestHandler, Response } from 'express';

import type { Env } from '../../config/env.js';
import { signSessionToken } from '../../lib/jwt.js';
import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from '../../lib/sessionCookie.js';
import type { SessionUser } from '../../lib/sessionUser.js';
import { withValidatedBody } from '../../middleware/validate.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export interface AuthController {
  register: RequestHandler;
  login: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
}

export function createAuthController(
  authService: AuthService,
  env: Pick<Env, 'NODE_ENV' | 'JWT_SECRET'>,
): AuthController {
  /** Munkamenetet nyit: a felhasználó azonosítójára kiállított JWT a httpOnly sütibe kerül. */
  const startSession = (res: Response, user: SessionUser): void => {
    setSessionCookie(res, signSessionToken(user.id, env.JWT_SECRET), env);
  };

  return {
    // A sikeres regisztráció egyben be is jelentkeztet
    register: withValidatedBody(registerSchema, async (input, _req, res) => {
      const user = await authService.register(input);
      startSession(res, user);
      res.status(201).json({ data: { user } });
    }),

    login: withValidatedBody(loginSchema, async (input, req, res) => {
      const user = await authService.login(input, req.log);
      startSession(res, user);
      res.json({ data: { user } });
    }),

    // A token állapotmentes: a kijelentkezés a süti törlését jelenti
    logout: (_req, res) => {
      clearSessionCookie(res, env);
      res.status(204).end();
    },

    // A bejelentkezett felhasználó, vagy null, ha nincs munkamenet (loadSession – L26): a vendégnek
    // nem hiba. Ha küldött sütit, de az nem jó (lejárt, hamis, törölt felhasználóé – a loadSession nem
    // talált hozzá felhasználót), a süti törlődik: a böngésző nem küldözgeti tovább. A letiltott
    // felhasználó sütije marad (403-at kap, a hibát a kliens mutatja).
    me: (req, res) => {
      const sentCookie = req.cookies?.[SESSION_COOKIE_NAME] !== undefined;
      if (!req.user && sentCookie) clearSessionCookie(res, env);
      res.json({ data: { user: req.user ?? null } });
    },
  };
}
