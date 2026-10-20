import { render, screen } from '@testing-library/react';
import { ShieldCheck } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { StatusBadge, type Tone } from './StatusBadge';

describe('StatusBadge', () => {
  it('ikon + szöveg: az állapotot a szöveg mondja, a szín csak megerősít (WCAG 1.4.1)', () => {
    render(
      <StatusBadge tone="trust" icon={ShieldCheck}>
        Hitelesítve
      </StatusBadge>,
    );

    const badge = screen.getByText('Hitelesítve');
    expect(badge).toHaveClass('text-trust-700', 'bg-trust-50');
    expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('mind a négy tónus a stílusútmutató színeit kapja', () => {
    const expected: Record<Tone, string> = {
      trust: 'text-trust-700',
      caution: 'text-caution-700',
      danger: 'text-danger',
      neutral: 'text-fg-muted',
    };
    for (const [tone, className] of Object.entries(expected) as [Tone, string][]) {
      const { unmount } = render(
        <StatusBadge tone={tone} icon={ShieldCheck}>
          {tone}
        </StatusBadge>,
      );
      expect(screen.getByText(tone)).toHaveClass(className);
      unmount();
    }
  });
});
