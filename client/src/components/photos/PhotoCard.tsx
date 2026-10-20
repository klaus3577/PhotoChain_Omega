// A galéria fotókártyája (L17 stílusútmutató – „Fotókártya”): vízjeles bélyegkép, a cím a hivatkozás
// (címsor), fotós, ár, átlagos értékelés és a „Hitelesítve” pajzs – a galériában csak hitelesített kép
// szerepel, a pajzs ezt teszi láthatóvá. A kattintható felület a teljes kártya (a hivatkozás ::after
// rétege), a fókuszkeret is a kártyán jelenik meg; a bélyegkép alt="" (a cím leírja).
// Forrás: Inclusive Components – Cards (a „pseudo-content trick”),
// https://inclusive-components.design/cards/ (adaptálva)
import { ShieldCheck, Star } from 'lucide-react';
import { Link } from 'react-router';

import type { RatingSummary } from '../../api/guards';
import type { PhotoListItem } from '../../api/photos.api';
import { formatPrice, formatRating } from '../../lib/format';
import { PhotoImage } from './PhotoImage';

/** Átlag és darabszám: „★ 4,6 (12)” – a képernyőolvasónak „Értékelés: 4,6 (12 értékelés)”. */
function CardRating({ rating }: { rating: RatingSummary }) {
  if (rating.average === null) {
    return <span className="text-sm text-fg-muted">nincs értékelés</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star aria-hidden="true" className="size-4 fill-current" />
      <span className="sr-only">Értékelés: </span>
      {formatRating(rating.average)}
      <span className="text-fg-muted">
        {' '}
        ({rating.count}
        <span className="sr-only"> értékelés</span>)
      </span>
    </span>
  );
}

interface PhotoCardProps {
  photo: PhotoListItem;
  /** A kártya címsorának szintje: a galériában h2, egy h2 alatti szakaszban (pl. a profilon) h3 */
  headingLevel?: 2 | 3;
}

export function PhotoCard({ photo, headingLevel = 2 }: PhotoCardProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-lg border border-line bg-canvas shadow-card has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus">
      {/* A rejtett túlcsordulás miatt az álló kép sem nyújtja meg a dobozt: a 4:3 arány marad,
          a képet az object-cover vágja */}
      <div className="aspect-[4/3] overflow-hidden bg-surface">
        <PhotoImage
          src={photo.thumbnailUrl}
          alt=""
          width={photo.width}
          height={photo.height}
          className="object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <Heading className="line-clamp-2 font-medium break-words">
          <Link to={`/photos/${photo.id}`} className="outline-none after:absolute after:inset-0">
            {photo.title}
          </Link>
        </Heading>
        <p className="truncate text-sm text-fg-muted">{photo.owner.displayName}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-lg font-semibold tabular-nums">{formatPrice(photo.priceHuf)}</span>
          <CardRating rating={photo.rating} />
        </div>
        {photo.status === 'REGISTERED' && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-trust-700">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Hitelesítve
          </p>
        )}
      </div>
    </article>
  );
}
