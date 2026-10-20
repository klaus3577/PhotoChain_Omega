// A kép adatainak mezői (cím, leírás, kategória, ár) – a feltöltés űrlapja (L21) és a vezérlőpult
// szerkesztő ablaka (L22) ugyanazokat a mezőket, szabályokat és súgókat használja. A kategóriák
// hibája a választó leírásában látszik, az újratöltés gombja mellette; a mezők állapotát a közös
// űrlap-hook (useForm) adja, a szabályokat az upload/uploadValidation.ts.
import type { UseQueryResult } from '@tanstack/react-query';

import type { Category } from '../../api/categories.api';
import type { useForm } from '../../hooks/useForm';
import { PRICE_HINT, type UploadField } from '../../upload/uploadValidation';
import { Button } from '../ui/Button';
import { SelectField } from '../ui/SelectField';
import { TextAreaField } from '../ui/TextAreaField';
import { TextField } from '../ui/TextField';

/** A kép adatainak űrlapja (useForm az UPLOAD_FIELDS mezőivel) */
export type PhotoForm = ReturnType<typeof useForm<UploadField>>;

interface PhotoFormFieldsProps {
  form: PhotoForm;
  categories: UseQueryResult<Category[]>;
  /** A kategóriák újratöltése (siker után a hívó teszi a fókuszt a választóra) */
  onReloadCategories: () => void;
}

export function PhotoFormFields({ form, categories, onReloadCategories }: PhotoFormFieldsProps) {
  return (
    <>
      <TextField label="Cím" autoComplete="off" required {...form.fieldProps('title')} />
      <TextAreaField
        label="Leírás (nem kötelező)"
        rows={4}
        help="Legfeljebb 2000 karakter: hol, mikor, mivel készült."
        {...form.fieldProps('description')}
      />
      <div>
        <SelectField
          label="Kategória"
          required
          help={categories.isError ? 'A kategóriák listája nem töltődött be.' : undefined}
          {...form.fieldProps('categoryId')}
        >
          <option value="">Válassz…</option>
          {categories.data?.map((category) => (
            <option key={category.id} value={String(category.id)}>
              {category.name}
            </option>
          ))}
        </SelectField>
        {categories.isError && (
          <Button onClick={onReloadCategories} busy={categories.isFetching} className="mt-2">
            Kategóriák újratöltése
          </Button>
        )}
      </div>
      <TextField
        label="Ár (Ft)"
        inputMode="numeric"
        autoComplete="off"
        required
        help={PRICE_HINT}
        className="max-w-xs"
        {...form.fieldProps('priceHuf')}
      />
    </>
  );
}
