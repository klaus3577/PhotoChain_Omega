// Fókuszkezelés útvonalváltáskor: egyoldalas alkalmazásban a böngésző nem tölt új oldalt, ezért a
// fókusz a megnyomott hivatkozáson maradna. Oldalváltáskor az új oldal címére (h1) tesszük – ennek
// hiányában a fő tartalomra –, így a képernyőolvasó az új oldallal kezd (WCAG 2.4.3). Ha az új cím
// célrészletet (#azonosító) nevez meg, és az elem a fő tartalomban van, a fókusz oda kerül (pl. az
// adatlap „Mit jelent ez?” hivatkozása → a magyarázat címe, L24); a ScrollRestoration oda is görget. Ha
// az oldal maga már a célrészletre (vagy bele) tette a fókuszt (PhotoReviews – #ertekeles), nem visszük
// el; vissza-navigációnál (POP) a célrészlet helyett a cím kapja, mert a görgetés a korábbi helyre áll
// vissza. Az első betöltéskor nem mozdítjuk: ott a böngésző alapviselkedése a helyes (kivétel a
// váratlan hiba oldala, amely maga teszi a fókuszt a címére – RouteErrorPage). A fókusz görgetés nélkül
// kerül a célra: a ScrollRestoration már beállította a helyzetet. Az oldalváltás utánra kért bejelentés
// (pl. „Bejelentkeztél”) csak a fókusz áthelyezése után hangzik el.
// Forrás: React Router – Accessibility, https://reactrouter.com/how-to/accessibility; React Router –
// useNavigationType, https://reactrouter.com/api/hooks/useNavigationType (adaptálva)
import { useEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router';

import { useFlushPendingAnnouncement } from '../components/ui/useAnnounce';
import { focusElement } from '../lib/focus';

/** A cím célrészletének eleme a fő tartalomban, ha van (a hibásan kódolt részlet nem mutat sehová). */
function fragmentTarget(main: HTMLElement, hash: string): HTMLElement | null {
  if (hash === '') return null;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
  const target = document.getElementById(id);
  return target instanceof HTMLElement && main.contains(target) ? target : null;
}

export function useRouteFocus(mainRef: RefObject<HTMLElement | null>): void {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef(pathname);
  const flushPendingAnnouncement = useFlushPendingAnnouncement();

  useEffect(() => {
    // Csak útvonalváltáskor; az oldalon belüli célrészlet-váltás nem mozdítja a fókuszt
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    const main = mainRef.current;
    if (main) {
      const target = navigationType === 'POP' ? null : fragmentTarget(main, hash);
      // Az oldal már a célrészletbe tette a fókuszt (a gyermek effektusa előbb fut): marad
      const handledByPage = target !== null && target.contains(document.activeElement);
      if (!handledByPage) {
        if (target) focusElement(target);
        // Nincs célrészlet, vagy nem tudta fogadni a fókuszt (pl. rejtett): az oldal címe
        if (document.activeElement !== target) {
          focusElement(main.querySelector<HTMLElement>('h1') ?? main);
        }
      }
    }
    flushPendingAnnouncement();
  }, [pathname, hash, navigationType, mainRef, flushPendingAnnouncement]);
}
