import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axeViolations } from '../../test/axe';
import { TextAreaField } from './TextAreaField';

describe('TextAreaField', () => {
  it('a látható címke a többsoros mezőhöz kötött; alapból három sor', () => {
    render(<TextAreaField label="Leírás (nem kötelező)" />);

    const field = screen.getByLabelText('Leírás (nem kötelező)');
    expect(field).toBeInstanceOf(HTMLTextAreaElement);
    expect(field).toHaveAttribute('rows', '3');
  });

  it('a súgó és a hiba is a mező leírása (aria-describedby), hibánál aria-invalid', () => {
    render(
      <TextAreaField
        label="Leírás"
        help="Legfeljebb 2000 karakter."
        error="A leírás legfeljebb 2000 karakter lehet."
      />,
    );

    const field = screen.getByLabelText('Leírás');
    expect(field).toHaveAccessibleDescription(
      'Legfeljebb 2000 karakter. A leírás legfeljebb 2000 karakter lehet.',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('hiba nélkül nincs aria-invalid, és a leírás csak a súgó', () => {
    render(<TextAreaField label="Leírás" help="Legfeljebb 2000 karakter." rows={5} />);

    const field = screen.getByLabelText('Leírás');
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(field).toHaveAccessibleDescription('Legfeljebb 2000 karakter.');
    expect(field).toHaveAttribute('rows', '5');
  });

  it('a hibaüzenet ikonnal és szöveggel jelenik meg, nem csak színnel', () => {
    render(<TextAreaField label="Leírás" error="A leírás nem tartalmazhat vezérlőkaraktert." />);

    const error = screen.getByText('A leírás nem tartalmazhat vezérlőkaraktert.');
    expect(error.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('nincs akadálymentességi hiba (axe)', async () => {
    const { container } = render(
      <TextAreaField
        label="Leírás"
        help="Legfeljebb 2000 karakter."
        error="A leírás legfeljebb 2000 karakter lehet."
      />,
    );

    expect(await axeViolations(container)).toEqual([]);
  });
});
