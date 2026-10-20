import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axeViolations } from '../../test/axe';
import { TextField } from './TextField';

describe('TextField', () => {
  it('a látható címke a mezőhöz kötött', () => {
    render(<TextField label="Cím" />);

    expect(screen.getByLabelText('Cím')).toBeInstanceOf(HTMLInputElement);
  });

  it('a súgó és a hiba is a mező leírása (aria-describedby), hibánál aria-invalid', () => {
    render(
      <TextField label="Ár (Ft)" help="Egész forint." error="Az ár legalább 175 Ft legyen." />,
    );

    const input = screen.getByLabelText('Ár (Ft)');
    expect(input).toHaveAccessibleDescription('Egész forint. Az ár legalább 175 Ft legyen.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('hiba nélkül nincs aria-invalid, és a leírás csak a súgó', () => {
    render(<TextField label="Cím" help="Rövid, beszédes cím." />);

    const input = screen.getByLabelText('Cím');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('Rövid, beszédes cím.');
  });

  it('a hibaüzenet ikonnal és szöveggel jelenik meg, nem csak színnel', () => {
    render(<TextField label="Ár (Ft)" error="Az ár legalább 175 Ft legyen." />);

    const error = screen.getByText('Az ár legalább 175 Ft legyen.');
    expect(error.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('nincs akadálymentességi hiba (axe)', async () => {
    const { container } = render(
      <TextField label="Ár (Ft)" help="Egész forint." error="Az ár legalább 175 Ft legyen." />,
    );

    expect(await axeViolations(container)).toEqual([]);
  });
});
