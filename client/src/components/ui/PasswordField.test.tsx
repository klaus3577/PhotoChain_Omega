// Jelszómező megjelenítő kapcsolóval: a gomb a mező után áll (a Tab a mezőből a gombra visz), az
// állapotát az aria-pressed és az ikon is jelzi; beküldéskor és a vissza-gyorsítótárból visszaállított
// oldalon a jelszó újra rejtett.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PasswordField } from './PasswordField';

function LoginForm({ onSubmit }: { onSubmit: (passwordType: string) => void }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.querySelector('input');
        onSubmit(input?.type ?? '');
      }}
    >
      <PasswordField label="Jelszó" autoComplete="current-password" />
      <button type="submit">Belépés</button>
    </form>
  );
}

const renderForm = (onSubmit: (passwordType: string) => void = () => {}) => {
  render(<LoginForm onSubmit={onSubmit} />);
  return {
    user: userEvent.setup(),
    input: screen.getByLabelText('Jelszó'),
    toggle: screen.getByRole('button', { name: 'Jelszó megjelenítése' }),
  };
};

describe('PasswordField', () => {
  it('a megjelenítő gomb a mező után áll: a mezőből a Tab a gombra visz', async () => {
    const { user, input, toggle } = renderForm();

    expect(input.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(input);
    await user.tab();

    expect(toggle).toHaveFocus();
  });

  it('a gomb állapotát az aria-pressed és a megjelenése (benyomva sötét, inverz gomb) jelzi; az ikon állandó, mint a felirat', async () => {
    const { user, input, toggle } = renderForm();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveClass('aria-pressed:bg-black', 'aria-pressed:text-white');

    await user.click(toggle);

    expect(input).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle.querySelector('svg.lucide-eye')).not.toBeNull();
    expect(toggle.querySelector('svg.lucide-eye-off')).toBeNull();
  });

  it('beküldéskor a jelszó még az űrlap feldolgozása előtt újra rejtett (a jelszókezelő jelszómezőként látja)', async () => {
    const onSubmit = vi.fn();
    const { user, input, toggle } = renderForm(onSubmit);
    await user.click(toggle);

    await user.click(screen.getByRole('button', { name: 'Belépés' }));

    expect(onSubmit).toHaveBeenCalledWith('password');
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('a vissza-gyorsítótárból (bfcache) visszaállított oldalon is rejtett', async () => {
    const { user, input, toggle } = renderForm();
    await user.click(toggle);

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    });
    expect(input).toHaveAttribute('type', 'text');
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    expect(input).toHaveAttribute('type', 'password');
  });
});
