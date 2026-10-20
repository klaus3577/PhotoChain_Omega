// A kiválasztott fájl (L17 drótváz „Feltöltés”, 2. jegyzet): előnézet, név, méret és – amint a böngésző
// betöltötte a képet – a felbontás; a „Kép cseréje” új fájlt választ, az űrlap adatai megmaradnak. Az
// összefoglaló a fájlválasztó leírásának része (az azonosítóját a szülő adja), így a képernyőolvasó a
// vezérlőn is hallja, mi van kiválasztva. Az objektum-URL kezelése a useImageSelection hooké.
import type { Ref, SyntheticEvent } from 'react';

import { formatBytes } from '../../lib/format';
import type { ImageDimensions, ImageSelection } from '../../upload/useImageSelection';
import { Button } from '../ui/Button';

interface SelectedFileProps {
  selection: ImageSelection;
  /** Az összefoglaló azonosítója (a fájlválasztó aria-describedby-ához) */
  summaryId: string;
  onDimensions: (dimensions: ImageDimensions) => void;
  onReplace: () => void;
  /** A dobozra: a szülő tudja, hogy a fókusz benne volt-e, amikor a doboz eltűnik */
  ref?: Ref<HTMLDivElement>;
}

export function SelectedFile({
  selection,
  summaryId,
  onDimensions,
  onReplace,
  ref,
}: SelectedFileProps) {
  const { file, previewUrl, dimensions } = selection;
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) =>
    onDimensions({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });

  return (
    <div ref={ref} className="flex items-center gap-3 rounded-lg border border-line p-3">
      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
        <img src={previewUrl} alt="" onLoad={onLoad} className="size-full object-cover" />
      </div>
      <div id={summaryId} className="min-w-0 flex-1 text-sm">
        <p className="font-medium break-all">{file.name}</p>
        <p className="text-fg-muted">
          {formatBytes(file.size)}
          {dimensions && ` · ${dimensions.width} × ${dimensions.height} képpont`}
        </p>
      </div>
      <Button onClick={onReplace}>Kép cseréje</Button>
    </div>
  );
}
