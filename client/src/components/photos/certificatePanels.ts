// A kép állapotainak megjelenése (L17 stílusútmutató – „Blokklánc-tanúsítvány”): cím, ikon és a
// bizalom vizuális nyelvének hangneme (ui/panelTones.ts) – a zöld kizárólag a blokkláncon igazolt
// hitelességé. Az adatlap tanúsítványdoboza (ChainCertificate) és a feltöltés állapotkártyája
// (RegistrationStatus) ugyanezt használja, így a két helyen azonos a jelzés.
import { Clock, EyeOff, type LucideIcon, ShieldAlert, ShieldCheck } from 'lucide-react';

import type { PhotoStatus } from '../../api/photos.api';
import { PANEL_TONES, type PanelTone } from '../ui/panelTones';

export interface PanelState extends PanelTone {
  icon: LucideIcon;
  title: string;
  note: string;
}

export const PANEL_STATES: Record<PhotoStatus, PanelState> = {
  REGISTERED: {
    icon: ShieldCheck,
    title: 'Hitelesítve a blokkláncon',
    ...PANEL_TONES.trust,
    note: 'A láncra csak az ujjlenyomat kerül, maga a kép nem. A rekord nyilvános és utólag nem módosítható.',
  },
  PENDING_CHAIN: {
    icon: Clock,
    title: 'Regisztrálás folyamatban',
    ...PANEL_TONES.caution,
    note: 'A tranzakció elküldve, megerősítésre vár. A tanúsítvány a megerősítés után jelenik meg; addig a kép csak neked látszik.',
  },
  CHAIN_FAILED: {
    icon: ShieldAlert,
    title: 'Sikertelen regisztráció',
    ...PANEL_TONES.danger,
    note: 'A tranzakció nem ment át. Az adminisztrátor újrapróbálhatja a regisztrációt.',
  },
  HIDDEN: {
    icon: EyeOff,
    title: 'Elrejtve',
    ...PANEL_TONES.neutral,
    note: 'A kép nem nyilvános. A láncon rögzített rekord megmarad, a hitelesség továbbra is ellenőrizhető.',
  },
};
