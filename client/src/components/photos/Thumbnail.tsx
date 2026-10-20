// Kis bélyegkép a listák soraiban (vezérlőpult – L22): rögzített méretű doboz, a kép kitölti
// (object-cover). Ha nincs kép (az elrejtett kép nyilvános fájljai törlődtek) vagy nem tölthető be,
// semleges ikon áll a helyén, a képernyőolvasónak szöveggel. A kép maga díszítő (alt=""): a sorban a
// cím írja le, ami hozzá tartozik (L17 drótváz „Vezérlőpult”, 10. jegyzet).
import { ImageOff } from 'lucide-react';
import { useState } from 'react';

interface ThumbnailProps {
  /** A bélyegkép címe; ha null, a helykitöltő jelenik meg */
  src: string | null;
}

export function Thumbnail({ src }: ThumbnailProps) {
  // A hibás forrást jegyezzük meg (nem egy jelzőt): új forrásnál magától újra próbálkozik
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // Saját méret (inline-block, inline-grid): a szülő elrendezésétől függetlenül 64 × 48 képpont
  const box = 'h-12 w-16 shrink-0 overflow-hidden rounded border border-line bg-surface';

  if (src === null || failedSrc === src) {
    return (
      <span className={`${box} inline-grid place-items-center text-fg-muted`}>
        <ImageOff aria-hidden="true" className="size-5" />
        <span className="sr-only">Előnézet nem érhető el</span>
      </span>
    );
  }
  return (
    <span className={`${box} inline-block`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(src)}
        className="size-full object-cover"
      />
    </span>
  );
}
