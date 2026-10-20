// A kép (bélyegkép vagy vízjeles előnézet) helykitöltővel: ha nincs (az elrejtett kép fájljai
// törlődtek) vagy nem tölthető be, semleges „Előnézet nem érhető el” doboz áll a helyén – a rács, illetve
// az oldal nem esik szét (L17 drótváz, 5. jegyzet). A szélesség és a magasság a méretarányt adja meg,
// így a kép betöltése nem ugrasztja el az oldalt.
import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import { cx } from '../../lib/cx';

interface PhotoImageProps {
  /** A kép címe; ha null, a helykitöltő jelenik meg */
  src: string | null;
  /** A szöveges helyettesítő – a galéria bélyegképénél üres (a kártya címe leírja) */
  alt: string;
  width: number;
  height: number;
  /** Az img osztályai (pl. object-cover a rácsban, object-contain az adatlapon) */
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function PhotoImage({
  src,
  alt,
  width,
  height,
  className,
  loading = 'lazy',
}: PhotoImageProps) {
  // A hibás forrást jegyezzük meg (nem egy jelzőt): új forrásnál magától újra próbálkozik
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src === null || failedSrc === src) {
    return (
      <div className="grid size-full min-h-32 place-items-center bg-surface text-fg-muted">
        <span className="flex flex-col items-center gap-1 text-sm">
          <ImageOff aria-hidden="true" className="size-6" />
          Előnézet nem érhető el
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={cx('size-full', className)}
    />
  );
}
