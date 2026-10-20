// Egyszerre egy ellenőrzés (L24): a két űrlap (kép, hash) ugyanazt a – IP-címenként korlátozott –
// végpontot használja, és az eredmény kártyája mindkettő helyére lép. Amíg az egyik ellenőrzés fut, a
// másik űrlap nem indít kérést (a begépelt hash és a futó kérés nem veszne el, a keret nem fogy
// hiába); a szerver kérte várakozás (Retry-After – korlátozás, túlterhelés, a lánc szünete) alatt
// egyik sem – a felhasználó a hátralévő időt látja, újra feltölteni a fájlt nem kell.
import { useState } from 'react';

import { ApiError } from '../api/http';
import { retryHint } from '../lib/text';

/** Honnan indult az ellenőrzés: a fájlból (POST) vagy a beírt hash-ből (GET) */
export type VerificationSource = 'file' | 'hash';

/** Az űrlap kapuja: indítható-e most ellenőrzés, és az indulás, illetve a vég jelzése. */
export interface VerificationGate {
  /** Miért nem indítható most ellenőrzés (másik fut, vagy a szerver várakozást kért); null, ha indítható */
  reasonNotToStart: () => string | null;
  onStart: () => void;
  /** A kérés vége – sikerrel, hibával vagy megszakítva; a hibából a szerver kérte várakozás ideje */
  onSettle: (error?: unknown) => void;
}

export const OTHER_PENDING_TEXT = 'Egyszerre egy ellenőrzés futhat – várd meg az eredményt.';
export const WAIT_TEXT = 'Még nem indítható új ellenőrzés.';
const MS_PER_SECOND = 1000;

export function useVerificationGate(): (source: VerificationSource) => VerificationGate {
  const [pending, setPending] = useState<VerificationSource | null>(null);
  /** Eddig az időpontig a szerver várakozást kért (Retry-After) */
  const [retryUntil, setRetryUntil] = useState<number | null>(null);

  return (source) => ({
    reasonNotToStart: () => {
      if (pending !== null && pending !== source) return OTHER_PENDING_TEXT;
      const remainingMs = (retryUntil ?? 0) - Date.now();
      if (remainingMs <= 0) return null;
      return `${WAIT_TEXT} ${retryHint(Math.ceil(remainingMs / MS_PER_SECOND))}`;
    },
    onStart: () => setPending(source),
    onSettle: (error) => {
      setPending(null);
      if (error instanceof ApiError && error.retryAfterSeconds !== undefined) {
        setRetryUntil(Date.now() + error.retryAfterSeconds * MS_PER_SECOND);
      }
    },
  });
}
