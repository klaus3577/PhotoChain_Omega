import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Upload } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Button, ButtonLink } from './Button';

describe('Button', () => {
  it('alapból type="button" – űrlapban sem küld véletlenül', () => {
    render(<Button>Mentés</Button>);

    expect(screen.getByRole('button', { name: 'Mentés' })).toHaveAttribute('type', 'button');
  });

  it('színátmenet csak annak, aki nem kért kevesebb mozgást (prefers-reduced-motion)', () => {
    render(<Button>Mentés</Button>);

    const button = screen.getByRole('button', { name: 'Mentés' });
    expect(button).toHaveClass('motion-safe:transition-colors');
    expect(button).not.toHaveClass('transition-colors');
  });

  it('a változat a szerepalapú tokenekből színez (az elsődleges piros, a veszélyes körvonalas)', () => {
    render(
      <>
        <Button variant="primary">Megveszem</Button>
        <Button variant="danger">Letiltás</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Megveszem' })).toHaveClass(
      'bg-primary',
      'text-on-primary',
    );
    expect(screen.getByRole('button', { name: 'Letiltás' })).toHaveClass(
      'border-danger',
      'text-danger',
    );
  });

  it('folyamatban: aria-disabled (nem disabled – a fókusz megmarad), a kattintás hatástalan', async () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Fizetés indítása…
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Fizetés indítása…' });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('folyamatban lévő küldőgomb az űrlapot sem küldi el újra (dupla beküldés ellen)', async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <Button type="submit" busy>
          Mentés…
        </Button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mentés…' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('az ikon dekoratív: a gomb neve a felirat', () => {
    render(<Button icon={Upload}>Feltöltés</Button>);

    const button = screen.getByRole('button', { name: 'Feltöltés' });
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ButtonLink', () => {
  it('gombstílusú hivatkozás a megadott útvonalra', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/" variant="outline">
          Vissza a kezdőlapra
        </ButtonLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Vissza a kezdőlapra' });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveClass('border-line-strong');
  });
});
