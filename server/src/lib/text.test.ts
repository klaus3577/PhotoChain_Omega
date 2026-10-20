// A szabad szöveges mezők karakterszabályainak tesztjei.
import { describe, expect, it } from 'vitest';

import {
  collapseBlankLines,
  HAS_LETTER_OR_DIGIT,
  hasVisibleCharacter,
  hasVisibleLetterOrDigit,
  NO_CONTROL_CHARACTERS,
  NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES,
  removeHiddenCharacters,
  visibleLength,
} from './text.js';

const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const HANGUL_FILLER = String.fromCodePoint(0x3164);
/** A Braille üres mintája: nem szóköz és nem is „láthatatlan” karakter, mégis üresen jelenik meg */
const BRAILLE_BLANK = String.fromCodePoint(0x2800);
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x3000);
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
const THUMBS_UP = String.fromCodePoint(0x1f44d);
/** Emoji-sorozatok részei: összekötő (ZWJ), változatjelölő (VS16), bőrszín-módosító */
const ZWJ = String.fromCodePoint(0x200d);
const VS16 = String.fromCodePoint(0xfe0f);
const MEDIUM_SKIN_TONE = String.fromCodePoint(0x1f3fd);
const WOMAN = String.fromCodePoint(0x1f469);
const LAPTOP = String.fromCodePoint(0x1f4bb);
const HEART = String.fromCodePoint(0x2764);
const FIRE = String.fromCodePoint(0x1f525);
/** Címke-karakterek („ASCII-csempészet”: láthatatlanul írt, de géppel olvasható szöveg) */
const tagText = (ascii: string): string =>
  [...ascii].map((character) => String.fromCodePoint(0xe0000 + character.codePointAt(0)!)).join('');
const BLACK_FLAG = String.fromCodePoint(0x1f3f4);
const CANCEL_TAG = String.fromCodePoint(0xe007f);
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);
const LONE_SURROGATE = String.fromCodePoint(0xd800);
const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd);
/** CJK betű a kiegészítő síkon: egy karakter, de UTF-16-ban két kódegység */
const ASTRAL_LETTER = String.fromCodePoint(0x20bb7);

describe('removeHiddenCharacters', () => {
  it('a láthatatlan karakterek kimaradnak – a címke-karakterekkel elrejtett üzenet is', () => {
    const hidden = `${tagText('rejtett uzenet')}${ZERO_WIDTH_SPACE}${SOFT_HYPHEN}${LEFT_TO_RIGHT_MARK}`;

    expect(removeHiddenCharacters(`Nagyon${hidden} jó${HANGUL_FILLER}`)).toBe('Nagyon jó');
  });

  it('az emoji-sorozatok összekötője, változatjelölője és bőrszín-módosítója megmarad', () => {
    const emoji = [
      `${WOMAN}${ZWJ}${LAPTOP}`,
      `${WOMAN}${MEDIUM_SKIN_TONE}${ZWJ}${LAPTOP}`,
      `${HEART}${VS16}`,
      `${HEART}${VS16}${ZWJ}${FIRE}`,
      `${THUMBS_UP}${MEDIUM_SKIN_TONE}`,
      // szivárványos zászló (VS16, majd ZWJ), futó nő (ZWJ, majd VS16)
      `${String.fromCodePoint(0x1f3f3)}${VS16}${ZWJ}${String.fromCodePoint(0x1f308)}`,
      `${String.fromCodePoint(0x1f3c3)}${ZWJ}${String.fromCodePoint(0x2640)}${VS16}`,
    ].join(' ');

    expect(removeHiddenCharacters(emoji)).toBe(emoji);
  });

  it('a teljes (RGI) emoji-sorozatok épek maradnak: számjegyes keycap és az angol zászló is', () => {
    const keycapOne = `1${VS16}${String.fromCodePoint(0x20e3)}`;
    const englandFlag = `${BLACK_FLAG}${tagText('gbeng')}${CANCEL_TAG}`;

    expect(removeHiddenCharacters(`${keycapOne} ${englandFlag}`)).toBe(
      `${keycapOne} ${englandFlag}`,
    );
  });

  it('a zászló mögé írt, nem létező címkeszöveg kimarad (így sem csempészhető rejtett üzenet)', () => {
    expect(removeHiddenCharacters(`${BLACK_FLAG}${tagText('rejtett')}${CANCEL_TAG}!`)).toBe(
      `${BLACK_FLAG}!`,
    );
  });

  it('az emojin kívül álló összekötő és változatjelölő kimarad (ezekkel is kódolható rejtett üzenet)', () => {
    expect(removeHiddenCharacters(`a${ZWJ}b${VS16}c`)).toBe('abc');
    expect(removeHiddenCharacters(`${HEART}${VS16}${VS16}${VS16}`)).toBe(`${HEART}${VS16}`);
    expect(removeHiddenCharacters(`${WOMAN}${ZWJ}${ZWJ}${LAPTOP}${ZWJ}`)).toBe(`${WOMAN}${LAPTOP}`);
  });

  it('a párosítatlan UTF-16 helyettesítő helyén cserekarakter áll – a tárolt érték és a válasz így egyezik', () => {
    expect(removeHiddenCharacters(`jó${LONE_SURROGATE}kép`)).toBe(`jó${REPLACEMENT_CHARACTER}kép`);
  });

  it('a rejtett karakterrel kettévágott pár nem forr össze (előbb a cserekarakter, utána a törlés)', () => {
    const [high, low] = [String.fromCodePoint(0xd83d), String.fromCodePoint(0xde00)];

    expect(removeHiddenCharacters(`${high}${ZERO_WIDTH_SPACE}${low}`)).toBe(
      REPLACEMENT_CHARACTER.repeat(2),
    );
  });

  it('ismételt alkalmazásra nem változik tovább', () => {
    const once = removeHiddenCharacters(
      `a${ZWJ}${HEART}${VS16}${VS16}${tagText('x')}${BLACK_FLAG}${LONE_SURROGATE}${ZERO_WIDTH_SPACE}b`,
    );

    expect(removeHiddenCharacters(once)).toBe(once);
  });
});

describe('collapseBlankLines', () => {
  it('két bekezdés között legfeljebb egy üres sor marad (a szóközös „üres” sor is annak számít)', () => {
    expect(collapseBlankLines('Első\n\n\n\n\nMásodik\n \n\t\n\nHarmadik\nNegyedik')).toBe(
      'Első\n\nMásodik\n\nHarmadik\nNegyedik',
    );
    expect(collapseBlankLines('Egy\n\nKettő')).toBe('Egy\n\nKettő');
  });

  it('az üresen megjelenő (nem törhető, ideografikus szóközös, Braille-üres) sor is üres sornak számít', () => {
    const blankLooking = [NO_BREAK_SPACE, IDEOGRAPHIC_SPACE, BRAILLE_BLANK, `${NO_BREAK_SPACE}\t`];

    expect(collapseBlankLines(`a${blankLooking.map((line) => `\n${line}`).join('')}\nb`)).toBe(
      'a\n\nb',
    );
  });
});

describe('visibleLength', () => {
  it('a láthatatlan karaktereket nem számolja, a kiegészítő síkon álló betűt egynek veszi', () => {
    expect(visibleLength(`a${ZERO_WIDTH_SPACE}b`)).toBe(2);
    expect(visibleLength(HANGUL_FILLER.repeat(3))).toBe(0);
    expect(visibleLength(ASTRAL_LETTER)).toBe(1);
    expect(visibleLength('Árvíz')).toBe(5);
  });
});

describe('hasVisibleLetterOrDigit', () => {
  it.each([
    ['hangul kitöltő (betűnek számít, de üresen jelenik meg)', HANGUL_FILLER],
    ['változatjelölő', String.fromCodePoint(0xfe0f)],
    ['címke-karakter', String.fromCodePoint(0xe0041)],
    ['csak írásjel', '!?'],
  ])('betű nélküli vagy láthatatlan szöveg: %s', (_name, text) => {
    expect(hasVisibleLetterOrDigit(text)).toBe(false);
  });

  it('egy látható betű vagy szám elég (a kiegészítő síkon is)', () => {
    expect(hasVisibleLetterOrDigit(`${HANGUL_FILLER}A`)).toBe(true);
    expect(hasVisibleLetterOrDigit(ASTRAL_LETTER)).toBe(true);
    expect(hasVisibleLetterOrDigit('7')).toBe(true);
  });
});

describe('hasVisibleCharacter', () => {
  it.each([
    ['üres szöveg', ''],
    ['szóközök, sortörés, tabulátor', ' \n\t '],
    ['nem törhető és ideografikus szóköz', `${NO_BREAK_SPACE}${IDEOGRAPHIC_SPACE}`],
    ['nulla szélességű szóköz', ZERO_WIDTH_SPACE],
    ['hangul kitöltő szóközzel', `${HANGUL_FILLER} ${HANGUL_FILLER}`],
    ['Braille üres minta', BRAILLE_BLANK.repeat(3)],
  ])('üresen megjelenő szöveg: %s', (_name, text) => {
    expect(hasVisibleCharacter(text)).toBe(false);
  });

  it('a csak hibás karakterből (párosítatlan helyettesítő, cserekarakter) álló szöveg sem tartalom', () => {
    expect(hasVisibleCharacter(`${LONE_SURROGATE}${REPLACEMENT_CHARACTER} `)).toBe(false);
    expect(hasVisibleCharacter(`${REPLACEMENT_CHARACTER}a`)).toBe(true);
  });

  it('egy látható jel elég – írásjel és emoji is (a vélemény lehet „👍” vagy „!!!”)', () => {
    expect(hasVisibleCharacter(THUMBS_UP)).toBe(true);
    expect(hasVisibleCharacter('!!!')).toBe(true);
    expect(hasVisibleCharacter(`${ZERO_WIDTH_SPACE}a${BRAILLE_BLANK}`)).toBe(true);
  });
});

describe('NO_CONTROL_CHARACTERS', () => {
  it.each([
    'Tócsa tükröződéssel',
    'Ősz – 2026 (Árvíztűrő tükörfúrógép)',
    '日本語 🙂 👨\u200D👩\u200D👧',
    '',
  ])('a hétköznapi szöveget elfogadja: %j', (text) => {
    expect(NO_CONTROL_CHARACTERS.test(text)).toBe(true);
  });

  it.each([
    ['NUL (a PostgreSQL nem tudja tárolni)', 'a\u0000b'],
    ['sortörés', 'a\nb'],
    ['tabulátor', 'a\tb'],
    ['escape', 'a\u001bb'],
    // A megjelenítést megtévesztő karakterek: a szöveg irányát megfordító vezérlők…
    ['jobbról balra felülírás (U+202E)', 'kep\u202Egpj.exe'],
    ['irányizolátor (U+2066)', 'a\u2066b'],
    // …és a Unicode sor-, illetve bekezdéselválasztója
    ['sorelválasztó (U+2028)', 'a\u2028b'],
    ['bekezdéselválasztó (U+2029)', 'a\u2029b'],
  ])('elutasítja: %s', (_name, text) => {
    expect(NO_CONTROL_CHARACTERS.test(text)).toBe(false);
  });
});

describe('NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES', () => {
  it('a sortörést és a tabulátort megengedi, a többi vezérlőkaraktert nem', () => {
    expect(NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES.test('első sor\nmásodik\r\n\tbehúzva')).toBe(true);
    expect(NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES.test('a\u0000b')).toBe(false);
    expect(NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES.test('a\u202Eb')).toBe(false);
    expect(NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES.test('a\u2028b')).toBe(false);
  });
});

describe('HAS_LETTER_OR_DIGIT', () => {
  it('csak akkor teljesül, ha a szövegben van betű vagy szám', () => {
    expect(HAS_LETTER_OR_DIGIT.test('Tócsa')).toBe(true);
    expect(HAS_LETTER_OR_DIGIT.test('2026')).toBe(true);
    expect(HAS_LETTER_OR_DIGIT.test('日本')).toBe(true);
    // Láthatatlan (nulla szélességű) karakterek, írásjelek
    expect(HAS_LETTER_OR_DIGIT.test('\u200B\u200B\u200B')).toBe(false);
    expect(HAS_LETTER_OR_DIGIT.test('... !!!')).toBe(false);
  });
});
