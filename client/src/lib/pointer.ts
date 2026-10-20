// Módosított kattintás (Ctrl/Cmd, Shift, Alt, középső gomb): a böngésző új lapon vagy ablakban nyitná a
// hivatkozást – ezt a saját kattintáskezelő nem akadályozhatja meg (pl. az aktuális oldalra mutató
// hivatkozásnál, ahol a sima kattintást elnyeljük).
import type { MouseEvent } from 'react';

export const isModifiedClick = (event: MouseEvent): boolean =>
  event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
