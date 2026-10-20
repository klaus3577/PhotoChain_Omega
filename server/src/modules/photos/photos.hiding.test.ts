// Az elrejtés állapotátmeneteinek unit tesztjei (L16): ki rejtette el a képet – a tulajdonos, az
// admin (moderátori levétel), vagy mindkettő. A két döntés független: egyik fél sem szüntetheti meg
// a másikét.
import { describe, expect, it } from 'vitest';

import type { HiddenBy, PhotoStatus } from '../../generated/prisma/client.js';
import { hiddenByAfterHide, hiddenByAfterLiftingTakedown, isTakenDown } from './photos.hiding.js';

const visible = (status: PhotoStatus = 'REGISTERED') => ({ status, hiddenBy: null });
const hidden = (hiddenBy: HiddenBy) => ({ status: 'HIDDEN' as const, hiddenBy });

describe('hiddenByAfterHide', () => {
  it('a nem rejtett kép annak a nevére kerül, aki elrejti', () => {
    for (const status of ['PENDING_CHAIN', 'REGISTERED', 'CHAIN_FAILED'] as const) {
      expect(hiddenByAfterHide(visible(status), 'OWNER')).toBe('OWNER');
      expect(hiddenByAfterHide(visible(status), 'ADMIN')).toBe('ADMIN');
    }
  });

  it('a másik fél által elrejtett kép mindkettőjük döntésével rejtett (egyik sem írja felül a másikat)', () => {
    expect(hiddenByAfterHide(hidden('ADMIN'), 'OWNER')).toBe('OWNER_AND_ADMIN');
    expect(hiddenByAfterHide(hidden('OWNER'), 'ADMIN')).toBe('OWNER_AND_ADMIN');
  });

  it('ha a fél döntése már érvényben van, nincs változás (null)', () => {
    expect(hiddenByAfterHide(hidden('OWNER'), 'OWNER')).toBeNull();
    expect(hiddenByAfterHide(hidden('ADMIN'), 'ADMIN')).toBeNull();
    expect(hiddenByAfterHide(hidden('OWNER_AND_ADMIN'), 'OWNER')).toBeNull();
    expect(hiddenByAfterHide(hidden('OWNER_AND_ADMIN'), 'ADMIN')).toBeNull();
  });
});

describe('hiddenByAfterLiftingTakedown', () => {
  it('az admin csak a saját levételét oldja fel: a tulajdonos elrejtése megmarad', () => {
    expect(hiddenByAfterLiftingTakedown('ADMIN')).toBeNull();
    expect(hiddenByAfterLiftingTakedown('OWNER_AND_ADMIN')).toBe('OWNER');
  });
});

describe('isTakenDown', () => {
  it('moderátori levétel: amíg az admin döntése érvényben van (a tulajdonosé mellett is)', () => {
    expect(isTakenDown('ADMIN')).toBe(true);
    expect(isTakenDown('OWNER_AND_ADMIN')).toBe(true);
    expect(isTakenDown('OWNER')).toBe(false);
    expect(isTakenDown(null)).toBe(false);
  });
});
