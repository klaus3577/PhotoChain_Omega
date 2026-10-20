// Hiba- és tájékoztató doboz (L17). A hiba role="alert" (a képernyőolvasó azonnal felolvassa), a
// tájékoztatás nem élő régió – a nem hibajellegű bejelentést az egyetlen LiveRegion végzi (WCAG 4.1.3).
import { CircleAlert, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';

interface AlertProps {
  tone: 'danger' | 'info';
  title?: string;
  children?: ReactNode;
}

export function Alert({ tone, title, children }: AlertProps) {
  const Icon = tone === 'danger' ? CircleAlert : Info;
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cx(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm leading-6',
        tone === 'danger'
          ? 'border-accent-200 bg-danger-surface text-danger'
          : 'border-line bg-surface text-fg',
      )}
    >
      <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <p>
        {title && <span className="font-medium">{title}</span>}
        {title && children ? ' ' : null}
        {children}
      </p>
    </div>
  );
}
