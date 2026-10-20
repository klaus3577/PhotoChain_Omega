// A saját kép állapotának megjelenése a vezérlőpulton (L22; L17 „A bizalom vizuális nyelve”): ugyanaz
// az ikon, szöveg és szín, mint a galériában és az adatlapon – a zöld kizárólag a blokkláncon igazolt
// hitelességé; a moderátori levétel piros, a saját elrejtés semleges. A megjegyzés megmondja, mi a
// teendő (semmi: az újrapróbálás az adminisztrátor dolga), illetve ki döntött a levételről. A
// műveletek az állapothoz igazodnak: a rejtett kép nem módosítható (a szerver 409-et adna), levenni
// csak a nyilvános (hitelesített) képet lehet – nem kínálunk meg nem valósítható lépést (Nielsen H5).
import { Ban, Clock, EyeOff, type LucideIcon, ShieldAlert, ShieldCheck } from 'lucide-react';

import type { HiddenBy, OwnPhotoListItem } from '../../api/photos.api';
import type { Tone } from '../ui/StatusBadge';

export interface OwnPhotoStatus {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  /** Rövid magyarázat a jelvény alatt (teendő, ki döntött) */
  note?: string;
  /** Moderátori levétel alatt áll: a vásárlók sem tölthetik le, a fotós nem oldhatja fel */
  takenDown: boolean;
}

type StatusFields = Pick<OwnPhotoListItem, 'status' | 'hiddenBy'>;

/** A moderátor (admin) döntése érvényben van – a tulajdonosé mellett is (server: photos.hiding.ts). */
export const isTakenDown = (hiddenBy: HiddenBy | null): boolean =>
  hiddenBy === 'ADMIN' || hiddenBy === 'OWNER_AND_ADMIN';

export function ownPhotoStatusOf(photo: StatusFields): OwnPhotoStatus {
  switch (photo.status) {
    case 'REGISTERED':
      return { tone: 'trust', icon: ShieldCheck, label: 'Hitelesítve', takenDown: false };
    case 'PENDING_CHAIN':
      return { tone: 'caution', icon: Clock, label: 'Regisztrálás folyamatban', takenDown: false };
    case 'CHAIN_FAILED':
      return {
        tone: 'danger',
        icon: ShieldAlert,
        label: 'Sikertelen regisztráció',
        note: 'Az adminisztrátor újrapróbálja.',
        takenDown: false,
      };
    case 'HIDDEN':
      return isTakenDown(photo.hiddenBy)
        ? {
            tone: 'danger',
            icon: Ban,
            label: 'Moderátor eltávolította',
            note: 'A vásárlók sem tölthetik le.',
            takenDown: true,
          }
        : {
            tone: 'neutral',
            icon: EyeOff,
            label: 'Elrejtve',
            note: 'Te vetted le a galériából.',
            takenDown: false,
          };
  }
}

/** A rejtett kép adatai nem módosíthatók (a levétel végleges). */
export const canEdit = (photo: StatusFields): boolean => photo.status !== 'HIDDEN';

/** Levenni csak a nyilvános (hitelesített) képet lehet; a függő és a sikertelen képet az admin kezeli. */
export const canHide = (photo: StatusFields): boolean => photo.status === 'REGISTERED';

/** A listában regisztrációra váró képek azonosítói (amíg van ilyen, a lista magától frissül). */
export const pendingPhotoIds = (
  photos: readonly Pick<OwnPhotoListItem, 'id' | 'status'>[] | undefined,
): string[] =>
  (photos ?? []).filter((photo) => photo.status === 'PENDING_CHAIN').map((photo) => photo.id);
