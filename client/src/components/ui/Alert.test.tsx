import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert } from './Alert';

describe('Alert', () => {
  it('a hiba role="alert": címmel, szöveggel és ikonnal', () => {
    render(
      <Alert tone="danger" title="Nem sikerült a feltöltés.">
        A fájl legfeljebb 15 MB lehet.
      </Alert>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Nem sikerült a feltöltés. A fájl legfeljebb 15 MB lehet.');
    expect(alert).toHaveClass('text-danger');
    expect(alert.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('a tájékoztatás nem élő régió (a bejelentést az egyetlen LiveRegion végzi), semleges színnel', () => {
    render(<Alert tone="info">A regisztráció folyamatban.</Alert>);

    const box = screen.getByText('A regisztráció folyamatban.').closest('div');
    expect(box).not.toHaveAttribute('role');
    expect(box).toHaveClass('text-fg');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
