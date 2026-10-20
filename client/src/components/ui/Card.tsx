import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';

interface CardProps {
  title: string;
  className?: string;
  children: ReactNode;
}

/**
 * Címmel ellátott tartalomdoboz. A cím (h2) a címsor-navigációban megtalálható; a doboz szándékosan
 * nem tájékozódási pont (név nélküli section) – a sok kártya különben teleszórná a landmark-listát.
 */
export function Card({ title, className, children }: CardProps) {
  return (
    <section className={cx('rounded-lg border border-line bg-canvas p-5 shadow-card', className)}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
