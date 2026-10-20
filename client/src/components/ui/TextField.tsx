// Szövegmező látható címkével (L17): a súgó és a hiba is a mező leírása (aria-describedby), hibánál
// aria-invalid, a hibaüzenet ikonnal és szöveggel – nem csak piros kerettel (WCAG 1.3.1, 1.4.1, 3.3.1).
// A mező után kiegészítő vezérlő tehető (pl. a jelszó megjelenítése – PasswordField): a Tab a mezőből
// rá visz, keskeny képernyőn a mező alá törik. A ref a beviteli mezőre mutat (az űrlap a hibás mezőre
// teszi vele a fókuszt).
import { CircleAlert } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

import { cx } from '../../lib/cx';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  help?: string;
  error?: string;
  /** A mező után (széles képernyőn mellette) megjelenő vezérlő */
  action?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, help, error, action, className, ref, ...rest }: TextFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-sugo` : undefined;
  const errorId = error ? `${id}-hiba` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  const input = (
    <input
      {...rest}
      ref={ref}
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cx(
        'block min-h-10 rounded-md border bg-canvas px-3 text-sm text-fg',
        error ? 'border-danger' : 'border-line-strong',
        action ? 'min-w-0 flex-1 basis-48' : 'mt-1.5 w-full',
      )}
    />
  );

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {action ? (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {input}
          {action}
        </div>
      ) : (
        input
      )}
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
