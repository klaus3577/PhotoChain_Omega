// Modális párbeszédablak natív <dialog> elemmel (L17 stílusútmutató – „Megerősítő párbeszédablak”;
// WCAG 2.1.2): a showModal() alatt a háttér nem érhető el, az Escape bezárja (cancel → close), és
// bezáráskor a böngésző a fókuszt a megnyitás előtti elemre teszi vissza. A komponens megnyitja (a
// showModal csak scriptből hívható), és a bezárást jelzi a szülőnek (close esemény), aki az ablakot
// eltünteti. Amikor a szülő tünteti el (Mégse, sikeres mentés), a bezárás layout-effektus takarításában
// történik: az még azelőtt fut, hogy a React az elemet kivenné a DOM-ból – a már eltávolított, nem
// modális ablak bezárása a fókuszt nem adná vissza (HTML-szabvány: „dialog removing steps”). Ha a
// böngésző mégsem tudta visszaadni (a megnyitó gomb közben eltűnt), a fókusz a megnyitó gombra vagy
// az oldal címére kerül – a body-n nem maradhat. A saját bezárás close eseménye (a böngésző késve, a
// fejlesztői StrictMode újranyitása után küldi) nem a felhasználó döntése: a komponens nem jelenti
// a szülőnek. Amíg egy művelet fut (closable: false), az Escape sem zárja be.
// Forrás: MDN – <dialog>: showModal(), close(), cancel és close esemény,
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog; WHATWG HTML – The
// dialog element (dialog removing steps, close the dialog),
// https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element (adaptálva)
import {
  use,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type SyntheticEvent,
} from 'react';

import { cx } from '../../lib/cx';
import { focusElement, focusPageHeading } from '../../lib/focus';
import { LiveRegionContext } from './liveRegionContext';

/**
 * A böngésző a megnyitó gombra tette vissza a fókuszt? Ha nem (a gomb közben eltűnt – akár az Escape
 * előtt –, vagy a fókusz az ablakban ragadt), a megnyitó gombra vagy a hívó által megadott helyre,
 * különben az oldal címére kerül. A <body> nem megnyitó (a Safari kattintásra nem fókuszálja a gombot).
 */
function restoreFocus(
  dialog: HTMLDialogElement,
  opener: Element | null,
  fallback: () => HTMLElement | null,
): void {
  const active = document.activeElement;
  const restored =
    active !== null && active !== document.body && active.isConnected && !dialog.contains(active);
  if (restored) return;
  if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) {
    opener.focus();
    return;
  }
  const target = fallback();
  if (target) focusElement(target);
  else focusPageHeading();
}

interface DialogProps {
  /** A cím elemének azonosítója */
  labelledBy: string;
  /** A leírás (pl. a következmény) elemének azonosítója */
  describedBy?: string;
  /** A felhasználó bezárta (Escape) */
  onClose: () => void;
  /** Hamis, amíg egy művelet fut: az Escape nem zárja be (a hívó a Mégse gombot is foglalttá teszi) */
  closable?: boolean;
  /**
   * Ha a megnyitó gomb közben eltűnt (pl. a sor állapota megváltozott), ide kerül a fókusz az oldal
   * címe helyett – pl. a sor elejére (admin – L25); null, ha nincs ilyen hely
   */
  fallbackFocus?: () => HTMLElement | null;
  className?: string;
  children: ReactNode;
}

export function Dialog({
  labelledBy,
  describedBy,
  onClose,
  closable = true,
  fallbackFocus,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  /** A komponens maga zárja be (eltávolításkor): ennek close eseménye nem a felhasználó döntése */
  const closingItself = useRef(false);
  // Effektus-esemény: a bezáráskor érvényes hívót látja, az effektus mégsem fut újra a változásakor
  const resolveFallback = useEffectEvent(() => fallbackFocus?.() ?? null);
  // Az élő régió (ha van): amíg az ablak nyitva van, a bejelentések várnak – a modális ablak alatt az
  // oldal nem elérhető (L26); a kontextus értéke állandó
  const liveRegion = use(LiveRegionContext);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();
    liveRegion?.dialogOpened();
    return () => {
      if (dialog.open) {
        closingItself.current = true;
        dialog.close();
      }
      restoreFocus(dialog, opener, resolveFallback);
      // A várakozó bejelentések most hangzanak el – a fókusz már a helyén van
      liveRegion?.dialogClosed();
    };
  }, [liveRegion]);

  const handleClose = () => {
    // A saját bezárás eseménye – a StrictMode újranyitása után késve is érkezhet (az ablak már
    // újra nyitva): nem a szülőé
    if (closingItself.current || ref.current?.open) {
      closingItself.current = false;
      return;
    }
    onClose();
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (!closable) event.preventDefault();
  };
  return (
    // Az ismételt Escape bezárási kérését a böngésző a cancel megakadályozása ellenére is végrehajthatja
    // (visszaélés-védelem): a closedby="none" az újabb böngészőkben ezt is tiltja, a régiekben hatástalan
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClose={handleClose}
      onCancel={handleCancel}
      closedby={closable ? undefined : 'none'}
      className={cx(
        'm-auto w-[min(100%-2rem,32rem)] rounded-lg border border-line-strong bg-canvas p-5 text-fg shadow-card backdrop:bg-black/40',
        className,
      )}
    >
      {children}
    </dialog>
  );
}
