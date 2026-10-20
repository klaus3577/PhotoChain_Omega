// Egy függő állapot lekérdezési üteme (L21: a regisztráció állapota a feltöltés után és a vezérlőpulton;
// L22: a rendelés állapota a fizetés után, amíg a webhook be nem fut). A terv szerint 3 másodpercenként
// kérdezünk, amíg van mire várni; de egy sokáig függő folyamat (elakadt tranzakció, lassú csomópont,
// kimaradt webhook) ne fogyassza el az API kérelemkeretét (300 kérés / 15 perc / IP – server/src/app.ts):
// két perc után ritkábban kérdezünk, tíz perc után leállunk (az állapot később is megnézhető). A 429 a
// Retry-After szerint vár, a 404 (az adat eltűnt a néző elől) leállít; más hiba (pl. hálózati) nem
// változtat az ütemen. A stopper és a sikertelen lekérdezés megjegyzése is közös.
import { ApiError } from '../api/http';

export const POLL_INTERVAL_MS = 3000;
export const SLOW_POLL_AFTER_MS = 2 * 60_000;
export const SLOW_POLL_INTERVAL_MS = 30_000;
export const POLL_LIMIT_MS = 10 * 60_000;

/** Stopper a lekérdezési ütemhez: az indítástól méri az eltelt időt (indítás előtt 0). */
export interface PollClock {
  /** Az első hívás indítja; a továbbiak hatástalanok (a komponens effektje hívja) */
  start(): void;
  /** Újraindítás – amikor újra van mire várni, az időkeret elölről indul */
  restart(): void;
  /**
   * A függő elemek (pl. regisztrációra váró képek) azonosítói a legfrissebb adatból: egy még nem
   * látott azonosító megjelenésekor újraindul – a lekérdezési ütem a friss adatot látó
   * visszahívásból (refetchInterval) hívja, így az új elem azonnal számít; a régóta függő nem nyitja
   * újra az időkeretet.
   */
  trackPending(ids: Iterable<string>): void;
  elapsedMs(): number;
}

/** A stopper – a komponens egyszer hozza létre (useState), így a renderelés tiszta marad. */
export function createPollClock(now: () => number = Date.now): PollClock {
  let startedAt: number | null = null;
  const seen = new Set<string>();
  const restart = () => {
    startedAt = now();
  };
  return {
    start() {
      startedAt ??= now();
    },
    restart,
    trackPending(ids) {
      let fresh = false;
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        fresh = true;
      }
      if (fresh) restart();
    },
    elapsedMs() {
      return startedAt === null ? 0 : now() - startedAt;
    },
  };
}

interface PollState {
  /** Van-e még mire várni (regisztrációra váró kép, függő fizetés) */
  pending: boolean;
  /** A figyelés kezdete óta eltelt idő */
  elapsedMs: number;
  /** A legutóbbi lekérdezés hibája (ha volt) */
  error: unknown;
}

/** A következő lekérdezésig várandó idő, vagy false, ha nincs több lekérdezés. */
export function pollIntervalOf({ pending, elapsedMs, error }: PollState): number | false {
  if (!pending || elapsedMs >= POLL_LIMIT_MS) return false;
  const regular = elapsedMs < SLOW_POLL_AFTER_MS ? POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS;
  if (!(error instanceof ApiError)) return regular;
  if (error.status === 404) return false;
  if (error.status === 429) {
    if (error.retryAfterSeconds === undefined) return SLOW_POLL_INTERVAL_MS;
    const wait = Math.max(error.retryAfterSeconds * 1000, POLL_INTERVAL_MS);
    // A várakozás nem nyúlhat a határon túl (egy óriási Retry-After a böngésző időzítőjét is túlcsordítaná)
    return elapsedMs + wait >= POLL_LIMIT_MS ? false : wait;
  }
  return regular;
}

const SECONDS_PER_MINUTE = 60;
const waitText = (seconds: number): string =>
  seconds < SECONDS_PER_MINUTE
    ? `${seconds} másodperc`
    : `${Math.ceil(seconds / SECONDS_PER_MINUTE)} perc`;

/**
 * A sikertelen lekérdezés megjegyzése – azt mondja, ami történni fog (nem ígér újrapróbálást, ha
 * nincs): a 404-nél a hívó mondja meg, hol nézhető meg az állapot (unavailableNote).
 */
export function pollErrorNoteOf(error: unknown, unavailableNote: string): string {
  if (error instanceof ApiError && error.status === 404) return unavailableNote;
  if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds !== undefined) {
    return `Túl sok kérés: a következő lekérdezés kb. ${waitText(error.retryAfterSeconds)} múlva.`;
  }
  return 'Az állapot lekérdezése most nem sikerült; néhány másodperc múlva újra próbáljuk.';
}
