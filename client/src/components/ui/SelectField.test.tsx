import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axeViolations } from '../../test/axe';
import { SelectField } from './SelectField';

const options = (
  <>
    <option value="">Válassz…</option>
    <option value="1">Tájkép</option>
  </>
);

describe('SelectField', () => {
  it('a látható címke a választóhoz kötött, az opciók benne vannak', () => {
    render(<SelectField label="Kategória">{options}</SelectField>);

    const select = screen.getByLabelText('Kategória');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole('option', { name: 'Tájkép' })).toBeInTheDocument();
  });

  it('a súgó és a hiba is a mező leírása (aria-describedby), hibánál aria-invalid', () => {
    render(
      <SelectField label="Kategória" help="Egyet válassz." error="Válassz kategóriát.">
        {options}
      </SelectField>,
    );

    const select = screen.getByLabelText('Kategória');
    expect(select).toHaveAccessibleDescription('Egyet válassz. Válassz kategóriát.');
    expect(select).toHaveAttribute('aria-invalid', 'true');
  });

  it('hiba nélkül nincs aria-invalid, és a leírás csak a súgó', () => {
    render(
      <SelectField label="Kategória" help="Egyet válassz.">
        {options}
      </SelectField>,
    );

    const select = screen.getByLabelText('Kategória');
    expect(select).not.toHaveAttribute('aria-invalid');
    expect(select).toHaveAccessibleDescription('Egyet válassz.');
  });

  it('a hibaüzenet ikonnal és szöveggel jelenik meg, nem csak színnel', () => {
    render(
      <SelectField label="Kategória" error="Válassz kategóriát.">
        {options}
      </SelectField>,
    );

    const error = screen.getByText('Válassz kategóriát.');
    expect(error.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('nincs akadálymentességi hiba (axe)', async () => {
    const { container } = render(
      <SelectField label="Kategória" help="Egyet válassz." error="Válassz kategóriát.">
        {options}
      </SelectField>,
    );

    expect(await axeViolations(container)).toEqual([]);
  });
});
