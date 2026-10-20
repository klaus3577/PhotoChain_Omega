// A kép értékelései az adatlapon (L17 drótváz „Adatlap”, 5–6. jegyzet): átlag számmal és csillaggal, a
// darabszám, a vásárlónak az értékelés írása (ReviewForm – L23), majd az értékelések a legújabb elöl;
// mindegyik neve a szerző és a dátum, a néző sajátja jelölve és törölhető (DeleteReviewDialog). A
// „További értékelések” a következő oldalt tölti be, és a fókuszt az első új értékelésre teszi (a gomb
// az utolsó oldal után eltűnik – a fókusz így sem vész el); ha ez nem sikerül, hibaüzenet jelenik meg,
// a gomb pedig marad (újrapróbálható). Az oldalak eltolás alapján jönnek: ha közben új értékelés
// érkezett, a következő oldal az előző utolsójával kezdődhet – az ismétlődőt egyszer mutatja (ha csak
// ismétlődő jött, a fókusz a lista végére kerül). Az első oldal hibájánál újrapróbálás; a sikeres
// újrapróbálás után a fókusz a szakasz címére kerül. Új értékelés után (a lista és az adatlap már
// frissült) a fókusz az új értékelésre kerül – ha nincs a listán, a szakasz címére –, és a köszönet
// elhangzik; törlés után a szakasz címére (a törölt sor gombja eltűnt), és a törlés hangzik el. A
// szöveg felhasználói tartalom: csak szövegként jelenik meg (React), a sortörései megmaradnak.
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { ApiError } from '../../api/http';
import { orderKeys } from '../../api/orders.api';
import { type PhotoDetail, type PhotoViewer, photoKeys } from '../../api/photos.api';
import { type Review, reviewKeys, type ReviewPage } from '../../api/reviews.api';
import { userKeys } from '../../api/users.api';
import { useFocusAfterRecovery } from '../../hooks/useFocusAfterRecovery';
import { focusElement, focusLost } from '../../lib/focus';
import { formatDate } from '../../lib/format';
import { loadStateOf, showsLoadError } from '../../lib/loadState';
import { errorText, toSentence } from '../../lib/text';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { LoadError } from '../ui/LoadError';
import { Spinner } from '../ui/Spinner';
import type { AnnounceTone } from '../ui/liveRegionContext';
import { useAnnounce } from '../ui/useAnnounce';
import { DeleteReviewDialog } from './DeleteReviewDialog';
import { RatingStars } from './RatingStars';
import { RatingSummary } from './RatingSummary';
import { type ReviewConflict, ReviewForm } from './ReviewForm';

interface PhotoReviewsProps {
  photoId: string;
  /** A bejelentkezett néző jelzői (írhat-e, a saját értékelése); vendégnek null */
  viewer: PhotoViewer | null;
  reviews: UseInfiniteQueryResult<InfiniteData<ReviewPage>>;
}

/** Az oldalak értékelései, mindegyik egyszer (az eltolásos lapozás az oldalhatáron ismételhet). */
function uniqueReviews(pages: readonly ReviewPage[]): Review[] {
  const byId = new Map<string, Review>();
  for (const review of pages.flatMap((page) => page.reviews)) {
    if (!byId.has(review.id)) byId.set(review.id, review);
  }
  return [...byId.values()];
}

interface ReviewItemProps {
  review: Review;
  /** A néző saját értékelése: jelölve és törölhető */
  own: boolean;
  onDelete: () => void;
}

function ReviewItem({ review, own, onDelete }: ReviewItemProps) {
  const titleId = useId();
  return (
    <li>
      <article
        aria-labelledby={titleId}
        data-review-id={review.id}
        className="space-y-2 rounded-lg border border-line p-4"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <p id={titleId} className="min-w-0 text-sm wrap-anywhere">
            <strong className="font-medium">{review.author.displayName}</strong>{' '}
            <span className="text-fg-muted">· {formatDate(review.createdAt)}</span>
          </p>
          <RatingStars value={review.rating} label={`${review.rating} csillag az 5-ből`} />
        </header>
        {review.comment !== null && (
          <p className="text-sm leading-6 break-words whitespace-pre-line">{review.comment}</p>
        )}
        {own && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            <span className="text-xs font-medium text-fg-muted">A te értékelésed</span>
            <Button icon={Trash2} onClick={onDelete} className="min-h-8 px-3 text-xs">
              Értékelés törlése
            </Button>
          </div>
        )}
      </article>
    </li>
  );
}

/** Egyszeri fókuszkérés egy változás után; force: akkor is mozdul, ha a fókusz nem veszett el. */
interface FocusRequest {
  /** A fókuszálandó értékelés (az új vagy a saját); null: a szakasz címe */
  id: string | null;
  message: string;
  /** A látható értesítés tónusa: a szerver elutasítása (403/409) figyelmeztetés, nem siker (L26) */
  tone?: AnnounceTone;
  force?: boolean;
  /**
   * A lista gyorsítótárának frissítési ideje a kéréskor: a megfigyelő (useInfiniteQuery) állapota csak
   * később, külön feladatban követi a gyorsítótárat – addig a lista még a régi
   */
  listUpdatedAt: number;
}

/** Fókusz az elemre, és a képernyőre görgetve (a programból mozgatott fókusz ne tűnjön el a nézetből). */
function revealAndFocus(element: HTMLElement | null, block: ScrollLogicalPosition = 'nearest') {
  if (!element) return;
  focusElement(element);
  element.scrollIntoView?.({ block });
}

export function PhotoReviews({ photoId, viewer, reviews }: PhotoReviewsProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const { hash } = useLocation();
  /**
   * A „További értékelések” után várt oldalszám, az első új értékelés helye és a gomb (amelyen a
   * fókusz állt): amint az oldal megjelent, a fókusz az új értékelésre kerül
   */
  const pendingFocus = useRef<{ pages: number; index: number; origin: Element | null } | null>(
    null,
  );
  /**
   * Fókuszkérés egy változás után (új értékelés, a szerver szerint elavult állapot, törlés): a kérés
   * ref-ben, a kiváltó renderelést a számláló adja – a frissült lista megjelenése után teljesül
   */
  const afterChange = useRef<FocusRequest | null>(null);
  const [changeTick, bumpChangeTick] = useReducer((tick: number) => tick + 1, 0);
  /** A törlés megerősítése ennél az értékelésnél */
  const [deleting, setDeleting] = useState<string | null>(null);
  /** A #ertekeles célrészlet egyszer teljesül */
  const hashHandled = useRef(false);
  const ownReviewId = viewer?.ownReviewId ?? null;
  const canReview = viewer?.canReview ?? false;

  const pages = reviews.data?.pages ?? [];
  const items = uniqueReviews(pages);
  const rating = pages[0]?.rating;
  const remaining = (pages.at(-1)?.meta.total ?? 0) - items.length;
  const state = loadStateOf(reviews);
  useFocusAfterRecovery(showsLoadError(state), headingRef, 'Az értékelések betöltődtek.');

  const requestFocus = (request: Omit<FocusRequest, 'listUpdatedAt'>) => {
    const listUpdatedAt = queryClient.getQueryState(reviewKeys.list(photoId))?.dataUpdatedAt ?? 0;
    afterChange.current = { ...request, listUpdatedAt };
    bumpChangeTick();
  };

  // Az új oldal megjelent: a fókusz az első új értékelésre kerül – ha még a gombon (vagy az eltűnt gomb
  // helyén, a body-n) volt; ha közben máshová vitte, ott marad. Ha nem jött új (csak ismétlődő), és a
  // gomb is eltűnt, a lista végére – a fókusz így sem vész el, és később (pl. egy frissítéskor) sem ugrik el.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null || pages.length < pending.pages) return;
    pendingFocus.current = null;
    const active = document.activeElement;
    if (active !== pending.origin && active !== document.body) return;
    const articles = [...(listRef.current?.querySelectorAll<HTMLElement>('article') ?? [])];
    const firstNew = articles[pending.index];
    const last = articles.at(-1);
    if (firstNew) focusElement(firstNew);
    else if (last && active === document.body) focusElement(last);
  }, [pages.length]);

  // Változás utáni fókusz, amint a megjelenített lista a frissült gyorsítótárat mutatja: az eltűnő
  // űrlapról vagy a bezárult ablakból az új vagy a saját értékelésre, különben a szakasz címére kerül;
  // ha a felhasználó közben máshová vitte, ott marad – a bejelentés mindenképp elhangzik, a fókusz után
  useEffect(() => {
    const request = afterChange.current;
    if (request === null || reviews.dataUpdatedAt < request.listUpdatedAt) return;
    afterChange.current = null;
    const active = document.activeElement;
    const inForm = active instanceof Element && active.closest('#ertekeles') !== null;
    if (request.force || focusLost() || inForm) {
      const article =
        request.id === null
          ? null
          : listRef.current?.querySelector<HTMLElement>(`[data-review-id="${request.id}"]`);
      revealAndFocus(article ?? headingRef.current);
    }
    announce(request.message, { visible: true, tone: request.tone });
  }, [changeTick, reviews.dataUpdatedAt, announce]);

  // A vásárlásaim „Értékelés írása” hivatkozása (#ertekeles): az űrlap csak az adatlap betöltése után
  // jelenik meg, ezért a böngésző görgetése és az útvonalváltás címfókusza nem éri el – ide görget és
  // fókuszál (aki nem értékelhet, annál a szakasz címére)
  useEffect(() => {
    if (hash !== '#ertekeles' || hashHandled.current) return;
    hashHandled.current = true;
    const formHeading = document.getElementById('ertekeles')?.querySelector<HTMLElement>('h3');
    revealAndFocus((canReview ? formHeading : null) ?? headingRef.current, 'start');
  }, [hash, canReview]);

  const loadMore = () => {
    // Sikertelen betöltésnél az oldalszám nem nő: a várakozó fókusz nem sül el, az újabb kattintás felülírja
    pendingFocus.current = {
      pages: pages.length + 1,
      index: items.length,
      origin: document.activeElement,
    };
    void reviews.fetchNextPage();
  };

  /** A szerver döntése után (403/409) az adatlap már frissült: a fókusz a saját értékelésre vagy a címre. */
  const conflict = ({ status, message }: ReviewConflict) => {
    // A saját értékelés azonosítója a frissült gyorsítótárból (a megfigyelő még a régit mutathatja)
    const detail = queryClient.getQueryData<PhotoDetail>(photoKeys.detail(photoId));
    requestFocus({
      id: status === 409 ? (detail?.viewer?.ownReviewId ?? null) : null,
      message,
      tone: 'warning',
    });
  };

  /** Törlés (vagy a szerver szerint már törölt értékelés) után: a lista és az adatlap frissül megvárva. */
  const refreshAfterDelete = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewKeys.list(photoId) }),
      queryClient.invalidateQueries({ queryKey: photoKeys.detail(photoId), exact: true }),
    ]);
    void queryClient.invalidateQueries({ queryKey: photoKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: orderKeys.purchases() });
    void queryClient.invalidateQueries({ queryKey: userKeys.all() });
    setDeleting(null);
  };
  const deleted = async () => {
    await refreshAfterDelete();
    requestFocus({ id: null, message: 'Az értékelésed törölve.', force: true });
  };
  const deleteStale = async (error: ApiError) => {
    await refreshAfterDelete();
    requestFocus({ id: null, message: toSentence(error.message), tone: 'warning', force: true });
  };

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          ref={headingRef}
          id={headingId}
          className="text-xl font-semibold tracking-tight focus:outline-none"
        >
          Értékelések
        </h2>
        {rating && rating.average !== null && (
          <RatingSummary rating={{ average: rating.average, count: rating.count }} />
        )}
      </div>
      {viewer?.canReview && (
        <ReviewForm
          photoId={photoId}
          onCreated={(review) =>
            requestFocus({ id: review.id, message: 'Köszönjük az értékelést!' })
          }
          onConflict={conflict}
        />
      )}
      {state === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner />
          Értékelések betöltése…
        </p>
      )}
      {showsLoadError(state) && (
        <LoadError
          title="Az értékelések betöltése nem sikerült."
          state={state}
          error={reviews.error}
          failedAt={reviews.errorUpdatedAt}
          onRetry={() => void reviews.refetch()}
          retryingText="Értékelések betöltése…"
        />
      )}
      {state === 'ready' && items.length === 0 && (
        <p className="text-sm text-fg-muted">Még nincs értékelés.</p>
      )}
      {/* A felsorolásjel nélküli lista is lista marad (a WebKit különben nem annak mondja) */}
      {items.length > 0 && (
        <ul ref={listRef} role="list" className="space-y-3">
          {items.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              own={review.id === ownReviewId}
              onDelete={() => setDeleting(review.id)}
            />
          ))}
        </ul>
      )}
      {reviews.isFetchNextPageError && (
        <Alert
          key={reviews.errorUpdatedAt}
          tone="danger"
          title="A további értékelések betöltése nem sikerült."
        >
          {errorText(reviews.error)}
        </Alert>
      )}
      {reviews.hasNextPage && remaining > 0 && (
        <Button busy={reviews.isFetchingNextPage} onClick={loadMore}>
          További értékelések ({remaining})
        </Button>
      )}
      {deleting !== null && (
        <DeleteReviewDialog
          reviewId={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={deleted}
          onStale={deleteStale}
        />
      )}
    </section>
  );
}
