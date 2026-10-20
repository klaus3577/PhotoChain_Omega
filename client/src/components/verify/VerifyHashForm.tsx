// Ellenőrzés a SHA-256 hash alapján (L24; L17 drótváz „Ellenőrzés”, 1. jegyzet): például egy
// tanúsítványból vagy az Etherscanről másolt hash-sel – kép nélkül hasonlóságot nem keres (a dHash-hez a
// kép kellene), csak pontos egyezést. A mező a szerver sémáját tükrözi (verifyValidation.ts), hibás
// hash-sel kérés sem indul; a szerver mezőhibája a mezőhöz, más hibája riasztásként a gomb mellé kerül
// (useForm – a várakozás idejével). A kérés mutáció (useMutation – mint a többi űrlapé): a gomb addig
// foglalt, az indulást az élő régió mondja be; az oldal elhagyásakor a kérés megszakad. Egyszerre egy
// ellenőrzés futhat (verificationGate.ts). Az eredményt a szülő mutatja: a kártya az űrlapok helyére lép.
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, type FormEvent } from 'react';

import { isAbortError } from '../../api/http';
import { type Verification, verifyHash } from '../../api/verify.api';
import { useForm } from '../../hooks/useForm';
import type { VerificationGate } from '../../verify/verificationGate';
import {
  HASH_FIELDS,
  HASH_HINT,
  type HashValues,
  validateHashFields,
} from '../../verify/verifyValidation';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { useAnnounce } from '../ui/useAnnounce';

interface VerifyHashFormProps {
  onResult: (result: Verification) => void;
  gate: VerificationGate;
  /** Új ellenőrzéskor (a kártya helyére lépve): a fókusz a mezőre */
  autoFocus?: boolean;
}

export function VerifyHashForm({ onResult, gate, autoFocus = false }: VerifyHashFormProps) {
  const form = useForm(HASH_FIELDS, validateHashFields);
  const announce = useAnnounce();
  const controllerRef = useRef<AbortController | null>(null);
  const headingId = useId();
  const failureId = useId();

  // Az oldal elhagyásakor a még tartó kérés megszakad (az eredménye ide már nem írna)
  useEffect(() => () => controllerRef.current?.abort(), []);

  const check = useMutation({
    mutationFn: ({ sha256, signal }: { sha256: string; signal: AbortSignal }) =>
      verifyHash(sha256, signal),
    onSuccess: (result) => {
      gate.onSettle();
      onResult(result);
    },
    onError: (error) => {
      gate.onSettle(error);
      if (!isAbortError(error)) form.showServerError(error);
    },
  });

  /** Az ellenőrzött mező után: a kapu (másik ellenőrzés fut, a szerver várakozást kért), majd a kérés. */
  const start = (values: HashValues) => {
    if (check.isPending) return;
    const blocked = gate.reasonNotToStart();
    if (blocked !== null) {
      form.showFailure(blocked);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    gate.onStart();
    announce('Az ellenőrzés elindult.');
    check.mutate({ sha256: values.sha256, signal: controller.signal });
  };

  // A mezők ellenőrzése és a küldés az eseménykezelőben áll össze (a küldő a megszakító ref-et írja:
  // renderelés közben a React Compiler szabálya szerint nem adható át)
  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(start)(event);

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="space-y-4">
      <h2 id={headingId} className="text-lg font-semibold tracking-tight">
        Ellenőrzés SHA-256 hash alapján
      </h2>
      <p className="text-sm leading-6 text-fg-muted">
        Például egy tanúsítványból másolt hash-sel. Kép nélkül hasonló képet nem keresünk, csak a
        pontos egyezést.
      </p>
      {form.fieldAlert && (
        <p key={form.fieldAlert.id} role="alert" className="sr-only">
          {form.fieldAlert.text}
        </p>
      )}
      {/* Az autoFocus csak az új ellenőrzéskor, a kártya helyére lépő űrlapban (a fókusz nem vész el) */}
      <TextField
        label="SHA-256 hash"
        help={HASH_HINT}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        {...form.fieldProps('sha256')}
      />
      {form.failure && (
        <div id={failureId}>
          <Alert key={form.failure.id} tone="danger" title="Az ellenőrzés nem sikerült.">
            {form.failure.text}
          </Alert>
        </div>
      )}
      <Button
        type="submit"
        busy={check.isPending}
        aria-describedby={form.failure ? failureId : undefined}
      >
        {check.isPending ? 'Ellenőrzés…' : 'Hash ellenőrzése'}
      </Button>
    </form>
  );
}
