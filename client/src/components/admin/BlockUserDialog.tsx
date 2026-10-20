// Megerősítés a felhasználó letiltása előtt (L25; L17 drótváz „Adminisztráció”, 8. jegyzet;
// stílusútmutató „Megerősítő párbeszédablak”): a kérdés megnevezi a felhasználót, a következmények
// felsorolva (nem használhatja a fiókját; a képei a tiltás idejére eltűnnek a galériából; a nyitott
// fizetései lezárulnak), és hogy a tiltás feloldható; a gomb felirata az igét ismétli. Megnyitáskor a
// fókusz a Mégse gombon; amíg a kérés fut, az ablak nem zárható. Hibánál a hiba az ablakban marad, a
// gomb újra használható; a szerver hibája után a lista frissül (a felhasználó közben megváltozhatott
// – pl. adminisztrátor lett, 409 –, vagy a tiltás meg is történt). Ha a megnyitó gomb közben eltűnt,
// bezáráskor a fókusz a sor elejére kerül (fallbackFocus).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useId } from 'react';

import { type AdminUser, adminKeys, setUserBlocked } from '../../api/admin.api';
import { errorText } from '../../lib/text';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { shouldRefreshAfterError } from './adminCache';

interface BlockUserDialogProps {
  user: AdminUser;
  /** Az ablak bezárása tiltás nélkül (Mégse, Escape) */
  onClose: () => void;
  /** A felhasználó letiltva (a hívó frissíti a listát, és bezárja az ablakot) */
  onBlocked: (user: AdminUser) => void;
  /** Hová kerüljön a fókusz, ha a megnyitó gomb közben eltűnt */
  fallbackFocus: () => HTMLElement | null;
}

export function BlockUserDialog({ user, onClose, onBlocked, fallbackFocus }: BlockUserDialogProps) {
  const titleId = useId();
  const textId = useId();
  const errorId = useId();
  const queryClient = useQueryClient();
  const block = useMutation({
    mutationFn: () => setUserBlocked(user.id, true),
    onSuccess: onBlocked,
    onError: (error) => {
      if (shouldRefreshAfterError(error)) {
        void queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      }
    },
  });

  return (
    <Dialog
      labelledBy={titleId}
      describedBy={textId}
      onClose={onClose}
      closable={!block.isPending}
      fallbackFocus={fallbackFocus}
    >
      <h2 id={titleId} className="text-lg font-semibold tracking-tight break-words">
        Letiltod: {user.displayName}?
      </h2>
      <div id={textId} className="mt-2 text-sm leading-6 text-fg-muted">
        <ul className="list-disc space-y-1 pl-5">
          <li>nem használhatja a fiókját;</li>
          <li>a képei a tiltás idejére eltűnnek a galériából;</li>
          <li>a folyamatban lévő fizetései lezárulnak.</li>
        </ul>
        <p className="mt-2">A tiltás bármikor feloldható.</p>
      </div>
      {block.isError && (
        <div id={errorId} className="mt-3">
          <Alert key={block.submittedAt} tone="danger" title="A letiltás nem sikerült.">
            {errorText(block.error)}
          </Alert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button busy={block.isPending} onClick={onClose}>
          Mégse
        </Button>
        <Button
          variant="danger"
          icon={Ban}
          busy={block.isPending}
          aria-describedby={block.isError ? errorId : undefined}
          onClick={() => block.mutate()}
        >
          {block.isPending ? 'Letiltás…' : 'Letiltás'}
        </Button>
      </div>
    </Dialog>
  );
}
