// A lapozó (L17 stílusútmutató – „Nézetváltó és lapozó”): hivatkozássor nav-ban; az aktuális oldal
// aria-current="page"; a nem létező irány (az első oldalon az „Előző”, az utolsón a „Következő”) nem
// jelenik meg (mint a GOV.UK lapozójánál). Sok oldalnál az első, az utolsó és az aktuális környéke
// látszik, a kihagyást „…” jelzi; mobilon csak „n. oldal (összesen m)”.
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { axeViolations } from '../../test/axe';
import { Pagination } from './Pagination';

function renderPagination(page: number, totalPages: number) {
  return render(
    <MemoryRouter>
      <Pagination page={page} totalPages={totalPages} hrefFor={(n) => `?q=erd%C5%91&page=${n}`} />
    </MemoryRouter>,
  );
}

/** A lapozó elemei sorban: szám, „…” (a képernyőolvasó elől rejtve), illetve az irányok felirata. */
function itemsOf(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole('listitem', { hidden: true })
    .map((item) => item.textContent ?? '');
}

describe('Pagination', () => {
  it('egyetlen oldalnál nincs lapozó', () => {
    const { container } = renderPagination(1, 1);

    expect(container).toBeEmptyDOMElement();
  });

  it('az első oldalon nincs „Előző”; az aktuális oldal jelölt, a többi hivatkozás', () => {
    renderPagination(1, 3);

    const nav = screen.getByRole('navigation', { name: 'Lapozás' });
    expect(itemsOf(nav)).toEqual(['1', '2', '3', 'Következő']);
    expect(within(nav).getByRole('link', { name: '1. oldal' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: '2. oldal' })).toHaveAttribute(
      'href',
      '/?q=erd%C5%91&page=2',
    );
    // A név a hivatkozáslistában is érthető: „Következő oldal” (a látható szöveggel kezdődik)
    expect(within(nav).getByRole('link', { name: 'Következő oldal' })).toHaveAttribute(
      'href',
      '/?q=erd%C5%91&page=2',
    );
  });

  it('az utolsó oldalon nincs „Következő”; az előző két oldal és az első látszik', () => {
    renderPagination(8, 8);

    const nav = screen.getByRole('navigation', { name: 'Lapozás' });
    expect(itemsOf(nav)).toEqual(['Előző', '1', '…', '6', '7', '8']);
    expect(within(nav).getByRole('link', { name: 'Előző oldal' })).toHaveAttribute(
      'href',
      '/?q=erd%C5%91&page=7',
    );
  });

  it('középen az aktuális oldal környéke; egyetlen kimaradó oldal helyett maga az oldal áll', () => {
    renderPagination(4, 8);

    const nav = screen.getByRole('navigation', { name: 'Lapozás' });
    expect(itemsOf(nav)).toEqual(['Előző', '1', '2', '3', '4', '5', '…', '8', 'Következő']);
  });

  it('a nem létező oldalról (pl. régi hivatkozás) az „Előző” az utolsó létező oldalra visz', () => {
    renderPagination(5, 2);

    const nav = screen.getByRole('navigation', { name: 'Lapozás' });
    expect(within(nav).getByRole('link', { name: 'Előző oldal' })).toHaveAttribute(
      'href',
      '/?q=erd%C5%91&page=2',
    );
    expect(within(nav).queryByRole('link', { name: 'Következő oldal' })).toBeNull();
  });

  it('a rövid összegzés: „n. oldal (összesen m)” (mobilon csak ez látszik)', () => {
    renderPagination(4, 8);

    expect(screen.getByText('4. oldal (összesen 8)')).toBeInTheDocument();
  });

  it('nincs akadálymentességi hiba', async () => {
    const { container } = renderPagination(4, 8);

    expect(await axeViolations(container)).toEqual([]);
  });
});
