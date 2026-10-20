// A statisztika állapotonkénti darabszámainak unit tesztje (L16): az adatbázis csak a létező
// állapotokat adja vissza (groupBy) – a hiányzó állapot 0, az összeg az összes darab.
import { describe, expect, it } from 'vitest';

import { statusCounts } from './admin.stats.js';

describe('statusCounts', () => {
  it('minden állapot szerepel (a hiányzó 0-val), az összesen a darabok összege', () => {
    const counts = statusCounts(['PENDING', 'PAID', 'EXPIRED', 'FAILED'] as const, [
      { status: 'PAID', _count: { _all: 3 } },
      { status: 'EXPIRED', _count: { _all: 2 } },
    ]);

    expect(counts).toEqual({
      total: 5,
      byStatus: { PENDING: 0, PAID: 3, EXPIRED: 2, FAILED: 0 },
    });
  });

  it('üres adatbázisnál minden darabszám 0', () => {
    expect(statusCounts(['REGISTERED', 'HIDDEN'] as const, [])).toEqual({
      total: 0,
      byStatus: { REGISTERED: 0, HIDDEN: 0 },
    });
  });
});
