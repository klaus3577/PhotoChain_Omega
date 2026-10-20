// Fókusz útvonalváltáskor (L18; a célrészlet kezelése – L24): az új oldal címére kerül, kivéve ha a
// cím célrészletet (#azonosító) nevez meg, és az elem a fő tartalomban van – akkor oda. Ha az oldal
// maga már a célrészletre (vagy bele) tette a fókuszt (mint a PhotoReviews az #ertekeles-nél), a layout
// nem viszi el; az oldalon belüli célrészlet-váltás és a vissza-navigáció nem mozdítja a célrészletre.
import { act, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { createRoutes } from '../routes/router';
import { renderRoute } from '../test/renderRoute';

/** Próbaoldal: célrészletek a fő tartalomban, egy azon kívül (portál), és egy saját kezelésű (#sajat). */
function ProbePage() {
  const { hash } = useLocation();
  const innerRef = useRef<HTMLButtonElement>(null);
  // Mint a PhotoReviews az #ertekeles-nél: az oldal a célrészleten belüli vezérlőre teszi a fókuszt
  useEffect(() => {
    if (hash === '#sajat') innerRef.current?.focus();
  }, [hash]);
  return (
    <div>
      <h1>Próbaoldal</h1>
      <section id="cel">
        <h2>Célrészlet</h2>
      </section>
      <div id="sajat">
        <button ref={innerRef} type="button">
          Belső gomb
        </button>
      </div>
      {createPortal(<p id="kint">A fő tartalmon kívül</p>, document.body)}
    </div>
  );
}

const routes = () => createRoutes([{ path: '_proba', Component: ProbePage }]);
const heading = () => screen.getByRole('heading', { level: 1, name: 'Próbaoldal' });

/** Útvonalváltás a 404-es oldalról (annak nincs kérése) a próbaoldalra. */
async function navigateTo(path: string) {
  const view = renderRoute('/nincs-ilyen', routes());
  await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });
  await act(() => view.router.navigate(path));
  await screen.findByRole('heading', { level: 1, name: 'Próbaoldal' });
  return view;
}

describe('useRouteFocus – a cím célrészlete', () => {
  it('útvonalváltáskor a célrészlet eleme kapja a fókuszt, ha a fő tartalomban van', async () => {
    await navigateTo('/_proba#cel');

    await waitFor(() => expect(document.getElementById('cel')).toHaveFocus());
  });

  it('ha a célrészlet nincs meg, a fő tartalmon kívül van vagy hibásan kódolt: az oldal címe', async () => {
    for (const hash of ['#nincs', '#kint', '#%E0%A4%A']) {
      const view = await navigateTo(`/_proba${hash}`);
      await waitFor(() => expect(heading()).toHaveFocus());
      view.unmount();
    }
  });

  it('ha az oldal maga már a célrészletbe tette a fókuszt, a layout nem viszi el (PhotoReviews – #ertekeles)', async () => {
    await navigateTo('/_proba#sajat');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Belső gomb' })).toHaveFocus());
  });

  it('ugyanazon az oldalon a célrészlet váltása nem mozdítja a fókuszt', async () => {
    const { router } = await navigateTo('/_proba');
    const button = screen.getByRole('button', { name: 'Belső gomb' });
    act(() => button.focus());

    await act(() => router.navigate('/_proba#cel'));

    expect(router.state.location.hash).toBe('#cel');
    expect(button).toHaveFocus();
  });

  it('vissza-navigációnál (POP) a célrészlet helyett az oldal címe: a görgetés a korábbi helyre áll vissza, a fókusz ne ugorjon máshová', async () => {
    const { router } = await navigateTo('/_proba#cel');
    await waitFor(() => expect(document.getElementById('cel')).toHaveFocus());
    await act(() => router.navigate('/nincs-ilyen'));
    await screen.findByRole('heading', { level: 1, name: 'Az oldal nem található' });

    await act(() => router.navigate(-1));

    await screen.findByRole('heading', { level: 1, name: 'Próbaoldal' });
    expect(router.state.location.hash).toBe('#cel');
    await waitFor(() => expect(heading()).toHaveFocus());
  });
});
