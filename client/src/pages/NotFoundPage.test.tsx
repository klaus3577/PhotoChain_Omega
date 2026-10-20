import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { isClientSideNavigation } from '../test/links';
import { renderRoute } from '../test/renderRoute';

describe('NotFoundPage', () => {
  it('ismeretlen címen: cím, a keresett útvonal szó szerint (szövegként), és hivatkozás a kezdőlapra', async () => {
    const { container } = renderRoute('/nincs/<b>ilyen</b>');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' }),
    ).toBeInTheDocument();
    expect(screen.getByText('/nincs/<b>ilyen</b>').tagName).toBe('CODE');
    expect(container.querySelector('main b')).toBeNull();
    expect(screen.getByRole('link', { name: 'Vissza a kezdőlapra' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Az oldal nem található · PhotoChain');
  });

  it('a százalékkódolt címet olvashatóan, a hibás kódolásút változatlanul mutatja', async () => {
    const first = renderRoute('/k%C3%A9pek');
    expect((await screen.findByText('/képek')).tagName).toBe('CODE');
    first.unmount();

    renderRoute('/%E0%A4%A');
    expect((await screen.findByText('/%E0%A4%A')).tagName).toBe('CODE');
  });

  it('a vezérlő- és láthatatlan formázókaraktereket (pl. irányváltás) kiszűri', async () => {
    // jobbról balra váltás (U+202E), tabulátor, nulla szélességű szóköz (U+200B) – százalékkódolva
    renderRoute('/a%E2%80%AEb%09c%E2%80%8Bd');

    expect((await screen.findByText('/abcd')).tagName).toBe('CODE');
  });

  it('a sortörést tartalmazó címre is a 404-oldal jelenik meg (a „*” útvonal ilyenkor nem illeszkedik)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderRoute('/a%0Ab');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' }),
    ).toBeInTheDocument();
    expect(screen.getByText('/ab').tagName).toBe('CODE');
    expect(document.title).toBe('Az oldal nem található · PhotoChain');
    // Gyökérszinten (a layout helyett) a kezdőlapra teljes újratöltéssel visz – így a fókusz sem vész el
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(isClientSideNavigation(screen.getByRole('link', { name: 'Vissza a kezdőlapra' }))).toBe(
      false,
    );
  });

  it('a hosszú címet rövidítve mutatja (legfeljebb 100 karakter és „…”)', async () => {
    renderRoute(`/${'x'.repeat(150)}`);

    const code = await screen.findByText(/^\/x+…$/);
    expect(code.textContent).toBe(`/${'x'.repeat(99)}…`);
  });
});
