// A képek szakasza az adminfelületen (L25; L17 drótváz „Adminisztráció”, 4–7. jegyzet): minden kép
// minden állapotban – a moderáláshoz a rejtett és a hibás képek is –, állapotszűrővel (a darabszám a
// statisztikából), táblázatban (bélyegkép és cím az adatlapra, tulajdonos – tiltva, ha az –, állapot
// a magyarázatával, a feltöltés napja, művelet), lapozva. A művelet az állapothoz igazodik
// (adminPhotoStatus.ts): az elrejtés megerősítéssel (HideAdminPhotoDialog), a visszaállítás és az
// újrapróbálás egy gombbal. A siker után a sor a szerver válaszából frissül; ha a gomb eltűnt
// (újrapróbálás → várakozás; a tulajdonos elrejtése érvényben maradt), a fókusz a kép címére kerül;
// az eredményt az élő régió mondja be – ha a sor a szűrt listából kikerül, azt is. A gombos műveletek
// hibája riasztás a táblázat fölött, a sor gombjának leírásaként; a korlátozás (429) után a szerver
// kérte várakozás alatt az újrapróbálás gombjai foglaltak. Az újrapróbálás a lekérdezési időkeretet is
// újraindítja (onRetryStarted – AdminPage).
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Eye, EyeOff, ImageOff, type LucideIcon, RotateCw } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';

import {
  type AdminPhoto,
  type AdminPhotoPage,
  adminKeys,
  PHOTO_STATUS_LIST,
  type PlatformStats,
  retryRegistration,
  setPhotoHidden,
} from '../../api/admin.api';
import { ApiError } from '../../api/http';
import type { PhotoStatus } from '../../api/photos.api';
import {
  type AdminParams,
  adminSearch,
  MAX_ADMIN_PAGE,
  photosApiQuery,
} from '../../admin/adminParams';
import { countSummaryOf, useViewChangeFocus } from '../../dashboard/listSummary';
import { useFocusAfterRecovery } from '../../hooks/useFocusAfterRecovery';
import { cx } from '../../lib/cx';
import { formatDate, formatInteger } from '../../lib/format';
import { loadStateOf, showsLoadError } from '../../lib/loadState';
import { errorText } from '../../lib/text';
import { ListSummary } from '../dashboard/ListSummary';
import { Thumbnail } from '../photos/Thumbnail';
import { Alert } from '../ui/Alert';
import { Button, type ButtonVariant } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { LoadError } from '../ui/LoadError';
import { Pagination } from '../ui/Pagination';
import { StatusBadge } from '../ui/StatusBadge';
import { useActionError, useCooldown, usePendingIds } from './actionState';
import { applyPhotoChange, applyRetryStarted, shouldRefreshAfterError } from './adminCache';
import { type AdminPhotoAction, adminPhotoActionOf, adminPhotoStatusOf } from './adminPhotoStatus';
import { CELL, DataTable, ROW_HEADER } from './DataTable';
import { FilterGroup, type FilterOption } from './FilterGroup';
import { HideAdminPhotoDialog } from './HideAdminPhotoDialog';
import { ListPlaceholder } from './ListPlaceholder';
import { rowFocusAttribute, rowStart, useRowFocus, useRowRemovalRescue } from './useRowFocus';

const LOADING_TEXT = 'Képek betöltése…';
const NOUN = 'kép';
const COLUMNS = ['Kép', 'Tulajdonos', 'Állapot', 'Feltöltve', 'Művelet'] as const;
/** A mutációk kulcsai: a futó kérések soraihoz (actionState.ts) */
const RESTORE_KEY = ['admin', 'restore'] as const;
const RETRY_KEY = ['admin', 'retry'] as const;

type StatusFilter = PhotoStatus | 'all';

const STATUS_LABELS: Record<PhotoStatus, string> = {
  REGISTERED: 'Hitelesítve',
  PENDING_CHAIN: 'Folyamatban',
  CHAIN_FAILED: 'Sikertelen',
  HIDDEN: 'Rejtett',
};

interface ActionView {
  label: string;
  /** A gomb teljes neve a képernyőolvasónak (a látható felirattal kezdődik – WCAG 2.5.3) */
  name: (title: string) => string;
  icon: LucideIcon;
  variant: ButtonVariant;
}

const ACTIONS: Record<AdminPhotoAction, ActionView> = {
  hide: {
    label: 'Elrejtés',
    name: (title) => `Elrejtés: ${title}`,
    icon: EyeOff,
    variant: 'danger',
  },
  // „Újrapróbálás” a betöltés hibájánál is van: a név megmondja, hogy ez a regisztrációé
  retry: {
    label: 'Újrapróbálás',
    name: (title) => `Újrapróbálás: ${title} regisztrációja`,
    icon: RotateCw,
    variant: 'outline',
  },
  restore: {
    label: 'Visszaállítás',
    name: (title) => `Visszaállítás: ${title}`,
    icon: Eye,
    variant: 'outline',
  },
};

/** A szűrő címkéi a darabszámmal („Rejtett (4)”), amíg a statisztika nem ismert, anélkül. */
function statusOptions(stats: PlatformStats | undefined): FilterOption<StatusFilter>[] {
  const withCount = (label: string, count: number | undefined) =>
    count === undefined ? label : `${label} (${formatInteger(count)})`;
  return [
    { value: 'all', label: withCount('Mind', stats?.photos.total) },
    ...PHOTO_STATUS_LIST.map((status) => ({
      value: status,
      label: withCount(STATUS_LABELS[status], stats?.photos.byStatus[status]),
    })),
  ];
}

/** Az üres állapot címe: a szűrőé, az üres oldalé vagy az üres listáé. */
function emptyTitleOf(params: AdminParams, total: number): string {
  if (total > 0) return 'Ezen az oldalon nincs kép';
  return params.status !== null ? 'Nincs ilyen kép' : 'Még nincs feltöltött kép';
}

/** A módosított kép a szűrt listából kikerül (más lett az állapota, mint a szűrőé). */
const leavesFilter = (params: AdminParams, status: PhotoStatus): boolean =>
  params.status !== null && status !== params.status;

function PhotosEmpty({ params, total }: { params: AdminParams; total: number }) {
  const title = emptyTitleOf(params, total);
  const link = (search: string, label: string) => (
    <Link
      to={{ pathname: '/admin', search }}
      preventScrollReset
      className="text-sm underline underline-offset-2"
    >
      {label}
    </Link>
  );
  if (total > 0) {
    return (
      <EmptyState
        icon={ImageOff}
        title={title}
        action={link(adminSearch({ ...params, photosPage: 1 }), 'Vissza az első oldalra')}
      />
    );
  }
  if (params.status !== null) {
    return (
      <EmptyState
        icon={ImageOff}
        title={title}
        action={link(adminSearch({ ...params, status: null, photosPage: 1 }), 'Szűrő törlése')}
      >
        Ebben az állapotban most nincs kép.
      </EmptyState>
    );
  }
  return <EmptyState icon={ImageOff} title={title} />;
}

/** A visszaállítás eredménye: a kép újra nyilvános, vagy a tulajdonos elrejtése érvényben maradt. */
const restoredText = (photo: AdminPhoto) =>
  photo.status === 'HIDDEN'
    ? `„${photo.title}” moderátori elrejtése megszűnt; a tulajdonos elrejtése érvényben marad`
    : `„${photo.title}” visszaállítva`;

interface PhotoRowProps {
  photo: AdminPhoto;
  /** A sor művelete folyamatban (vagy a szerver kérte várakozás alatt nem indítható) */
  busy: boolean;
  /** A sor műveletének riasztása (a gomb leírása) */
  errorId: string | undefined;
  onAction: (action: AdminPhotoAction, photo: AdminPhoto) => void;
  /** A sor a fókusszal együtt tűnik el (useRowFocus) */
  onRemoved: (index: number) => void;
}

function PhotoRow({ photo, busy, errorId, onAction, onRemoved }: PhotoRowProps) {
  const ref = useRowRemovalRescue(onRemoved);
  const status = adminPhotoStatusOf(photo);
  const next = adminPhotoActionOf(photo);
  const muted = photo.status === 'HIDDEN';
  return (
    <tr ref={ref}>
      <th scope="row" className={ROW_HEADER}>
        <span className="flex items-center gap-3">
          <Thumbnail src={photo.thumbnailUrl} />
          <Link
            to={`/photos/${photo.id}`}
            {...rowFocusAttribute(photo.id)}
            className={cx('underline-offset-2 hover:underline', muted && 'text-fg-muted')}
          >
            {photo.title}
          </Link>
        </span>
      </th>
      <td className={cx(CELL, 'text-fg-muted')}>
        {photo.owner.displayName}
        {photo.owner.isBlocked && <span> (tiltva)</span>}
      </td>
      <td className={CELL}>
        <StatusBadge tone={status.tone} icon={status.icon}>
          {status.label}
        </StatusBadge>
        {status.note && <p className="mt-1 text-xs text-fg-muted">{status.note}</p>}
      </td>
      <td className={cx(CELL, 'text-fg-muted whitespace-nowrap')}>{formatDate(photo.createdAt)}</td>
      <td className={cx(CELL, 'text-right')}>
        {'action' in next ? (
          // Egyetlen gomb-elem minden művelethez: a művelet után (elrejtés → visszaállítás) a fókusz rajta marad
          <Button
            variant={ACTIONS[next.action].variant}
            icon={ACTIONS[next.action].icon}
            busy={busy}
            aria-describedby={errorId}
            onClick={() => onAction(next.action, photo)}
          >
            <span aria-hidden="true">{ACTIONS[next.action].label}</span>
            <span className="sr-only">{ACTIONS[next.action].name(photo.title)}</span>
          </Button>
        ) : (
          <span className="text-fg-muted">{next.note}</span>
        )}
      </td>
    </tr>
  );
}

interface PhotosSectionProps {
  params: AdminParams;
  query: UseQueryResult<AdminPhotoPage>;
  /** A statisztika, ha már ismert – a szűrő darabszámaihoz */
  stats: PlatformStats | undefined;
  onChange: (next: AdminParams) => void;
  /** Egy újrapróbálás elfogadva: a kép újra várakozik (a lekérdezés időkerete újraindul) */
  onRetryStarted: () => void;
}

export function PhotosSection({
  params,
  query,
  stats,
  onChange,
  onRetryStarted,
}: PhotosSectionProps) {
  const queryClient = useQueryClient();
  const headingId = useId();
  const errorId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const rowFocus = useRowFocus(sectionRef, summaryRef);
  const viewKey = photosApiQuery(params);
  const actionError = useActionError(viewKey);
  const restoring = usePendingIds(RESTORE_KEY);
  const retrying = usePendingIds(RETRY_KEY);
  const cooldown = useCooldown();
  const [hiding, setHiding] = useState<AdminPhoto | null>(null);

  const data = query.data;
  const stale = query.isPlaceholderData;
  const state = loadStateOf({
    data: stale ? undefined : data,
    error: query.error,
    errorUpdateCount: query.errorUpdateCount,
  });
  const failed = showsLoadError(state);
  const summaryText = data ? countSummaryOf(NOUN, data.meta.total, params.photosPage) : '';
  useFocusAfterRecovery(failed, summaryRef, summaryText || 'A képek betöltődtek.');
  useViewChangeFocus(
    viewKey,
    query.isSuccess && !stale,
    summaryRef,
    summaryText,
    data ? `${emptyTitleOf(params, data.meta.total)}.` : '',
    sectionRef,
  );

  /** A bemondás: az eredmény, és ha a sor a szűrt listából kikerül, az is */
  const outcome = (status: PhotoStatus, text: string) =>
    `${text}${leavesFilter(params, status) ? '; a szűrt listából kikerült.' : '.'}`;
  /** A művelet után a sor gombja eltűnik (magyarázat lép a helyére): a fókusz a kép címére kerül */
  const buttonDisappears = (photo: AdminPhoto) => !('action' in adminPhotoActionOf(photo));

  const refreshAfterError = (error: unknown) => {
    if (shouldRefreshAfterError(error)) {
      void queryClient.invalidateQueries({ queryKey: adminKeys.photos() });
    }
  };
  const restore = useMutation({
    mutationKey: RESTORE_KEY,
    mutationFn: (photo: AdminPhoto) => setPhotoHidden(photo.id, false),
    onSuccess: (updated) => {
      actionError.clear();
      applyPhotoChange(queryClient, updated);
      rowFocus.request(
        updated.id,
        outcome(updated.status, restoredText(updated)),
        buttonDisappears(updated),
      );
    },
    onError: (error, photo) => {
      actionError.fail(photo.id, 'A visszaállítás nem sikerült.', error);
      refreshAfterError(error);
    },
  });
  const retry = useMutation({
    mutationKey: RETRY_KEY,
    mutationFn: (photo: AdminPhoto) => retryRegistration(photo.id),
    onSuccess: (started, photo) => {
      actionError.clear();
      onRetryStarted();
      applyRetryStarted(queryClient, started.id);
      rowFocus.request(
        started.id,
        outcome('PENDING_CHAIN', `„${photo.title}” regisztrációja újraindult`),
        true,
      );
    },
    onError: (error, photo) => {
      actionError.fail(photo.id, 'Az újrapróbálás nem sikerült.', error);
      if (error instanceof ApiError && error.code === 'RATE_LIMITED' && error.retryAfterSeconds) {
        cooldown.start(error.retryAfterSeconds);
      }
      refreshAfterError(error);
    },
  });

  const applyHidden = (photo: AdminPhoto) => {
    actionError.clear();
    applyPhotoChange(queryClient, photo);
    setHiding(null);
    // A böngésző a bezáruló ablakból a megnyitó gombra (most: Visszaállítás) teszi vissza a fókuszt
    rowFocus.request(
      photo.id,
      outcome(photo.status, `„${photo.title}” elrejtve`),
      buttonDisappears(photo),
    );
  };

  const runAction = (action: AdminPhotoAction, photo: AdminPhoto) => {
    if (action === 'hide') setHiding(photo);
    else if (action === 'restore') restore.mutate(photo);
    else retry.mutate(photo);
  };
  const isBusy = (photo: AdminPhoto) =>
    restoring.has(photo.id) ||
    retrying.has(photo.id) ||
    (cooldown.active && photo.status === 'CHAIN_FAILED');

  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          Képek
        </h2>
        <FilterGroup
          label="Állapot szerint"
          variant="chips"
          options={statusOptions(stats)}
          value={params.status ?? 'all'}
          onChange={(value) =>
            onChange({ ...params, status: value === 'all' ? null : value, photosPage: 1 })
          }
        />
      </div>
      <ListSummary
        ref={summaryRef}
        state={state}
        stale={stale}
        loadingText={LOADING_TEXT}
        text={summaryText}
      />
      {actionError.error && (
        <div id={errorId}>
          <Alert key={actionError.error.at} tone="danger" title={actionError.error.title}>
            {errorText(actionError.error.error)}
          </Alert>
        </div>
      )}
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
      {state === 'loading' && <ListPlaceholder />}
      {data && !stale && data.photos.length === 0 && (
        <PhotosEmpty params={params} total={data.meta.total} />
      )}
      {data && !failed && data.photos.length > 0 && (
        <DataTable
          label="Képek táblázata"
          columns={COLUMNS}
          alignEnd={['Művelet']}
          minWidthClass="min-w-[52rem]"
          busy={stale}
        >
          {data.photos.map((photo) => (
            <PhotoRow
              key={photo.id}
              photo={photo}
              busy={isBusy(photo)}
              errorId={actionError.error?.id === photo.id ? errorId : undefined}
              onAction={runAction}
              onRemoved={rowFocus.rowRemoved}
            />
          ))}
        </DataTable>
      )}
      {data && !failed && (
        <Pagination
          label="Képek lapozása"
          page={params.photosPage}
          totalPages={Math.min(data.meta.totalPages, MAX_ADMIN_PAGE)}
          hrefFor={(page) => ({
            pathname: '/admin',
            search: adminSearch({ ...params, photosPage: page }),
          })}
          preventScrollReset
        />
      )}
      {hiding && (
        <HideAdminPhotoDialog
          photo={hiding}
          onClose={() => setHiding(null)}
          onHidden={applyHidden}
          fallbackFocus={() => rowStart(sectionRef.current, hiding.id) ?? rowFocus.listStart()}
        />
      )}
    </section>
  );
}
