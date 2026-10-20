// A saját profil szerkesztése (L23) párbeszédablakban: a megjelenített név és a bemutatkozás, a
// meglévő adatokkal kitöltve (a fókusz a néven). A szabályok a regisztrációéi, illetve a szerver
// users.schemas.ts-éi (users/profileValidation.ts); mentéskor PATCH /api/me a szerver formájában. A
// mezőhiba a mezőnél (fókusszal), a szerver más hibája riasztás az ablakban (a nyitott ablak alatt az
// oldal élő régiója nem érhető el). Amíg a mentés fut, az ablak nem zárható (a Mégse foglalt, az
// Escape hatástalan). Siker után a hívó frissíti a munkamenetet és a profilt, és bezárja az ablakot –
// a fókusz a megnyitó gombra tér vissza (natív dialog).
import { useMutation } from '@tanstack/react-query';
import { useId } from 'react';

import type { AuthUser } from '../../api/auth.api';
import { type ProfileUpdate, updateProfile } from '../../api/users.api';
import { useForm } from '../../hooks/useForm';
import {
  BIO_HINT,
  PROFILE_FIELDS,
  profileUpdateOf,
  validateProfile,
} from '../../users/profileValidation';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { TextAreaField } from '../ui/TextAreaField';
import { TextField } from '../ui/TextField';

interface EditProfileDialogProps {
  user: AuthUser;
  /** Az ablak bezárása mentés nélkül (Mégse, Escape) */
  onClose: () => void;
  /** Sikeres mentés: a felhasználó új adatai (a hívó frissít és bezár) */
  onSaved: (user: AuthUser) => void;
}

export function EditProfileDialog({ user, onClose, onSaved }: EditProfileDialogProps) {
  const titleId = useId();
  const textId = useId();
  const failureId = useId();
  const form = useForm(PROFILE_FIELDS, validateProfile, {
    displayName: user.displayName,
    bio: user.bio ?? '',
  });
  const save = useMutation({
    mutationFn: (input: ProfileUpdate) => updateProfile(input),
    onSuccess: onSaved,
    onError: (error) => form.showServerError(error),
  });

  const onSubmit = form.handleSubmit((values) => {
    if (!save.isPending) save.mutate(profileUpdateOf(values));
  });

  return (
    <Dialog labelledBy={titleId} describedBy={textId} onClose={onClose} closable={!save.isPending}>
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">
        Profil szerkesztése
      </h2>
      <p id={textId} className="mt-1 text-sm leading-6 text-fg-muted">
        A neved a képeidnél és az értékeléseidnél jelenik meg; az e-mail-címed nem nyilvános.
      </p>
      <form noValidate onSubmit={onSubmit} className="mt-4 space-y-5">
        {form.fieldAlert && (
          <p key={form.fieldAlert.id} role="alert" className="sr-only">
            {form.fieldAlert.text}
          </p>
        )}
        <TextField
          label="Megjelenített név"
          autoComplete="nickname"
          required
          autoFocus
          {...form.fieldProps('displayName')}
        />
        <TextAreaField
          label="Bemutatkozás (nem kötelező)"
          rows={4}
          help={BIO_HINT}
          {...form.fieldProps('bio')}
        />
        {form.failure && (
          <div id={failureId}>
            <Alert key={form.failure.id} tone="danger" title="A mentés nem sikerült.">
              {form.failure.text}
            </Alert>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button busy={save.isPending} onClick={onClose}>
            Mégse
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={save.isPending}
            aria-describedby={form.failure ? failureId : undefined}
          >
            {save.isPending ? 'Mentés…' : 'Mentés'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
