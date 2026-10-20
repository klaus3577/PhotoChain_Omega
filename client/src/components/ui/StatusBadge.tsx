// Állapotjelvény (L17, a bizalom vizuális nyelve): mindig ikon + szöveg, a szín csak megerősít
// (WCAG 1.4.1). A zöld (trust) kizárólag a blokkláncon igazolt hitelességé.
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';

export type Tone = 'trust' | 'caution' | 'danger' | 'neutral';

const TONES: Record<Tone, string> = {
  trust: 'border-trust-200 bg-trust-50 text-trust-700',
  caution: 'border-caution-200 bg-caution-50 text-caution-700',
  danger: 'border-accent-200 bg-danger-surface text-danger',
  neutral: 'border-line bg-surface text-fg-muted',
};

interface StatusBadgeProps {
  tone: Tone;
  icon: LucideIcon;
  children: ReactNode;
}

export function StatusBadge({ tone, icon: Icon, children }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-medium',
        TONES[tone],
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </span>
  );
}
