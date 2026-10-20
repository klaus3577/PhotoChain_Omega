// A stílusútmutató-generátor (styleguide.mjs) tesztjei: a lap a design tokenekből készül (a téma
// szó szerint, a színminták és a kontraszttáblázat a tokenekből), és a repóban lévő
// docs/design/stilusutmutato.html a jelenlegi témából generált változat (nem maradt le).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { THEME_FILE } from './contrast.mjs';
import { buildStyleguide, STYLEGUIDE_FILE } from './styleguide.mjs';

const SAMPLE = `@theme {
  --color-white: #ffffff;
  --color-neutral-950: #0a0a0a;
  --color-accent-600: #d7192d;
  --color-fg: var(--color-neutral-950);
  --color-canvas: var(--color-white);
}`;

describe('buildStyleguide', () => {
  it('a témát szó szerint a Tailwind böngészős buildjének adja (a lap a tokeneket használja)', () => {
    const html = buildStyleguide(SAMPLE, []);

    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes(`<style type="text/tailwindcss">\n${SAMPLE}\n</style>`));
  });

  it('minden színtokenhez színmintát ad a nevével, a feloldott értékével és a hivatkozással', () => {
    const html = buildStyleguide(SAMPLE, []);
    // A minta: a <figure data-token="…"> és a hozzá tartozó felirat (a téma szövege nélkül)
    const swatch = (name) => html.match(new RegExp(`data-token="${name}"[\\s\\S]*?</figure>`))?.[0];

    assert.match(swatch('accent-600'), /background-color: #d7192d/);
    assert.match(swatch('neutral-950'), />#0a0a0a</);
    assert.match(swatch('fg'), /#0a0a0a · neutral-950/);
    assert.match(swatch('canvas'), /#ffffff · white/);
  });

  it('a kontraszttáblázat soronként mutatja a párost, az arányt és az eredményt', () => {
    const html = buildStyleguide(SAMPLE, [
      { fg: 'fg', bg: 'canvas', min: 4.5, use: 'törzsszöveg' },
      { fg: 'accent-600', bg: 'canvas', min: 4.5, use: 'piros <szöveg>' },
    ]);

    assert.ok(html.includes('törzsszöveg'));
    assert.ok(html.includes('19.80:1'));
    assert.ok(html.includes('megfelel'));
    // A felhasználási leírás szövegként kerül a lapra (HTML-ként nem értelmeződik)
    assert.ok(html.includes('piros &lt;szöveg&gt;'));
  });

  it('a minimumot el nem érő párost „nem felel meg” eredménnyel jelöli', () => {
    const html = buildStyleguide(SAMPLE, [
      { fg: 'accent-600', bg: 'fg', min: 4.5, use: 'piros a feketén' },
    ]);

    assert.match(html, /piros a feketén[\s\S]*?3\.83:1[\s\S]*?nem felel meg/);
  });

  it('a lap egyetlen sora sem végződik szóközzel (az .editorconfig mentéskor levágná)', () => {
    const html = buildStyleguide(SAMPLE, [
      { fg: 'fg', bg: 'canvas', min: 4.5, use: 'törzsszöveg' },
    ]);

    assert.doesNotMatch(html, /[ \t]$/m);
  });
});

describe('docs/design/stilusutmutato.html', () => {
  it('a jelenlegi témából generált változat (a téma módosítása után újra kell generálni)', () => {
    const expected = buildStyleguide(readFileSync(THEME_FILE, 'utf8'));

    assert.equal(readFileSync(STYLEGUIDE_FILE, 'utf8'), expected);
  });
});
