// A kép kiválasztásának közös folyamata (L21 feltöltés, L24 ellenőrzés): a kiválasztott kép és a hibái
// (useImageSelection), a hiba rejtett riasztása, a kiválasztás bemondása, és a felbontás ellenőrzése az
// előnézet betöltése után. A fókusz szabálya: a hibás fájl nem kerül be – ha az eltűnő „Kép cseréje”
// gombon volt a fókusz, a fájlválasztóra kerül (a leírása a hiba), különben rejtett riasztás mondja el;
// a jó fájlt az élő régió mondja be. A felbontás hibája később (a betöltés után) derül ki, ezért
// mindig rejtett riasztás mondja el – a fókusz nem ugrik el gépelés közben.
import { useRef, useState, type RefObject } from 'react';

import { useAnnounce } from '../components/ui/useAnnounce';
import type { FormMessage } from '../hooks/useForm';
import { formatBytes } from '../lib/format';
import { MIN_IMAGE_EDGE_PX } from './uploadValidation';
import { type ImageDimensions, useImageSelection } from './useImageSelection';

interface ImagePickerOptions {
  /** A rövidebb oldal korlátja: a feltöltésnél 600, az ellenőrzésnél 100 képpont */
  minEdgePx?: number;
  /** A kiválasztott fájl doboza: a szülő tudja, hogy a fókusz benne volt-e, amikor eltűnik */
  selectedRef: RefObject<HTMLElement | null>;
  /** Fókusz a fájlválasztóra (a változás megjelenése után) */
  focusFile: () => void;
}

export function useImagePicker({
  minEdgePx = MIN_IMAGE_EDGE_PX,
  selectedRef,
  focusFile,
}: ImagePickerOptions) {
  const announce = useAnnounce();
  const image = useImageSelection(minEdgePx);
  /** Az elutasított kép hibája rejtett riasztásként, ha a fókusz nem a fájlválasztóra kerül */
  const [imageAlert, setImageAlert] = useState<FormMessage | null>(null);
  const messageCount = useRef(0);

  /** Üzenet, minden újnál új azonosítóval – a képernyőolvasó az ismétlődő szöveget is újra felolvassa. */
  const message = (text: string): FormMessage => {
    messageCount.current += 1;
    return { id: messageCount.current, text };
  };
  const showImageAlert = (text: string) => setImageAlert(message(`Kép: ${text}`));
  const clearImageAlert = () => setImageAlert(null);

  /** A kiválasztott (vagy dobott) fájl. */
  const selectFile = (file: File) => {
    const replaceHadFocus = selectedRef.current?.contains(document.activeElement) ?? false;
    const error = image.select(file);
    if (error === undefined) {
      setImageAlert(null);
      announce(`Kiválasztott kép: ${file.name} (${formatBytes(file.size)}).`);
      return;
    }
    if (replaceHadFocus) {
      setImageAlert(null);
      focusFile();
    } else {
      showImageAlert(error);
    }
  };

  /** A fájl eldobása (másik kép választása, új űrlap): a fókusz a fájlválasztóra kerül. */
  const clearFile = () => {
    image.clear();
    setImageAlert(null);
    focusFile();
  };

  /** A böngésző betöltötte az előnézetet: a felbontás hibáját rejtett riasztás mondja el. */
  const onDimensions = (loaded: ImageDimensions) => {
    const error = image.loaded(loaded);
    if (error) showImageAlert(error);
  };

  return {
    image,
    imageAlert,
    message,
    showImageAlert,
    clearImageAlert,
    selectFile,
    clearFile,
    onDimensions,
  };
}
