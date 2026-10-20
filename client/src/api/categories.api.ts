// A kategóriák listája (GET /api/categories – server/src/modules/categories): a galéria szűrője ebből
// kínál választást, a kép adatai is ezt a formát használják. A válasz külső adat: futás közben is
// ellenőrizzük.
import { queryOptions } from '@tanstack/react-query';

import { PUBLIC_QUERY_META } from '../auth/sessionCache';
import { expectValid, isInteger, isRecord, isString } from './guards';
import { apiRequest } from './http';

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export const categoriesQueryKey = ['categories'] as const;
/** A kategóriák ritkán változnak: 5 percig frissek (a galéria szűrője és a feltöltés űrlapja is ezt használja) */
export const CATEGORIES_STALE_MS = 5 * 60_000;

export const isCategory = (value: unknown): value is Category =>
  isRecord(value) && isInteger(value.id, 1) && isString(value.name) && isString(value.slug);

const isCategoryList = (value: unknown): value is { categories: Category[] } =>
  isRecord(value) && Array.isArray(value.categories) && value.categories.every(isCategory);

export async function listCategories(signal?: AbortSignal): Promise<Category[]> {
  const data = await apiRequest<unknown>('/categories', { signal });
  return expectValid(data, isCategoryList).categories;
}

/** A kategóriák lekérdezése (a galéria szűrője és a feltöltés űrlapja ugyanazzal a beállítással). */
export const categoriesQuery = () =>
  queryOptions({
    queryKey: categoriesQueryKey,
    queryFn: ({ signal }) => listCategories(signal),
    staleTime: CATEGORIES_STALE_MS,
    refetchOnWindowFocus: false,
    meta: PUBLIC_QUERY_META,
  });
