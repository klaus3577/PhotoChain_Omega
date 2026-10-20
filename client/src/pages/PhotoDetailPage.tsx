// A kép adatlapja (L20 – L17 drótváz „Adatlap”): vízjeles előnézet, cím, fotós, ár és a néző
// helyzetéhez illő művelet, a blokklánc-tanúsítvány (a dolgozat egyik kulcsképe), a leírás és az adatok,
// végül az értékelések (a vásárlónak az értékelés írásával – L23); a fotós neve a profiljára mutat. Az olvasási sorrend mobilon is a drótváz szerinti (7. jegyzet): kép → ár és
// vásárlás → tanúsítvány → leírás; széles képernyőn a vásárlás és a tanúsítvány a jobb oszlopba kerül.
// Az azonosító csak a szerver formájában (UUID) indít kérést – más érték (pl. „..”) más API-címre sem
// vihet –; a nem létező vagy nem nyilvános kép saját, érthető oldalt kap. A betöltött kép egy sikertelen
// háttérfrissítés után is megmarad; hibaoldal csak akkor van, ha nincs mit mutatni. Amikor a kép
// megjelenik, a fókusz a címére kerül, ha az útvonalváltás a fő tartalomra tette, vagy ha egy
// újratöltés (újrapróbálás, felhasználóváltás) a body-ra ejtette.
// Forrás: TanStack Query – Infinite Queries (useInfiniteQuery, getNextPageParam),
// https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries (adaptálva)
import { useInfiniteQuery, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { ApiError } from '../api/http';
import { getPhoto, isPhotoId, type PhotoDetail, photoKeys } from '../api/photos.api';
import { listReviews, reviewKeys } from '../api/reviews.api';
import { monogram } from '../auth/session';
import { useSessionRecheck } from '../auth/useSessionRecheck';
import { ChainCertificate } from '../components/photos/ChainCertificate';
import { PhotoImage } from '../components/photos/PhotoImage';
import { PhotoReviews } from '../components/photos/PhotoReviews';
import { PurchaseBox } from '../components/photos/PurchaseBox';
import { LoadError } from '../components/ui/LoadError';
import { PageHeading } from '../components/ui/PageHeading';
import { LoadingView } from '../components/ui/LoadingView';
import { useHeadingFocusWhenShown } from '../hooks/useHeadingFocusWhenShown';
import { usePageTitle } from '../hooks/usePageTitle';
import { cx } from '../lib/cx';
import { formatDate } from '../lib/format';
import { loadStateOf } from '../lib/loadState';
import { createPollClock, pollIntervalOf } from '../upload/pollInterval';
import { useRegistrationTransition } from '../upload/useRegistrationTransition';

type PageView =
  | { status: 'ready'; photo: PhotoDetail }
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' };

type PageStatus = PageView['status'];

const PAGE_TITLES: Record<Exclude<PageStatus, 'ready'>, string> = {
  loading: 'Kép betöltése',
  'not-found': 'A kép nem található',
  error: 'A kép most nem tölthető be',
};

/**
 * Mit mutat az oldal: a nem létező (érvénytelen azonosítójú vagy 404-es – közben elrejtett) képnél a
 * „nem található” oldalt; ha van adat, a képet – egy sikertelen háttérfrissítés után is –; különben a
 * betöltést, illetve a hibát (az újrapróbálás közben is).
 */
function pageViewOf(validId: boolean, query: UseQueryResult<PhotoDetail>): PageView {
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (!validId || notFound) return { status: 'not-found' };
  if (query.data !== undefined) return { status: 'ready', photo: query.data };
  return { status: loadStateOf(query) === 'loading' ? 'loading' : 'error' };
}

/**
 * Az adatlap a kép azonosítójához kötve: másik képre lépve (pl. az előzményekben) új példány indul –
 * az előző kép függő fókusza és állapota nem viszi át magát.
 */
export function PhotoDetailPage() {
  const { id = '' } = useParams();
  return <PhotoDetailContent key={id} id={id} />;
}

function PhotoDetailContent({ id }: { id: string }) {
  const validId = isPhotoId(id);

  // A saját, még regisztrálás alatt álló kép adatlapja magától frissül, amíg a regisztráció le nem
  // zárul – mint a feltöltés állapotkártyája (pollInterval.ts: 3 s, két perc után 30 s, tíz perc után
  // megáll); az állapotváltást bemondja, és a listákat frissíti
  const [clock] = useState(createPollClock);
  useEffect(() => clock.start(), [clock]);
  const photo = useQuery({
    queryKey: photoKeys.detail(id),
    queryFn: ({ signal }) => getPhoto(id, signal),
    enabled: validId,
    refetchInterval: (query) =>
      pollIntervalOf({
        pending: query.state.data?.status === 'PENDING_CHAIN',
        elapsedMs: clock.elapsedMs(),
        error: query.state.error,
      }),
  });
  useRegistrationTransition(photo.data?.status);
  const reviews = useInfiniteQuery({
    queryKey: reviewKeys.list(id),
    queryFn: ({ pageParam, signal }) => listReviews(id, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
    enabled: validId,
    // Ablakváltáskor nem tölti újra az összes betöltött oldalt (az értékelés írása és törlése frissíti – L23)
    refetchOnWindowFocus: false,
  });

  const view = pageViewOf(validId, photo);
  usePageTitle(view.status === 'ready' ? view.photo.title : PAGE_TITLES[view.status]);
  useHeadingFocusWhenShown(view.status, 'A kép betöltődött.');
  useSessionRecheck(view.status === 'ready' && view.photo.viewer === null);

  if (view.status === 'not-found') return <PhotoNotFound />;
  if (view.status === 'loading') return <LoadingView text="Kép betöltése…" />;
  if (view.status === 'error') {
    return (
      <div className="max-w-2xl space-y-4">
        <PageHeading>{PAGE_TITLES.error}</PageHeading>
        <LoadError
          title="A kép betöltése nem sikerült."
          state={loadStateOf(photo) === 'retrying' ? 'retrying' : 'failed'}
          error={photo.error}
          failedAt={photo.errorUpdatedAt}
          onRetry={() => void photo.refetch()}
          retryingText="Kép betöltése…"
        />
      </div>
    );
  }
  return (
    <div className="space-y-10">
      <PhotoView photo={view.photo} />
      <PhotoReviews photoId={id} viewer={view.photo.viewer} reviews={reviews} />
    </div>
  );
}

function PhotoNotFound() {
  return (
    <div className="max-w-2xl space-y-3">
      <PageHeading>{PAGE_TITLES['not-found']}</PageHeading>
      <p className="leading-7 text-fg-muted">
        Lehet, hogy a képet levették a galériából, vagy hibás a hivatkozás.
      </p>
      <Link to="/" className="inline-block underline underline-offset-2 hover:text-primary">
        Vissza a galériába
      </Link>
    </div>
  );
}

const BREADCRUMB_LINK = 'underline underline-offset-2 hover:text-fg';

/** Morzsamenü: Galéria › kategória (a galéria szűrve) › a kép címe. */
function Breadcrumb({ photo }: { photo: PhotoDetail }) {
  const separator = <ChevronRight aria-hidden="true" className="size-4 shrink-0" />;
  return (
    <nav aria-label="Morzsamenü">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
        <li className="flex items-center gap-1">
          <Link to="/" className={BREADCRUMB_LINK}>
            Galéria
          </Link>
          {separator}
        </li>
        <li className="flex items-center gap-1">
          <Link
            to={{ pathname: '/', search: `?categoryId=${photo.category.id}` }}
            className={BREADCRUMB_LINK}
          >
            {photo.category.name}
          </Link>
          {separator}
        </li>
        <li className="min-w-0">
          <span aria-current="page" className="block truncate text-fg">
            {photo.title}
          </span>
        </li>
      </ol>
    </nav>
  );
}

function PhotoView({ photo }: { photo: PhotoDetail }) {
  const hasDescription = photo.description !== null;

  return (
    <div className="space-y-6">
      <Breadcrumb photo={photo} />
      <header className="space-y-3">
        <PageHeading>{photo.title}</PageHeading>
        <p className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-xs font-medium"
          >
            {monogram(photo.owner.displayName)}
          </span>
          <Link
            to={`/users/${photo.owner.id}`}
            className="min-w-0 wrap-anywhere underline underline-offset-2 hover:text-primary"
          >
            {/* A név és a cél egyetlen szövegcsomópontban: a külön csomópontok között a név-számítás
                szóközt hagyna el vagy tenne be (mint a vezérlőpult gombjainál – L22) */}
            <span aria-hidden="true">{photo.owner.displayName}</span>
            <span className="sr-only">{photo.owner.displayName} profilja</span>
          </Link>
        </p>
      </header>
      {/* Mobilon egy oszlop (minmax(0, 1fr): a hosszú, töretlen szó sem szélesíti ki), a forrás
          sorrendjében; széles képernyőn a jobb oszlop (vásárlás, tanúsítvány) az összes sor mellett fut –
          az utolsó, rugalmas sor nyeli el a magasságkülönbséget */}
      <div
        className={cx(
          'grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]',
          hasDescription ? 'lg:grid-rows-[auto_auto_auto_1fr]' : 'lg:grid-rows-[auto_auto_1fr]',
        )}
      >
        {/* A keret a kép méretarányát előre foglalja (legfeljebb a képernyő 70 %-a magas, és legalább
            akkora, hogy a hiányzó előnézet szövege a lapos panorámánál se vágódjon le): az előnézet
            betöltése nem ugrasztja el az oldalt és az értékelések célrészletét (L26) */}
        <figure
          style={{ '--preview-ratio': `${photo.width} / ${photo.height}` } as CSSProperties}
          className="max-h-[70vh] min-h-32 overflow-hidden rounded-lg border border-line bg-surface aspect-(--preview-ratio) lg:col-start-1 lg:row-start-1"
        >
          <PhotoImage
            src={photo.previewUrl}
            alt={`${photo.title} – vízjeles előnézet`}
            width={photo.width}
            height={photo.height}
            loading="eager"
            className="object-contain"
          />
        </figure>
        <div
          className={cx(
            'space-y-6 lg:col-start-2 lg:row-start-1',
            hasDescription ? 'lg:row-span-4' : 'lg:row-span-3',
          )}
        >
          <PurchaseBox photo={photo} />
          <ChainCertificate photo={photo} />
        </div>
        {/* A leírás és az adatok egyszerű szakaszok (címsorral), nem tájékozódási pontok */}
        {hasDescription && (
          <div className="space-y-2 lg:col-start-1">
            <h2 className="text-xl font-semibold tracking-tight">Leírás</h2>
            <p className="leading-7 break-words whitespace-pre-line">{photo.description}</p>
          </div>
        )}
        <div className="space-y-2 lg:col-start-1">
          <h2 className="text-xl font-semibold tracking-tight">Adatok</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-fg-muted">Kategória</dt>
            <dd>{photo.category.name}</dd>
            <dt className="text-fg-muted">Feltöltve</dt>
            <dd>{formatDate(photo.createdAt)}</dd>
            <dt className="text-fg-muted">Méret</dt>
            <dd className="tabular-nums">
              {photo.width} × {photo.height} képpont
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
