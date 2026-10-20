// Másolás a vágólapra (pl. a teljes SHA-256 a rövidített kiírás mellett – L17 stílusútmutató,
// „Blokklánc-tanúsítvány”). Ikongomb, a neve mondja meg, mit másol. Az eredményt az oldal közös élő
// régiója jelenti be, és látszik is: sikernél pipa és „Másolva” – legalább 5 másodpercig, és amíg a
// gombon a mutató vagy a fókusz van (L17: 2.2.1). Ha a böngésző nem engedi a vágólapot (pl. http-n), a
// teljes érték egy csak olvasható mezőben jelenik meg a gomb után – fókuszkor kijelölve, onnan
// kimásolható.
// Forrás: MDN – Clipboard: writeText(), https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
// (adaptálva)
import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAnnounce } from './useAnnounce';

/** A „Másolva” legalább ennyi ideig látszik (L17 stílusútmutató, 2.2.1) */
const COPIED_MIN_VISIBLE_MS = 5000;

type CopyState = 'idle' | 'copied' | 'failed';

interface CopyButtonProps {
  /** A vágólapra kerülő teljes érték */
  value: string;
  /** A gomb neve (pl. „A teljes SHA-256 másolása”) */
  label: string;
  /** A sikeres másolás bejelentése */
  copiedMessage: string;
  /** A tartalék mező neve (pl. „A teljes SHA-256”) – ha a másolás nem sikerül */
  fieldLabel: string;
}

export function CopyButton({ value, label, copiedMessage, fieldLabel }: CopyButtonProps) {
  const announce = useAnnounce();
  const [state, setState] = useState<CopyState>('idle');
  /** A legutóbbi sikeres másolás sorszáma – minden új másolás újraindítja az időt */
  const [copies, setCopies] = useState(0);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (copies === 0) return;
    const timer = window.setTimeout(() => setMinimumElapsed(true), COPIED_MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [copies]);

  // Az idő letelt, és a gombon már sem a mutató, sem a fókusz nincs: a visszajelzés eltűnik
  if (state === 'copied' && minimumElapsed && !hovered && !focused) setState('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
      setMinimumElapsed(false);
      setCopies((count) => count + 1);
      announce(copiedMessage, { visible: true });
    } catch {
      setState('failed');
      announce('A másolás nem sikerült – a teljes érték a gomb utáni mezőből kimásolható.');
    }
  };

  const Icon = state === 'copied' ? Check : Copy;
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => void copy()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="grid size-9 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface hover:text-fg"
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
      {state === 'copied' && (
        <span aria-hidden="true" className="text-xs text-fg-muted">
          Másolva
        </span>
      )}
      {state === 'failed' && (
        <input
          readOnly
          value={value}
          aria-label={fieldLabel}
          onFocus={(event) => {
            event.currentTarget.select();
            // iOS Safari a select()-et figyelmen kívül hagyhatja
            event.currentTarget.setSelectionRange(0, value.length);
          }}
          className="min-h-9 min-w-0 basis-full rounded-md border border-line-strong bg-canvas px-2 font-mono text-xs"
        />
      )}
    </>
  );
}
