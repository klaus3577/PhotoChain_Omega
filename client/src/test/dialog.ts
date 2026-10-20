// A jsdom nem valósítja meg a <dialog> megnyitását és bezárását (showModal, close): a tesztekhez a
// böngésző viselkedésének egyszerű mása – megnyitáskor a fókusz az autofocus jelölésű, ennek hiányában
// az első fókuszálható elemre kerül; Escape-re cancel, majd close esemény; bezáráskor a fókusz
// visszatér a megnyitás előtti elemre (ha még a dokumentumban van). Csak a tesztkörnyezet része.
// Forrás: HTML Living Standard – The dialog element (showModal, close, cancel),
// https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element (adaptálva)

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Az aktív elem a megnyitás előtt (visszaállításhoz) */
const openers = new WeakMap<HTMLDialogElement, Element | null>();

function closeDialog(dialog: HTMLDialogElement, returnValue?: string) {
  if (!dialog.open) return;
  dialog.open = false;
  if (returnValue !== undefined) dialog.returnValue = returnValue;
  const opener = openers.get(dialog);
  openers.delete(dialog);
  // Mint a szabványban: a dokumentumból már eltávolított ablak nem modális – a böngésző nem állítja
  // vissza a fókuszt (a komponensnek kell gondoskodnia róla, mielőtt a DOM-ból kikerül)
  if (dialog.isConnected && opener instanceof HTMLElement && opener.isConnected) opener.focus();
  // A böngésző a close eseményt külön feladatként, a bezárás után küldi
  setTimeout(() => dialog.dispatchEvent(new Event('close')), 0);
}

function onKeyDown(this: HTMLDialogElement, event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const cancel = new Event('cancel', { cancelable: true });
  if (this.dispatchEvent(cancel)) closeDialog(this);
}

export function installDialogPolyfill(): void {
  const prototype = HTMLDialogElement.prototype;
  if (typeof prototype.showModal === 'function') return;
  prototype.showModal = function showModal(this: HTMLDialogElement) {
    if (this.open) return;
    openers.set(this, document.activeElement);
    this.open = true;
    this.addEventListener('keydown', onKeyDown);
    const target =
      this.querySelector<HTMLElement>('[autofocus]') ?? this.querySelector<HTMLElement>(FOCUSABLE);
    (target ?? this).focus();
  };
  prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    this.removeEventListener('keydown', onKeyDown);
    closeDialog(this, returnValue);
  };
}
