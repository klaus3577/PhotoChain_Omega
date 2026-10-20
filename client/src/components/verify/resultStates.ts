// Az ellenőrzés eredményeinek megjelenése (L17 stílusútmutató – a bizalom vizuális nyelve): cím, ikon,
// hangnem (ui/panelTones.ts) és a közérthető magyarázat. A zöld kizárólag a láncon igazolt hitelességé;
// a hasonló kép borostyán (figyelmeztet, nem vádol); a „nincs a nyilvántartásban” szándékosan semleges –
// nem jelent hamisítást, csak azt, hogy nem a PhotoChainen regisztrálták.
import { type LucideIcon, ScanSearch, SearchX, ShieldCheck } from 'lucide-react';

import type { VerificationOutcome } from '../../api/verify.api';
import type { VerificationSource } from '../../verify/verificationGate';
import { PANEL_TONES, type PanelTone } from '../ui/panelTones';

export interface ResultState extends PanelTone {
  icon: LucideIcon;
  title: string;
  /** A magyarázat a forrás szerint (a hash alapú ellenőrzésnél nincs fájl) */
  lead: Record<VerificationSource, string>;
}

const SIMILAR_LEAD =
  'Nem azonos fájl, de egy regisztrált kép módosított – például átméretezett vagy újratömörített – változata lehet.';

export const RESULT_STATES: Record<VerificationOutcome, ResultState> = {
  VERIFIED: {
    icon: ShieldCheck,
    title: 'Hiteles, regisztrált kép',
    ...PANEL_TONES.trust,
    lead: {
      file: 'A fájl bitre megegyezik egy, a blokkláncon regisztrált képpel.',
      hash: 'Ezzel a SHA-256 hash-sel a blokkláncon regisztráltak egy képet.',
    },
  },
  SIMILAR: {
    icon: ScanSearch,
    title: 'Hasonló regisztrált kép',
    ...PANEL_TONES.caution,
    lead: { file: SIMILAR_LEAD, hash: SIMILAR_LEAD },
  },
  NOT_FOUND: {
    icon: SearchX,
    title: 'Nincs a nyilvántartásban',
    ...PANEL_TONES.neutral,
    lead: {
      file: 'Sem azonos, sem hasonló regisztrált képet nem találtunk. Ez nem jelenti, hogy a kép hamis – csak azt, hogy nem a PhotoChainen regisztrálták.',
      hash: 'Ezzel a hash-sel nem regisztráltak képet a PhotoChainen. Hasonló képet csak a kép feltöltésével keresünk – a hash önmagában erre nem elég.',
    },
  },
};
