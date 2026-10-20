// Az értékelés írása (L23; L17 drótváz „Adatlap”, 6. jegyzet): csak a kép vásárlójának
// (viewer.canReview), az értékelések elején. A csillag kötelező, a vélemény nem; a szabályok a
// szerveréi (reviews/reviewValidation.ts). Küldéskor POST a szerver formájában; a mezőhiba a mezőnél
// (fókusszal), a szerver más hibája riasztás a küldő gomb leírásaként. Ha a szerver szerint már
// értékelte (409) vagy nem jogosult (403), az adatlap – 409-nél a lista is – frissül: az űrlap
// eltűnhet, ezért az üzenet az élő régióban hangzik el, nem az űrlapban. Siker után a lista és az
// adatlap frissül (megvárva), majd a hívó viszi a fókuszt az új értékelésre; a galéria listái, a
// vásárlásaim és a fotósprofil érvénytelenedik (átlag, saját értékelés).
// Forrás: TanStack Query – Mutations (onSuccess/onError, invalidateQueries),
// https://tanstack.com/query/latest/docs/framework/react/guides/mutations (adaptálva)
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';

import { ApiError } from '../../api/http';
import { orderKeys } from '../../api/orders.api';
import { photoKeys } from '../../api/photos.api';
import { createReview, type Review, type ReviewInput, reviewKeys } from '../../api/reviews.api';
import { userKeys } from '../../api/users.api';
import { useForm } from '../../hooks/useForm';
import { toSentence } from '../../lib/text';
import {
  COMMENT_HINT,
  REVIEW_FIELDS,
  reviewInputOf,
  validateReview,
} from '../../reviews/reviewValidation';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { TextAreaField } from '../ui/TextAreaField';
import { RatingInput } from './RatingInput';

/** A szerver döntése a küldésről: nem jogosult (403) vagy már értékelte (409) – az adatlap már frissült. */
export interface ReviewConflict {
  status: 403 | 409;
  message: string;
}

interface ReviewFormProps {
  photoId: string;
  /** Sikeres küldés: az új értékelés (a lista és az adatlap már frissült) */
  onCreated: (review: Review) => void;
  /** A szerver szerint nem értékelhet (403/409): a hívó viszi a fókuszt, és mondja be az üzenetet */
  onConflict: (conflict: ReviewConflict) => void;
}

/** Az adatlap jelzői elavultak: nem jogosult (403), a kép már nem látható (404) vagy már értékelte (409). */
const isStaleState = (error: unknown): error is ApiError =>
  error instanceof ApiError && [403, 404, 409].includes(error.status);

export function ReviewForm({ photoId, onCreated, onConflict }: ReviewFormProps) {
  const headingId = useId();
  const failureId = useId();
  const queryClient = useQueryClient();
  const form = useForm(REVIEW_FIELDS, validateReview);
  const submit = useMutation({
    mutationFn: (input: ReviewInput) => createReview(photoId, input),
    // A lista és az adatlap frissülését megvárja (a gomb addig foglalt): a hívó az új értékelésre teszi a fókuszt
    onSuccess: async (review) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewKeys.list(photoId) }),
        // exact: a lista az adatlap kulcsa alatt van – külön kérjük, hogy ne induljon kétszer
        queryClient.invalidateQueries({ queryKey: photoKeys.detail(photoId), exact: true }),
      ]);
      void queryClient.invalidateQueries({ queryKey: photoKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: orderKeys.purchases() });
      void queryClient.invalidateQueries({ queryKey: userKeys.all() });
      onCreated(review);
    },
    onError: async (error) => {
      if (!isStaleState(error)) {
        form.showServerError(error);
        return;
      }
      // Az adatlap frissül (404-nél az oldal „nem található” lesz), 409-nél a lista is (a saját értékelés)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: photoKeys.detail(photoId), exact: true }),
        error.status === 409
          ? queryClient.invalidateQueries({ queryKey: reviewKeys.list(photoId) })
          : Promise.resolve(),
      ]);
      if (error.status === 404) return;
      onConflict({ status: error.status === 409 ? 409 : 403, message: toSentence(error.message) });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    if (!submit.isPending) submit.mutate(reviewInputOf(values));
  });

  return (
    <form
      id="ertekeles"
      noValidate
      aria-labelledby={headingId}
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-line bg-surface p-4"
    >
      <h3 id={headingId} className="font-medium">
        Értékelés írása
      </h3>
      {form.fieldAlert && (
        <p key={form.fieldAlert.id} role="alert" className="sr-only">
          {form.fieldAlert.text}
        </p>
      )}
      <RatingInput legend="Értékelés" {...form.fieldProps('rating')} />
      <TextAreaField
        label="Vélemény (nem kötelező)"
        rows={3}
        help={COMMENT_HINT}
        {...form.fieldProps('comment')}
      />
      {form.failure && (
        <div id={failureId}>
          <Alert key={form.failure.id} tone="danger" title="Az értékelés küldése nem sikerült.">
            {form.failure.text}
          </Alert>
        </div>
      )}
      <Button
        type="submit"
        variant="secondary"
        busy={submit.isPending}
        aria-describedby={form.failure ? failureId : undefined}
      >
        {submit.isPending ? 'Küldés…' : 'Értékelés küldése'}
      </Button>
    </form>
  );
}
