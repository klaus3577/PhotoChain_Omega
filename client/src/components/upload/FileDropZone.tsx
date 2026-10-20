// A kép fogadóterülete (L17 drótváz „Feltöltés”, 1. jegyzet): húzással vagy a „Tallózás…” gombbal –
// billentyűzettel is. A vezérlő a natív fájlválasztó (rejtett, de fókuszálható és Enterrel, szóközzel
// nyitható); a neve a mező tárgya és a látható gomb („Kép Tallózás…”), kötelező, mint a többi mező. A
// fókuszkeret a teljes területen jelenik meg. A súgó (formátum, méret, legkisebb felbontás), a
// kiválasztott fájl összefoglalója és a hiba a vezérlő leírása (aria-describedby), hibánál aria-invalid.
// A natív vezérlő értéke követi a kiválasztást (dobott fájl, a doboz újramegjelenése, törlés): a
// kisegítő technológia így nem „nincs fájl kiválasztva”-t vagy más fájlt jelent. Húzás közben a terület a
// szövegével és a keretével is jelzi (nem csak színnel), a dobott fájl ugyanúgy kiválasztódik.
// Érintőképernyőn a húzás szövege nem jelenik meg.
// Forrás: GOV.UK Design System – File upload (a natív vezérlő megtartása; a GOV.UK Frontend a dobott
// fájlt a vezérlő files tulajdonságába írja), https://design-system.service.gov.uk/components/file-upload/;
// MDN – HTML Drag and Drop API: File drag and drop,
// https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop (adaptálva)
import { CircleAlert, ImageUp } from 'lucide-react';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from 'react';

import { cx } from '../../lib/cx';
import { ACCEPTED_IMAGE_TYPES } from '../../upload/uploadValidation';

interface FileDropZoneProps {
  /** A korlátok (előre látszanak) */
  hint: string;
  error?: string;
  /** A kiválasztott fájl összefoglalójának azonosítója – a vezérlő leírásának része */
  selectionId?: string;
  /** A kiválasztott fájl (a natív vezérlő értéke ezt követi) */
  file: File | null;
  onSelect: (file: File) => void;
  /** A fájlválasztóra (fókusz; a „Kép cseréje” gomb a párbeszédablakot nyitja vele) */
  inputRef: RefObject<HTMLInputElement | null>;
}

const hasFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

/** A natív vezérlő értéke a kiválasztáshoz igazítva (ahol a böngésző engedi: DataTransfer). */
function syncFileInput(input: HTMLInputElement, file: File | null): void {
  if (file === null) {
    input.value = '';
    return;
  }
  if (input.files?.[0] === file || typeof DataTransfer !== 'function') return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}

export function FileDropZone({
  hint,
  error,
  selectionId,
  file,
  onSelect,
  inputRef,
}: FileDropZoneProps) {
  const id = useId();
  const labelId = `${id}-cimke`;
  const browseId = `${id}-tallozas`;
  const hintId = `${id}-sugo`;
  const errorId = `${id}-hiba`;
  const [dragging, setDragging] = useState(false);
  // A dragenter/dragleave a gyermekelemeken is tüzel: a mélység számolása nélkül villogna a jelzés
  const depth = useRef(0);

  useLayoutEffect(() => {
    if (inputRef.current) syncFileInput(inputRef.current, file);
  }, [file, inputRef]);

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    // Enélkül a böngésző a dobást nem engedné (a fájlt megnyitná)
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onSelect(dropped);
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    if (chosen) onSelect(chosen);
    // A párbeszédablak megszakítva: a böngésző kiürítette a vezérlőt, a kiválasztás viszont megmaradt
    else syncFileInput(event.target, file);
  };

  return (
    <div>
      <span id={labelId} className="block text-sm font-medium">
        Kép
      </span>
      <div
        data-dragging={dragging || undefined}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cx(
          'mt-1.5 flex flex-col items-center rounded-lg border-2 px-6 py-8 text-center',
          'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus',
          // Egymást kizáró osztályok: a cx nem egyesít, a kaszkádban az ábécérend döntene
          dragging ? 'border-solid bg-surface' : 'border-dashed bg-surface/60',
          error ? 'border-danger' : dragging ? 'border-fg' : 'border-line-strong',
        )}
      >
        <ImageUp aria-hidden="true" className="size-8 text-fg-muted" />
        <p className={cx('mt-3 font-medium', !dragging && 'pointer-coarse:hidden')}>
          {dragging ? 'Engedd el a képet' : 'Húzd ide a képet, vagy'}
        </p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          aria-labelledby={`${labelId} ${browseId}`}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, selectionId, error ? errorId : undefined]
            .filter(Boolean)
            .join(' ')}
          onChange={onChange}
          className="sr-only"
        />
        <label
          id={browseId}
          htmlFor={id}
          className="mt-2 inline-flex min-h-10 cursor-pointer items-center rounded-md border border-line-strong bg-canvas px-4 text-sm font-medium hover:bg-surface"
        >
          Tallózás…
        </label>
        <p id={hintId} className="mt-3 text-sm text-fg-muted">
          {hint}
        </p>
        {error && (
          <p
            id={errorId}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger"
          >
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
