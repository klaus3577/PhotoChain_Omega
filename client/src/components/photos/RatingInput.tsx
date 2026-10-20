// Csillagos értékelés bevitele (L17 stílusútmutató – „Értékelés”, bevitel; L23): natív rádiócsoport
// (fieldset + legend) „1 csillag” … „5 csillag” címkével – nyilakkal is választható, és egyetlen
// értéket jelent be; a csillagok kitöltése (1-től a választottig) a kliens állapota. Fekete csillag,
// nem sárga: a minimalista palettában marad, és az üres csillag kerete is eléri a 3:1-et. A hiba a
// csoport alatt, ikonnal és szöveggel, és minden rádió leírása (aria-describedby); a kötelezőséget és
// a hibát a csoport (fieldset, role="radiogroup") hordozza – az ARIA szerint az aria-required és az
// aria-invalid a radiogroup-é, nem az egyes rádióké (jsx-a11y, L26; WCAG 3.3.1). A natív required-et a
// Chrome már betöltéskor érvénytelennek mutatná (mint a választónál, L21). A ref az első rádióra mutat.
// Forrás: W3C WAI-ARIA APG – Radio Group Pattern (natív rádiógombok is),
// https://www.w3.org/WAI/ARIA/apg/patterns/radio/; MDN – <fieldset>,
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/fieldset (adaptálva)
import { CircleAlert, Star } from 'lucide-react';
import { useId, type ChangeEvent, type Ref } from 'react';

import { cx } from '../../lib/cx';
import { MAX_RATING, MIN_RATING } from '../../reviews/reviewValidation';

const STARS = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, index) => MIN_RATING + index);

interface RatingInputProps {
  /** A csoport címe (legend) */
  legend: string;
  /** A választott csillag szövegként („4”), üresen nincs választás – az űrlap-hook értéke */
  value: string;
  error?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Az első rádióra (a fókuszhoz) */
  ref?: Ref<HTMLInputElement>;
}

export function RatingInput({ legend, value, error, onChange, ref }: RatingInputProps) {
  const id = useId();
  const errorId = error ? `${id}-hiba` : undefined;
  const selected = Number(value) || 0;

  return (
    <fieldset role="radiogroup" aria-required="true" aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1.5 flex gap-0.5">
        {STARS.map((star) => (
          <label key={star} className="cursor-pointer p-0.5">
            <input
              ref={star === MIN_RATING ? ref : undefined}
              type="radio"
              name={id}
              value={String(star)}
              checked={selected === star}
              onChange={onChange}
              aria-describedby={errorId}
              className="peer sr-only"
            />
            <span className="sr-only">{star} csillag</span>
            <Star
              aria-hidden="true"
              className={cx(
                'size-7 rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                star <= selected ? 'fill-current text-fg' : 'text-line-strong',
              )}
            />
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1 flex items-center gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  );
}
