import { LoaderCircle } from 'lucide-react';

import { cx } from '../../lib/cx';

/**
 * Töltésjelző ikon – dekoratív (a folyamatot a mellette álló szöveg mondja el), és csak akkor forog,
 * ha a felhasználó nem kért kevesebb mozgást (prefers-reduced-motion).
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cx('size-4 shrink-0 motion-safe:animate-spin', className)}
    />
  );
}
