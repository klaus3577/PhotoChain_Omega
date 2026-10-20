// Választó látható címkével (L17): a súgó és a hiba a mező leírása (aria-describedby), hibánál
// aria-invalid, a hibaüzenet ikonnal és szöveggel – mint a TextField. A ref a választóra mutat (az
// űrlap a hibás mezőre teszi vele a fókuszt).
import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react';

import { cx } from '../../lib/cx';

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  help?: string;
  error?: string;
  ref?: Ref<HTMLSelectElement>;
  /** A választó opciói */
  children: ReactNode;
}

export function SelectField({
  label,
  help,
  error,
  className,
  ref,
  children,
  required,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-sugo` : undefined;
  const errorId = error ? `${id}-hiba` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        {...rest}
        ref={ref}
        id={id}
        // A kötelezőséget nem a natív required mondja: a Chrome a kötelező, még üres választót már
        // betöltéskor érvénytelennek jelentené az akadálymentességi fán (az űrlap maga ellenőriz)
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'mt-1.5 block min-h-10 w-full rounded-md border bg-canvas px-2.5 text-sm text-fg',
          error ? 'border-danger' : 'border-line-strong',
        )}
      >
        {children}
      </select>
      {help && (
        <p id={helpId} className="mt-1.5 text-sm text-fg-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 flex items-center gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
