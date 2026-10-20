// A bizalom vizuális nyelvének panelszínei (L17 stílusútmutató): a keret és a fejléc a négy hangnemben –
// a zöld kizárólag a blokkláncon igazolt hitelességé, a borostyán a függő vagy hasonló, a piros a
// sikertelen, a semleges a rejtett vagy nem talált. A tanúsítvány és az állapotkártya
// (photos/certificatePanels.ts) és az ellenőrzés eredménye (verify/resultStates.ts) ugyanezt használja,
// így a „zöld csak az igazolt” szabály egy helyen él.
import type { Tone } from './StatusBadge';

export interface PanelTone {
  /** A doboz kerete */
  border: string;
  /** A fejléc kerete, háttere és szövegszíne */
  header: string;
}

export const PANEL_TONES: Record<Tone, PanelTone> = {
  trust: { border: 'border-trust-200', header: 'border-trust-200 bg-trust-50 text-trust-700' },
  caution: {
    border: 'border-caution-200',
    header: 'border-caution-200 bg-caution-50 text-caution-700',
  },
  danger: {
    border: 'border-accent-200',
    header: 'border-accent-200 bg-danger-surface text-danger',
  },
  neutral: { border: 'border-line', header: 'border-line bg-surface text-fg-muted' },
};
