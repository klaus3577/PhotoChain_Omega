// A vezérlőpult listáinak találatszám-sora (L22): betöltés, frissítés (lapozás közben a régi lista
// látszik) vagy az összesítés; hibánál üres – a hibanézet beszél. A sikeres újrapróbálás után ide kerül
// a fókusz (useFocusAfterRecovery), ezért ref-et kap.
import type { Ref } from 'react';

import { type LoadState, showsLoadError } from '../../lib/loadState';
import { Spinner } from '../ui/Spinner';

interface ListSummaryProps {
  state: LoadState;
  /** Lapozás közben a régi lista látszik */
  stale: boolean;
  loadingText: string;
  text: string;
  ref: Ref<HTMLParagraphElement>;
}

export function ListSummary({ state, stale, loadingText, text, ref }: ListSummaryProps) {
  return (
    <p
      ref={ref}
      className="flex min-h-6 items-center gap-2 text-sm text-fg-muted focus:outline-none"
    >
      {showsLoadError(state) ? null : stale || state === 'loading' ? (
        <>
          <Spinner />
          {stale ? 'Frissítés…' : loadingText}
        </>
      ) : (
        text
      )}
    </p>
  );
}
