// A listák közös szövege és a nézetváltás fókusza (L22, L25): az összesítés („Összesen 5 kép”), és a
// fül, a szűrő vagy az oldal váltásának kezelése, amikor az új lista megérkezett. Lapozáskor a
// megnyomott hivatkozás el is tűnhet (az utolsó oldalon nincs „Következő”), a fül vagy a szűrő
// váltásakor a fókusz a gombon maradna: ha a fókusz még a váltáskor megnyomott elemen (vagy sehol) van,
// a találatszámra kerül – a lista elejére, ahonnan a képernyőolvasó az új listát olvassa; ha a
// felhasználó közben máshová vitte, ott marad, és az összesítést az élő régió mondja be. Az első
// betöltésnél nem mozdul: ott az oldal maga a hír. Külön modul, hogy a komponensfájl csak komponenst
// exportáljon.
import { useEffect, useRef, type RefObject } from 'react';

import { useAnnounce } from '../components/ui/useAnnounce';
import { focusElement, focusLost, focusPageHeading } from '../lib/focus';
import type { DashboardTab } from './dashboardParams';

const NOUNS: Record<DashboardTab, string> = { kepeim: 'kép', vasarlasaim: 'vásárlás' };

/** „Összesen 5 kép”, a második oldaltól az oldallal; üres listánál üres (az üres állapot beszél). */
export function countSummaryOf(noun: string, total: number, page: number): string {
  if (total === 0) return '';
  const base = `Összesen ${total} ${noun}`;
  return page > 1 ? `${base}, ${page}. oldal` : base;
}

/** A vezérlőpult fülének összesítése („Összesen 5 kép”, „Összesen 2 vásárlás”). */
export function summaryTextOf(tab: DashboardTab, total: number, page: number): string {
  return countSummaryOf(NOUNS[tab], total, page);
}

interface ViewChange {
  /** Az elem, amelyen a fókusz a nézet váltásakor volt */
  origin: Element | null;
}

/**
 * Az üres állapot címe (EmptyState jelöli), ha a listának nincs eleme – oda kerül a fókusz. Több lista
 * egy oldalon (admin): a saját szakaszán belül keresi.
 */
const emptyStateTitle = (scope: HTMLElement | null | undefined): HTMLElement | null =>
  (scope ?? document.getElementById('tartalom'))?.querySelector<HTMLElement>(
    '[data-empty-title]',
  ) ?? null;

/**
 * A nézet (fül, szűrő, oldal) váltása után, amikor az új lista megérkezett: a fókusz a találatszámra
 * kerül (üres listánál az üres állapot címére), ha még a váltáskor megnyomott elemen vagy sehol sincs;
 * különben az összesítés (üres listánál az üres állapot szövege) hangzik el – kivéve, ha a fókusz már
 * a találatszámon van (a sikeres újrapróbálás tette oda: akkor azt olvassa).
 */
export function useViewChangeFocus(
  key: string,
  fresh: boolean,
  target: RefObject<HTMLElement | null>,
  text: string,
  emptyText: string,
  /** A lista szakasza – az üres állapot címét ezen belül keresi (több lista egy oldalon) */
  scope?: RefObject<HTMLElement | null>,
): void {
  const announce = useAnnounce();
  const seen = useRef<string | null>(null);
  const change = useRef<ViewChange | null>(null);

  useEffect(() => {
    const before = seen.current;
    seen.current = key;
    if (before !== null && before !== key) change.current = { origin: document.activeElement };
    if (change.current === null || !fresh) return;
    const { origin } = change.current;
    change.current = null;
    if (document.activeElement === origin || focusLost()) {
      const next = text !== '' ? target.current : emptyStateTitle(scope?.current);
      if (next) {
        focusElement(next);
        // A találatszám a lapozó fölött, akár egy képernyőnyivel feljebb áll (admin: a lapozás nem
        // görgeti az oldal tetejére): a fókuszált sor látszódjon (a jsdom nem valósítja meg)
        next.scrollIntoView?.({ block: 'nearest' });
      } else {
        focusPageHeading();
      }
    } else if (document.activeElement !== target.current) {
      announce(text || emptyText);
    }
  }, [key, fresh, target, text, emptyText, scope, announce]);
}
