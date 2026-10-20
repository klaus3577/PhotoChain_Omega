// A vezérlőpult nézete az URL-ben (L22; L17 drótváz „Vezérlőpult”, 1. jegyzet): a fül (?tab=) és az
// oldal (?page=) – így a vissza gomb és a könyvjelző is működik. A hibás érték az alapértelmezés.
import { describe, expect, it } from 'vitest';

import { dashboardSearch, dashboardTitle, parseDashboardParams } from './dashboardParams';

const parse = (search: string) => parseDashboardParams(new URLSearchParams(search));

describe('parseDashboardParams', () => {
  it('alapból a saját képek első oldala', () => {
    expect(parse('')).toEqual({ tab: 'kepeim', page: 1 });
  });

  it('a fül és az oldal az URL-ből; a hibás érték az alapértelmezés', () => {
    expect(parse('?tab=vasarlasaim')).toEqual({ tab: 'vasarlasaim', page: 1 });
    expect(parse('?tab=vasarlasaim&page=3')).toEqual({ tab: 'vasarlasaim', page: 3 });
    expect(parse('?tab=admin&page=2')).toEqual({ tab: 'kepeim', page: 2 });
    for (const page of ['0', '-1', 'abc', '2.5', '1001', '']) {
      expect(parse(`?page=${page}`).page).toBe(1);
    }
  });
});

describe('dashboardSearch', () => {
  it('csak a nem alapértelmezett értékek kerülnek az URL-be', () => {
    expect(dashboardSearch({ tab: 'kepeim', page: 1 })).toBe('');
    expect(dashboardSearch({ tab: 'vasarlasaim', page: 1 })).toBe('?tab=vasarlasaim');
    expect(dashboardSearch({ tab: 'kepeim', page: 2 })).toBe('?page=2');
    expect(dashboardSearch({ tab: 'vasarlasaim', page: 2 })).toBe('?tab=vasarlasaim&page=2');
  });

  it('oda-vissza: amit kiír, azt olvassa vissza', () => {
    for (const params of [
      { tab: 'kepeim', page: 1 },
      { tab: 'vasarlasaim', page: 7 },
    ] as const) {
      expect(parse(dashboardSearch(params))).toEqual(params);
    }
  });
});

describe('dashboardTitle', () => {
  it('a böngészőfül címe a fület és az oldalt is megmondja', () => {
    expect(dashboardTitle({ tab: 'kepeim', page: 1 })).toBe('Vezérlőpult – Saját képeim');
    expect(dashboardTitle({ tab: 'vasarlasaim', page: 2 })).toBe(
      'Vezérlőpult – Vásárlásaim, 2. oldal',
    );
  });
});
