// A galéria fotókártyája (L17 stílusútmutató – „Fotókártya”): vízjeles bélyegkép, a cím a hivatkozás
// (címsor; a teljes kártya kattintható), fotós, ár, átlagos értékelés, „Hitelesítve” pajzs. A bélyegkép
// alt="" (a cím leírja); ha nincs vagy nem tölthető be, semleges helykitöltő áll a helyén.
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { axeViolations } from '../../test/axe';
import { PHOTO_ID, photoListItem } from '../../test/photos';
import type { PhotoListItem } from '../../api/photos.api';
import { PhotoCard } from './PhotoCard';

const NBSP = String.fromCharCode(0xa0);

function renderCard(overrides: Record<string, unknown> = {}) {
  const photo = photoListItem(overrides) as PhotoListItem;
  return render(
    <MemoryRouter>
      <PhotoCard photo={photo} />
    </MemoryRouter>,
  );
}

describe('PhotoCard', () => {
  it('a cím a kép adatlapjára mutató hivatkozás egy második szintű címsorban', () => {
    renderCard();

    const heading = screen.getByRole('heading', { level: 2, name: 'Őszi erdő ködben' });
    const link = screen.getByRole('link', { name: 'Őszi erdő ködben' });
    expect(heading).toContainElement(link);
    expect(link).toHaveAttribute('href', `/photos/${PHOTO_ID}`);
  });

  it('a bélyegkép díszítő (alt=""), méretarányos és lustán töltődik', () => {
    const { container } = renderCard();

    const image = container.querySelector('img')!;
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('src', `/media/thumbnails/${PHOTO_ID}.webp`);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('width', '1600');
    expect(image).toHaveAttribute('height', '1067');
  });

  it('a fotós, az ár, az átlagos értékelés (a darabszámmal) és a „Hitelesítve” jelzés', () => {
    const { container } = renderCard();
    const article = container.querySelector('article')!;

    expect(article).toHaveTextContent('Fotós Fanni');
    // A tagoló és a pénznem előtti szóköz nem törő (a „12 500 Ft” nem törik el); a toHaveTextContent ezt
    // nem látná (a nem törő szóközt sima szóközre cseréli), ezért a szöveget közvetlenül nézzük
    expect(article.textContent).toContain(`12${NBSP}500${NBSP}Ft`);
    expect(article).toHaveTextContent('Értékelés: 4,6 (12 értékelés)');
    expect(article).toHaveTextContent('Hitelesítve');
  });

  it('a nem regisztrált képen (pl. később a saját képek listájában) nincs „Hitelesítve” jelzés', () => {
    const { container } = renderCard({ status: 'PENDING_CHAIN' });

    expect(container.querySelector('article')).not.toHaveTextContent('Hitelesítve');
  });

  it('értékelés nélküli képnél „nincs értékelés”', () => {
    const { container } = renderCard({ rating: { average: null, count: 0 } });

    expect(container.querySelector('article')).toHaveTextContent('nincs értékelés');
  });

  it('hiányzó bélyegkép helyén semleges helykitöltő', () => {
    const { container } = renderCard({ thumbnailUrl: null });

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Előnézet nem érhető el')).toBeInTheDocument();
  });

  it('ha a bélyegkép nem tölthető be, a helykitöltő váltja fel (a rács nem esik szét)', () => {
    const { container } = renderCard();

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Előnézet nem érhető el')).toBeInTheDocument();
  });

  it('nincs akadálymentességi hiba', async () => {
    const { container } = renderCard();

    expect(await axeViolations(container)).toEqual([]);
  });
});
