// A felület magyar formázásai: ár (forint, nem törő szóközökkel – a „12 500 Ft” nem törik el), átlagos
// értékelés egy tizedesre, dátum és időpont budapesti idő szerint, hosszú hexa értékek rövidítése.
import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatInteger,
  formatPrice,
  formatPriceRange,
  formatRating,
  shortenHex,
} from './format';

const NBSP = String.fromCharCode(0xa0);

describe('formatPrice', () => {
  it('forintban, ezres tagolással; a tagoló és a pénznem előtti szóköz nem törő', () => {
    expect(formatPrice(12500)).toBe(`12${NBSP}500${NBSP}Ft`);
    expect(formatPrice(175)).toBe(`175${NBSP}Ft`);
  });
});

describe('formatInteger', () => {
  it('ezres tagolással (pl. blokkszám); a négyjegyű szám a magyar szokás szerint tagolatlan', () => {
    expect(formatInteger(11_820_993)).toBe(`11${NBSP}820${NBSP}993`);
    expect(formatInteger(5000)).toBe('5000');
  });
});

describe('formatPriceRange', () => {
  it('a két határ, illetve csak az egyik („legalább”, „legfeljebb”)', () => {
    expect(formatPriceRange(5000, 20000)).toBe(`5000 – 20${NBSP}000${NBSP}Ft`);
    expect(formatPriceRange(5000, null)).toBe(`legalább 5000${NBSP}Ft`);
    expect(formatPriceRange(null, 20000)).toBe(`legfeljebb 20${NBSP}000${NBSP}Ft`);
    expect(formatPriceRange(null, null)).toBe('');
  });
});

describe('formatRating', () => {
  it('egy tizedesre, tizedesvesszővel', () => {
    expect(formatRating(4.63)).toBe('4,6');
    expect(formatRating(5)).toBe('5,0');
    expect(formatRating(4.25)).toBe('4,3');
  });
});

describe('formatDate és formatDateTime', () => {
  it('budapesti idő szerint (a téli és a nyári időszámítást is követve)', () => {
    expect(formatDate('2026-10-04T12:30:00.000Z')).toBe('2026. október 4.');
    expect(formatDateTime('2026-10-04T12:32:15.000Z')).toBe('2026. 10. 04. 14:32');
    // Éjfél előtt UTC-ben, de Budapesten már másnap
    expect(formatDate('2026-12-31T23:30:00.000Z')).toBe('2027. január 1.');
  });
});

describe('formatBytes', () => {
  it('a fájlméret: 1 MB fölött egy tizedessel (1024-es alapon, mint a szerver korlátja), alatta kB, illetve B', () => {
    expect(formatBytes(8_808_038)).toBe(`8,4${NBSP}MB`);
    expect(formatBytes(15 * 1024 * 1024)).toBe(`15,0${NBSP}MB`);
    expect(formatBytes(655_360)).toBe(`640${NBSP}kB`);
    // Egész kB (nem „244,722 kB”)
    expect(formatBytes(250_595)).toBe(`245${NBSP}kB`);
    expect(formatBytes(512)).toBe(`512${NBSP}B`);
    expect(formatBytes(0)).toBe(`0${NBSP}B`);
  });
});

describe('shortenHex', () => {
  it('az elejét és a végét tartja meg, a „0x” előtag megmarad', () => {
    expect(shortenHex(`5a1f9c3e${'ab'.repeat(24)}8b20d47e`)).toBe('5a1f9c3e…8b20d47e');
    expect(shortenHex(`0x9c4e${'cd'.repeat(30)}1b7a`, 4)).toBe('0x9c4e…1b7a');
  });

  it('a rövid értéket változatlanul hagyja – a rövidítés csak akkor rövidebb, ha legalább két jegyet elhagy', () => {
    expect(shortenHex('f0e4c8d0b0a09080')).toBe('f0e4c8d0b0a09080');
    expect(shortenHex('a'.repeat(17))).toBe('a'.repeat(17));
    expect(shortenHex('a'.repeat(18))).toBe(`${'a'.repeat(8)}…${'a'.repeat(8)}`);
  });
});
