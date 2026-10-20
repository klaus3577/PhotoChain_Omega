import { createContext } from 'react';

import type { AuthUser } from '../api/auth.api';

/** Az ellenőrzés nem sikerült (pl. szerverhiba – nem tudni, be van-e jelentkezve; újrapróbálható). */
interface SessionCheckFailed {
  status: 'error';
  retry: () => void;
}

/**
 * A munkamenet állapota: ellenőrzés alatt, nincs bejelentkezve, bejelentkezve, vagy az ellenőrzés nem
 * sikerült. Hiba után az újrapróbálás alatt is „error” marad (retrying): a hibanézet és a fókuszban
 * lévő Újrapróbálás gomb a helyén marad, nem cseréli le a betöltésjelző.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthUser }
  | (SessionCheckFailed & {
      retrying: false;
      error: Error;
      /** A hiba időpontja – minden új hibánál új riasztás (a képernyőolvasó újra felolvassa) */
      failedAt: number;
    })
  | (SessionCheckFailed & { retrying: true });

export const AuthContext = createContext<AuthState | null>(null);
