// A kép adatainak szerkesztése (L22) párbeszédablakban: ugyanazok a mezők és szabályok, mint a
// feltöltésnél (PhotoFormFields, validateUploadFields), a kép meglévő adataival kitöltve; a kép maga
// nem cserélhető. Mentéskor PATCH a szerver formájában (a cím levágva, a leírás normalizálva – üresen
// null, az ár és a kategória szám); a mezőhiba a mezőnél (fókusszal), a szerver más hibája (pl. 409 –
// a képet közben elrejtették) riasztás az ablakban – ilyenkor a lista is frissül, hogy a sor a valós
// állapotot mutassa. Amíg a mentés fut, az ablak nem zárható (a Mégse foglalt, az Escape hatástalan):
// a félbehagyott kérés eredménye nem maradhat kezeletlen. A nyitott ablak alatt az oldal élő régiója
// nem érhető el (a háttér inert): a kategóriák újratöltésének hibáját az ablakon belüli riasztás
// mondja el. Siker után a hívó frissíti a listát és bezárja az ablakot – a fókusz a megnyitó gombra
// tér vissza (natív dialog).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState, type FormEvent } from 'react';

import { categoriesQuery } from '../../api/categories.api';
import {
  type OwnPhotoListItem,
  photoKeys,
  type PhotoUpdate,
  updatePhoto,
  type UploadedPhoto,
} from '../../api/photos.api';
import { isStaleConflict } from '../../dashboard/staleConflict';
import { useForm, type FormMessage } from '../../hooks/useForm';
import {
  normalizeDescription,
  priceDigits,
  UPLOAD_FIELDS,
  type UploadValues,
  validateUploadFields,
} from '../../upload/uploadValidation';
import { PhotoFormFields } from '../photos/PhotoFormFields';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

/** A kérés mezői a szerver formájában (mint a feltöltésnél, UploadPage). */
function updateOf(values: UploadValues): PhotoUpdate {
  const description = normalizeDescription(values.description);
  return {
    title: values.title.trim(),
    description: description === '' ? null : description,
    priceHuf: Number(priceDigits(values.priceHuf) ?? values.priceHuf),
    categoryId: Number(values.categoryId),
  };
}

interface EditPhotoDialogProps {
  photo: OwnPhotoListItem;
  /** Az ablak bezárása mentés nélkül (Mégse, Escape) */
  onClose: () => void;
  /** Sikeres mentés: a kép új adatai (a hívó frissíti a listát, és bezárja az ablakot) */
  onSaved: (photo: UploadedPhoto) => void;
}

export function EditPhotoDialog({ photo, onClose, onSaved }: EditPhotoDialogProps) {
  const titleId = useId();
  const textId = useId();
  const failureId = useId();
  const queryClient = useQueryClient();
  const categories = useQuery(categoriesQuery());
  const form = useForm(UPLOAD_FIELDS, validateUploadFields, {
    title: photo.title,
    description: photo.description ?? '',
    priceHuf: String(photo.priceHuf),
    categoryId: String(photo.category.id),
  });
  /** A kategóriák újratöltésének hibája – riasztás az ablakban (az élő régió a háttérben nem érhető el) */
  const [reloadFailure, setReloadFailure] = useState<FormMessage | null>(null);
  const messageCount = useRef(0);
  const save = useMutation({
    mutationFn: (input: PhotoUpdate) => updatePhoto(photo.id, input),
    onSuccess: onSaved,
    // A mezőhiba a mezőhöz (fókusszal), más hiba riasztásként; az elavult sor frissül
    onError: (error) => {
      form.showServerError(error);
      if (isStaleConflict(error)) void queryClient.invalidateQueries({ queryKey: photoKeys.own() });
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    form.clearMessages();
    if (form.showErrors(validateUploadFields(form.values))) return;
    save.mutate(updateOf(form.values));
  };

  const reloadCategories = async () => {
    const result = await categories.refetch();
    if (result.isSuccess) {
      setReloadFailure(null);
      form.focusField('categoryId');
    } else {
      messageCount.current += 1;
      setReloadFailure({
        id: messageCount.current,
        text: 'A kategóriák betöltése most sem sikerült.',
      });
    }
  };

  return (
    <Dialog labelledBy={titleId} describedBy={textId} onClose={onClose} closable={!save.isPending}>
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">
        Kép adatainak szerkesztése
      </h2>
      <p id={textId} className="mt-1 text-sm leading-6 text-fg-muted">
        „{photo.title}” – a kép maga nem cserélhető, csak az adatai. A módosítás a blokkláncon
        rögzített ujjlenyomatot nem érinti.
      </p>
      <form noValidate onSubmit={onSubmit} className="mt-4 space-y-5">
        {form.fieldAlert && (
          <p key={form.fieldAlert.id} role="alert" className="sr-only">
            {form.fieldAlert.text}
          </p>
        )}
        {reloadFailure && (
          <p key={reloadFailure.id} role="alert" className="sr-only">
            {reloadFailure.text}
          </p>
        )}
        <PhotoFormFields
          form={form}
          categories={categories}
          onReloadCategories={() => void reloadCategories()}
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
