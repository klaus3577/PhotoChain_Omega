// Az átlagos értékelés számmal és csillaggal (L17 stílusútmutató – „Értékelés”): „4,6 az 5-ből ·
// 12 értékelés”. A szám a lényeg, a csillagsor díszítő (a képernyőolvasó elől rejtett). Az adatlap
// (PhotoReviews) és a fotós profilja (ProfilePage) ugyanígy mutatja; átlag nélkül a hívó dönt, mit ír.
import { formatRating } from '../../lib/format';
import { RatingStars } from './RatingStars';

interface RatingSummaryProps {
  rating: { average: number; count: number };
  className?: string;
}

export function RatingSummary({ rating, className }: RatingSummaryProps) {
  return (
    <p className={className ?? 'inline-flex flex-wrap items-center gap-x-2 gap-y-1'}>
      <RatingStars value={rating.average} />
      <span className="font-semibold">
        {formatRating(rating.average)}
        <span className="sr-only"> az 5-ből</span>
      </span>
      <span className="text-sm text-fg-muted"> · {rating.count} értékelés</span>
    </p>
  );
}
