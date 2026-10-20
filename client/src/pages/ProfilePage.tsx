// A fotós publikus profilja (L23 – terv 5.2 „/users/:id”; a drótvázak meglévő mintáiból épül): név
// monogrammal, a csatlakozás ideje, a hitelesített képek száma, az átlagos értékelés (csak a nyilvános
// képek értékeléseiből – server users.service), a bemutatkozás szövegként (a sortörései megmaradnak),
// és a hitelesített képek rácsa lapozással (GET /api/photos?ownerId=…, az oldal az URL-ben). A saját
// profil szerkeszthető (EditProfileDialog, PATCH /api/me): a név a fejlécben (munkamenet), a címben
// és a profilban is frissül. Az azonosító csak UUID-ként indít kérést; a nem létező (vagy letiltott)
// felhasználó saját, érthető oldalt kap. A képek hibája a profil mellett, a saját szakaszában látszik.
// Forrás: TanStack Query – Paginated Queries (placeholderData: keepPreviousData),
// https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries (adaptálva)
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { ImageOff, Pencil } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import type { AuthUser } from '../api/auth.api';
import { ApiError } from '../api/http';
import { listPhotos, type PhotoPage, photoKeys } from '../api/photos.api';
import { getProfile, isUserId, type PublicProfile, userKeys } from '../api/users.api';
import { monogram } from '../auth/session';
import { PUBLIC_QUERY_META, setSessionUser } from '../auth/sessionCache';
import { useAuth } from '../auth/useAuth';
import { PhotoCard } from '../components/photos/PhotoCard';
import { RatingSummary } from '../components/photos/RatingSummary';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadError } from '../components/ui/LoadError';
import { PageHeading } from '../components/ui/PageHeading';
import { Pagination } from '../components/ui/Pagination';
import { LoadingView } from '../components/ui/LoadingView';
import { Spinner } from '../components/ui/Spinner';
import { useAnnounce } from '../components/ui/useAnnounce';
import { EditProfileDialog } from '../components/users/EditProfileDialog';
import { summaryTextOf, useViewChangeFocus } from '../dashboard/listSummary';
import { useFocusAfterRecovery } from '../hooks/useFocusAfterRecovery';
import { type PageStatus, useHeadingFocusWhenShown } from '../hooks/useHeadingFocusWhenShown';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatDate } from '../lib/format';
import { loadStateOf, showsLoadError } from '../lib/loadState';
import { GALLERY_PAGE_SIZE, integerParam, MAX_GALLERY_PAGE } from '../photos/galleryParams';

type PageView =
  | { status: 'ready'; profile: PublicProfile }
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' };

const PAGE_TITLES: Record<Exclude<PageStatus, 'ready'>, string> = {
  loading: 'Profil betöltése',
  'not-found': 'A felhasználó nem található',
  error: 'A profil most nem tölthető be',
};

/** A fotós nyilvános képeinek lekérdezése: a galéria végpontja a tulajdonosra szűrve, lapozva. */
const profilePhotosQuery = (ownerId: string, page: number): string =>
  `?ownerId=${ownerId}&page=${page}&pageSize=${GALLERY_PAGE_SIZE}`;

/**
 * Mit mutat az oldal: a nem létező (érvénytelen azonosítójú vagy 404-es – letiltott, megszűnt)
 * felhasználónál a „nem található” oldalt; ha van adat, a profilt; különben a betöltést vagy a hibát.
 */
function viewOf(validId: boolean, query: UseQueryResult<PublicProfile>): PageView {
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (!validId || notFound) return { status: 'not-found' };
  if (query.data !== undefined) return { status: 'ready', profile: query.data };
  return { status: loadStateOf(query) === 'loading' ? 'loading' : 'error' };
}

/** A profil a felhasználó azonosítójához kötve: másik profilra lépve új példány indul. */
export function ProfilePage() {
  const { id = '' } = useParams();
  return <ProfileContent key={id} id={id} />;
}

function ProfileContent({ id }: { id: string }) {
  const validId = isUserId(id);
  const [searchParams] = useSearchParams();
  const page = integerParam(searchParams.get('page'), 1, MAX_GALLERY_PAGE) ?? 1;
  const profile = useQuery({
    queryKey: userKeys.profile(id),
    queryFn: ({ signal }) => getProfile(id, signal),
    enabled: validId,
    meta: PUBLIC_QUERY_META,
  });
  const query = profilePhotosQuery(id, page);
  const photos = useQuery({
    queryKey: photoKeys.list(query),
    queryFn: ({ signal }) => listPhotos(query, signal),
    enabled: validId,
    placeholderData: keepPreviousData,
    meta: PUBLIC_QUERY_META,
  });
  const view = viewOf(validId, profile);
  usePageTitle(view.status === 'ready' ? view.profile.displayName : PAGE_TITLES[view.status]);
  useHeadingFocusWhenShown(view.status, 'A profil betöltődött.');

  if (view.status === 'not-found') return <ProfileNotFound />;
  if (view.status === 'loading') return <LoadingView text="Profil betöltése…" />;
  if (view.status === 'error') {
    return (
      <div className="max-w-2xl space-y-4">
        <PageHeading>{PAGE_TITLES.error}</PageHeading>
        <LoadError
          title="A profil betöltése nem sikerült."
          state={loadStateOf(profile) === 'retrying' ? 'retrying' : 'failed'}
          error={profile.error}
          failedAt={profile.errorUpdatedAt}
          onRetry={() => void profile.refetch()}
          retryingText="Profil betöltése…"
        />
      </div>
    );
  }
  return (
    <div className="space-y-10">
      <ProfileHeader profile={view.profile} />
      <ProfilePhotos photos={photos} page={page} ownerId={view.profile.id} />
    </div>
  );
}

function ProfileNotFound() {
  return (
    <div className="max-w-2xl space-y-3">
      <PageHeading>{PAGE_TITLES['not-found']}</PageHeading>
      <p className="leading-7 text-fg-muted">
        Lehet, hogy a fiókot megszüntették, vagy hibás a hivatkozás.
      </p>
      <Link to="/" className="inline-block underline underline-offset-2 hover:text-primary">
        Vissza a galériába
      </Link>
    </div>
  );
}

/** A fejléc: monogram, név, csatlakozás és képszám, átlag, bemutatkozás; a sajátnál szerkesztés. */
function ProfileHeader({ profile }: { profile: PublicProfile }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [editing, setEditing] = useState(false);
  const currentUser = auth.status === 'authenticated' ? auth.user : null;
  const own = currentUser !== null && currentUser.id === profile.id;
  // Ha a néző közben nem a tulajdonos (a munkamenet megszűnt vagy más lépett be), a nyitott szerkesztő
  // eltűnik – az állapot igazítása renderelés közben, hogy egy újabb belépés ne nyissa ki kéretlenül
  if (!own && editing) setEditing(false);

  /** Mentés után: a munkamenet (fejléc), a profil azonnal, a galéria kártyái (a fotós neve) később. */
  const saved = (user: AuthUser) => {
    setSessionUser(queryClient, user);
    // Csak a saját profilba íródik (ha közben másik lapon más lépett be, a válasz az övé – a
    // munkamenet követi, a nyilvános profil nem)
    if (user.id === profile.id) {
      queryClient.setQueryData<PublicProfile>(
        userKeys.profile(profile.id),
        (current) => current && { ...current, displayName: user.displayName, bio: user.bio },
      );
    }
    void queryClient.invalidateQueries({ queryKey: userKeys.profile(profile.id) });
    // A fotós neve a galéria kártyáin, az adatlapokon és az értékeléseinél is szerepel
    void queryClient.invalidateQueries({ queryKey: photoKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: photoKeys.details() });
    setEditing(false);
    announce('A profil mentve.', { visible: true });
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <span
        aria-hidden="true"
        className="grid size-14 shrink-0 place-items-center rounded-full border border-line-strong text-lg font-medium"
      >
        {monogram(profile.displayName)}
      </span>
      {/* grow + basis (nem flex-1): keskeny képernyőn az avatár alá törik, nem csuklik össze (WCAG 1.4.10) */}
      <div className="min-w-0 grow basis-64 space-y-3">
        <PageHeading>{profile.displayName}</PageHeading>
        <p className="text-sm text-fg-muted">
          Csatlakozott: {formatDate(profile.createdAt)} ·{' '}
          <span className="text-fg">{profile.photoCount} hitelesített kép</span>
        </p>
        {profile.rating.average !== null ? (
          <RatingSummary
            rating={{ average: profile.rating.average, count: profile.rating.count }}
          />
        ) : (
          <p className="text-sm text-fg-muted">Még nincs értékelés.</p>
        )}
        {profile.bio !== null && (
          <p className="max-w-prose leading-7 break-words whitespace-pre-line">{profile.bio}</p>
        )}
      </div>
      {own && (
        <Button icon={Pencil} onClick={() => setEditing(true)}>
          Profil szerkesztése
        </Button>
      )}
      {own && editing && currentUser && (
        <EditProfileDialog user={currentUser} onClose={() => setEditing(false)} onSaved={saved} />
      )}
    </div>
  );
}

interface ProfilePhotosProps {
  photos: UseQueryResult<PhotoPage>;
  page: number;
  ownerId: string;
}

/** A hitelesített képek rácsa lapozással – mint a galéria, de csak a fotós képeivel. */
function ProfilePhotos({ photos, page, ownerId }: ProfilePhotosProps) {
  const headingId = useId();
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const auth = useAuth();
  const own = auth.status === 'authenticated' && auth.user.id === ownerId;

  const data = photos.data;
  const stale = photos.isPlaceholderData;
  // A régi (helykitöltő) találat a hibanézet szempontjából nem adat (mint a galériában)
  const state = loadStateOf({
    data: stale ? undefined : data,
    error: photos.error,
    errorUpdateCount: photos.errorUpdateCount,
  });
  const failed = showsLoadError(state);
  const fresh = photos.isSuccess && !stale;
  const summaryText = data ? summaryTextOf('kepeim', data.meta.total, page) : '';
  const emptyTitle = own ? 'Még nincs hitelesített képed' : 'Még nincs hitelesített képe';
  useViewChangeFocus(String(page), fresh, summaryRef, summaryText, emptyTitle);
  useFocusAfterRecovery(failed, summaryRef, 'A képek betöltődtek.');

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-xl font-semibold tracking-tight">
        Képek
      </h2>
      <p
        ref={summaryRef}
        className="flex min-h-6 items-center gap-2 text-sm text-fg-muted focus:outline-none"
      >
        {!failed && (stale || state === 'loading') && (
          <>
            <Spinner />
            {stale ? 'Képek frissítése…' : 'Képek betöltése…'}
          </>
        )}
        {!failed && !stale && state === 'ready' && summaryText}
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
      {data && !stale && data.photos.length === 0 && data.meta.total > 0 && (
        <EmptyState
          icon={ImageOff}
          title="Ezen az oldalon nincs kép"
          action={
            <Link to={{ search: '' }} className="text-sm underline underline-offset-2">
              Vissza az első oldalra
            </Link>
          }
        />
      )}
      {data && !stale && data.meta.total === 0 && (
        <EmptyState
          icon={ImageOff}
          title={emptyTitle}
          action={
            own ? (
              <Link to="/upload" className="text-sm underline underline-offset-2">
                Kép feltöltése
              </Link>
            ) : undefined
          }
        >
          {own
            ? 'A feltöltött és a blokkláncon rögzített képeid itt jelennek meg.'
            : 'A fotós hitelesített képei itt jelennek majd meg.'}
        </EmptyState>
      )}
      {data && !failed && data.photos.length > 0 && (
        <ul
          role="list"
          aria-busy={stale || undefined}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {data.photos.map((photo) => (
            <li key={photo.id}>
              <PhotoCard photo={photo} headingLevel={3} />
            </li>
          ))}
        </ul>
      )}
      {data && !failed && (
        <Pagination
          page={page}
          totalPages={Math.min(data.meta.totalPages, MAX_GALLERY_PAGE)}
          hrefFor={(target) => ({ search: target === 1 ? '' : `?page=${target}` })}
        />
      )}
    </section>
  );
}
