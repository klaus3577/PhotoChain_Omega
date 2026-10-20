// Üres állapot (L17 stílusútmutató – „Fejléc és üres állapot”): szaggatott keretes doboz ikonnal,
// címmel, magyarázattal – és ha van, a továbblépés lehetőségével (pl. „Szűrők törlése”). Üres listánál
// mindig van javaslat a továbblépésre.
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Rövid magyarázat vagy javaslat */
  children?: ReactNode;
  /** A továbblépés gombja vagy hivatkozása */
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <Icon aria-hidden="true" className="size-8 text-fg-muted" />
      {/* A cím programból fókuszálható célpont (pl. üres fülre váltva – listSummary.ts) */}
      <p data-empty-title="" className="mt-3 font-medium focus:outline-none">
        {title}
      </p>
      {children && <p className="mt-1 max-w-md text-sm text-fg-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
