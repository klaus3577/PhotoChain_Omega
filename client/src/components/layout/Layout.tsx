// Az oldalak közös váza (L17 drótvázak): ugrólink, fejléc, fő tartalom, lábléc. Az élő régió a
// layout része, így már az első bejelentés előtt a DOM-ban van; útvonalváltáskor a fókusz az új oldal
// címére kerül (ezután hangzik el az oldalváltás utánra kért bejelentés – ezért a keret az élő régió
// alatt van), és a görgetés az oldal tetejére áll (vissza-navigációnál a korábbi helyre). A fő
// tartalom csak az ugrólink használatakor fókuszálható (ideiglenes tabindex, lib/focus.ts).
import { useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';

import { useRouteFocus } from '../../hooks/useRouteFocus';
import { cx } from '../../lib/cx';
import { focusElement } from '../../lib/focus';
import { LiveRegionProvider } from '../ui/LiveRegion';
import { Footer } from './Footer';
import { Header } from './Header';

// Az ugrólink rejtett, és csak billentyűzetes fókusznál jelenik meg a bal felső sarokban (WCAG 2.4.1)
const SKIP_LINK = cx(
  'sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50',
  'focus:rounded-md focus:bg-canvas focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-card',
);

export function Layout() {
  return (
    <LiveRegionProvider>
      <PageFrame />
      <ScrollRestoration />
    </LiveRegionProvider>
  );
}

function PageFrame() {
  const mainRef = useRef<HTMLElement>(null);
  useRouteFocus(mainRef);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#tartalom"
        onClick={() => mainRef.current && focusElement(mainRef.current)}
        className={SKIP_LINK}
      >
        Ugrás a tartalomra
      </a>
      <Header />
      <main
        id="tartalom"
        ref={mainRef}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 focus:outline-none sm:px-6"
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
