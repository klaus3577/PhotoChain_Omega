// A kategóriák listája (GET /api/categories) – a galéria szűrője ebből kínál választást.
import { describe, expect, it } from 'vitest';

import { jsonResponse, stubFetch } from '../test/fetch';
import { CATEGORIES, categoriesResponse } from '../test/photos';
import { listCategories } from './categories.api';

describe('listCategories', () => {
  it('a GET /api/categories válaszából a kategóriákat adja', async () => {
    const fetchMock = stubFetch(categoriesResponse());

    await expect(listCategories()).resolves.toEqual(CATEGORIES);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/categories');
  });

  it('a hibás kategóriát váratlan válasznak tekinti', async () => {
    const responses = [
      jsonResponse(200, { data: { categories: [{ id: '1', name: 'Tájkép', slug: 'tajkep' }] } }),
      jsonResponse(200, { data: { categories: [{ id: 1, name: 7, slug: 'tajkep' }] } }),
      jsonResponse(200, { data: { categories: [{ id: 0, name: 'Tájkép', slug: 'tajkep' }] } }),
      jsonResponse(200, { data: {} }),
    ];
    stubFetch(...responses);

    for (let i = 0; i < responses.length; i += 1) {
      await expect(listCategories()).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    }
  });
});
