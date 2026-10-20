// A saját kép sora a vezérlőpulton (L17 drótváz „Vezérlőpult”, 2–6. és 10. jegyzet): bélyegkép, a cím
// hivatkozás az adatlapra, a feltöltés dátuma; az állapotjelvény a megjegyzésével (függő képnél a
// függő tranzakció linkje, moderátori levételnél a „Miért?” magyarázat), az ár, és a műveletek – a
// gombok neve a kép címét is tartalmazza („Szerkesztés: Őszi erdő ködben”), így a hivatkozás- és
// gomblistában is érthetők; a cellák rejtett címkét kapnak („Feltöltve:”, „Ár:”). Mobilon kártya
// (minden egymás alatt), szélesebb képernyőn táblázatszerű sor elválasztóval. Ha a függő tranzakció
// hivatkozása a fókusszal együtt tűnik el (a kép hitelesítve lett), a fókusz a kép címére kerül. A cím
// hivatkozását a szülő nyilvántartása is megkapja (ref): a levétel után oda kerül a fókusz.
import { EyeOff, Pencil } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import type { OwnPhotoListItem, PendingTransaction } from '../../api/photos.api';
import { formatDate, formatPrice } from '../../lib/format';
import { HexValue } from '../photos/ExplorerLink';
import { Thumbnail } from '../photos/Thumbnail';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { canEdit, canHide, ownPhotoStatusOf } from './ownPhotoStatus';

/** A sor rácsa: kép · állapot · ár · műveletek (mobilon egy oszlop) */
export const ROW_GRID =
  'md:grid-cols-[minmax(0,1fr)_14rem_6rem_14rem] md:items-center md:gap-4 md:px-3';

const TAKEDOWN_EXPLANATION =
  'A moderátor a szabályzat megsértése miatt vette le a képet (például szerzői jogi kifogás vagy nem megengedett tartalom). Ezt a levételt te nem tudod feloldani; kérdéseddel az adminisztrátorhoz fordulhatsz. A blokkláncon rögzített ujjlenyomat megmarad.';

/** „Miért?” – rövid magyarázat a moderátori levételről (feltáró gomb, a szöveg a sorban nyílik ki). */
function TakedownWhy({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const textId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={textId}
        onClick={() => setOpen((shown) => !shown)}
        className="ml-1 text-xs underline underline-offset-2 hover:text-fg"
      >
        {/* A látható felirat a név eleje (WCAG 2.5.3); a teljes név a kép címével a képernyőolvasónak */}
        <span aria-hidden="true">Miért?</span>
        <span className="sr-only">Miért? – „{title}” levétele</span>
      </button>
      <span id={textId} hidden={!open} className="mt-1 block text-xs leading-5 text-fg-muted">
        {TAKEDOWN_EXPLANATION}
      </span>
    </>
  );
}

/** A sor címhivatkozásának jelölője – a fókusz átadásához a DOM-ból (lásd PendingTransactionLine) */
const ROW_TITLE_ATTRIBUTE = 'data-row-title';

/**
 * A függő tranzakció hivatkozása. Ha a fókusszal együtt tűnik el (a kép hitelesítve lett), a fókusz a
 * sor címére kerül: a layout-effektus takarítása még a DOM-ból való eltávolítás előtt fut, a címet a
 * sorból (li) keresi meg – a React Router Link a ref-jét minden rendereléskor újraköti, ezért a
 * mutációs fázisban egy ref éppen üres lehet, a DOM viszont már teljes.
 */
function PendingTransactionLine({ transaction }: { transaction: PendingTransaction }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const line = ref.current;
    return () => {
      if (!line?.contains(document.activeElement)) return;
      line.closest('li')?.querySelector<HTMLElement>(`[${ROW_TITLE_ATTRIBUTE}]`)?.focus();
    };
  }, []);

  return (
    <p ref={ref} className="mt-1 text-xs">
      <span className="text-fg-muted">Függő tranzakció: </span>
      <HexValue value={transaction.txHash} url={transaction.txUrl} target="a függő tranzakció" />
    </p>
  );
}

interface OwnPhotoRowProps {
  photo: OwnPhotoListItem;
  onEdit: (photo: OwnPhotoListItem) => void;
  onHide: (photo: OwnPhotoListItem) => void;
  /** A cím hivatkozása (a levétel után ide kerül a fókusz: a műveletek gombjai eltűnnek) */
  titleRef?: (element: HTMLAnchorElement | null) => void;
}

export function OwnPhotoRow({ photo, onEdit, onHide, titleRef }: OwnPhotoRowProps) {
  const status = ownPhotoStatusOf(photo);
  const muted = photo.status === 'HIDDEN';
  const editable = canEdit(photo);
  const hideable = canHide(photo);

  return (
    <li
      className={`grid gap-3 p-3 max-md:rounded-lg max-md:border max-md:border-line md:py-3 ${ROW_GRID}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Thumbnail src={photo.thumbnailUrl} />
        <p className="min-w-0 text-sm">
          <Link
            ref={titleRef}
            to={`/photos/${photo.id}`}
            {...{ [ROW_TITLE_ATTRIBUTE]: '' }}
            className={`block truncate font-medium underline-offset-2 hover:underline ${muted ? 'text-fg-muted' : ''}`}
          >
            {photo.title}
          </Link>
          <span className="text-fg-muted">
            <span className="sr-only">Feltöltve: </span>
            {formatDate(photo.createdAt)}
          </span>
        </p>
      </div>
      <div className="text-sm">
        <StatusBadge tone={status.tone} icon={status.icon}>
          {status.label}
        </StatusBadge>
        {photo.pendingTransaction && (
          <PendingTransactionLine transaction={photo.pendingTransaction} />
        )}
        {status.note && (
          <p className="mt-1 text-xs text-fg-muted">
            {status.note}
            {status.takenDown && <TakedownWhy title={photo.title} />}
          </p>
        )}
      </div>
      <p className={`font-semibold tabular-nums md:text-right ${muted ? 'text-fg-muted' : ''}`}>
        <span className="sr-only">Ár: </span>
        {formatPrice(photo.priceHuf)}
      </p>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {/* A gomb neve a kép címével („Szerkesztés: …”): a látható felirat a név eleje, a teljes név a
            képernyőolvasónak egy szövegcsomópontban (a böngészők a csomópontok közé szóközt tehetnek) */}
        {editable && (
          <Button icon={Pencil} onClick={() => onEdit(photo)}>
            <span aria-hidden="true">Szerkesztés</span>
            <span className="sr-only">Szerkesztés: {photo.title}</span>
          </Button>
        )}
        {hideable && (
          <Button icon={EyeOff} onClick={() => onHide(photo)}>
            <span aria-hidden="true">Levétel</span>
            <span className="sr-only">Levétel: {photo.title}</span>
          </Button>
        )}
        {!editable && !hideable && (
          <span aria-hidden="true" className="hidden text-sm text-fg-muted md:block">
            —
          </span>
        )}
      </div>
    </li>
  );
}
