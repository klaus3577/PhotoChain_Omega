// Megerősítés a kép moderátori elrejtése előtt (L25; L17 drótváz „Adminisztráció”, 5. jegyzet;
// stílusútmutató „Megerősítő párbeszédablak”): a kérdés megnevezi a képet, a következmények felsorolva
// (eltűnik a galériából, a vásárlók sem tölthetik le; a nyitott fizetései lezárulnak; a lánc rekordja
// megmarad), és hogy az elrejtés visszaállítható; a gomb felirata az igét ismétli. Megnyitáskor a
// fókusz a Mégse gombon; amíg a kérés fut, az ablak nem zárható. Hibánál a hiba az ablakban marad; a
// szerver hibája után a lista frissül (a kép közben megváltozhatott – pl. a tulajdonos vette le, 409
// –, vagy az elrejtés meg is történt). Ha a megnyitó gomb közben eltűnt, bezáráskor a fókusz a kép
// címére kerül (fallbackFocus).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EyeOff } from 'lucide-react';
import { useId } from 'react';

import { type AdminPhoto, adminKeys, setPhotoHidden } from '../../api/admin.api';
import { errorText } from '../../lib/text';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { shouldRefreshAfterError } from './adminCache';

interface HideAdminPhotoDialogProps {
  photo: AdminPhoto;
  /** Az ablak bezárása elrejtés nélkül (Mégse, Escape) */
  onClose: () => void;
  /** A kép elrejtve (a hívó frissíti a listát, és bezárja az ablakot) */
  onHidden: (photo: AdminPhoto) => void;
  /** Hová kerüljön a fókusz, ha a megnyitó gomb közben eltűnt */
  fallbackFocus: () => HTMLElement | null;
}

export function HideAdminPhotoDialog({
  photo,
  onClose,
  onHidden,
  fallbackFocus,
}: HideAdminPhotoDialogProps) {
  const titleId = useId();
  const textId = useId();
  const errorId = useId();
  const queryClient = useQueryClient();
  const hide = useMutation({
    mutationFn: () => setPhotoHidden(photo.id, true),
    onSuccess: onHidden,
    onError: (error) => {
      if (shouldRefreshAfterError(error)) {
        void queryClient.invalidateQueries({ queryKey: adminKeys.photos() });
      }
    },
  });

  return (
    <Dialog
      labelledBy={titleId}
      describedBy={textId}
      onClose={onClose}
      closable={!hide.isPending}
      fallbackFocus={fallbackFocus}
    >
      <h2 id={titleId} className="text-lg font-semibold tracking-tight break-words">
        Elrejted: {photo.title}?
      </h2>
      <div id={textId} className="mt-2 text-sm leading-6 text-fg-muted">
        <ul className="list-disc space-y-1 pl-5">
          <li>eltűnik a galériából, és a vásárlók sem tölthetik le;</li>
          <li>a folyamatban lévő fizetései lezárulnak;</li>
          <li>a blokkláncon a rekord megmarad.</li>
        </ul>
        <p className="mt-2">Az elrejtés visszaállítható.</p>
      </div>
      {hide.isError && (
        <div id={errorId} className="mt-3">
          <Alert key={hide.submittedAt} tone="danger" title="Az elrejtés nem sikerült.">
            {errorText(hide.error)}
          </Alert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button busy={hide.isPending} onClick={onClose}>
          Mégse
        </Button>
        <Button
          variant="danger"
          icon={EyeOff}
          busy={hide.isPending}
          aria-describedby={hide.isError ? errorId : undefined}
          onClick={() => hide.mutate()}
        >
          {hide.isPending ? 'Elrejtés…' : 'Elrejtés'}
        </Button>
      </div>
    </Dialog>
  );
}
