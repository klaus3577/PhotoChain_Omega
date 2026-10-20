// Csillagok (L17 stílusútmutató – „Értékelés”): fekete csillag, nem sárga – a minimalista palettában
// marad, és az üres csillag kerete is eléri a 3:1-et. A szám mindig mellette áll („4,6 az 5-ből”), így a
// csillagok csak kiegészítik: a képernyőolvasó elől rejtettek – kivéve, ha a hívó nevet ad nekik
// (pl. egy értékelésnél „5 csillag az 5-ből”).
import { Star } from 'lucide-react';

import { cx } from '../../lib/cx';

const STARS = [1, 2, 3, 4, 5] as const;

interface RatingStarsProps {
  /** Az értékelés (1–5); az átlagnál a kitöltött csillagok száma a kerekített érték */
  value: number;
  /** Ha meg van adva, a csillagsor egyetlen kép ezzel a névvel; különben díszítő */
  label?: string;
  className?: string;
}

export function RatingStars({ value, label, className }: RatingStarsProps) {
  const filled = Math.round(value);
  const labelled =
    label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };

  return (
    <span {...labelled} className={cx('inline-flex shrink-0', className)}>
      {STARS.map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={cx('size-4', star <= filled ? 'fill-current text-fg' : 'text-line-strong')}
        />
      ))}
    </span>
  );
}
