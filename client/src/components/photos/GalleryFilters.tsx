// A galéria kereső- és szűrősávja (L17 drótváz, 1–3. jegyzet): keresés (a címben, a leírásban és a
// fotós nevében), kategória, ár-tartomány, rendezés; az aktív szűrők címkéi egyenként törölhetők. A
// szöveges mezők gépelés után rövid késleltetéssel frissítik a nézetet (Enterre azonnal), a választók
// azonnal – a nézet az URL-ben van (galleryParams.ts), a szerkesztés szabályai a useGalleryDrafts-ban, a
// kategória- és az ármezők a GalleryFilterFields-ben. Mobilon a kategória és az ár a „Szűrők” gomb
// mögött van (felfedő minta: aria-expanded, aria-controls; a gombon az aktív szűrők száma), a rendezés
// mindig látszik; ha Enterre árhiba marad, a panel kinyílik. Egy címke törlése után a fókusz a sor
// következő gombjára kerül, ha a sor eltűnt, a találatszámra – a keresőmezőre nem: érintőképernyőn az a
// billentyűzetet nyitná fel.
// Forrás: W3C WAI-ARIA APG – Disclosure (Show/Hide) Pattern,
// https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ (adaptálva)
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react';

import type { Category } from '../../api/categories.api';
import { cx } from '../../lib/cx';
import { focusElement } from '../../lib/focus';
import { formatPriceRange } from '../../lib/format';
import type { LoadState } from '../../lib/loadState';
import {
  activeFilterCount,
  clearAllLabel,
  GALLERY_SORTS,
  type GalleryParams,
  type GallerySort,
  isFiltering,
  MAX_SEARCH_LENGTH,
} from '../../photos/galleryParams';
import { CategoryField, FIELD, PriceFields } from './GalleryFilterFields';
import { type GalleryUpdate, useGalleryDrafts } from './useGalleryDrafts';

const SORT_LABELS: Record<GallerySort, string> = {
  newest: 'Legújabb elöl',
  oldest: 'Legrégebbi elöl',
  price_asc: 'Ár szerint növekvő',
  price_desc: 'Ár szerint csökkenő',
};

/** A keresőmező neve és látható helykitöltője ugyanaz (a hangvezérlés a látott szöveggel éri el) */
const SEARCH_LABEL = 'Keresés cím, leírás vagy fotós alapján';

interface GalleryFiltersProps {
  /** A keresés és a szűrők törlésekor nő: a mezők piszkozata is törlődik (useGalleryDrafts) */
  generation: number;
  params: GalleryParams;
  categories: readonly Category[];
  /** A kategórialista betöltése – hibánál a választó leírása ezt mondja, és újratölthető */
  categoriesState: LoadState;
  /** A kategórialista legutóbbi hibájának ideje (errorUpdatedAt) – az ismételt hiba felismeréséhez */
  categoriesFailedAt: number;
  onRetryCategories: () => void;
  onChange: (next: GalleryParams, update?: GalleryUpdate) => void;
  /** A keresőszó és minden szűrő törlése (a rendezés marad) */
  onClearAll: () => void;
  /** A találatszám – ha a címkesor eltűnik, ide kerül a fókusz */
  resultsRef: RefObject<HTMLElement | null>;
}

/** Egy aktív szűrő címkéje: a gomb a szűrőt törli (a neve ezt is megmondja). */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={`${label} – szűrő törlése`}
      onClick={onRemove}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong bg-canvas px-3 text-sm hover:bg-surface"
    >
      {label}
      <X aria-hidden="true" className="size-4" />
    </button>
  );
}

/**
 * Egy címke törlése után – az URL frissülése után – a fókusz a helyére lépő gombra (a következő címkére
 * vagy a törlés gombra) kerül; ha a sor eltűnt, a találatszámra. A visszatérési érték a törléskor hívandó.
 */
function useFocusAfterChipRemoval(
  params: GalleryParams,
  chipsRef: RefObject<HTMLElement | null>,
  resultsRef: RefObject<HTMLElement | null>,
) {
  /** A törölt címke helye a sorban (a törlés gomb mindig az utolsó, így a helyén mindig van gomb) */
  const removedChip = useRef<number | null>(null);

  const focusAfterRemoval = useEffectEvent(() => {
    const index = removedChip.current;
    if (index === null) return;
    removedChip.current = null;
    const next = chipsRef.current?.querySelectorAll('button')[index];
    if (next) next.focus();
    else if (resultsRef.current) focusElement(resultsRef.current);
  });
  useEffect(() => {
    focusAfterRemoval();
  }, [params.q, params.categoryId, params.minPrice, params.maxPrice]);

  return (index: number) => {
    removedChip.current = index;
  };
}

export function GalleryFilters({
  generation,
  params,
  categories,
  categoriesState,
  categoriesFailedAt,
  onRetryCategories,
  onChange,
  onClearAll,
  resultsRef,
}: GalleryFiltersProps) {
  const panelId = useId();
  const searchId = useId();
  const sortId = useId();
  const [open, setOpen] = useState(false);
  const drafts = useGalleryDrafts(params, onChange, generation);
  const chipsRef = useRef<HTMLDivElement>(null);
  const chipRemoved = useFocusAfterChipRemoval(params, chipsRef, resultsRef);

  const removeChip = (index: number, patch: Partial<GalleryParams>) => {
    chipRemoved(index);
    drafts.remove(patch);
  };

  // Enter: ha az ár hibás, a (mobilon esetleg bezárt) panel kinyílik – a hiba nem maradhat rejtve
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!drafts.submit()) setOpen(true);
  };

  const count = activeFilterCount(params);
  const hasPrice = params.minPrice !== null || params.maxPrice !== null;
  // A még be nem töltött vagy nem létező kategória (pl. régi hivatkozás) felirata
  const categoryLabel =
    categories.find(({ id }) => id === params.categoryId)?.name ??
    (categoriesState === 'ready' ? 'Ismeretlen kategória' : 'Kategória');

  return (
    <div className="space-y-3">
      <form
        role="search"
        aria-label="Képek keresése"
        onSubmit={submit}
        onFocus={drafts.startEditing}
        className="space-y-3"
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <label htmlFor={searchId} className="sr-only">
              {SEARCH_LABEL}
            </label>
            <input
              id={searchId}
              type="search"
              value={drafts.text}
              onChange={(event) => drafts.setText(event.target.value)}
              placeholder={`${SEARCH_LABEL}…`}
              maxLength={MAX_SEARCH_LENGTH}
              // A hosszú helykitöltő (és a fókusz nélkül túlnyúló érték) keskeny mezőben három ponttal
              // rövidül, nem vágódik le (L26) – a mezőn, mert a ::placeholder nem minden böngészőben
              // fogad text-overflow-t
              className={cx(FIELD, 'border-line-strong pr-11 text-ellipsis')}
            />
            <button
              type="submit"
              aria-label="Keresés"
              className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-fg-muted hover:text-fg"
            >
              <Search aria-hidden="true" className="size-4" />
            </button>
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-line-strong px-3 text-sm font-medium hover:bg-surface md:hidden"
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Szűrők
            {count > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="rounded-full bg-black px-1.5 text-xs leading-5 text-white"
                >
                  {count}
                </span>
                <span className="sr-only">{`, ${count} aktív szűrő`}</span>
              </>
            )}
          </button>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div
            id={panelId}
            className={cx(
              open ? 'grid' : 'hidden',
              'gap-4 md:grid md:grid-cols-[minmax(0,14rem)_minmax(0,18rem)] md:items-end',
            )}
          >
            <CategoryField
              categoryId={params.categoryId}
              categories={categories}
              unknownLabel={categoryLabel}
              state={categoriesState}
              failedAt={categoriesFailedAt}
              onSelect={(categoryId) => drafts.select('category', { categoryId })}
              onRetry={onRetryCategories}
            />
            <PriceFields
              minText={drafts.minText}
              maxText={drafts.maxText}
              onMinChange={drafts.setMinText}
              onMaxChange={drafts.setMaxText}
              error={drafts.priceError}
              onLeave={drafts.checkPrices}
            />
          </div>
          <div className="grid gap-1.5 md:w-56">
            <label htmlFor={sortId} className="text-sm font-medium">
              Rendezés
            </label>
            <select
              id={sortId}
              value={params.sort}
              onChange={(event) =>
                drafts.select('sort', { sort: event.target.value as GallerySort })
              }
              className={cx(FIELD, 'border-line-strong')}
            >
              {GALLERY_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>
      {isFiltering(params) && (
        <div ref={chipsRef} className="flex flex-wrap items-center gap-2">
          {params.categoryId !== null && (
            <FilterChip
              label={categoryLabel}
              onRemove={() => removeChip(0, { categoryId: null })}
            />
          )}
          {hasPrice && (
            <FilterChip
              label={formatPriceRange(params.minPrice, params.maxPrice)}
              onRemove={() =>
                removeChip(params.categoryId === null ? 0 : 1, { minPrice: null, maxPrice: null })
              }
            />
          )}
          <button
            type="button"
            onClick={onClearAll}
            className="min-h-9 px-1 text-sm underline underline-offset-2 hover:text-primary"
          >
            {clearAllLabel(params)}
          </button>
        </div>
      )}
    </div>
  );
}
