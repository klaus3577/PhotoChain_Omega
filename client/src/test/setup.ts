// A Vitest közös beállítása: a jest-dom illesztők (toBeInTheDocument, toHaveAccessibleDescription …),
// és minden teszt után a DOM és a lecserélt globálisok (pl. fetch) visszaállítása. A fetch-csonk
// fel nem használt válasza a tesztet buktatja: vagy fölösleges, vagy egy várt kérés elmaradt.
// Forrás: Testing Library – jest-dom, https://github.com/testing-library/jest-dom#with-vitest (adaptálva)
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { installDialogPolyfill } from './dialog';
import { takeUnusedOutcomeCount } from './fetch';

// A tesztek is StrictMode-ban renderelnek, mint az alkalmazás (main.tsx): a kettős effektus-futás a
// tesztben is előhozza a mellékhatás-hibákat.
// A várakozó lekérdezők (findBy*, waitFor) időkorlátja: az alapértelmezett 1 s a teljes csomag párhuzamos,
// lefedettséggel műszerezett futásában terhelt gépen szűk volt (L21) – a sikeres teszt futásideje nem nő, csak a bukásé
configure({ reactStrictMode: true, asyncUtilTimeout: 2500 });

// A jsdom nem valósítja meg a görgetést (a ScrollRestoration hívja) és a canvas rajzolást (az axe-core
// próbálja) – „Not implemented” zaj helyett üres megvalósítás; a tesztek egyiket sem vizsgálják.
window.scrollTo = () => {};
HTMLCanvasElement.prototype.getContext = () => null;
// A jsdom nem ismeri az objektum-URL-t (a kiválasztott kép előnézete – L21); a cím csak jelképes
let objectUrls = 0;
URL.createObjectURL ??= () => `blob:teszt/${(objectUrls += 1)}`;
URL.revokeObjectURL ??= () => {};
// A jsdom nem ismeri a <dialog> showModal/close hívását (a vezérlőpult párbeszédablakai – L22)
installDialogPolyfill();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.title = '';
  const unused = takeUnusedOutcomeCount();
  if (unused > 0) {
    throw new Error(
      `${unused} fel nem használt fetch-válasz maradt (fölösleges válasz vagy elmaradt kérés)`,
    );
  }
});
