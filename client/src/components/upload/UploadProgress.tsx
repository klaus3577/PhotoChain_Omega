// A feltöltés haladásjelzője (L17 drótváz „Feltöltés”, 7. jegyzet): bájtok és százalék, megszakítható –
// amíg a törzs el nem ment. Utána a szerver dolgozik (ujjlenyomat, egyezésvizsgálat, mentés), ezt a
// megszakítás már nem állítaná meg: a „Mégse” ilyenkor nincs, a szöveg a feldolgozást mondja (az
// állapotsor fókuszálható: ha a fókusz az eltűnő Mégse gombon volt, az oldal ide teszi). A sáv
// progressbar szerepkörű, a számértékekkel és szöveges értékkel; az első haladás-esemény előtt
// határozatlan (nincs értéke, nincs „0%”). A haladás szövege szándékosan nem élő régió: másodpercenként
// többször változik, elárasztaná a felolvasást – az indulást, a törzs elküldését és a végét az oldal élő
// régiója mondja be.
// Forrás: MDN – ARIA: progressbar role,
// https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/progressbar_role (adaptálva)
import type { Ref } from 'react';

import { percentOf, type TransferProgress } from '../../api/multipart';
import { formatBytes, formatMegabytes } from '../../lib/format';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** A doboz szövegei – a feltöltésé (alapból) vagy az ellenőrzésé (L24) */
export interface ProgressTexts {
  /** A sáv neve */
  label: string;
  /** Amíg a törzs megy */
  sending: string;
  /** A törzs elment, a szerver dolgozik */
  sent: string;
}

const UPLOAD_TEXTS: ProgressTexts = {
  label: 'Feltöltés',
  sending: 'Feltöltés…',
  sent: 'A fájl elküldve, a szerver feldolgozza a képet…',
};

interface UploadProgressProps {
  fileName: string;
  /** Az első haladás-esemény előtt null */
  progress: TransferProgress | null;
  /** A törzs hiánytalanul elment: a szerver feldolgozza, megszakítani már nem lehet */
  sent: boolean;
  onCancel: () => void;
  texts?: ProgressTexts;
  /** A dobozra: a szülő tudja, hogy a fókusz benne volt-e, amikor a doboz eltűnik */
  ref?: Ref<HTMLDivElement>;
  /** Az állapotsorra: a Mégse gomb eltűnésekor ide kerülhet a fókusz */
  statusRef?: Ref<HTMLParagraphElement>;
}

/** „5,1 / 8,4 MB” – a két érték közös mértékegységgel; kis fájlnál mindkettő a saját egységével. */
function formatPair({ loaded, total }: TransferProgress): string {
  if (total >= BYTES_PER_MEGABYTE) return `${formatMegabytes(loaded)} / ${formatBytes(total)}`;
  return `${formatBytes(loaded)} / ${formatBytes(total)}`;
}

/** A sáv szöveges értéke a képernyőolvasónak – nem „per”-ként olvasva: „61% – 8,4 MB-ból 5,1 MB” */
const valueTextOf = (progress: TransferProgress, percent: number): string =>
  `${percent}% – ${formatBytes(progress.total)}-ból ${formatBytes(progress.loaded)}`;

export function UploadProgress({
  fileName,
  progress,
  sent,
  onCancel,
  texts = UPLOAD_TEXTS,
  ref,
  statusRef,
}: UploadProgressProps) {
  const percent = percentOf(progress);

  return (
    <div ref={ref} className="rounded-lg border border-line p-4">
      <p
        ref={statusRef}
        tabIndex={-1}
        className="flex items-center gap-2 font-medium focus:outline-none"
      >
        <Spinner />
        {sent ? texts.sent : texts.sending}
      </p>
      <p className="mt-3 text-sm break-all">{fileName}</p>
      <div
        role="progressbar"
        aria-label={texts.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={progress && percent !== null ? valueTextOf(progress, percent) : undefined}
        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full bg-black motion-safe:transition-[width]"
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      <p className="mt-2 flex justify-between text-sm text-fg-muted">
        <span>{progress ? formatPair(progress) : 'Előkészítés…'}</span>
        {percent !== null && <span>{percent}%</span>}
      </p>
      {!sent && (
        <Button onClick={onCancel} className="mt-4">
          Mégse
        </Button>
      )}
    </div>
  );
}
