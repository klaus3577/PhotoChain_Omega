// A vezérlőpult „Saját képeim” füle (L22; L17 drótváz „Vezérlőpult”): a felhasználó képei minden
// állapotban, a legújabb elöl, lapozva; sorok állapotjelvénnyel, árral és műveletekkel. A szerkesztés
// és a levétel párbeszédablakban (EditPhotoDialog, HidePhotoDialog); siker után a lista gyorsítótára
// azonnal frissül (minden betöltött oldalon), majd érvénytelenedik – az adatlap és a galéria listái
// is. A levétel után a sor műveletei eltűnnek: a fókusz a kép címére kerül (ne vesszen el), és csak
// utána hangzik el a bemondás (a fókuszváltás megszakíthatná); ha a felhasználó közben máshová vitte
// a fókuszt, ott marad. A szerkesztés után a böngésző a megnyitó gombra teszi vissza. A regisztráció
// figyelése és a lista frissítése a szülőé (DashboardPage). A betöltött lista egy sikertelen frissítés
// után is megmarad; hibanézet csak akkor van, ha nincs mit mutatni.
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { ImageOff, ImageUp } from 'lucide-react';
import { useEffect, useId, useState, type RefObject } from 'react';
import { Link } from 'react-router';

import {
  type OwnPhotoListItem,
  type OwnPhotoPage,
  photoKeys,
  type UploadedPhoto,
} from '../../api/photos.api';
import { dashboardSearch, MAX_DASHBOARD_PAGE } from '../../dashboard/dashboardParams';
import { summaryTextOf } from '../../dashboard/listSummary';
import { useFocusAfterRecovery } from '../../hooks/useFocusAfterRecovery';
import { focusLost } from '../../lib/focus';
import { loadStateOf, showsLoadError } from '../../lib/loadState';
import { ButtonLink } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { LoadError } from '../ui/LoadError';
import { Pagination } from '../ui/Pagination';
import { useAnnounce } from '../ui/useAnnounce';
import { EditPhotoDialog } from './EditPhotoDialog';
import { HidePhotoDialog } from './HidePhotoDialog';
import { ListSummary } from './ListSummary';
import { OwnPhotoRow, ROW_GRID } from './OwnPhotoRow';

const LOADING_TEXT = 'Képek betöltése…';

/**
 * A sorok címhivatkozásainak nyilvántartása képenként – stabil ref-visszahívásokkal (nem csatolódnak
 * le minden rendereléskor); a komponens egyszer hozza létre (useState).
 */
function createTitleRegistry() {
  const links = new Map<string, HTMLAnchorElement>();
  const callbacks = new Map<string, (element: HTMLAnchorElement | null) => void>();
  return {
    refFor(id: string) {
      let callback = callbacks.get(id);
      if (!callback) {
        callback = (element) => {
          if (element) links.set(id, element);
          else links.delete(id);
        };
        callbacks.set(id, callback);
      }
      return callback;
    },
    focus(id: string) {
      links.get(id)?.focus();
    },
  };
}

/** Üres állapot: nincs feltöltött kép, vagy csak ez az oldal üres (túl nagy oldalszám). */
function OwnEmpty({ total }: { total: number }) {
  if (total > 0) {
    return (
      <EmptyState
        icon={ImageOff}
        title="Ezen az oldalon nincs kép"
        action={
          <Link to="/dashboard" className="text-sm underline underline-offset-2">
            Vissza az első oldalra
          </Link>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={ImageOff}
      title="Még nincs feltöltött képed"
      action={
        <ButtonLink to="/upload" variant="primary" icon={ImageUp}>
          Kép feltöltése
        </ButtonLink>
      }
    >
      Az első képed ujjlenyomata a feltöltéskor a blokkláncra kerül, és itt követheted az állapotát.
    </EmptyState>
  );
}

/** A fókusz a bezáruló ablakban van (vagy már sehol): a művelet után a sor címére kerülhet. */
function focusInDialogOrLost(): boolean {
  const active = document.activeElement;
  return focusLost() || (active instanceof Element && active.closest('dialog') !== null);
}

interface OwnPhotosTabProps {
  query: UseQueryResult<OwnPhotoPage>;
  page: number;
  /** A találatszám sora – a szülő ide teszi a fókuszt lapozás és fülváltás után */
  summaryRef: RefObject<HTMLParagraphElement | null>;
}

export function OwnPhotosTab({ query, page, summaryRef }: OwnPhotosTabProps) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const headingId = useId();
  const [titles] = useState(createTitleRegistry);
  const [editing, setEditing] = useState<OwnPhotoListItem | null>(null);
  const [hiding, setHiding] = useState<OwnPhotoListItem | null>(null);
  // Új objektum minden kéréskor: a fókusz a lista frissülése UTÁN kerül a címre, és csak azután a bemondás
  const [focusRequest, setFocusRequest] = useState<{ id: string; message: string } | null>(null);

  const data = query.data;
  const stale = query.isPlaceholderData;
  // A régi (helykitöltő) oldal a hibanézet szempontjából nem adat (mint a galériánál)
  const state = loadStateOf({
    data: stale ? undefined : data,
    error: query.error,
    errorUpdateCount: query.errorUpdateCount,
  });
  const failed = showsLoadError(state);
  const summaryText = data ? summaryTextOf('kepeim', data.meta.total, page) : '';
  useFocusAfterRecovery(failed, summaryRef, summaryText || 'A képek betöltődtek.');

  useEffect(() => {
    if (!focusRequest) return;
    titles.focus(focusRequest.id);
    announce(focusRequest.message, { visible: true });
  }, [focusRequest, titles, announce]);

  const refreshAfterChange = (photoId: string) => {
    void queryClient.invalidateQueries({ queryKey: photoKeys.own() });
    void queryClient.invalidateQueries({ queryKey: photoKeys.detail(photoId) });
    void queryClient.invalidateQueries({ queryKey: photoKeys.lists() });
  };

  /** A módosult adatok minden betöltött oldalon azonnal; aztán a lista, az adatlap és a galéria frissül. */
  const applyUpdate = (updated: UploadedPhoto) => {
    queryClient.setQueriesData<OwnPhotoPage>(
      { queryKey: photoKeys.own() },
      (current) =>
        current && {
          ...current,
          photos: current.photos.map((photo) =>
            photo.id === updated.id
              ? {
                  ...photo,
                  title: updated.title,
                  description: updated.description,
                  priceHuf: updated.priceHuf,
                  category: updated.category,
                }
              : photo,
          ),
        },
    );
    refreshAfterChange(updated.id);
    setEditing(null);
    announce('A kép adatai frissültek.', { visible: true });
  };

  /** A levett kép sora azonnal „Elrejtve” lesz; a műveletei eltűnnek, a fókusz a címére kerül. */
  const applyHidden = (photo: OwnPhotoListItem) => {
    const moveFocus = focusInDialogOrLost();
    queryClient.setQueriesData<OwnPhotoPage>(
      { queryKey: photoKeys.own() },
      (current) =>
        current && {
          ...current,
          photos: current.photos.map((item) =>
            item.id === photo.id
              ? {
                  ...item,
                  status: 'HIDDEN' as const,
                  hiddenBy: 'OWNER' as const,
                  thumbnailUrl: null,
                  pendingTransaction: null,
                }
              : item,
          ),
        },
    );
    refreshAfterChange(photo.id);
    setHiding(null);
    const message = `„${photo.title}” lekerült a galériából.`;
    if (moveFocus) setFocusRequest({ id: photo.id, message });
    else announce(message, { visible: true });
  };

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="sr-only">
        Saját képeim
      </h2>
      <ListSummary
        ref={summaryRef}
        state={state}
        stale={stale}
        loadingText={LOADING_TEXT}
        text={summaryText}
      />
      {failed && (
        <LoadError
          title="A képek betöltése nem sikerült."
          state={state}
          error={query.error}
          failedAt={query.errorUpdatedAt}
          onRetry={() => void query.refetch()}
          retryingText={LOADING_TEXT}
        />
      )}
      {data && !stale && data.photos.length === 0 && <OwnEmpty total={data.meta.total} />}
      {data && !failed && data.photos.length > 0 && (
        <div>
          {/* Az oszlopfejléc csak vizuális: a cellák rejtett címkét kapnak, a gombok neve a kép címét */}
          <div
            aria-hidden="true"
            className={`hidden border-b border-line pb-2 text-sm text-fg-muted md:grid ${ROW_GRID}`}
          >
            <span>Kép</span>
            <span>Állapot</span>
            <span className="text-right">Ár</span>
            <span className="text-right">Műveletek</span>
          </div>
          <ul
            role="list"
            aria-busy={stale || undefined}
            className="space-y-3 md:space-y-0 md:divide-y md:divide-line"
          >
            {data.photos.map((photo) => (
              <OwnPhotoRow
                key={photo.id}
                photo={photo}
                onEdit={setEditing}
                onHide={setHiding}
                titleRef={titles.refFor(photo.id)}
              />
            ))}
          </ul>
        </div>
      )}
      {data && !failed && (
        <Pagination
          page={page}
          totalPages={Math.min(data.meta.totalPages, MAX_DASHBOARD_PAGE)}
          hrefFor={(target) => ({
            pathname: '/dashboard',
            search: dashboardSearch({ tab: 'kepeim', page: target }),
          })}
        />
      )}
      {editing && (
        <EditPhotoDialog photo={editing} onClose={() => setEditing(null)} onSaved={applyUpdate} />
      )}
      {hiding && (
        <HidePhotoDialog
          photo={hiding}
          onClose={() => setHiding(null)}
          onHidden={() => applyHidden(hiding)}
        />
      )}
    </section>
  );
}
