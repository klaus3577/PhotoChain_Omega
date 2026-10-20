// A galéria (kezdőlap, L20 – L17 drótváz „Galéria”): a nyilvános, hitelesített képek keresése,
// szűrése, rendezése és lapozása. A nézet az URL-ben van (galleryParams.ts): megosztható, és a vissza
// gomb is működik; a böngészőfül címe a keresőszót és az oldalt is megmondja. Szűrés és lapozás közben
// a régi találatok látszanak (foglaltként jelölve, a találatszám helyén „frissítés”), amíg az újak meg
// nem érkeznek; szűréskor a frissült találatszámot az oldal közös élő régiója mondja be, lapozáskor
// pedig – az új oldal megérkezése után – a fókusz kerül a találatszámra (a lista elejére), és azt olvassa
// fel. A lista és a kategóriák mindenkinek ugyanazok: a felhasználóváltás nem tölti újra őket.
// Forrás: TanStack Query – Paginated Queries (placeholderData: keepPreviousData),
// https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries (adaptálva)
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ImageOff, X } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { categoriesQuery } from '../api/categories.api';
import type { PageMeta } from '../api/guards';
import { listPhotos, type PhotoPage, photoKeys } from '../api/photos.api';
import { PUBLIC_QUERY_META } from '../auth/sessionCache';
import { GalleryFilters } from '../components/photos/GalleryFilters';
import { PhotoCard } from '../components/photos/PhotoCard';
import type { GalleryUpdate } from '../components/photos/useGalleryDrafts';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadError } from '../components/ui/LoadError';
import { PageHeading } from '../components/ui/PageHeading';
import { Pagination } from '../components/ui/Pagination';
import { Spinner } from '../components/ui/Spinner';
import { useAnnounce } from '../components/ui/useAnnounce';
import { useFocusAfterRecovery } from '../hooks/useFocusAfterRecovery';
import { usePageTitle } from '../hooks/usePageTitle';
import { focusElement } from '../lib/focus';
import { type LoadState, loadStateOf, showsLoadError } from '../lib/loadState';
import {
  clearAllLabel,
  DEFAULT_GALLERY_PARAMS,
  galleryApiQuery,
  type GalleryParams,
  gallerySearchParams,
  galleryTitle,
  isFiltering,
  MAX_GALLERY_PAGE,
  parseGalleryParams,
} from '../photos/galleryParams';

const searchOf = (params: GalleryParams) => {
  const search = gallerySearchParams(params).toString();
  return search === '' ? '' : `?${search}`;
};

/** A találatszám, az első oldal után az oldallal: „30 találat, 2. oldal”. */
const resultSummary = ({ total, page }: PageMeta) =>
  page > 1 ? `${total} találat, ${page}. oldal` : `${total} találat`;

/**
 * A frissült találatszám bejelentése, ha a szűrés változott (az első betöltésnél nem – ott az oldal
 * maga a hír –, lapozáskor sem: ott a fókuszba kerülő találatszámot olvassa fel). Csak a megérkezett,
 * nem a régi (helykitöltő) eredményt jelenti be.
 */
function useResultAnnouncement(photos: PhotoPage | undefined, fresh: boolean, filters: string) {
  const announce = useAnnounce();
  const announced = useRef(filters);

  useEffect(() => {
    if (photos === undefined || !fresh || announced.current === filters) return;
    announced.current = filters;
    announce(photos.meta.total === 0 ? 'Nincs találat' : `${photos.meta.total} találat`);
  }, [photos, fresh, filters, announce]);
}

/**
 * Lapozáskor (csak az oldal változott, a szűrés nem) a fókusz a találatszámra kerül – de csak az új
 * oldal megérkezése után: addig a régi kártyák látszanak, és az onnan továbblépő fókusz a lecserélt
 * kártyával elveszne. Ha közben máshová vitte a fókuszt, ott marad, és a találatszámot az élő régió
 * mondja be. Közbejött szűréskor nem mozdul.
 */
function usePageChangeFocus(
  page: number,
  filters: string,
  fresh: boolean,
  summaryRef: RefObject<HTMLElement | null>,
  summaryText: string,
) {
  const announce = useAnnounce();
  const previous = useRef({ page, filters });
  /** A lapozáskor fókuszban lévő elem (pl. a lapozó hivatkozása) – ha még ott a fókusz, áthelyezhető */
  const pending = useRef<Element | null | undefined>(undefined);

  useEffect(() => {
    const before = previous.current;
    previous.current = { page, filters };
    if (before.filters !== filters) pending.current = undefined;
    else if (before.page !== page) pending.current = document.activeElement;
    if (pending.current === undefined || !fresh || !summaryRef.current) return;
    const active = document.activeElement;
    if (active === pending.current || active === document.body) focusElement(summaryRef.current);
    else announce(summaryText);
    pending.current = undefined;
  }, [page, filters, fresh, summaryRef, summaryText, announce]);
}

/** A keresés és a szűrők törlése után – az URL frissülése után – a fókusz a találatszámra kerül. */
function useFocusAfterClear(filters: string, summaryRef: RefObject<HTMLElement | null>) {
  const pending = useRef(false);

  useEffect(() => {
    if (!pending.current || !summaryRef.current) return;
    pending.current = false;
    focusElement(summaryRef.current);
  }, [filters, summaryRef]);

  return () => {
    pending.current = true;
  };
}

export function GalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = parseGalleryParams(searchParams);
  usePageTitle(galleryTitle(params));
  const apiQuery = galleryApiQuery(params);
  const filters = searchOf({ ...params, page: 1 });
  const summaryRef = useRef<HTMLParagraphElement>(null);
  /** A keresés és a szűrők törlése a szűrősáv piszkozatát is törli: félbehagyott gépelés, hiba sem marad */
  const [filtersGeneration, setFiltersGeneration] = useState(0);

  const photos = useQuery({
    queryKey: photoKeys.list(apiQuery),
    queryFn: ({ signal }) => listPhotos(apiQuery, signal),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    meta: PUBLIC_QUERY_META,
  });
  const categories = useQuery(categoriesQuery());

  const data = photos.data;
  const stale = photos.isPlaceholderData;
  // A régi (helykitöltő) találat a hibanézet szempontjából nem adat: a sikertelen szűrés vagy lapozás
  // újrapróbálásakor is a hibanézet – és benne a fókuszban lévő gomb – marad
  const state = loadStateOf({
    data: stale ? undefined : data,
    error: photos.error,
    errorUpdateCount: photos.errorUpdateCount,
  });
  const failed = showsLoadError(state);
  const fresh = photos.isSuccess && !stale;
  const summaryText = data ? resultSummary(data.meta) : '';
  useResultAnnouncement(data, fresh, filters);
  usePageChangeFocus(params.page, filters, fresh, summaryRef, summaryText);
  useFocusAfterRecovery(failed, summaryRef, summaryText);
  const focusAfterClear = useFocusAfterClear(filters, summaryRef);

  const update = (next: GalleryParams, { replace = false }: GalleryUpdate = {}) => {
    // Szinkron frissítés (nem átmenetként): a választó nem ugrik vissza egy pillanatra, és a közben
    // érkező gépelés sem keveredik egy régebbi nézettel
    setSearchParams(gallerySearchParams(next), {
      replace,
      preventScrollReset: true,
      flushSync: true,
    });
  };
  const clearAll = () => {
    focusAfterClear();
    setFiltersGeneration((generation) => generation + 1);
    update({ ...DEFAULT_GALLERY_PARAMS, sort: params.sort });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeading>Galéria</PageHeading>
        <p className="leading-7 text-fg-muted">
          Csak hitelesített képek – mindegyik ujjlenyomata a blokkláncon rögzítve.
        </p>
      </div>
      <GalleryFilters
        generation={filtersGeneration}
        params={params}
        categories={categories.data ?? []}
        categoriesState={loadStateOf(categories)}
        categoriesFailedAt={categories.errorUpdatedAt}
        onRetryCategories={() => void categories.refetch()}
        onChange={update}
        onClearAll={clearAll}
        resultsRef={summaryRef}
      />
      <p
        ref={summaryRef}
        className="flex min-h-6 items-center gap-2 text-sm text-fg-muted focus:outline-none"
      >
        <ResultStatus state={state} stale={stale} summaryText={summaryText} />
      </p>
      {failed && (
        <LoadError
          title="A képek betöltése nem sikerült."
          state={state}
          error={photos.error}
          failedAt={photos.errorUpdatedAt}
          onRetry={() => void photos.refetch()}
          retryingText="Képek betöltése…"
        />
      )}
      {data && !stale && data.photos.length === 0 && (
        <EmptyResult
          total={data.meta.total}
          filtering={isFiltering(params)}
          clearLabel={clearAllLabel(params)}
          firstPage={searchOf({ ...params, page: 1 })}
          onClear={clearAll}
        />
      )}
      {data && !failed && data.photos.length > 0 && (
        // A felsorolásjel nélküli lista is lista marad (a WebKit különben nem annak mondja). Egy oszlopnál
        // is megadott oszlop (minmax(0, 1fr)): a hosszú cím így nem szélesíti ki a rácsot (WCAG 1.4.10)
        <ul
          role="list"
          aria-busy={stale || undefined}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {data.photos.map((photo) => (
            <li key={photo.id}>
              <PhotoCard photo={photo} />
            </li>
          ))}
        </ul>
      )}
      {data && !failed && (
        <Pagination
          page={params.page}
          totalPages={Math.min(data.meta.totalPages, MAX_GALLERY_PAGE)}
          hrefFor={(page) => ({ search: searchOf({ ...params, page }) })}
        />
      )}
    </div>
  );
}

interface ResultStatusProps {
  state: LoadState;
  /** Szűrés vagy lapozás közben a régi találatok látszanak */
  stale: boolean;
  summaryText: string;
}

/** A találatszám helye: első betöltés, frissítés (régi találatokkal) vagy a találatszám. */
function ResultStatus({ state, stale, summaryText }: ResultStatusProps) {
  // Hibánál a hibanézet beszél (az újrapróbálás szövegével)
  if (showsLoadError(state)) return null;
  if (stale || state === 'loading') {
    return (
      <>
        <Spinner />
        {stale ? 'Találatok frissítése…' : 'Képek betöltése…'}
      </>
    );
  }
  return summaryText;
}

interface EmptyResultProps {
  /** A szűrésnek megfelelő képek száma – ha nem nulla, csak ez az oldal üres (túl nagy oldalszám) */
  total: number;
  filtering: boolean;
  /** A törlés gomb neve: azt mondja meg, amit töröl (keresés, szűrők) */
  clearLabel: string;
  firstPage: string;
  onClear: () => void;
}

/** Üres találat: mindig van javaslat a továbblépésre (L17 stílusútmutató – üres állapot). */
function EmptyResult({ total, filtering, clearLabel, firstPage, onClear }: EmptyResultProps) {
  if (total > 0) {
    return (
      <EmptyState
        icon={ImageOff}
        title="Ezen az oldalon nincs kép"
        action={
          <Link to={{ search: firstPage }} className="text-sm underline underline-offset-2">
            Vissza az első oldalra
          </Link>
        }
      />
    );
  }
  if (filtering) {
    return (
      <EmptyState
        icon={ImageOff}
        title="Nincs találat"
        action={
          <Button icon={X} onClick={onClear}>
            {clearLabel}
          </Button>
        }
      >
        Próbálj más keresőszót, vagy töröld a szűrőket.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={ImageOff} title="Még nincs hitelesített kép">
      Az első feltöltött és a blokkláncon rögzített kép itt jelenik meg.
    </EmptyState>
  );
}
