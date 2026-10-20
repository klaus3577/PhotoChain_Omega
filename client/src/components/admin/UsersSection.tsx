// A felhasználók szakasza az adminfelületen (L25; L17 drótváz „Adminisztráció”, 2–3. és 8. jegyzet):
// keresés névre és e-mailre (Enterre vagy a gombbal – az admin célzottan keres, a gépelés nem indít
// kérést), tiltási szűrő kapcsológombokkal, a lista táblázatban (név – a saját fiók „(te)” –, e-mail,
// a regisztráció napja, a képek száma, állapot, művelet), lapozva. A letiltás megerősítéssel
// (BlockUserDialog), a feloldás egy gombbal: a tiltás bármikor feloldható, a feloldás nem veszélyes.
// Adminisztrátor nem tiltható (a saját fiók sem): a gomb helyett magyarázat. A művelet után a sor
// gombja a másik művelet gombja lesz (ugyanaz az elem: a fókusz rajta marad), az eredményt az élő
// régió mondja be – ha a sor a szűrt listából (Aktív, Tiltott) kikerül, azt is –; a feloldás hibája
// riasztás a táblázat fölött, a sor gombjának leírásaként. A keresés és a szűrő a nézetet (URL)
// változtatja: az új lista érkezésekor a fókusz a találatszámra kerül (listSummary.ts) – a
// keresőmezőről is, hogy a képernyőolvasó a találatszámmal folytassa; a már alkalmazott keresőszó
// újraküldése nem navigál, csak a találatszámra viszi a fókuszt.
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Ban, Search, Undo2, Users } from 'lucide-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Link } from 'react-router';

import { type AdminUser, type AdminUserPage, adminKeys, setUserBlocked } from '../../api/admin.api';
import {
  type AdminParams,
  adminSearch,
  MAX_ADMIN_PAGE,
  USER_FILTER_LABELS,
  USER_FILTERS,
  usersApiQuery,
} from '../../admin/adminParams';
import { useAuth } from '../../auth/useAuth';
import { countSummaryOf, useViewChangeFocus } from '../../dashboard/listSummary';
import { useFocusAfterRecovery } from '../../hooks/useFocusAfterRecovery';
import { cx } from '../../lib/cx';
import { focusElement } from '../../lib/focus';
import { formatDate, formatInteger } from '../../lib/format';
import { loadStateOf, showsLoadError } from '../../lib/loadState';
import { errorText } from '../../lib/text';
import { MAX_SEARCH_LENGTH, searchFromInput } from '../../photos/galleryParams';
import { ListSummary } from '../dashboard/ListSummary';
import { FIELD } from '../photos/GalleryFilterFields';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { LoadError } from '../ui/LoadError';
import { Pagination } from '../ui/Pagination';
import { StatusBadge } from '../ui/StatusBadge';
import { useActionError, usePendingIds } from './actionState';
import { applyUserChange, shouldRefreshAfterError } from './adminCache';
import { BlockUserDialog } from './BlockUserDialog';
import { CELL, DataTable, ROW_HEADER } from './DataTable';
import { FilterGroup } from './FilterGroup';
import { ListPlaceholder } from './ListPlaceholder';
import { rowFocusAttribute, rowStart, useRowFocus, useRowRemovalRescue } from './useRowFocus';

const LOADING_TEXT = 'Felhasználók betöltése…';
const NOUN = 'felhasználó';
/** A keresőmező neve és látható helykitöltője (a hangvezérlés a látott szöveggel éri el) */
const SEARCH_LABEL = 'Keresés név vagy e-mail alapján';
const COLUMNS = ['Név', 'E-mail', 'Regisztrált', 'Képek', 'Állapot', 'Művelet'] as const;
const FILTER_OPTIONS = USER_FILTERS.map((value) => ({ value, label: USER_FILTER_LABELS[value] }));
/** A feloldás mutációinak kulcsa: a futó kérések soraihoz (actionState.ts) */
const UNBLOCK_KEY = ['admin', 'unblock'] as const;

const isFiltering = (params: AdminParams) => params.q !== '' || params.users !== 'all';

/** Az üres állapot címe: a keresésé, az üres oldalé vagy az üres listáé. */
function emptyTitleOf(params: AdminParams, total: number): string {
  if (total > 0) return 'Ezen az oldalon nincs felhasználó';
  return isFiltering(params) ? 'Nincs ilyen felhasználó' : 'Még nincs felhasználó';
}

/** A keresést és a szűrőt törlő hivatkozás neve: azt mondja meg, amit töröl. */
function clearLabelOf(params: AdminParams): string {
  if (params.q !== '' && params.users !== 'all') return 'Keresés és szűrő törlése';
  return params.q !== '' ? 'Keresés törlése' : 'Szűrő törlése';
}

/** A módosított felhasználó a szűrt listából (Aktív, Tiltott) kikerül. */
const leavesFilter = (params: AdminParams, user: AdminUser): boolean =>
  (params.users === 'active' && user.isBlocked) || (params.users === 'blocked' && !user.isBlocked);

function UsersEmpty({ params, total }: { params: AdminParams; total: number }) {
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
        icon={Users}
        title={title}
        action={link(adminSearch({ ...params, usersPage: 1 }), 'Vissza az első oldalra')}
      />
    );
  }
  if (isFiltering(params)) {
    return (
      <EmptyState
        icon={Users}
        title={title}
        action={link(
          adminSearch({ ...params, q: '', users: 'all', usersPage: 1 }),
          clearLabelOf(params),
        )}
      >
        Más keresőszóval vagy szűrővel próbáld újra.
      </EmptyState>
    );
  }
  return <EmptyState icon={Users} title={title} />;
}

interface SearchFormProps {
  q: string;
  onSearch: (q: string) => void;
}

/** A keresőmező a gombjával; a mező követi az URL keresőszavát (vissza gomb), a gépelt szöveg marad. */
function SearchForm({ q, onSearch }: SearchFormProps) {
  const inputId = useId();
  const [text, setText] = useState(q);
  const [synced, setSynced] = useState(q);
  // Kívülről változott az URL (vissza gomb, törlés): a mező követi
  if (q !== synced) {
    setSynced(q);
    setText(q);
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(searchFromInput(text));
  };

  return (
    // Keskeny képernyőn teljes sor (a szűrő alá törik), különben rögzített szélesség
    <form
      role="search"
      aria-label="Felhasználók keresése"
      onSubmit={submit}
      className="relative basis-full sm:w-72 sm:basis-auto"
    >
      <label htmlFor={inputId} className="sr-only">
        {SEARCH_LABEL}
      </label>
      <input
        id={inputId}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Név vagy e-mail…"
        maxLength={MAX_SEARCH_LENGTH}
        className={cx(FIELD, 'border-line-strong pr-11')}
      />
      <button
        type="submit"
        aria-label="Keresés"
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-fg-muted hover:text-fg"
      >
        <Search aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}

interface UserRowProps {
  user: AdminUser;
  /** A bejelentkezett adminisztrátor saját sora */
  self: boolean;
  /** A sor művelete folyamatban (feloldás) */
  busy: boolean;
  /** A sor műveletének riasztása (a gomb leírása) */
  errorId: string | undefined;
  onBlock: (user: AdminUser) => void;
  onUnblock: (user: AdminUser) => void;
  /** A sor a fókusszal együtt tűnik el (useRowFocus) */
  onRemoved: (index: number) => void;
}

function UserRow({ user, self, busy, errorId, onBlock, onUnblock, onRemoved }: UserRowProps) {
  const ref = useRowRemovalRescue(onRemoved);
  const admin = user.role === 'ADMIN';
  const action = user.isBlocked ? 'Feloldás' : 'Letiltás';
  return (
    <tr ref={ref}>
      <th scope="row" className={ROW_HEADER}>
        <span {...rowFocusAttribute(user.id)}>{user.displayName}</span>
        {self && <span className="font-normal text-fg-muted"> (te)</span>}
      </th>
      <td className={cx(CELL, 'text-fg-muted break-all')}>{user.email}</td>
      <td className={cx(CELL, 'text-fg-muted whitespace-nowrap')}>{formatDate(user.createdAt)}</td>
      <td className={cx(CELL, 'tabular-nums')}>{formatInteger(user.photoCount)}</td>
      <td className={CELL}>
        {admin ? (
          'Admin'
        ) : user.isBlocked ? (
          <StatusBadge tone="danger" icon={Ban}>
            Tiltva
          </StatusBadge>
        ) : (
          'Aktív'
        )}
      </td>
      <td className={cx(CELL, 'text-right')}>
        {admin ? (
          <span className="text-fg-muted">nem tiltható</span>
        ) : (
          // Egyetlen gomb-elem mindkét művelethez: a művelet után a fókusz rajta marad
          <Button
            variant={user.isBlocked ? 'outline' : 'danger'}
            icon={user.isBlocked ? Undo2 : Ban}
            busy={busy}
            aria-describedby={errorId}
            onClick={() => (user.isBlocked ? onUnblock(user) : onBlock(user))}
          >
            <span aria-hidden="true">{action}</span>
            <span className="sr-only">
              {action}: {user.displayName}
            </span>
          </Button>
        )}
      </td>
    </tr>
  );
}

interface UsersSectionProps {
  params: AdminParams;
  query: UseQueryResult<AdminUserPage>;
  onChange: (next: AdminParams) => void;
}

export function UsersSection({ params, query, onChange }: UsersSectionProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const headingId = useId();
  const errorId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const rowFocus = useRowFocus(sectionRef, summaryRef);
  const viewKey = usersApiQuery(params);
  const actionError = useActionError(viewKey);
  const pendingIds = usePendingIds(UNBLOCK_KEY);
  const [blocking, setBlocking] = useState<AdminUser | null>(null);
  const selfId = auth.status === 'authenticated' ? auth.user.id : null;

  const data = query.data;
  const stale = query.isPlaceholderData;
  const state = loadStateOf({
    data: stale ? undefined : data,
    error: query.error,
    errorUpdateCount: query.errorUpdateCount,
  });
  const failed = showsLoadError(state);
  const summaryText = data ? countSummaryOf(NOUN, data.meta.total, params.usersPage) : '';
  useFocusAfterRecovery(failed, summaryRef, summaryText || 'A felhasználók betöltődtek.');
  useViewChangeFocus(
    viewKey,
    query.isSuccess && !stale,
    summaryRef,
    summaryText,
    data ? `${emptyTitleOf(params, data.meta.total)}.` : '',
    sectionRef,
  );

  /** A bemondás: az eredmény, és ha a sor a szűrt listából kikerül, az is */
  const outcome = (user: AdminUser, text: string) =>
    `${text}${leavesFilter(params, user) ? '; a szűrt listából kikerült.' : '.'}`;

  const unblock = useMutation({
    mutationKey: UNBLOCK_KEY,
    mutationFn: (user: AdminUser) => setUserBlocked(user.id, false),
    onSuccess: (updated) => {
      actionError.clear();
      applyUserChange(queryClient, updated);
      // A sor gombja megmarad (Feloldás → Letiltás): a fókusz rajta marad
      rowFocus.request(
        updated.id,
        outcome(updated, `„${updated.displayName}” tiltása feloldva`),
        false,
      );
    },
    onError: (error, user) => {
      actionError.fail(user.id, 'A feloldás nem sikerült.', error);
      if (shouldRefreshAfterError(error)) {
        void queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      }
    },
  });

  const applyBlocked = (user: AdminUser) => {
    actionError.clear();
    applyUserChange(queryClient, user);
    setBlocking(null);
    // A böngésző a bezáruló ablakból a megnyitó gombra (most: Feloldás) teszi vissza a fókuszt
    rowFocus.request(user.id, outcome(user, `„${user.displayName}” letiltva`), false);
  };

  const search = (q: string) => {
    if (q !== params.q) {
      onChange({ ...params, q, usersPage: 1 });
      return;
    }
    // Ugyanaz a keresőszó: nincs új nézet, a visszajelzés a találatszám (vagy az üres állapot)
    const target = rowFocus.listStart();
    if (target) focusElement(target);
  };

  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          Felhasználók
        </h2>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <SearchForm q={params.q} onSearch={search} />
          <FilterGroup
            label="Tiltás szerint"
            options={FILTER_OPTIONS}
            value={params.users}
            onChange={(users) => onChange({ ...params, users, usersPage: 1 })}
          />
        </div>
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
          title="A felhasználók betöltése nem sikerült."
          state={state}
          error={query.error}
          failedAt={query.errorUpdatedAt}
          onRetry={() => void query.refetch()}
          retryingText={LOADING_TEXT}
        />
      )}
      {state === 'loading' && <ListPlaceholder />}
      {data && !stale && data.users.length === 0 && (
        <UsersEmpty params={params} total={data.meta.total} />
      )}
      {data && !failed && data.users.length > 0 && (
        <DataTable
          label="Felhasználók táblázata"
          columns={COLUMNS}
          alignEnd={['Művelet']}
          minWidthClass="min-w-[46rem]"
          busy={stale}
        >
          {data.users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              self={user.id === selfId}
              busy={pendingIds.has(user.id)}
              errorId={actionError.error?.id === user.id ? errorId : undefined}
              onBlock={setBlocking}
              onUnblock={(target) => unblock.mutate(target)}
              onRemoved={rowFocus.rowRemoved}
            />
          ))}
        </DataTable>
      )}
      {data && !failed && (
        <Pagination
          label="Felhasználók lapozása"
          page={params.usersPage}
          totalPages={Math.min(data.meta.totalPages, MAX_ADMIN_PAGE)}
          hrefFor={(page) => ({
            pathname: '/admin',
            search: adminSearch({ ...params, usersPage: page }),
          })}
          preventScrollReset
        />
      )}
      {blocking && (
        <BlockUserDialog
          user={blocking}
          onClose={() => setBlocking(null)}
          onBlocked={applyBlocked}
          fallbackFocus={() => rowStart(sectionRef.current, blocking.id) ?? rowFocus.listStart()}
        />
      )}
    </section>
  );
}
