// A galéria szűrősávjának két mezőcsoportja (GalleryFilters): a kategóriaválasztó és az ár-tartomány.
// - Kategória: a még be nem töltött vagy nem létező kategória (pl. régi hivatkozás) is látszik a
//   választóban; ha a lista nem tölthető be, a választó leírása ezt mondja, és újratölthető – az
//   újratöltést és az ismételt hibát az élő régió bejelenti, siker után a fókusz a választóra kerül.
// - Ár: látható címkék; a hiba riasztás, csak a hibás mező jelölt (a leírása a hibaüzenet); a mezők
//   elhagyásakor a még fennálló hiba (pl. fordított tartomány) is megjelenik (useGalleryDrafts).
import { CircleAlert } from 'lucide-react';
import { type RefObject, useEffect, useId, useRef } from 'react';

import type { Category } from '../../api/categories.api';
import { useFocusAfterRecovery } from '../../hooks/useFocusAfterRecovery';
import { cx } from '../../lib/cx';
import { type LoadState, showsLoadError } from '../../lib/loadState';
import { Spinner } from '../ui/Spinner';
import { useAnnounce } from '../ui/useAnnounce';
import type { PriceError } from './useGalleryDrafts';

export const FIELD = 'block min-h-10 w-full rounded-md border bg-canvas px-3 text-sm text-fg';

/**
 * A kategórialista újratöltésének visszajelzése: az ismételt hibát bejelenti (a hiba szövege nem
 * változik), a sikeres újratöltés után – az eltűnt gomb helyett – a választóra teszi a fókuszt. Az
 * ismételt hibát a hiba idejének változása jelzi (a köztes „újratöltés” állapot gyors válasznál ki sem
 * rajzolódik). A visszatérési érték az újratöltés kérésekor hívandó.
 */
function useCategoriesRecovery(
  state: LoadState,
  failedAt: number,
  selectRef: RefObject<HTMLElement | null>,
) {
  const announce = useAnnounce();
  /** Az újratöltés kérésekor ismert hiba ideje (null: nincs folyamatban kért újratöltés) */
  const retriedAfter = useRef<number | null>(null);
  useFocusAfterRecovery(showsLoadError(state), selectRef, 'A kategóriák betöltődtek.');

  useEffect(() => {
    const before = retriedAfter.current;
    if (before === null) return;
    if (state === 'ready') retriedAfter.current = null;
    else if (state === 'failed' && failedAt !== before) {
      retriedAfter.current = null;
      announce('A kategóriák betöltése most sem sikerült.');
    }
  }, [state, failedAt, announce]);

  return () => {
    retriedAfter.current = failedAt;
    announce('Kategóriák betöltése…');
  };
}

interface CategoryFieldProps {
  categoryId: number | null;
  categories: readonly Category[];
  /** A kiválasztott, de a listában (még) nem szereplő kategória felirata */
  unknownLabel: string;
  state: LoadState;
  /** A kategórialista legutóbbi hibájának ideje (errorUpdatedAt) */
  failedAt: number;
  onSelect: (categoryId: number | null) => void;
  onRetry: () => void;
}

export function CategoryField({
  categoryId,
  categories,
  unknownLabel,
  state,
  failedAt,
  onSelect,
  onRetry,
}: CategoryFieldProps) {
  const id = useId();
  const hintId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const retried = useCategoriesRecovery(state, failedAt, selectRef);
  const failed = showsLoadError(state);
  const retrying = state === 'retrying';
  const unknown = categoryId !== null && !categories.some((category) => category.id === categoryId);

  const retry = () => {
    if (retrying) return;
    retried();
    onRetry();
  };

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Kategória
      </label>
      <select
        ref={selectRef}
        id={id}
        value={categoryId ?? ''}
        aria-describedby={failed ? hintId : undefined}
        onChange={(event) =>
          onSelect(event.target.value === '' ? null : Number(event.target.value))
        }
        className={cx(FIELD, 'border-line-strong')}
      >
        <option value="">Minden kategória</option>
        {unknown && <option value={categoryId}>{unknownLabel}</option>}
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {failed && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <p id={hintId} className="text-danger">
            A kategóriák most nem tölthetők be.
          </p>
          <button
            type="button"
            aria-disabled={retrying || undefined}
            onClick={retry}
            className="inline-flex min-h-6 items-center gap-1 underline underline-offset-2 hover:text-primary"
          >
            {retrying && <Spinner />}
            Kategóriák újratöltése
          </button>
        </div>
      )}
    </div>
  );
}

interface PriceInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** A mező hibás: a hibaüzenet a leírása */
  invalid: boolean;
  errorId: string;
}

/** Ármező látható címkével (a neve a címke). */
function PriceInput({ label, value, onChange, invalid, errorId }: PriceInputProps) {
  const id = useId();
  return (
    <div className="grid min-w-0 flex-1 gap-1">
      <label htmlFor={id} className="text-xs text-fg-muted">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={cx(FIELD, invalid ? 'border-danger' : 'border-line-strong')}
      />
    </div>
  );
}

interface PriceFieldsProps {
  minText: string;
  maxText: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  error: PriceError | null;
  /** A mezőcsoport elhagyása: a még fennálló hiba megjelenítése */
  onLeave: () => void;
}

export function PriceFields({
  minText,
  maxText,
  onMinChange,
  onMaxChange,
  error,
  onLeave,
}: PriceFieldsProps) {
  const errorId = useId();
  return (
    <fieldset
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onLeave();
      }}
      className="grid min-w-0 gap-1.5"
    >
      <legend className="mb-1.5 text-sm font-medium">Ár (Ft)</legend>
      <div className="flex items-end gap-2">
        <PriceInput
          label="Legalacsonyabb ár"
          value={minText}
          onChange={onMinChange}
          invalid={error?.min ?? false}
          errorId={errorId}
        />
        <span aria-hidden="true" className="pb-2.5">
          –
        </span>
        <PriceInput
          label="Legmagasabb ár"
          value={maxText}
          onChange={onMaxChange}
          invalid={error?.max ?? false}
          errorId={errorId}
        />
      </div>
      {/* Minden új hiba új elem: a képernyőolvasó újra felolvassa */}
      {error !== null && (
        <p
          key={error.key}
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-sm text-danger"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error.message}
        </p>
      )}
    </fieldset>
  );
}
