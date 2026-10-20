// Fókuszmentés: ha egy elem úgy tűnik el, hogy benne volt a fókusz (pl. a munkamenet változásakor a
// fejléc fiókmenüje vagy belépési hivatkozásai cserélődnek), a fókusz a <body>-ra esne, és a
// billentyűzetes felhasználó elveszítené a helyét (WCAG 2.4.3). Ilyenkor az oldal címére kerül. A
// layout-effekt takarítása még az elem DOM-ból való eltávolítása előtt fut, így a fókusz helye még
// ellenőrizhető; maga a fókuszálás a következő taszkban történik, amikor az új tartalom már megvan.
import { useLayoutEffect, type RefObject } from 'react';

import { focusPageHeading } from '../lib/focus';

export function useFocusRescueOnUnmount(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    return () => {
      if (element?.contains(document.activeElement)) window.setTimeout(focusPageHeading, 0);
    };
  }, [ref]);
}
