// A sor művelete utáni fókusz és bemondás, és a fókusz mentése, ha egy sor eltűnik az admin
// táblázataiból (L25; WCAG 2.4.3). A művelet a sor gombját cserélheti (Letiltás → Feloldás: ugyanaz
// a gomb-elem, a fókusz rajta marad), vagy el is tüntetheti (Újrapróbálás → „várakozás a láncra”):
// ilyenkor a fókusz a sor elejére (a kép címére, a felhasználó nevére) kerül, és csak utána hangzik
// el az üzenet – a fókuszváltás megszakíthatná a bejelentést. Hogy a gomb eltűnik-e, a hívó a szerver
// válaszából előre tudja (moveFocus): a sor frissülése a TanStack Query értesítésével külön lépésben
// érkezik, ezért a DOM-ból utólag nem dönthető el; a fókusz csak akkor mozdul, ha még a sorban van
// (ha a felhasználó közben máshová vitte, ott marad). A művelet után a lista újratöltődik, és a
// szűrt listából (pl. „Aktív”) a módosított sor ki is kerülhet – a fókusszal együtt: a sor
// (useRowRemovalRescue) a layout-effektus takarításában jelzi, hányadik volt, és a következő
// renderelés után a helyére lépő sor (vagy az utolsó, vagy a lista eleje: a találatszám, illetve az
// üres állapot címe) kapja a fókuszt. A kérés új objektum minden alkalommal: a fókusz a lista
// frissülése UTÁN kerül a helyére.
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { focusElement, focusLost } from '../../lib/focus';
import { useAnnounce } from '../ui/useAnnounce';

/** A sor elejének jelölője (az elem értéke a sor azonosítója): a művelet után ide kerül a fókusz */
export const ROW_FOCUS_ATTRIBUTE = 'data-row-focus';

/** A sor elejének jelölője JSX-attribútumként. */
export const rowFocusAttribute = (id: string) => ({ [ROW_FOCUS_ATTRIBUTE]: id });

const rowStarts = (container: HTMLElement | null): HTMLElement[] =>
  Array.from(container?.querySelectorAll<HTMLElement>(`[${ROW_FOCUS_ATTRIBUTE}]`) ?? []);

/** A sor eleje (a kép címe, a felhasználó neve) a sor azonosítója alapján. */
export function rowStart(container: HTMLElement | null, id: string): HTMLElement | null {
  return (
    rowStarts(container).find((element) => element.getAttribute(ROW_FOCUS_ATTRIBUTE) === id) ?? null
  );
}

/** A lista eleje: a találatszám, ha van szövege, különben az üres állapot címe (EmptyState jelöli). */
export function listStart(
  container: HTMLElement | null,
  summary: HTMLElement | null,
): HTMLElement | null {
  if (summary?.textContent) return summary;
  return container?.querySelector<HTMLElement>('[data-empty-title]') ?? summary;
}

interface FocusRequest {
  id: string;
  message: string;
  /** A művelet gombja eltűnik a sorból: a fókusz a sor elejére kerül */
  moveFocus: boolean;
}

export interface RowFocus {
  /** A művelet sikere: a sor azonosítója, a bemondandó üzenet, és hogy a gomb eltűnik-e a sorból */
  request: (id: string, message: string, moveFocus: boolean) => void;
  /** A sor jelzi (useRowRemovalRescue): a fókusszal együtt tűnik el, és ennyiedik volt a listában */
  rowRemoved: (index: number) => void;
  /** A lista eleje – pl. a párbeszédablak fókusz-visszaadásához, ha a megnyitó gomb eltűnt */
  listStart: () => HTMLElement | null;
}

export function useRowFocus(
  container: RefObject<HTMLElement | null>,
  summary: RefObject<HTMLElement | null>,
): RowFocus {
  const announce = useAnnounce();
  const [request, setRequest] = useState<FocusRequest | null>(null);
  const removedIndex = useRef<number | null>(null);

  useEffect(() => {
    if (!request) return;
    const start = rowStart(container.current, request.id);
    const row = start?.closest('tr') ?? null;
    const inRow = row !== null && row.contains(document.activeElement);
    if (start && ((request.moveFocus && inRow) || focusLost())) focusElement(start);
    announce(request.message, { visible: true });
  }, [request, container, announce]);

  // Minden renderelés után: ha egy sor a fókusszal együtt tűnt el, a helyére lépő sor eleje (vagy
  // az utolsó sor, vagy a lista eleje) kapja a fókuszt – ha közben más nem gondoskodott róla
  useEffect(() => {
    const index = removedIndex.current;
    if (index === null) return;
    removedIndex.current = null;
    if (!focusLost()) return;
    const rows = rowStarts(container.current);
    const target =
      rows[Math.min(index, rows.length - 1)] ?? listStart(container.current, summary.current);
    if (target) focusElement(target);
  });

  const requestFocus = useCallback(
    (id: string, message: string, moveFocus: boolean) => setRequest({ id, message, moveFocus }),
    [],
  );
  const rowRemoved = useCallback((index: number) => {
    removedIndex.current = index;
  }, []);
  const start = useCallback(
    () => listStart(container.current, summary.current),
    [container, summary],
  );

  return { request: requestFocus, rowRemoved, listStart: start };
}

/**
 * A sor jelzése, ha a fókusszal együtt tűnik el: a layout-effektus takarítása még a DOM-ból való
 * eltávolítás előtt fut, így a fókusz helye és a sor sorszáma még megállapítható. A ref a <tr>-re.
 */
export function useRowRemovalRescue(
  onRemoved: (index: number) => void,
): RefObject<HTMLTableRowElement | null> {
  const ref = useRef<HTMLTableRowElement>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    return () => {
      if (!row?.contains(document.activeElement)) return;
      onRemoved(Array.from(row.parentElement?.children ?? []).indexOf(row));
    };
  }, [onRemoved]);
  return ref;
}
