// Kapcsológomb-csoport a listák szűréséhez (L25; L17 drótváz „Adminisztráció”, 2. és 4. jegyzet): a
// választott szűrő aria-pressed="true" – a szín csak megerősít (nagy kontrasztú módban aláhúzás) –, a
// csoport neve mondja meg, mi szerint szűr. A nézet az URL-ben van, de a szűrés művelet (mint a galéria
// rendezése), ezért gomb, nem hivatkozás; a már választott szűrő gombja hatástalan.
// Forrás: W3C WAI-ARIA APG – Button Pattern (toggle button, aria-pressed),
// https://www.w3.org/WAI/ARIA/apg/patterns/button/ (adaptálva)
import { cx } from '../../lib/cx';

export interface FilterOption<Value extends string> {
  value: Value;
  label: string;
}

interface FilterGroupProps<Value extends string> {
  label: string;
  options: readonly FilterOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  /** Kerek címkék (chip) a képek állapotához; különben egybefüggő gombsor (segmented) */
  variant?: 'segmented' | 'chips';
}

const PRESSED = 'bg-black text-white forced-colors:underline';

export function FilterGroup<Value extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'segmented',
}: FilterGroupProps<Value>) {
  const chips = variant === 'chips';
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'flex flex-wrap text-sm',
        chips ? 'gap-2' : 'rounded-md border border-line-strong bg-canvas',
      )}
    >
      {options.map((option, index) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              if (!pressed) onChange(option.value);
            }}
            className={cx(
              'min-h-10 px-3 font-medium',
              chips
                ? cx('rounded-full border', pressed ? 'border-black' : 'border-line-strong')
                : cx(
                    'first:rounded-l-md last:rounded-r-md',
                    index > 0 && 'border-l border-line-strong',
                  ),
              pressed ? PRESSED : 'hover:bg-surface',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
