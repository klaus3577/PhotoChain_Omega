// A lapozó (L17 stílusútmutató – „Nézetváltó és lapozó”): hivatkozássor nav-ban, mert minden oldal
// saját URL (megosztható, a vissza gomb is működik). Az aktuális oldalt fekete háttér és
// aria-current="page" jelöli – nagy kontrasztú módban, ahol a háttér eltűnik, aláhúzás is. A nem
// létező irány nem jelenik meg (mint a GOV.UK lapozójánál): az első oldalon nincs „Előző”, az utolsón
// „Következő”; a nevük a hivatkozáslistában is érthető („Előző oldal”). A nem létező oldalról (pl. régi
// hivatkozás) az „Előző” az utolsó létező oldalra visz. Sok oldalnál az első, az utolsó és az aktuális
// környéke látszik; mobilon csak az irányok és „n. oldal (összesen m)”.
// Forrás: GOV.UK Design System – Pagination, https://design-system.service.gov.uk/components/pagination/
// (adaptálva)
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, type To } from 'react-router';

import { cx } from '../../lib/cx';

type PageItem = number | 'gap';

/**
 * A megjelenő oldalszámok: az első, az utolsó és az aktuális környéke (a szélén is három szám). Egyetlen
 * kimaradó oldal helyett maga az oldal áll (a „…” nem lenne rövidebb), több helyett „…”.
 */
function pageItems(page: number, totalPages: number): PageItem[] {
  const start = Math.max(1, Math.min(page - 1, totalPages - 2));
  const end = Math.min(totalPages, Math.max(page + 1, 3));
  const shown = new Set([1, totalPages]);
  for (let number = start; number <= end; number += 1) shown.add(number);
  const items: PageItem[] = [];
  for (const number of [...shown].sort((a, b) => a - b)) {
    const previous = items.at(-1);
    if (typeof previous === 'number' && number - previous === 2) items.push(previous + 1);
    else if (typeof previous === 'number' && number - previous > 2) items.push('gap');
    items.push(number);
  }
  return items;
}

const ITEM = 'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2.5 text-sm';
/** Rámutatáskor a háttér: csak a nem aktuális elemeken (az aktuális fehér szövege eltűnne rajta) */
const HOVER = 'hover:bg-surface';

interface DirectionProps {
  to: To;
  /** A teljes név („Előző oldal”) – a látható felirattal kezdődik */
  label: string;
  /** A lista elemének osztályai (pl. mobilon a jobb szélre igazítás) */
  className?: string;
  preventScrollReset?: boolean;
  children: ReactNode;
}

/** Előző / Következő oldal. */
function Direction({ to, label, className, preventScrollReset, children }: DirectionProps) {
  return (
    <li className={className}>
      <Link
        to={to}
        aria-label={label}
        preventScrollReset={preventScrollReset}
        className={cx(ITEM, HOVER)}
      >
        {children}
      </Link>
    </li>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Az oldal hivatkozásának célja – pl. a lekérdezés többi paraméterével („?q=tó&page=2”) */
  hrefFor: (page: number) => To;
  label?: string;
  /** A lapozás nem görgeti az oldal tetejére – ha a lista nem az oldal eleje (admin – L25) */
  preventScrollReset?: boolean;
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
  label = 'Lapozás',
  preventScrollReset,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={label} className="flex flex-col items-center gap-2">
      {/* Mobilon (csak az irányok látszanak) a két irány a két szélen áll, így nem ugrál, amikor a
          másik megjelenik vagy eltűnik */}
      <ul className="flex w-full flex-wrap items-center justify-between gap-1 sm:w-auto sm:justify-center">
        {page > 1 && (
          <Direction
            to={hrefFor(Math.min(page - 1, totalPages))}
            label="Előző oldal"
            preventScrollReset={preventScrollReset}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Előző
          </Direction>
        )}
        {pageItems(page, totalPages).map((item, index) =>
          item === 'gap' ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="hidden px-1 text-sm text-fg-muted sm:block"
            >
              …
            </li>
          ) : (
            <li key={item} className="hidden sm:block">
              <Link
                to={hrefFor(item)}
                aria-label={`${item}. oldal`}
                aria-current={item === page ? 'page' : undefined}
                preventScrollReset={preventScrollReset}
                className={cx(
                  ITEM,
                  'tabular-nums',
                  item === page ? 'bg-black font-medium text-white forced-colors:underline' : HOVER,
                )}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        {page < totalPages && (
          <Direction
            to={hrefFor(page + 1)}
            label="Következő oldal"
            className="ml-auto sm:ml-0"
            preventScrollReset={preventScrollReset}
          >
            Következő
            <ChevronRight aria-hidden="true" className="size-4" />
          </Direction>
        )}
      </ul>
      <p className="text-sm text-fg-muted sm:hidden">
        {page}. oldal (összesen {totalPages})
      </p>
    </nav>
  );
}
