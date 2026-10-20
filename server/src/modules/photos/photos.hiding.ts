// Ki rejtette el a képet (L16, Photo.hiddenBy): a tulajdonos, az admin (moderátori levétel), vagy
// mindkettő. A két döntés független – egyik fél sem szüntetheti meg a másikét:
// - a tulajdonos a saját elrejtésével nem oldhatja fel a moderátori levételt (különben a vásárlók
//   újra letölthetnék a levett képet), az admin pedig nem teheti nyilvánossá a tulajdonos által
//   visszavont képet (szerzői döntés, 2026-10-06);
// - az admin a tulajdonos által már elrejtett képen is rögzítheti a levételt.
// Az admin csak a saját levételét oldhatja fel: ha a tulajdonos is elrejtette, a kép rejtett marad.
import type { HiddenBy, PhotoStatus } from '../../generated/prisma/client.js';

/** Aki elrejti a képet. */
export type HidingParty = 'OWNER' | 'ADMIN';

/** A kép elrejtéssel kapcsolatos állapota. */
export interface HidingState {
  status: PhotoStatus;
  hiddenBy: HiddenBy | null;
}

/** Az elrejtés után a hiddenBy új értéke; null, ha a fél döntése már érvényben van (nincs változás). */
export function hiddenByAfterHide(current: HidingState, party: HidingParty): HiddenBy | null {
  if (current.status !== 'HIDDEN') return party;
  if (current.hiddenBy === party || current.hiddenBy === 'OWNER_AND_ADMIN') return null;
  return 'OWNER_AND_ADMIN';
}

/**
 * A moderátori levétel feloldása után: null – a kép újra nyilvános lehet; OWNER – a tulajdonos
 * döntése szerint rejtett marad.
 */
export function hiddenByAfterLiftingTakedown(current: 'ADMIN' | 'OWNER_AND_ADMIN'): 'OWNER' | null {
  return current === 'OWNER_AND_ADMIN' ? 'OWNER' : null;
}

/** Moderátori levétel alatt áll-e a kép (az admin döntése érvényben van – a tulajdonosé mellett is). */
export const isTakenDown = (hiddenBy: HiddenBy | null): boolean =>
  hiddenBy === 'ADMIN' || hiddenBy === 'OWNER_AND_ADMIN';
