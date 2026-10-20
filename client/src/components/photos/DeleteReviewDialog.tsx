// A saját értékelés törlése megerősítéssel (L23): natív párbeszédablak (ui/Dialog), a következmény a
// leírásban – végleges, a kép átlaga újraszámolódik, utána újra értékelhető a kép (a szervernek nincs
// módosítása: törlés, majd új értékelés). A fókusz a „Mégse” gombon indul (a veszélyes művelet nem
// az alapértelmezett). Amíg a kérés fut, az ablak nem zárható. Siker után a hívó frissíti a listát és
// az adatlapot, bezárja az ablakot, és elviszi a fókuszt (a törölt sor gombja eltűnt); a hiba az
// ablakban marad (riasztás a Törlés gomb leírásaként), a Mégse bezárja.
import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useId } from 'react';

import { ApiError } from '../../api/http';
import { deleteReview } from '../../api/reviews.api';
import { errorText } from '../../lib/text';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface DeleteReviewDialogProps {
  reviewId: string;
  /** Az ablak bezárása törlés nélkül (Mégse, Escape) */
  onClose: () => void;
  /** Sikeres törlés (a hívó frissít, bezár és fókuszál) */
  onDeleted: () => void | Promise<void>;
  /** A szerver szerint az értékelés már nincs meg (404) vagy nem a sajátja (403): a hívó frissít és bezár */
  onStale: (error: ApiError) => void | Promise<void>;
}

const isStale = (error: unknown): error is ApiError =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);

export function DeleteReviewDialog({
  reviewId,
  onClose,
  onDeleted,
  onStale,
}: DeleteReviewDialogProps) {
  const titleId = useId();
  const textId = useId();
  const failureId = useId();
  const remove = useMutation({
    mutationFn: () => deleteReview(reviewId),
    onSuccess: onDeleted,
    onError: (error) => (isStale(error) ? onStale(error) : undefined),
  });

  return (
    <Dialog
      labelledBy={titleId}
      describedBy={textId}
      onClose={onClose}
      closable={!remove.isPending}
    >
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">
        Törlöd az értékelésedet?
      </h2>
      <p id={textId} className="mt-1 text-sm leading-6 text-fg-muted">
        Az értékelés végleg törlődik, a kép átlaga újraszámolódik. Utána újra értékelheted a képet.
      </p>
      {remove.isError && (
        <div id={failureId} className="mt-3">
          <Alert key={remove.submittedAt} tone="danger" title="A törlés nem sikerült.">
            {errorText(remove.error)}
          </Alert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button autoFocus busy={remove.isPending} onClick={onClose}>
          Mégse
        </Button>
        <Button
          variant="danger"
          icon={Trash2}
          busy={remove.isPending}
          aria-describedby={remove.isError ? failureId : undefined}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? 'Törlés…' : 'Törlés'}
        </Button>
      </div>
    </Dialog>
  );
}
