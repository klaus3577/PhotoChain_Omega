import { createContext } from 'react';

/** A látható értesítés tónusa: siker (pipa), tájékoztatás (i), figyelmeztetés (felkiáltójel) */
export type AnnounceTone = 'success' | 'info' | 'warning';

export interface AnnounceOptions {
  /**
   * Csak a következő oldalváltás után hangzik el, amikor a fókusz már az új oldal címén van (pl.
   * „Bejelentkeztél” a belépés utáni oldalon): a fókuszváltás az előtte elkezdett udvarias bejelentést
   * egyes képernyőolvasókban (JAWS, VoiceOver) megszakítaná.
   */
  afterNavigation?: boolean;
  /**
   * Látható értesítés is (rövid, fekete – stílusútmutató „Visszajelzés”, L26): a műveletek eredménye
   * a látó felhasználónak is szól. Ugyanaz az élő régió mutatja, így egyszer hangzik el.
   * A folyamat közbeni állapotok (betöltés, ellenőrzés indul) rejtett bejelentések maradnak.
   */
  visible?: boolean;
  /**
   * A látható értesítés tónusa (alapból siker): a sikertelen kimenet (pl. a lánc-regisztráció nem
   * sikerült, a szerver elutasította a kérést) figyelmeztetés, a semleges változás (egy kép kikerült a
   * szűrt listából) tájékoztatás – a pipa csak a sikeré.
   */
  tone?: AnnounceTone;
}

/** Bejelentés az oldal egyetlen élő régiójában (WCAG 4.1.3). */
export type Announce = (message: string, options?: AnnounceOptions) => void;

export interface LiveRegion {
  announce: Announce;
  /** Elhangzik az oldalváltás utánra kért bejelentés – a layout hívja, miután a fókusz az új oldalra került */
  flushPending: () => void;
  /**
   * Modális párbeszédablak nyílt meg (Dialog): amíg nyitva van, a bejelentések várnak – a modális
   * ablak alatt az oldal többi része nem elérhető (inert), az élő régió sem hangzana el, nem látszana
   */
  dialogOpened: () => void;
  /** A modális ablak bezárult: a várakozó bejelentések most hangzanak el (egybefűzve) */
  dialogClosed: () => void;
}

/**
 * Ennyi idő után a bejelentés kiürül a régióból: a felolvasás addigra megtörtént, és a régió végére
 * érő képernyőolvasó-felhasználó később – akár egy másik oldalon – nem talál benne elavult üzenetet.
 */
export const LIVE_MESSAGE_TTL_MS = 7000;

export const LiveRegionContext = createContext<LiveRegion | null>(null);
