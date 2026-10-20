// Fájlok húzásakor a böngésző az oldalon (a fogadóterületen kívülre) dobott képet megnyitná – az űrlap
// elveszne. A fogadóterület (FileDropZone) a saját eseményét már kezelte (preventDefault); másutt a dobás
// tiltott. A feltöltés (L21) és az ellenőrzés (L24) oldala használja.
// Forrás: MDN – HTML Drag and Drop API: File drag and drop,
// https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop (adaptálva)
import { useEffect } from 'react';

export function useFileDropGuard(): void {
  useEffect(() => {
    const guard = (event: DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);
}
