// A 409-es válasz – már feltöltött (vagy nagyon hasonló) kép (L17 drótváz „Feltöltés”, 9. jegyzet): a
// szerver üzenete és a magyarázat előbb közérthetően, aztán a mérték (a 64 bites dHash eltérő bitjei);
// és – ha a meglévő kép nyilvános vagy a sajátja – annak címe (az adatlapjára mutató hivatkozással),
// fotósa és feltöltési ideje. Nem csak egy hibakód (Nielsen H9). A riasztás (role=alert) csak az üzenet
// és a magyarázat: a hivatkozást és a gombot a képernyőolvasó nem a riasztás részeként olvassa fel.
import { CopyX } from 'lucide-react';
import type { Ref } from 'react';
import { Link } from 'react-router';

import { isInteger, isIsoDate, isRecord, isString, isUuid } from '../../api/guards';
import type { ApiError } from '../../api/http';
import { formatDate } from '../../lib/format';
import { toSentence } from '../../lib/text';
import { Button } from '../ui/Button';

interface ExistingPhoto {
  photoId: string;
  title: string;
  ownerDisplayName: string;
  uploadedAt: string;
}

/** A meglévő kép adatai – csak akkor, ha a szerver megadta őket (nyilvános vagy saját kép), a szerver formájában. */
function existingPhotoOf(details: unknown): ExistingPhoto | null {
  if (!isRecord(details)) return null;
  const { photoId, title, ownerDisplayName, uploadedAt } = details;
  if (
    !isUuid(photoId) ||
    !isString(title) ||
    !isString(ownerDisplayName) ||
    !isIsoDate(uploadedAt)
  ) {
    return null;
  }
  return { photoId, title, ownerDisplayName, uploadedAt };
}

const distanceOf = (details: unknown): number | null =>
  isRecord(details) && isInteger(details.distance) ? details.distance : null;

/** A magyarázat a hibakód szerint – a távolság csak részlet, ha a szerver megadta. */
function explanationOf(code: string, distance: number | null): string {
  if (code !== 'DUPLICATE_SIMILAR') return 'A fájl bitre azonos egy már feltöltött képpel.';
  if (distance === null) return 'A két kép szinte teljesen egyezik.';
  return `A két kép szinte teljesen egyezik: a 64 bites vizuális ujjlenyomatból ${distance} bit tér el.`;
}

interface DuplicateNoticeProps {
  error: ApiError;
  /** Másik kép választása: a kiválasztott fájl törlődik, a fókusz a fájlválasztóra kerül */
  onReplace: () => void;
  /** A kártyára (az oldal a megjelenésekor a látótérbe görgeti) */
  ref?: Ref<HTMLDivElement>;
}

export function DuplicateNotice({ error, onReplace, ref }: DuplicateNoticeProps) {
  const existing = existingPhotoOf(error.details);

  return (
    <div ref={ref} className="rounded-lg border-2 border-danger bg-canvas p-4">
      <div role="alert">
        <p className="flex items-center gap-2 font-medium text-danger">
          <CopyX aria-hidden="true" className="size-5 shrink-0" />
          {toSentence(error.message) || 'Ezt a képet már feltöltötték.'}
        </p>{' '}
        <p className="mt-2 text-sm leading-6">
          Ugyanaz a kép – vagy egy módosított változata – nem tölthető fel újra.{' '}
          {explanationOf(error.code, distanceOf(error.details))}
        </p>
      </div>
      {existing && (
        <p className="mt-3 rounded-md bg-surface p-2.5 text-sm">
          <span className="text-fg-muted">Meglévő kép: </span>
          <Link
            to={`/photos/${existing.photoId}`}
            className="font-medium break-words underline underline-offset-2"
          >
            {existing.title}
          </Link>
          <span className="block text-fg-muted">
            {existing.ownerDisplayName} · {formatDate(existing.uploadedAt)}
          </span>
        </p>
      )}
      <Button onClick={onReplace} className="mt-4">
        Másik kép választása
      </Button>
    </div>
  );
}
