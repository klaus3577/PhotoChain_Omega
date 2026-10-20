import { afterEach, describe, expect, it } from 'vitest';

import { focusElement, focusPageHeading } from './focus';

/** A tesztoldal: egy fő tartalom (#tartalom) a megadott gyermekelemmel – vagy fő tartalom nélkül. */
function renderPage(child: HTMLElement, { withMain = true } = {}) {
  if (!withMain) {
    document.body.replaceChildren(child);
    return;
  }
  const main = document.createElement('main');
  main.id = 'tartalom';
  main.append(child);
  document.body.replaceChildren(main);
}

function element(tag: string, text: string) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('focusElement', () => {
  it('ha az elem nem kaphat fókuszt (pl. letiltott vagy rejtett), az ideiglenes tabindex sem marad rajta', () => {
    const button = element('button', 'Letiltva');
    button.setAttribute('disabled', '');
    renderPage(button);

    focusElement(button);

    expect(button).not.toHaveFocus();
    // Különben a később engedélyezett elem kimaradna a Tab-sorrendből (tabindex="-1")
    expect(button).not.toHaveAttribute('tabindex');
  });
});

describe('focusPageHeading', () => {
  it('az oldal címére (h1) teszi a fókuszt', () => {
    const heading = element('h1', 'Cím');
    heading.tabIndex = -1;
    renderPage(heading);

    focusPageHeading();

    expect(heading).toHaveFocus();
  });

  it('cím nélkül a fő tartalomra (ideiglenes tabindex-szel); fő tartalom nélkül nem csinál semmit', () => {
    renderPage(element('p', 'Szöveg'));
    focusPageHeading();
    expect(document.querySelector('main')).toHaveFocus();

    renderPage(element('p', 'Nincs fő tartalom'), { withMain: false });
    expect(() => focusPageHeading()).not.toThrow();
    expect(document.body).toHaveFocus();
  });
});
