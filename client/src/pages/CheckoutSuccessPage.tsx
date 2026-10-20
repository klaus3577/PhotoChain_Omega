// A sikeres fizetés oldala (L22, terv 3.3): a Stripe ide irányít vissza a fizetés után
// (/checkout/success?session_id=…). A fizetés tényét nem a visszairányítás, hanem a szerver igazolja
// (a Stripe aláírt webhookja, vagy a függő rendelés lekérdezésekor a Stripe-tól kérdezett munkamenet)
// – ezért az oldal a rendelés állapotát kérdezi (GET
// /api/orders/by-session/:id) néhány másodpercenként, amíg függő (pollInterval.ts: két perc után
// ritkábban, tíz perc után leáll – akkor a „Frissítés” gomb kérdez kézzel), és a kifizetett
// rendelésnél kínálja az eredeti letöltését. A munkamenet-azonosító csak a szerver formájában indít
// kérést; más fiók rendelése (404), a lejárt vagy sikertelen fizetés és a betöltési hiba saját,
// érthető nézetet kap. A Stripe-tól teljes oldalbetöltéssel érkezünk: amikor az eredmény megjelenik,
// a fókusz az oldal címére kerül (a képernyőolvasó az eredménnyel kezd); a későbbi állapotváltást
// (függő → kifizetett, lejárt) az élő régió mondja be, és ha az eltűnő nézet vitte a fókuszt, az
// a címre kerül. A kifizetéskor az adatlap (a néző már vásárló) és a vásárlásaim lista gyorsítótára
// érvénytelenedik. A rendelés állapotai semlegesek (a sikeres fizetés sem zöld – a zöld a
// blokklánc-hitelességé).
// Forrás: TanStack Query – useQuery: refetchInterval (függvény alak),
// https://tanstack.com/query/latest/docs/framework/react/reference/useQuery (adaptálva)
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Check, Clock, Download, type LucideIcon, RefreshCw, TimerOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ApiError } from '../api/http';
import {
  getOrderBySession,
  isCheckoutSessionId,
  type Order,
  orderKeys,
  type OrderStatus,
} from '../api/orders.api';
import { photoDownloadUrl, photoKeys } from '../api/photos.api';
import { Alert } from '../components/ui/Alert';
import { Button, ButtonLink } from '../components/ui/Button';
import { LoadError } from '../components/ui/LoadError';
import { PageHeading } from '../components/ui/PageHeading';
import { Spinner } from '../components/ui/Spinner';
import { useAnnounce } from '../components/ui/useAnnounce';
import { usePageTitle } from '../hooks/usePageTitle';
import { focusLost, focusPageHeading } from '../lib/focus';
import { formatDateTime, formatPrice } from '../lib/format';
import { loadStateOf } from '../lib/loadState';
import {
  createPollClock,
  POLL_LIMIT_MS,
  pollErrorNoteOf,
  pollIntervalOf,
} from '../upload/pollInterval';

type View =
  | { kind: 'invalid' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not-found' }
  | { kind: 'order'; order: Order };

const TITLES: Record<Exclude<View['kind'], 'order'>, string> = {
  invalid: 'Érvénytelen hivatkozás',
  loading: 'A rendelés ellenőrzése',
  error: 'A rendelés most nem ellenőrizhető',
  'not-found': 'A rendelés nem található',
};

const ORDER_TITLES: Record<OrderStatus, string> = {
  PENDING: 'A fizetés feldolgozása folyamatban',
  PAID: 'Sikeres fizetés',
  EXPIRED: 'A fizetés nem sikerült',
  FAILED: 'A fizetés nem sikerült',
};

/** Az élő régió üzenete az állapotváltásról (a rendelés már látszott, és az állapota változott) */
const STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
  PAID: 'A fizetés sikerült, az eredeti letölthető.',
  EXPIRED: 'A fizetés nem sikerült – nem történt terhelés.',
  FAILED: 'A fizetés nem sikerült – nem történt terhelés.',
};

const TIMEOUT_NOTE =
  'A visszaigazolás a szokásosnál tovább tart. A rendelést a vásárlásaid között később is megnézheted; a Frissítés gomb most kérdezi le az állapotát.';
const UNAVAILABLE_NOTE =
  'A rendelés állapota most nem érhető el ebben a munkamenetben; nézd meg a vásárlásaid között.';
/** A kézi frissítés eredménye (a lekérdezés már leállt: nem ígérünk újrapróbálást) */
const REFRESH_FAILED_NOTE =
  'A rendelés állapotának lekérdezése nem sikerült. Próbáld újra a Frissítés gombbal, vagy nézd meg később a vásárlásaid között.';
const STILL_PENDING_NOTE = 'A rendelés még feldolgozás alatt áll.';

const PURCHASES_PATH = '/dashboard?tab=vasarlasaim';
const DOWNLOAD_LINK =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary-hover';

/** Mit mutat az oldal: a rendelést (ha van adat – egy sikertelen frissítés után is), különben az okot. */
function viewOf(valid: boolean, query: UseQueryResult<Order>): View {
  if (!valid) return { kind: 'invalid' };
  if (query.data !== undefined) return { kind: 'order', order: query.data };
  if (query.error instanceof ApiError && query.error.status === 404) return { kind: 'not-found' };
  return { kind: loadStateOf(query) === 'loading' ? 'loading' : 'error' };
}

const viewKeyOf = (view: View): string =>
  view.kind === 'order' ? `order:${view.order.status}` : view.kind;

/**
 * A nézet váltásakor: ha a fókusz sehol (a body-n, a fő tartalmon vagy egy eltűnt elemen) van, az oldal
 * címére kerül – az eredmény megjelenésekor (a Stripe-tól érkezve) és az eltűnő nézet után is –;
 * különben az új állapot hangzik el. Az állapot változását (függő → kifizetett, lejárt) mindig bemondja.
 */
function useViewChangeEffects(view: View, title: string) {
  const announce = useAnnounce();
  const previous = useRef<string | null>(null);
  const key = viewKeyOf(view);
  const message = view.kind === 'order' ? (STATUS_MESSAGES[view.order.status] ?? title) : title;

  useEffect(() => {
    const before = previous.current;
    previous.current = key;
    if (before === key || key === 'loading') return;
    const main = document.getElementById('tartalom');
    const lost = focusLost() || document.activeElement === main;
    if (lost) focusPageHeading();
    const firstResult = before === null || before === 'loading';
    if (!firstResult) announce(message);
    else if (!lost) announce(title);
  }, [key, title, message, announce]);
}

/** A kifizetés hatásai: az adatlap (a néző már vásárló) és a vásárlásaim lista frissül. */
function usePaidInvalidation(order: Order | null) {
  const queryClient = useQueryClient();
  const invalidated = useRef(false);

  useEffect(() => {
    if (!order || order.status !== 'PAID' || invalidated.current) return;
    invalidated.current = true;
    void queryClient.invalidateQueries({ queryKey: photoKeys.detail(order.photo.id) });
    void queryClient.invalidateQueries({ queryKey: orderKeys.purchases() });
  }, [order, queryClient]);
}

/** Tíz perc függés után a lekérdezés leáll (pollInterval.ts): a nézet elmondja, és bemondja. */
function usePollTimeout(pending: boolean): boolean {
  const announce = useAnnounce();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      setTimedOut(true);
      announce(TIMEOUT_NOTE);
    }, POLL_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [pending, announce]);

  return pending && timedOut;
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** A rendelés állapotának doboza: ikon, cím és a tartalom (semleges színekkel). */
function OrderPanel({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-line bg-canvas p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {title}
      </h2>
      {children}
    </section>
  );
}

interface PendingViewProps {
  order: Order;
  pollError: unknown;
  /** A lekérdezés leállt (tíz perc): kézi frissítés */
  timedOut: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

function PendingView({ order, pollError, timedOut, refreshing, onRefresh }: PendingViewProps) {
  return (
    <OrderPanel icon={Clock} title="A rendelés állapota">
      {timedOut ? (
        <>
          <p className="text-sm leading-6">{TIMEOUT_NOTE}</p>
          {pollError !== null && <p className="text-sm text-fg-muted">{REFRESH_FAILED_NOTE}</p>}
          <Button icon={RefreshCw} busy={refreshing} onClick={onRefresh}>
            Frissítés
          </Button>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm">
            <Spinner />
            Várakozás a Stripe visszaigazolására – ez általában néhány másodperc.
          </p>
          <p className="text-sm leading-6 text-fg-muted">
            A fizetés tényét a Stripe üzenete igazolja a szervernek; az oldal ezt néhány
            másodpercenként ellenőrzi. Ha sokáig függőben marad, a rendelést („{order.photo.title}”)
            a vásárlásaid között később is megnézheted.
          </p>
          {pollError !== null && (
            <p className="text-sm text-fg-muted">{pollErrorNoteOf(pollError, UNAVAILABLE_NOTE)}</p>
          )}
        </>
      )}
      <Link to={PURCHASES_PATH} className="inline-block text-sm underline underline-offset-2">
        Vásárlásaim
      </Link>
    </OrderPanel>
  );
}

function PaidView({ order }: { order: Order }) {
  const { photo } = order;
  return (
    <OrderPanel icon={Check} title="A rendelés adatai">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <Row term="Kép">
          <Link to={`/photos/${photo.id}`} className="underline underline-offset-2">
            {photo.title}
          </Link>
        </Row>
        <Row term="Fotós">{photo.ownerDisplayName}</Row>
        <Row term="Összeg">
          <span className="tabular-nums">{formatPrice(order.amountHuf)}</span>
        </Row>
        {order.paidAt !== null && <Row term="Fizetve">{formatDateTime(order.paidAt)}</Row>}
      </dl>
      {order.downloadable ? (
        <div className="space-y-2">
          <a href={photoDownloadUrl(photo.id)} className={DOWNLOAD_LINK}>
            <Download aria-hidden="true" className="size-4 shrink-0" />
            Eredeti letöltése
          </a>
          <p className="text-sm text-fg-muted">
            Az eredeti, vízjel nélküli fájl; a vásárlásaid között később is letöltheted.
          </p>
        </div>
      ) : (
        <Alert tone="info">
          A képet a moderátor eltávolította – jelenleg nem tölthető le. A rendelésed megmarad, a
          vásárlásaid között látod.
        </Alert>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link to={PURCHASES_PATH} className="underline underline-offset-2">
          Vásárlásaim
        </Link>
        <Link to="/" className="underline underline-offset-2">
          Galéria
        </Link>
      </div>
    </OrderPanel>
  );
}

function FailedView({ order }: { order: Order }) {
  return (
    <OrderPanel icon={TimerOff} title="A rendelés nem teljesült">
      <p className="text-sm leading-6 text-fg-muted">
        A fizetés megszakadt vagy a munkamenet lejárt – nem történt terhelés. A képet újra
        megpróbálhatod megvenni.
      </p>
      <ButtonLink to={`/photos/${order.photo.id}`} variant="primary">
        Vissza a képhez
      </ButtonLink>
    </OrderPanel>
  );
}

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id') ?? '';
  const valid = isCheckoutSessionId(sessionId);
  // A figyelés stoppere az első megjelenéstől (effektben indul: a renderelés tiszta marad)
  const [clock] = useState(createPollClock);
  useEffect(() => clock.start(), [clock]);

  const query = useQuery({
    queryKey: orderKeys.bySession(sessionId),
    queryFn: ({ signal }) => getOrderBySession(sessionId, signal),
    enabled: valid,
    refetchOnWindowFocus: false,
    refetchInterval: (current) =>
      pollIntervalOf({
        pending: current.state.data?.status === 'PENDING',
        elapsedMs: clock.elapsedMs(),
        error: current.state.error,
      }),
  });
  const view = viewOf(valid, query);
  const order = view.kind === 'order' ? view.order : null;
  const title = view.kind === 'order' ? ORDER_TITLES[view.order.status] : TITLES[view.kind];
  usePageTitle(title);
  useViewChangeEffects(view, title);
  usePaidInvalidation(order);
  const timedOut = usePollTimeout(order?.status === 'PENDING');
  const announce = useAnnounce();

  /** Kézi frissítés a leállt lekérdezés után: az eredménye mindenképp elhangzik (a változást a nézet mondja). */
  const refresh = async () => {
    const result = await query.refetch();
    if (result.isError) announce(REFRESH_FAILED_NOTE);
    else if (result.data?.status === 'PENDING') announce(STILL_PENDING_NOTE);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeading>{title}</PageHeading>
      {view.kind === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner />
          {TITLES.loading}…
        </p>
      )}
      {view.kind === 'invalid' && (
        <>
          <p className="leading-7 text-fg-muted">
            A fizetés eredményének címe hiányos vagy hibás. A vásárlásaidat a vezérlőpulton nézheted
            meg.
          </p>
          <ButtonLink to={PURCHASES_PATH}>Vásárlásaim</ButtonLink>
        </>
      )}
      {view.kind === 'not-found' && (
        <>
          <p className="leading-7 text-fg-muted">
            Ez a rendelés nem a te fiókodhoz tartozik, vagy a hivatkozás hibás. A saját
            vásárlásaidat a vezérlőpulton találod.
          </p>
          <ButtonLink to={PURCHASES_PATH}>Vásárlásaim</ButtonLink>
        </>
      )}
      {view.kind === 'error' && (
        <LoadError
          title="A rendelés ellenőrzése nem sikerült."
          state={loadStateOf(query) === 'retrying' ? 'retrying' : 'failed'}
          error={query.error}
          failedAt={query.errorUpdatedAt}
          onRetry={() => void query.refetch()}
          retryingText={`${TITLES.loading}…`}
        />
      )}
      {order?.status === 'PENDING' && (
        <PendingView
          order={order}
          pollError={query.error}
          timedOut={timedOut}
          refreshing={query.isFetching}
          onRefresh={() => void refresh()}
        />
      )}
      {order?.status === 'PAID' && <PaidView order={order} />}
      {(order?.status === 'EXPIRED' || order?.status === 'FAILED') && <FailedView order={order} />}
    </div>
  );
}
