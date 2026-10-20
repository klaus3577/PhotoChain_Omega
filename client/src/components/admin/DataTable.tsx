// Adattábla az adminfelületen (L25; L17 drótváz „Adminisztráció”, 9. jegyzet; design README 1.4.10):
// keskeny képernyőn vízszintesen görgethető – az adattábla az újratördelés kivétele –, a görgethető
// doboz a táblázat (rejtett) feliratáról elnevezett tájékozódási pont (region), és a billentyűzettel
// is elérhető (tabindex="0": a görgetés a nyilakkal is működik). A fejléc cellái oszlopfejlécek
// (scope="col"), a sorok első cellája sorfejléc (a hívóé, scope="row"): a képernyőolvasó a cella
// oszlopát és sorát is mondja. Mobilon rövid jelzés a görgethetőségről.
// Forrás: Adrian Roselli – Under-Engineered Responsive Tables,
// https://adrianroselli.com/2020/11/under-engineered-responsive-tables.html (adaptálva)
import { useId, type ReactNode } from 'react';

import { cx } from '../../lib/cx';

/** A sorok celláinak közös osztálya */
export const CELL = 'px-4 py-3';
/** A sorfejléc (az első cella) osztálya: mint a többi cella, nem félkövér-középre igazított */
export const ROW_HEADER = `${CELL} text-left font-medium`;

interface DataTableProps {
  /** A táblázat neve („Felhasználók táblázata”) – a rejtett felirat és a régió neve */
  label: string;
  columns: readonly string[];
  /** A jobbra igazított oszlopok (pl. „Művelet”) */
  alignEnd?: readonly string[];
  /** A táblázat legkisebb szélessége (Tailwind-osztály): ennél keskenyebb képernyőn görgethető */
  minWidthClass: string;
  /** Frissítés közben (a régi lista látszik) */
  busy?: boolean;
  children: ReactNode;
}

export function DataTable({
  label,
  columns,
  alignEnd = [],
  minWidthClass,
  busy = false,
  children,
}: DataTableProps) {
  const captionId = useId();
  return (
    <div>
      <div
        role="region"
        tabIndex={0}
        aria-labelledby={captionId}
        aria-busy={busy || undefined}
        className="overflow-x-auto rounded-lg border border-line"
      >
        <table className={cx('w-full text-left text-sm', minWidthClass)}>
          <caption id={captionId} className="sr-only">
            {label}
          </caption>
          <thead className="bg-surface text-fg-muted">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={cx(
                    'px-4 py-2.5 font-medium',
                    alignEnd.includes(column) && 'text-right',
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-fg-muted sm:hidden">A táblázat vízszintesen görgethető.</p>
    </div>
  );
}
