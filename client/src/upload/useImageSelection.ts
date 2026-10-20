// A kiválasztott kép állapota (L21): a fájl, az előnézet objektum-URL-je és – amint a böngésző
// betöltötte a képet – a felbontása. Az objektum-URL az eseménykezelőben készül (nem effektben: a
// StrictMode kettős effektusa a még használt URL-t szabadítaná fel), és a fájl cseréjekor, törlésekor,
// illetve az oldal elhagyásakor szabadul fel. A hibák két forrása külön van: a kliens ítélete (típus,
// méret, a betöltés után a felbontás) blokkolja a beküldést; a szerver ítélete (pl. sérült vagy egyszínű
// kép) látszik, de nem blokkol – a szerver dönt újra –, és az előnézet újratöltése sem törli.
// Forrás: MDN – URL.createObjectURL(), https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static;
// React – You Might Not Need an Effect, https://react.dev/learn/you-might-not-need-an-effect (adaptálva)
import { useEffect, useRef, useState } from 'react';

import { checkImageDimensions, checkImageFile, MIN_IMAGE_EDGE_PX } from './uploadValidation';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageSelection {
  file: File;
  previewUrl: string;
  /** A kép betöltése után; addig null */
  dimensions: ImageDimensions | null;
}

export const FILE_REQUIRED = 'Válassz egy képfájlt.';

/** A kiválasztott kép; a rövidebb oldal korlátja a feltöltésnél 600, az ellenőrzésnél 100 képpont (L24). */
export function useImageSelection(minEdgePx = MIN_IMAGE_EDGE_PX) {
  const [selection, setSelection] = useState<ImageSelection | null>(null);
  /** A kliens ítélete: elutasított fájl (típus, méret) vagy a fájl hiánya beküldéskor */
  const [selectionError, setSelectionError] = useState<string>();
  /** A szerver ítélete a képről – a következő kiválasztásig vagy beküldésig látszik */
  const [serverError, setServerError] = useState<string>();
  const previewUrl = useRef<string | null>(null);

  const release = () => {
    if (previewUrl.current === null) return;
    URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  };
  // Az oldal elhagyásakor az előnézet URL-je felszabadul
  useEffect(() => release, []);

  /** Kiválasztás (tallózás vagy dobás): a hibás fájl nem kerül be; a hiba szövegét adja vissza. */
  const select = (file: File): string | undefined => {
    const error = checkImageFile(file);
    release();
    setServerError(undefined);
    setSelectionError(error);
    if (error !== undefined) {
      setSelection(null);
      return error;
    }
    const url = URL.createObjectURL(file);
    previewUrl.current = url;
    setSelection({ file, previewUrl: url, dimensions: null });
    return undefined;
  };

  /** A kép eldobása (másik kép választása, új űrlap). */
  const clear = () => {
    release();
    setSelection(null);
    setSelectionError(undefined);
    setServerError(undefined);
  };

  /** A böngésző betöltötte az előnézetet: a felbontás ismert. */
  const loaded = (dimensions: ImageDimensions): string | undefined => {
    setSelection((current) => (current === null ? null : { ...current, dimensions }));
    return checkImageDimensions(dimensions.width, dimensions.height, minEdgePx);
  };

  /** Beküldéskor fájl nélkül: a hiánya a hiba (egy korábbi elutasítás szövege megmarad). */
  const requireFile = () => setSelectionError((current) => current ?? FILE_REQUIRED);

  const dimensionError =
    selection === null || selection.dimensions === null
      ? undefined
      : checkImageDimensions(selection.dimensions.width, selection.dimensions.height, minEdgePx);

  return {
    selection,
    /** A fogadóterületnél mutatott hiba: a kliens ítélete elöl, a szerveré mögötte */
    error: selectionError ?? dimensionError ?? serverError,
    /** A beküldést akadályozó, kliensoldali hiba (a szerver korábbi ítélete nem akadály) */
    blockingError: selection === null ? (selectionError ?? FILE_REQUIRED) : dimensionError,
    select,
    clear,
    loaded,
    requireFile,
    setServerError,
  };
}
