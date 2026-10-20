// A kép állapota és művelete az adminfelületen (L25; L17 „A bizalom vizuális nyelve”): ugyanaz az
// ikon, szöveg és szín, mint a galériában és a vezérlőpulton – a zöld kizárólag a láncon igazolt
// hitelességé, a moderátori levétel piros, a tulajdonos elrejtése semleges. A művelet az állapothoz
// igazodik (drótváz 5–7. jegyzet): elrejteni a nyilvános képet lehet, újrapróbálni a sikertelen
// regisztrációt, visszaállítani a moderátori levételt; a függő képnél és a tulajdonos saját
// elrejtésénél nincs művelet, csak magyarázat – a felület nem kínál meg nem valósítható lépést.
import { Ban, Clock, EyeOff, type LucideIcon, ShieldAlert, ShieldCheck } from 'lucide-react';

import type { AdminPhoto } from '../../api/admin.api';
import { isTakenDown } from '../dashboard/ownPhotoStatus';
import type { Tone } from '../ui/StatusBadge';

export interface AdminPhotoStatus {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  /** Rövid magyarázat a jelvény alatt */
  note?: string;
}

type StatusFields = Pick<AdminPhoto, 'status' | 'hiddenBy'>;

export function adminPhotoStatusOf(photo: StatusFields): AdminPhotoStatus {
  switch (photo.status) {
    case 'REGISTERED':
      return { tone: 'trust', icon: ShieldCheck, label: 'Hitelesítve' };
    case 'PENDING_CHAIN':
      return { tone: 'caution', icon: Clock, label: 'Regisztrálás folyamatban' };
    case 'CHAIN_FAILED':
      return { tone: 'danger', icon: ShieldAlert, label: 'Sikertelen regisztráció' };
    case 'HIDDEN':
      if (!isTakenDown(photo.hiddenBy)) {
        return { tone: 'neutral', icon: EyeOff, label: 'Elrejtve (tulajdonos)' };
      }
      return {
        tone: 'danger',
        icon: Ban,
        label: 'Moderátor eltávolította',
        note: photo.hiddenBy === 'OWNER_AND_ADMIN' ? 'A tulajdonos is elrejtette.' : undefined,
      };
  }
}

export type AdminPhotoAction = 'hide' | 'retry' | 'restore';

/** A sor művelete, vagy – ha nincs – a magyarázat szövege a helyén. */
export type AdminPhotoActionOrNote = { action: AdminPhotoAction } | { note: string };

export function adminPhotoActionOf(photo: StatusFields): AdminPhotoActionOrNote {
  switch (photo.status) {
    case 'REGISTERED':
      return { action: 'hide' };
    case 'CHAIN_FAILED':
      return { action: 'retry' };
    case 'PENDING_CHAIN':
      return { note: 'várakozás a láncra' };
    case 'HIDDEN':
      return isTakenDown(photo.hiddenBy) ? { action: 'restore' } : { note: 'a tulajdonos döntése' };
  }
}
