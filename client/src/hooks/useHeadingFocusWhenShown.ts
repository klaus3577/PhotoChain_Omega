// Az oldal címére teszi a fókuszt, amikor a betöltés véget ér (adatlap – L20, fotósprofil – L23): ha
// az útvonalváltás a fő tartalomra tette (betöltés közben még nem volt cím), vagy ha az oldalon már
// látszott valami (a gyorsítótárból azonnal is), és egy újratöltés (sikeres újrapróbálás,
// felhasználóváltás a másik lapon) a body-ra ejtette. Az első betöltéskor (fókusz a body-n) – mint a
// useRouteFocus – nem mozdítja. Ha a sikeres újrapróbálás közben a fókuszt máshová vitte, ott marad,
// és a betöltést az élő régió jelenti be.
import { useEffect, useRef } from 'react';

import { useAnnounce } from '../components/ui/useAnnounce';
import { focusPageHeading } from '../lib/focus';

/** Az oldal állapota: betöltés, kész, nem található, hiba. */
export type PageStatus = 'loading' | 'ready' | 'not-found' | 'error';

export function useHeadingFocusWhenShown(status: PageStatus, loadedMessage: string): void {
  const announce = useAnnounce();
  const previous = useRef(status);
  const shownBefore = useRef(status !== 'loading');

  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (before === status || status === 'loading') return;
    const active = document.activeElement;
    const lost = shownBefore.current && active === document.body;
    shownBefore.current = true;
    if (active === document.getElementById('tartalom') || lost) focusPageHeading();
    else if (before === 'error' && status === 'ready') announce(loadedMessage);
  }, [status, loadedMessage, announce]);
}
