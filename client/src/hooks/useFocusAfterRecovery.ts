// Ha a hibanézet a sikeres újrapróbálás után eltűnik, vele tűnik el a fókuszban lévő Újrapróbálás gomb
// is – a fókusz a body-ra esne. Helyette a betöltött tartalom elejére (pl. a találatszámra, a szakasz
// címére) kerül, így a billentyűzettel és képernyőolvasóval is onnan folytatható (WCAG 2.4.3). Ha a
// felhasználó közben máshová vitte a fókuszt, ott marad, és a siker bejelentés formájában jut el hozzá
// (mint a védett útvonal ellenőrzésénél, L19).
import { type RefObject, useEffect, useRef } from 'react';

import { useAnnounce } from '../components/ui/useAnnounce';
import { focusElement } from '../lib/focus';

export function useFocusAfterRecovery(
  failed: boolean,
  target: RefObject<HTMLElement | null>,
  /** A bejelentés, ha a fókusz máshol van (pl. „Az értékelések betöltődtek.”) */
  recoveredMessage: string,
) {
  const announce = useAnnounce();
  const failedBefore = useRef(failed);

  useEffect(() => {
    const before = failedBefore.current;
    failedBefore.current = failed;
    if (!before || failed) return;
    if (document.activeElement === document.body && target.current) focusElement(target.current);
    else announce(recoveredMessage);
  }, [failed, target, recoveredMessage, announce]);
}
