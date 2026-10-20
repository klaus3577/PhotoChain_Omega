// A kép állapotváltása a lekérdezett adatban (pl. PENDING_CHAIN → REGISTERED): látható értesítés és
// bemondás, a vezérlőpult saját képeinek frissítése, a hitelesítéskor a galéria listáié is. A
// feltöltés állapotkártyája (L21) és a saját, még függő kép adatlapja is ezt használja.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { type PhotoStatus, photoKeys } from '../api/photos.api';
import type { AnnounceTone } from '../components/ui/liveRegionContext';
import { useAnnounce } from '../components/ui/useAnnounce';

/** Az állapotváltás látható értesítése (mint a vezérlőpulton – L26): a hitelesítés siker, az elrejtés tájékoztatás */
const TRANSITION_MESSAGES: Partial<Record<PhotoStatus, { message: string; tone: AnnounceTone }>> = {
  REGISTERED: {
    message: 'A kép hitelesítve a blokkláncon, és megjelent a galériában.',
    tone: 'success',
  },
  HIDDEN: { message: 'A képet elrejtették.', tone: 'info' },
};

/**
 * Az állapot változásakor értesít és frissít; az első ismert állapot (az első betöltés) még nem
 * változás. Amíg nincs adat (undefined), nem történik semmi.
 */
export function useRegistrationTransition(status: PhotoStatus | undefined): void {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const seenStatus = useRef(status);
  useEffect(() => {
    if (status === undefined || seenStatus.current === status) return;
    const first = seenStatus.current === undefined;
    seenStatus.current = status;
    if (first) return;
    const transition = TRANSITION_MESSAGES[status];
    if (transition) announce(transition.message, { visible: true, tone: transition.tone });
    void queryClient.invalidateQueries({ queryKey: photoKeys.own() });
    if (status === 'REGISTERED') {
      void queryClient.invalidateQueries({ queryKey: photoKeys.lists() });
    }
  }, [status, announce, queryClient]);
}
