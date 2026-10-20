import { use } from 'react';

import { LiveRegionContext, type Announce, type LiveRegion } from './liveRegionContext';

function useLiveRegion(): LiveRegion {
  const region = use(LiveRegionContext);
  if (!region) throw new Error('A useAnnounce csak a LiveRegionProvider alatt használható.');
  return region;
}

/** Bejelentő függvény az oldal élő régiójához; csak a LiveRegionProvider alatt használható. */
export function useAnnounce(): Announce {
  return useLiveRegion().announce;
}

/** Az oldalváltás utánra kért bejelentés kiküldése – a layout hívja a fókusz áthelyezése után. */
export function useFlushPendingAnnouncement(): () => void {
  return useLiveRegion().flushPending;
}
