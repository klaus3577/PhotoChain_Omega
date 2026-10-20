// Az egész oldalas betöltésjelző (L26): a szöveg látszik, a jelző ikon dekoratív, és a nézet a
// hajtásig ér – a megérkező tartalom nem tolja el a láblécet (elrendezés-ugrás, CLS).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingView } from './LoadingView';

describe('LoadingView', () => {
  it('a betöltés szövege látszik, az ikon rejtett, a nézet legalább a hajtásig ér', () => {
    render(<LoadingView text="Kép betöltése…" />);

    const view = screen.getByText('Kép betöltése…');
    expect(view).toHaveClass('min-h-[calc(100dvh-9rem)]');
    expect(view.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
