// A vezérlőpult nézete az URL-ben (L22; L17 drótváz „Vezérlőpult”, 1. jegyzet): a választott fül
// (?tab=) és az oldal (?page=). Mivel a nézetet az URL választja, a „fül” hivatkozás (nav +
// aria-current="page"), nem ARIA-fülsor – a vissza gomb és a könyvjelző is működik. A hibás vagy
// hiányzó érték az alapértelmezés (a saját képek első oldala); az URL-be csak a nem alapértelmezett
// érték kerül.
import { integerParam } from '../photos/galleryParams';

export const DASHBOARD_TABS = ['kepeim', 'vasarlasaim'] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export interface DashboardParams {
  tab: DashboardTab;
  page: number;
}

/** A szerver legfeljebb ennyi oldalt lapoz (lib/schemas.ts – MAX_PAGE) */
export const MAX_DASHBOARD_PAGE = 1000;

export const DEFAULT_DASHBOARD_PARAMS: Readonly<DashboardParams> = Object.freeze({
  tab: 'kepeim',
  page: 1,
});

export const TAB_LABELS: Record<DashboardTab, string> = {
  kepeim: 'Saját képeim',
  vasarlasaim: 'Vásárlásaim',
};

const isTab = (value: string | null): value is DashboardTab =>
  value !== null && (DASHBOARD_TABS as readonly string[]).includes(value);

export function parseDashboardParams(search: URLSearchParams): DashboardParams {
  const tab = search.get('tab');
  return {
    tab: isTab(tab) ? tab : DEFAULT_DASHBOARD_PARAMS.tab,
    page: integerParam(search.get('page'), 1, MAX_DASHBOARD_PAGE) ?? DEFAULT_DASHBOARD_PARAMS.page,
  };
}

/** A nézet lekérdezése az URL-hez („?tab=vasarlasaim&page=2”); az alapértelmezett nézeté üres. */
export function dashboardSearch({ tab, page }: DashboardParams): string {
  const search = new URLSearchParams();
  if (tab !== DEFAULT_DASHBOARD_PARAMS.tab) search.set('tab', tab);
  if (page !== DEFAULT_DASHBOARD_PARAMS.page) search.set('page', String(page));
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/** A böngészőfül címe: „Vezérlőpult – Vásárlásaim, 2. oldal”. */
export function dashboardTitle({ tab, page }: DashboardParams): string {
  const base = `Vezérlőpult – ${TAB_LABELS[tab]}`;
  return page > 1 ? `${base}, ${page}. oldal` : base;
}
