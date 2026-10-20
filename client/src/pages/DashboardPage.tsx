// A vezérlőpult (L22; L17 drótváz „Vezérlőpult”): védett oldal két füllel – Saját képeim és
// Vásárlásaim. A fül és az oldal az URL-ben van (dashboardParams.ts), ezért a fülek hivatkozások (nav +
// aria-current="page"), nem ARIA-fülsor: a vissza gomb és a könyvjelző is működik, a böngészőfül címe
// a nézetet is megmondja. Mindkét lista lekérdezése itt indul (a fülek a darabszámot mutatják); a nem
// aktív fülé az első oldalt kéri. Amíg a saját képek közt van regisztrációra váró, a lista
// 3 másodpercenként frissül (pollInterval.ts: két perc után ritkábban, tíz perc után leáll; az
// időkeret akkor indul, amikor függő kép jelenik meg), a hitelesítést és a sikertelen regisztrációt
// az élő régió mondja be – a másik fülön is (registrationNotices.ts). Lapozás és fülváltás után, az
// új lista megérkezésekor a fókusz a találatszámra kerül (listSummary.ts: az eltűnő
// lapozó-hivatkozásról sem vész el), vagy az összesítés hangzik el.
// Forrás: TanStack Query – Paginated Queries (placeholderData: keepPreviousData),
// https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries; useQuery:
// refetchInterval (függvény alak), https://tanstack.com/query/latest/docs/framework/react/reference/useQuery (adaptálva)
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { listPurchases, orderKeys } from '../api/orders.api';
import { listOwnPhotos, photoKeys } from '../api/photos.api';
import { pendingPhotoIds } from '../components/dashboard/ownPhotoStatus';
import { OwnPhotosTab } from '../components/dashboard/OwnPhotosTab';
import { PurchasesTab } from '../components/dashboard/PurchasesTab';
import { PageHeading } from '../components/ui/PageHeading';
import {
  DASHBOARD_TABS,
  type DashboardTab,
  dashboardSearch,
  dashboardTitle,
  parseDashboardParams,
  TAB_LABELS,
} from '../dashboard/dashboardParams';
import { summaryTextOf, useViewChangeFocus } from '../dashboard/listSummary';
import { useRegistrationNotices } from '../dashboard/registrationNotices';
import { usePageTitle } from '../hooks/usePageTitle';
import { cx } from '../lib/cx';
import { createPollClock, pollIntervalOf } from '../upload/pollInterval';

const EMPTY_TEXTS: Record<DashboardTab, string> = {
  kepeim: 'Még nincs feltöltött képed.',
  vasarlasaim: 'Még nem vásároltál képet.',
};

interface DashboardTabsProps {
  active: DashboardTab;
  /** A listák darabszáma, ha már ismert */
  counts: Partial<Record<DashboardTab, number | undefined>>;
}

/** A két fül hivatkozásként, darabszámmal; a választott fül aria-current="page". */
function DashboardTabs({ active, counts }: DashboardTabsProps) {
  return (
    <nav aria-label="Vezérlőpult nézetei" className="border-b border-line">
      <ul className="flex flex-wrap gap-x-6 text-sm">
        {DASHBOARD_TABS.map((tab) => {
          const current = tab === active;
          const count = counts[tab];
          return (
            <li key={tab}>
              <Link
                to={{ pathname: '/dashboard', search: dashboardSearch({ tab, page: 1 }) }}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 pb-0.5',
                  current
                    ? 'border-primary font-semibold text-fg'
                    : 'border-transparent text-fg-muted hover:text-fg',
                )}
              >
                {TAB_LABELS[tab]}
                {count !== undefined && ` (${count})`}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DashboardPage() {
  const [searchParams] = useSearchParams();
  const params = parseDashboardParams(searchParams);
  usePageTitle(dashboardTitle(params));
  const summaryRef = useRef<HTMLParagraphElement>(null);
  // A lekérdezési ütem stoppere: akkor indul (újra), amikor új függő kép jelenik meg a listában – a
  // friss adatot látó visszahívásban követve, így a már ütemezett lekérdezés is az új időkerettel számol
  const [clock] = useState(createPollClock);

  const ownPage = params.tab === 'kepeim' ? params.page : 1;
  const purchasesPage = params.tab === 'vasarlasaim' ? params.page : 1;
  const own = useQuery({
    queryKey: photoKeys.ownPage(ownPage),
    queryFn: ({ signal }) => listOwnPhotos(ownPage, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const pending = pendingPhotoIds(query.state.data?.photos);
      clock.trackPending(pending);
      return pollIntervalOf({
        pending: pending.length > 0,
        elapsedMs: clock.elapsedMs(),
        error: query.state.error,
      });
    },
  });
  const purchases = useQuery({
    queryKey: orderKeys.purchasesPage(purchasesPage),
    queryFn: ({ signal }) => listPurchases(purchasesPage, signal),
    placeholderData: keepPreviousData,
  });

  useRegistrationNotices(own.data?.photos);

  const active = params.tab === 'kepeim' ? own : purchases;
  const fresh = active.isSuccess && !active.isPlaceholderData;
  const total = active.data?.meta.total;
  useViewChangeFocus(
    `${params.tab}:${params.page}`,
    fresh,
    summaryRef,
    total === undefined ? '' : summaryTextOf(params.tab, total, params.page),
    EMPTY_TEXTS[params.tab],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeading>Vezérlőpult</PageHeading>
        <p className="leading-7 text-fg-muted">
          A feltöltött képeid állapota és a vásárlásaid egy helyen.
        </p>
      </div>
      <DashboardTabs
        active={params.tab}
        counts={{ kepeim: own.data?.meta.total, vasarlasaim: purchases.data?.meta.total }}
      />
      {params.tab === 'kepeim' ? (
        <OwnPhotosTab query={own} page={params.page} summaryRef={summaryRef} />
      ) : (
        <PurchasesTab query={purchases} page={params.page} summaryRef={summaryRef} />
      )}
    </div>
  );
}
