// A színkontraszt-ellenőrző (contrast.mjs) tesztjei a Node beépített tesztfuttatójával
// (node --test tools/design): a WCAG 2.2 relatív fénysűrűség és kontrasztarány képlete, a
// design tokenek beolvasása a Tailwind-témából (client/src/styles/theme.css), és hogy a valódi téma
// minden előírt szín-párosa eléri a WCAG AA szintet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  checkContrast,
  contrastRatio,
  parseHex,
  parseThemeColors,
  REQUIRED_PAIRS,
  THEME_FILE,
} from './contrast.mjs';

/** Két szám egyezése a megadott tizedesjegyig (a kontrasztarányt két tizedesre közöljük). */
const assertClose = (actual, expected, digits = 2) =>
  assert.equal(actual.toFixed(digits), expected.toFixed(digits));

describe('parseHex', () => {
  it('a hat- és a háromjegyű hexadecimális színt is beolvassa (kis- és nagybetűvel)', () => {
    assert.deepEqual(parseHex('#D7192D'), { r: 215, g: 25, b: 45 });
    assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255 });
  });

  it('a nem hexadecimális színt elutasítja (pl. színnév, rossz hossz)', () => {
    for (const value of ['red', '#12345', '#ggg', 'ffffff', '']) {
      assert.throws(() => parseHex(value), /hexadecimális/);
    }
  });
});

describe('contrastRatio', () => {
  it('fekete-fehér 21:1, azonos színek 1:1 – a sorrend nem számít', () => {
    assertClose(contrastRatio('#000000', '#ffffff'), 21);
    assertClose(contrastRatio('#ffffff', '#000000'), 21);
    assertClose(contrastRatio('#d7192d', '#d7192d'), 1);
  });

  it('a WCAG szerinti ismert határérték: #767676 fehéren 4,54:1 (a legvilágosabb AA-szürke)', () => {
    assertClose(contrastRatio('#767676', '#ffffff'), 4.54);
    assert.ok(contrastRatio('#777777', '#ffffff') < 4.5);
  });

  it('a színcsatornák súlya: tiszta piros 4,00:1, kék 8,59:1, zöld 1,37:1 fehéren', () => {
    assertClose(contrastRatio('#ff0000', '#ffffff'), 4);
    assertClose(contrastRatio('#0000ff', '#ffffff'), 8.59);
    assertClose(contrastRatio('#00ff00', '#ffffff'), 1.37);
  });

  it('a sötét tartomány lineáris ága (csatorna ≤ 10): #0a0a0a fehéren 19,80:1', () => {
    assertClose(contrastRatio('#0a0a0a', '#ffffff'), 19.8);
  });
});

describe('parseThemeColors', () => {
  const SAMPLE = `
    @theme {
      --color-*: initial;
      --font-sans: 'Inter Variable', sans-serif;
      --color-white: #ffffff;
      --color-accent-600: #D7192D;
      --color-primary: var(--color-accent-600);
      --color-on-primary: var(--color-white);
      --radius-md: 0.375rem;
    }`;

  it('a --color-* tokeneket adja kisbetűs hexadecimális értékkel; a többi változót kihagyja', () => {
    const colors = parseThemeColors(SAMPLE);

    assert.equal(colors.get('white'), '#ffffff');
    assert.equal(colors.get('accent-600'), '#d7192d');
    assert.equal(colors.has('*'), false);
    assert.equal(colors.has('sans'), false);
    assert.equal(colors.size, 4);
  });

  it('a var(--color-…) hivatkozást a hivatkozott szín értékére oldja fel', () => {
    const colors = parseThemeColors(SAMPLE);

    assert.equal(colors.get('primary'), '#d7192d');
    assert.equal(colors.get('on-primary'), '#ffffff');
  });

  it('a megjegyzésbe tett deklarációt kihagyja; a záró pontosvessző hiánya nem zavarja', () => {
    const colors = parseThemeColors(
      '@theme { /* --color-a: #000000; */ --color-a: #ffffff; --color-b: var(--color-a) }',
    );

    assert.deepEqual(
      [...colors],
      [
        ['a', '#ffffff'],
        ['b', '#ffffff'],
      ],
    );
  });

  it('a kétszer deklarált tokenre hibát ad (pl. egy sötét téma felülírása nem csúszhat át)', () => {
    assert.throws(
      () =>
        parseThemeColors('@theme { --color-canvas: #ffffff; } .dark { --color-canvas: #0a0a0a; }'),
      /többször deklarált színtoken: canvas/,
    );
  });

  it('a nem létező tokenre és a körkörös hivatkozásra hibát ad', () => {
    assert.throws(
      () => parseThemeColors('@theme { --color-a: var(--color-nincs); }'),
      /ismeretlen színtoken: nincs/,
    );
    assert.throws(
      () => parseThemeColors('@theme { --color-a: var(--color-b); --color-b: var(--color-a); }'),
      /körkörös/,
    );
  });
});

describe('checkContrast', () => {
  const colors = new Map([
    ['white', '#ffffff'],
    ['gray', '#777777'],
    ['black', '#000000'],
  ]);

  it('minden párosnál megadja az arányt, és hogy eléri-e a minimumot', () => {
    const results = checkContrast(colors, [
      { fg: 'black', bg: 'white', min: 4.5, use: 'szöveg' },
      { fg: 'gray', bg: 'white', min: 4.5, use: 'halvány szöveg' },
      { fg: 'gray', bg: 'white', min: 3, use: 'mezőkeret' },
    ]);

    assert.deepEqual(
      results.map(({ use, ok }) => [use, ok]),
      [
        ['szöveg', true],
        ['halvány szöveg', false],
        ['mezőkeret', true],
      ],
    );
    assertClose(results[0].ratio, 21);
  });

  it('a minimummal pontosan egyező arány is megfelel (≥, nem >)', () => {
    const exact = contrastRatio('#777777', '#ffffff');
    const [result] = checkContrast(colors, [{ fg: 'gray', bg: 'white', min: exact, use: 'határ' }]);

    assert.equal(result.ok, true);
  });

  it('a témában nem szereplő tokenre hibát ad (elírás nem csúszhat át csendben)', () => {
    assert.throws(
      () => checkContrast(colors, [{ fg: 'fekete', bg: 'white', min: 4.5, use: 'szöveg' }]),
      /ismeretlen színtoken: fekete/,
    );
  });
});

describe('a PhotoChain témája (client/src/styles/theme.css)', () => {
  const colors = parseThemeColors(readFileSync(THEME_FILE, 'utf8'));

  it('az előírt párosok között van szöveg (4,5:1) és felületi elem (3:1) is', () => {
    const minimums = new Set(REQUIRED_PAIRS.map(({ min }) => min));
    assert.deepEqual([...minimums].sort(), [3, 4.5]);
    for (const use of ['törzsszöveg', 'elsődleges gomb felirata', 'hitelesítve jelvény']) {
      assert.ok(
        REQUIRED_PAIRS.some((pair) => pair.use === use),
        `hiányzik az előírt páros: ${use}`,
      );
    }
  });

  it('minden előírt szín-páros eléri a WCAG AA szintet', () => {
    const failing = checkContrast(colors, REQUIRED_PAIRS).filter(({ ok }) => !ok);

    assert.deepEqual(
      failing.map(({ use, ratio }) => `${use}: ${ratio.toFixed(2)}:1`),
      [],
    );
  });
});
