// Megerősítés a kép levétele előtt (L17 drótváz „Vezérlőpult”, 7. jegyzet; stílusútmutató
// „Megerősítő párbeszédablak”): a kérdés a következményt mondja el (a levétel végleges – a tulajdonos
// nem tudja visszavonni; akik már megvették, továbbra is letölthetik; a láncon a rekord megmarad), a
// gomb felirata az igét ismétli („Levétel”, nem „OK”). Megnyitáskor a fókusz a biztonságos választásra
// („Mégse” – az első gomb) kerül, Escape vagy Mégse bezárja. Amíg a levétel kérése fut, az ablak nem
// zárható (a Mégse foglalt, az Escape hatástalan): a kép nem kerülhet le úgy, hogy a felhasználó
// közben meggondolta magát. Ha a levétel nem sikerül, a hiba az ablakban marad, a gomb újra
// használható; ha a kép közben megváltozott (404, 409), a lista is frissül.
import { EyeOff } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';

import { hidePhoto, type OwnPhotoListItem, photoKeys } from '../../api/photos.api';
import { isStaleConflict } from '../../dashboard/staleConflict';
import { errorText } from '../../lib/text';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface HidePhotoDialogProps {
  photo: OwnPhotoListItem;
  /** Az ablak bezárása levétel nélkül (Mégse, Escape) */
  onClose: () => void;
  /** A kép lekerült a galériából (a hívó frissíti a listát, és bezárja az ablakot) */
  onHidden: () => void;
}

export function HidePhotoDialog({ photo, onClose, onHidden }: HidePhotoDialogProps) {
  const titleId = useId();
  const textId = useId();
  const errorId = useId();
  const queryClient = useQueryClient();
  const hide = useMutation({
    mutationFn: () => hidePhoto(photo.id),
    onSuccess: onHidden,
    onError: (error) => {
      if (isStaleConflict(error)) void queryClient.invalidateQueries({ queryKey: photoKeys.own() });
    },
  });

  return (
    <Dialog labelledBy={titleId} describedBy={textId} onClose={onClose} closable={!hide.isPending}>
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">
        Leveszed a képet a galériából?
      </h2>
      <p id={textId} className="mt-2 text-sm leading-6 text-fg-muted">
        „{photo.title}” nem lesz nyilvános, és ezt később <strong>nem tudod visszavonni</strong>.
        Akik már megvették, továbbra is letölthetik; a blokkláncon a rekord megmarad.
      </p>
      {hide.isError && (
        <div id={errorId} className="mt-3">
          <Alert key={hide.submittedAt} tone="danger" title="A levétel nem sikerült.">
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
          {hide.isPending ? 'Levétel…' : 'Levétel'}
        </Button>
      </div>
    </Dialog>
  );
}
