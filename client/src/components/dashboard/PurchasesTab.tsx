// A vezérlőpult „Vásárlásaim” füle (L22; L17 drótváz „Vezérlőpult”, 8–9. jegyzet): a kifizetett
// rendelések, a legutóbb fizetett elöl, lapozva. Soronként a kép, a fotós neve, a fizetés napja és
// az ár (rejtett címkékkel); az eredeti letöltése a szerver védett címén (a munkamenet alapján dönt –
// L14), ugyanazzal a névvel, mint az adatlapon; ha a vásárló még nem értékelte a képet, „Értékelés
// írása” az adatlapra visz (az űrlap az L23-ban készül el), különben a saját értékelése látszik. A
// moderátor által levett kép sora megmarad – a vásárló látja, mit vett és miért nem érhető el –, de
// a letöltés letiltva (a szerver is 403-at adna): rövid jelvény és külön megjegyzés, hogy keskeny
// képernyőn se lógjon ki.
import type { UseQueryResult } from '@tanstack/react-query';
import { Ban, Download, ShoppingBag } from 'lucide-react';
import { useId, type RefObject } from 'react';
import { Link } from 'react-router';

import type { Order, OrderPage } from '../../api/orders.api';
import { photoDownloadUrl } from '../../api/photos.api';
import { dashboardSearch, MAX_DASHBOARD_PAGE } from '../../dashboard/dashboardParams';
import { summaryTextOf } from '../../dashboard/listSummary';
import { useFocusAfterRecovery } from '../../hooks/useFocusAfterRecovery';
import { formatDate, formatPrice } from '../../lib/format';
import { loadStateOf, showsLoadError } from '../../lib/loadState';
import { Thumbnail } from '../photos/Thumbnail';
import { ButtonLink } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { LoadError } from '../ui/LoadError';
import { Pagination } from '../ui/Pagination';
import { StatusBadge } from '../ui/StatusBadge';
import { ListSummary } from './ListSummary';

const LOADING_TEXT = 'Vásárlások betöltése…';

/** A letöltés gombja hivatkozásként (a szerver fájlt ad, nem oldal nyílik) – a körvonalas gomb stílusával */
const DOWNLOAD_LINK =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line-strong bg-canvas px-4 text-sm font-medium text-fg hover:bg-surface';

/** Rejtett címke a cella elé – a képernyőolvasónak („Fotós: …”) */
function Labelled({ label, children }: { label: string; children: string }) {
  return (
    <>
      <span className="sr-only">{label}: </span>
      {children}
    </>
  );
}

const Separator = () => <span aria-hidden="true"> · </span>;

function PurchaseRow({ order }: { order: Order }) {
  const { photo } = order;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
      <Thumbnail src={photo.thumbnailUrl} />
      <p className="min-w-0 flex-1 basis-48 text-sm">
        <Link
          to={`/photos/${photo.id}`}
          className="block truncate font-medium underline-offset-2 hover:underline"
        >
          {photo.title}
        </Link>
        <span className="text-fg-muted">
          <Labelled label="Fotós">{photo.ownerDisplayName}</Labelled>
          <Separator />
          <Labelled label="Fizetve">{formatDate(order.paidAt ?? order.createdAt)}</Labelled>
          <Separator />
          <Labelled label="Ár">{formatPrice(order.amountHuf)}</Labelled>
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {order.downloadable ? (
          <a href={photoDownloadUrl(photo.id)} className={DOWNLOAD_LINK}>
            <Download aria-hidden="true" className="size-4 shrink-0" />
            <span aria-hidden="true">Eredeti letöltése</span>
            <span className="sr-only">Eredeti letöltése: {photo.title}</span>
          </a>
        ) : (
          <p className="text-sm">
            <StatusBadge tone="danger" icon={Ban}>
              Moderátor eltávolította
            </StatusBadge>
            <span className="mt-1 block text-xs text-fg-muted">Most nem tölthető le.</span>
          </p>
        )}
        {order.review ? (
          <p className="text-sm text-fg-muted">
            Értékelted: <span aria-hidden="true">{order.review.rating} / 5</span>
            <span className="sr-only">{order.review.rating} csillag az 5-ből</span>
          </p>
        ) : (
          order.reviewable && (
            // Az adatlap értékelő űrlapjához (L23: a form azonosítója)
            <Link
              to={`/photos/${photo.id}#ertekeles`}
              className="inline-flex min-h-6 items-center text-sm underline underline-offset-2"
            >
              <span aria-hidden="true">Értékelés írása</span>
              <span className="sr-only">Értékelés írása: {photo.title}</span>
            </Link>
          )
        )}
      </div>
    </li>
  );
}

/** Üres állapot: nincs vásárlás, vagy csak ez az oldal üres (túl nagy oldalszám). */
function PurchasesEmpty({ total }: { total: number }) {
  if (total > 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Ezen az oldalon nincs vásárlás"
        action={
          <Link
            to={{
              pathname: '/dashboard',
              search: dashboardSearch({ tab: 'vasarlasaim', page: 1 }),
            }}
            className="text-sm underline underline-offset-2"
          >
            Vissza az első oldalra
          </Link>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={ShoppingBag}
      title="Még nem vásároltál képet"
      action={<ButtonLink to="/">Galéria böngészése</ButtonLink>}
    >
      A megvett képek eredeti, vízjel nélküli fájlja innen tölthető le.
    </EmptyState>
  );
}

interface PurchasesTabProps {
  query: UseQueryResult<OrderPage>;
  page: number;
  /** A találatszám sora – a szülő ide teszi a fókuszt lapozás és fülváltás után */
  summaryRef: RefObject<HTMLParagraphElement | null>;
}

export function PurchasesTab({ query, page, summaryRef }: PurchasesTabProps) {
  const headingId = useId();
  const data = query.data;
  const stale = query.isPlaceholderData;
  const state = loadStateOf({
    data: stale ? undefined : data,
    error: query.error,
    errorUpdateCount: query.errorUpdateCount,
  });
  const failed = showsLoadError(state);
  const summaryText = data ? summaryTextOf('vasarlasaim', data.meta.total, page) : '';
  useFocusAfterRecovery(failed, summaryRef, summaryText || 'A vásárlások betöltődtek.');

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="sr-only">
        Vásárlásaim
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
          title="A vásárlások betöltése nem sikerült."
          state={state}
          error={query.error}
          failedAt={query.errorUpdatedAt}
          onRetry={() => void query.refetch()}
          retryingText={LOADING_TEXT}
        />
      )}
      {data && !stale && data.orders.length === 0 && <PurchasesEmpty total={data.meta.total} />}
      {data && !failed && data.orders.length > 0 && (
        <ul role="list" aria-busy={stale || undefined} className="divide-y divide-line">
          {data.orders.map((order) => (
            <PurchaseRow key={order.id} order={order} />
          ))}
        </ul>
      )}
      {data && !failed && (
        <Pagination
          page={page}
          totalPages={Math.min(data.meta.totalPages, MAX_DASHBOARD_PAGE)}
          hrefFor={(target) => ({
            pathname: '/dashboard',
            search: dashboardSearch({ tab: 'vasarlasaim', page: target }),
          })}
        />
      )}
    </section>
  );
}
