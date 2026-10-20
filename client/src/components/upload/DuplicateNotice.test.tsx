// A 409-es kártya (L21): a riasztás csak az üzenet és a magyarázat (a hivatkozás és a gomb nem része a
// felolvasott riasztásnak); a meglévő kép hivatkozása csak a szerver formájú (UUID) azonosítóval készül.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api/http';
import { DuplicateNotice } from './DuplicateNotice';

const PHOTO_ID = '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const existing = {
  photoId: PHOTO_ID,
  title: 'Őszi erdő ködben',
  ownerDisplayName: 'Fotós Fanni',
  uploadedAt: '2026-10-04T12:30:00.000Z',
};

const renderNotice = (error: ApiError) =>
  render(
    <MemoryRouter>
      <DuplicateNotice error={error} onReplace={vi.fn()} />
    </MemoryRouter>,
  );

describe('DuplicateNotice', () => {
  it('hasonló kép a távolsággal: a riasztás az üzenet és a magyarázat; a meglévő kép adatai és a gomb a riasztáson kívül', () => {
    renderNotice(
      new ApiError(409, 'DUPLICATE_SIMILAR', 'Ehhez nagyon hasonló képet már feltöltöttek', {
        details: { ...existing, distance: 3 },
      }),
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Ehhez nagyon hasonló képet már feltöltöttek. Ugyanaz a kép – vagy egy módosított változata – nem tölthető fel újra. A két kép szinte teljesen egyezik: a 64 bites vizuális ujjlenyomatból 3 bit tér el.',
    );
    expect(alert).not.toHaveTextContent('Másik kép választása');
    expect(alert).not.toHaveTextContent('Meglévő kép');
    expect(screen.getByText('Meglévő kép:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Őszi erdő ködben' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(screen.getByText('Fotós Fanni · 2026. október 4.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Másik kép választása' })).toBeInTheDocument();
  });

  it('hasonló kép a távolság nélkül: nem állítja, hogy bitre azonos', () => {
    renderNotice(
      new ApiError(409, 'DUPLICATE_SIMILAR', 'Ehhez nagyon hasonló képet már feltöltöttek', {
        details: {},
      }),
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('A két kép szinte teljesen egyezik.');
    expect(alert).not.toHaveTextContent('bitre azonos');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('azonos kép: bitre azonos; részletek nélkül nincs hivatkozás', () => {
    renderNotice(
      new ApiError(409, 'DUPLICATE_EXACT', 'Ezt a képet már feltöltötték', {
        details: { distance: 0 },
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ezt a képet már feltöltötték. Ugyanaz a kép – vagy egy módosított változata – nem tölthető fel újra. A fájl bitre azonos egy már feltöltött képpel.',
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Meglévő kép:')).toBeNull();
  });

  it('gyanús azonosítóval (nem UUID) nincs hivatkozás, és a meglévő kép adatai sem jelennek meg', () => {
    for (const photoId of ['//evil.example', 'javascript:alert(1)', '../admin', '']) {
      const { unmount } = renderNotice(
        new ApiError(409, 'DUPLICATE_EXACT', 'Ezt a képet már feltöltötték', {
          details: { ...existing, photoId, distance: 0 },
        }),
      );

      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByText('Meglévő kép:')).toBeNull();
      unmount();
    }
  });
});
