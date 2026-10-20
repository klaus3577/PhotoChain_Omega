// Többsoros szövegmező látható címkével (L17): a súgó és a hiba a mező leírása (aria-describedby),
// hibánál aria-invalid, a hibaüzenet ikonnal és szöveggel – mint a TextField. A ref a mezőre mutat.
import { CircleAlert } from 'lucide-react';
import { useId, type Ref, type TextareaHTMLAttributes } from 'react';

import { cx } from '../../lib/cx';

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id'
> {
  label: string;
  help?: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextAreaField({
  label,
  help,
  error,
  className,
  ref,
  rows = 3,
  ...rest
}: TextAreaFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-sugo` : undefined;
  const errorId = error ? `${id}-hiba` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        {...rest}
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'mt-1.5 block w-full rounded-md border bg-canvas p-2.5 text-sm text-fg',
          error ? 'border-danger' : 'border-line-strong',
        )}
      />
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
