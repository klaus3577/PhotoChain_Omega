// Gomb és gombstílusú hivatkozás (L17 stílusútmutató). Egy nézetben egyetlen elsődleges (piros) gomb
// van; a veszélyes művelet körvonalas. Folyamatban lévő műveletnél aria-disabled (nem disabled, mert az
// a fókuszt elvenné), a kattintás hatástalan, és a töltésjelző forgása, illetve a színátmenet csak
// akkor működik, ha a felhasználó nem kért kevesebb mozgást. A gomb legalább 40 px magas (WCAG 2.5.8),
// a magasság min-h (WCAG 1.4.12).
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, MouseEvent, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';

import { cx } from '../../lib/cx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

const BASE =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium motion-safe:transition-colors';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-black text-white hover:bg-neutral-800',
  outline: 'border border-line-strong bg-canvas text-fg hover:bg-surface',
  danger: 'border border-danger bg-canvas text-danger hover:bg-danger-surface',
};

const BUSY = 'cursor-progress border border-line bg-surface text-fg-muted';
const DISABLED =
  'disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-fg-muted';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Dekoratív ikon a felirat előtt (a gomb neve a felirat) */
  icon?: LucideIcon;
  /** Folyamatban lévő művelet: aria-disabled, töltésjelző, a kattintás hatástalan */
  busy?: boolean;
  /** A gombra (pl. a fókusz visszaadásához) */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'outline',
  icon: Icon,
  busy = false,
  type = 'button',
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      type={type}
      aria-disabled={busy || undefined}
      className={cx(BASE, busy ? BUSY : VARIANTS[variant], DISABLED, className)}
      onClick={handleClick}
    >
      {busy ? <Spinner /> : Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  className?: string;
}

/** Útvonalra vivő hivatkozás gombként (a navigáció hivatkozás marad, nem gomb). */
export function ButtonLink({
  variant = 'outline',
  icon: Icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link {...rest} className={cx(BASE, VARIANTS[variant], className)}>
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {children}
    </Link>
  );
}
