// A saját profil módosításának (PATCH /api/me) sémája: csak a megjelenített név és a bemutatkozás
// módosítható; minden más mező (e-mail, szerepkör, tiltás) hiba. A vezérlő- és megtévesztő
// karaktereket kódpontjukkal állítjuk elő, hogy a forrásfájlban ne szerepeljenek.
import { describe, expect, it } from 'vitest';

import { updateProfileSchema } from './users.schemas.js';

const NUL = String.fromCodePoint(0);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);
const WORD_JOINER = String.fromCodePoint(0x2060);
/** Betűnek számít (Lo), de üresen jelenik meg */
const HANGUL_FILLER = String.fromCodePoint(0x3164);
const BRAILLE_BLANK = String.fromCodePoint(0x2800);

/** A hibás mezők és az első (legfontosabb) üzenetük: { mező: üzenet }. */
function issuesOf(input: unknown): Record<string, string> {
  const result = updateProfileSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.toReversed().map((issue) => [issue.path.join('.'), issue.message]),
  );
}

describe('updateProfileSchema', () => {
  it('a név szóközök nélkül; a bemutatkozás sortörései egységesen LF alakban', () => {
    expect(
      updateProfileSchema.parse({ displayName: '  Kiss Fanni ', bio: 'Tájképek\r\nés portrék' }),
    ).toEqual({ displayName: 'Kiss Fanni', bio: 'Tájképek\nés portrék' });
  });

  it('a bemutatkozás törölhető: null vagy üres szöveg', () => {
    expect(updateProfileSchema.parse({ bio: null })).toEqual({ bio: null });
    expect(updateProfileSchema.parse({ bio: '   ' })).toEqual({ bio: null });
  });

  it('üres törzsre: legalább egy mezőt módosítani kell', () => {
    expect(issuesOf({})).toEqual({ '': 'legalább egy módosítandó mező kell' });
  });

  it('a név szabályainak megsértésekor egyetlen, pontos üzenet jön', () => {
    const messagesOf = (displayName: string) =>
      updateProfileSchema.safeParse({ displayName }).error?.issues.map((issue) => issue.message);

    expect(messagesOf(ZERO_WIDTH_SPACE.repeat(3))).toEqual(['legalább 2 karakter kell']);
    expect(messagesOf('!!')).toEqual(['legalább egy betűt vagy számot tartalmazzon']);
    // A kiegészítő síkon álló betű (UTF-16-ban két kódegység) egyetlen karakter
    expect(messagesOf(String.fromCodePoint(0x20bb7))).toEqual(['legalább 2 karakter kell']);
  });

  it('csak ismeretlen mezőt tartalmazó törzsre egyetlen, a valódi okot megnevező üzenet jön', () => {
    const result = updateProfileSchema.safeParse({ role: 'ADMIN' });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['ismeretlen mező: role']);
  });

  it('a név nem állhat csak láthatatlan karakterekből vagy írásjelekből', () => {
    expect(issuesOf({ displayName: ZERO_WIDTH_SPACE.repeat(3) }).displayName).toMatch(/legalább 2/);
    expect(issuesOf({ displayName: `A${ZERO_WIDTH_SPACE}` }).displayName).toMatch(/legalább 2/);
    expect(issuesOf({ displayName: '!!' }).displayName).toMatch(/betűt vagy számot/);
    for (const blank of [HANGUL_FILLER, BRAILLE_BLANK, LEFT_TO_RIGHT_MARK, WORD_JOINER]) {
      expect(issuesOf({ displayName: blank.repeat(3) })).toHaveProperty('displayName');
    }
  });

  it.each(['email', 'role', 'isBlocked', 'passwordHash', 'id', 'createdAt'])(
    'a(z) %s nem módosítható: ismeretlen mező',
    (field) => {
      expect(issuesOf({ displayName: 'Kiss Fanni', [field]: 'ADMIN' })).toEqual({
        '': `ismeretlen mező: ${field}`,
      });
    },
  );

  it('nem JSON-objektum törzsre (tömb, szöveg, hiányzó törzs) magyar hibát ad', () => {
    for (const body of [[], 'Fanni', 42, null, undefined]) {
      expect(issuesOf(body)).toEqual({ '': 'JSON-objektum kell' });
    }
  });

  it('a név 2–50 karakter, vezérlőkarakter nélkül (mint a regisztrációnál)', () => {
    expect(issuesOf({ displayName: 'A' }).displayName).toMatch(/legalább 2/);
    expect(issuesOf({ displayName: 'a'.repeat(51) }).displayName).toMatch(/legfeljebb 50/);
    expect(issuesOf({ displayName: ['Kiss', 'Fanni'].join('\n') }).displayName).toMatch(
      /vezérlőkarakter/,
    );
    expect(issuesOf({ displayName: null }).displayName).toBe('szöveg kell');
  });

  it('a bemutatkozás legfeljebb 500 karakter, vezérlő- és megtévesztő karakter nélkül', () => {
    expect(updateProfileSchema.parse({ bio: 'a'.repeat(500) }).bio).toHaveLength(500);
    expect(issuesOf({ bio: 'a'.repeat(501) }).bio).toMatch(/legfeljebb 500/);
    expect(issuesOf({ bio: `a${NUL}b` }).bio).toMatch(/vezérlőkarakter/);
    expect(issuesOf({ bio: `a${RIGHT_TO_LEFT_OVERRIDE}b` }).bio).toMatch(/vezérlőkarakter/);
    expect(issuesOf({ bio: `a${LINE_SEPARATOR}b` }).bio).toMatch(/vezérlőkarakter/);
    expect(issuesOf({ bio: 42 }).bio).toBe('szöveg kell');
  });

  // L30: mint a véleménynél (L15) – a rejtett karakterekkel írt szöveg az olvasónak nem látszik, egy
  // gépi feldolgozó viszont elolvassa; a sok üres sor szétnyomná a profilt
  it('a névből és a bemutatkozásból a rejtett karakterek kimaradnak, két bekezdés között legfeljebb egy üres sor', () => {
    const tagA = String.fromCodePoint(0xe0061);

    expect(
      updateProfileSchema.parse({
        displayName: `Kiss${ZERO_WIDTH_SPACE} Fanni`,
        bio: `Tájképek${tagA}${tagA}\n\n\n \n\nés ${WORD_JOINER}portrék${ZERO_WIDTH_SPACE}`,
      }),
    ).toEqual({ displayName: 'Kiss Fanni', bio: 'Tájképek\n\nés portrék' });
  });

  it('a csak rejtett karakterekből álló bemutatkozás törlésnek számít (null)', () => {
    expect(updateProfileSchema.parse({ bio: `${ZERO_WIDTH_SPACE}${WORD_JOINER}` })).toEqual({
      bio: null,
    });
  });

  it('a hosszkorlátot a sortörések egységesítése után ellenőrzi', () => {
    const lines = Array.from({ length: 20 }, () => 'x'.repeat(24));
    const asSent = lines.join('\r\n'); // 20 × 24 + 19 × 2 = 518 karakter

    expect(asSent.length).toBeGreaterThan(500);
    expect(updateProfileSchema.parse({ bio: asSent }).bio).toBe(lines.join('\n'));
  });
});
