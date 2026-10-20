// Fókusz programból, görgetés nélkül (a görgetést a ScrollRestoration, illetve a hivatkozás kezeli). Ha
// az elem magától nem fókuszálható (pl. a fő tartalom), ideiglenesen tabindex="-1"-et kap, amelyet a
// fókusz elhagyásakor visszavonunk – így később egy egérkattintás sem teszi rá a fókuszt, és a Tab a
// kattintás helyétől folytatódik. Ha a fókusz nem került rá (pl. a bezárt mobil panelben rejtett
// mezőre), azonnal visszavonjuk: különben a mező kimaradna a Tab-sorrendből.
// Forrás: GOV.UK Frontend – setFocus (common/index.mjs) és a skip link komponens,
// https://github.com/alphagov/govuk-frontend/blob/main/packages/govuk-frontend/src/govuk/common/index.mjs (adaptálva)

export function focusElement(element: HTMLElement): void {
  if (!element.hasAttribute('tabindex')) {
    const removeTabIndex = () => element.removeAttribute('tabindex');
    element.setAttribute('tabindex', '-1');
    element.addEventListener('blur', removeTabIndex, { once: true });
    element.focus({ preventScroll: true });
    if (document.activeElement !== element) {
      element.removeEventListener('blur', removeTabIndex);
      removeTabIndex();
    }
    return;
  }
  element.focus({ preventScroll: true });
}

/** Elveszett a fókusz: nincs, a <body>-n van, vagy egy már eltávolított elemen. */
export function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

/**
 * Fókusz az aktuális oldal címére (ennek hiányában a fő tartalomra) – ha egy művelet eltünteti a
 * fókuszban lévő elemet, és útvonalváltás sincs (pl. kijelentkezés a kezdőlapon).
 */
export function focusPageHeading(): void {
  const main = document.getElementById('tartalom');
  const target = main?.querySelector<HTMLElement>('h1') ?? main;
  if (target) focusElement(target);
}
