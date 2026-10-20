// Az admin végpontok bemeneti sémáinak unit tesztjei (L16): a felhasználók és a képek listájának
// query-paraméterei, a tiltás és az elrejtés szigorú JSON-törzse.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  listAdminPhotosQuerySchema,
  listUsersQuerySchema,
  updateAdminPhotoSchema,
  updateUserSchema,
} from './admin.schemas.js';

/** A séma hibaüzenetei mezőnként („mező: üzenet”). */
function issuesOf(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('listUsersQuerySchema', () => {
  it('alapból az első oldal, 20 felhasználóval, szűrés nélkül', () => {
    expect(listUsersQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('a keresőszó körülvágva; az üres keresőszó nem szűr', () => {
    expect(listUsersQuerySchema.parse({ q: '  anna@  ' }).q).toBe('anna@');
    expect(listUsersQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });

  it('a túl hosszú, a vezérlőkaraktert tartalmazó és a többször megadott keresőszó hiba', () => {
    expect(issuesOf(listUsersQuerySchema, { q: 'a'.repeat(101) })).toEqual([
      'q: legfeljebb 100 karakter lehet',
    ]);
    expect(issuesOf(listUsersQuerySchema, { q: `anna${String.fromCodePoint(0)}` })).toEqual([
      'q: vezérlőkaraktert nem tartalmazhat',
    ]);
    expect(issuesOf(listUsersQuerySchema, { q: ['a', 'b'] })).toEqual(['q: egyetlen érték kell']);
  });

  it('a tiltási szűrő csak true vagy false lehet', () => {
    expect(listUsersQuerySchema.parse({ blocked: 'true' }).blocked).toBe(true);
    expect(listUsersQuerySchema.parse({ blocked: 'false' }).blocked).toBe(false);
    for (const blocked of ['igen', '1', '', ['true', 'false']]) {
      expect(issuesOf(listUsersQuerySchema, { blocked })).toEqual([
        'blocked: true vagy false lehet',
      ]);
    }
  });
});

describe('updateUserSchema', () => {
  it('a tiltás és a feloldás logikai értékkel adható meg', () => {
    expect(updateUserSchema.parse({ isBlocked: true })).toEqual({ isBlocked: true });
    expect(updateUserSchema.parse({ isBlocked: false })).toEqual({ isBlocked: false });
  });

  it('hiányzó vagy nem logikai érték, ismeretlen mező és nem objektum törzs: hiba', () => {
    expect(issuesOf(updateUserSchema, {})).toEqual(['isBlocked: kötelező']);
    for (const isBlocked of ['true', 1, null]) {
      expect(issuesOf(updateUserSchema, { isBlocked })).toEqual([
        'isBlocked: true vagy false kell',
      ]);
    }
    // A szerepkör és a többi mező nem módosítható ezen az úton
    expect(issuesOf(updateUserSchema, { isBlocked: true, role: 'ADMIN' })).toEqual([
      ': ismeretlen mező: role',
    ]);
    expect(issuesOf(updateUserSchema, [true])).toEqual([': JSON-objektum kell']);
  });
});

describe('listAdminPhotosQuerySchema', () => {
  it('alapból minden állapotú kép, az állapot szerint szűrhető', () => {
    expect(listAdminPhotosQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    for (const status of ['PENDING_CHAIN', 'REGISTERED', 'CHAIN_FAILED', 'HIDDEN'] as const) {
      expect(listAdminPhotosQuerySchema.parse({ status }).status).toBe(status);
    }
  });

  it('ismeretlen vagy kisbetűs állapot, illetve több érték: hiba a lehetséges értékekkel', () => {
    for (const status of ['hidden', 'DELETED', '', ['HIDDEN', 'REGISTERED']]) {
      expect(issuesOf(listAdminPhotosQuerySchema, { status })).toEqual([
        'status: az állapot lehetséges értékei: PENDING_CHAIN, REGISTERED, CHAIN_FAILED, HIDDEN',
      ]);
    }
  });
});

describe('updateAdminPhotoSchema', () => {
  it('az elrejtés és a visszaállítás logikai értékkel adható meg', () => {
    expect(updateAdminPhotoSchema.parse({ hidden: true })).toEqual({ hidden: true });
    expect(updateAdminPhotoSchema.parse({ hidden: false })).toEqual({ hidden: false });
  });

  it('hiányzó vagy nem logikai érték, illetve más mező (pl. az állapot közvetlenül): hiba', () => {
    expect(issuesOf(updateAdminPhotoSchema, {})).toEqual(['hidden: kötelező']);
    expect(issuesOf(updateAdminPhotoSchema, { hidden: 'false' })).toEqual([
      'hidden: true vagy false kell',
    ]);
    expect(issuesOf(updateAdminPhotoSchema, { hidden: false, status: 'REGISTERED' })).toEqual([
      ': ismeretlen mező: status',
    ]);
  });
});
