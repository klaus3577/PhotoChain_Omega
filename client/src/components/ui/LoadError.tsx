// A betöltés hibája újrapróbálással: a hiba riasztásként jelenik meg (minden újabb hibánál újra
// elhangzik), az Újrapróbálás gomb pedig az újrapróbálás közben is a helyén marad – foglaltként
// (aria-disabled), így a fókusz nem vész el (lib/loadState.ts); az újrapróbálást az élő régió is
// bejelenti (a foglalt gomb önmagában néma). A sikeres újrapróbálás után a hívó teszi a fókuszt a
// betöltött tartalomra (hooks/useFocusAfterRecovery.ts).
import { RefreshCw } from 'lucide-react';
import { useId } from 'react';

import type { LoadState } from '../../lib/loadState';
import { errorText } from '../../lib/text';
import { Alert } from './Alert';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { useAnnounce } from './useAnnounce';

interface LoadErrorProps {
  /** A riasztás címe (pl. „A képek betöltése nem sikerült.”) */
  title: string;
  state: Extract<LoadState, 'failed' | 'retrying'>;
  error: unknown;
  /** A hiba ideje: minden új hiba új riasztás (újra elhangzik) */
  failedAt: number;
  onRetry: () => void;
  /** Újrapróbálás közben a riasztás helyén látszó (és elhangzó) szöveg, pl. „Képek betöltése…” */
  retryingText: string;
}

export function LoadError({
  title,
  state,
  error,
  failedAt,
  onRetry,
  retryingText,
}: LoadErrorProps) {
  const announce = useAnnounce();
  const alertId = useId();
  const retrying = state === 'retrying';

  const retry = () => {
    announce(retryingText);
    onRetry();
  };

  return (
    <div className="space-y-4">
      {retrying ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner />
          {retryingText}
        </p>
      ) : (
        <div id={alertId}>
          <Alert key={failedAt} tone="danger" title={title}>
            {errorText(error)}
          </Alert>
        </div>
      )}
      {/* A gomb leírása a riasztás: több lista hibájánál is megmondja, melyik „Újrapróbálás” melyiké */}
      <Button
        icon={RefreshCw}
        busy={retrying}
        aria-describedby={retrying ? undefined : alertId}
        onClick={retry}
      >
        Újrapróbálás
      </Button>
    </div>
  );
}
