// A megszakított fizetés oldala (L22, terv 3.3): a Stripe ide irányít vissza, ha a vásárló a fizetési
// oldalon a visszalépést választja (/checkout/cancel?photoId=…). Nem történt terhelés; a megkezdett
// rendelés a szerveren magától lejár (a Stripe-munkamenet 31 perc után), újabb vásárláskor új indul,
// vagy a még nyitott munkamenet folytatódik – a felhasználónak nincs teendője. A kép azonosítója csak
// a szerver formájában (UUID) ad hivatkozást; különben csak a galéria marad.
import { ArrowLeft } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { isPhotoId } from '../api/photos.api';
import { ButtonLink } from '../components/ui/Button';
import { PageHeading } from '../components/ui/PageHeading';
import { usePageTitle } from '../hooks/usePageTitle';

const TITLE = 'A fizetés megszakadt';

export function CheckoutCancelPage() {
  usePageTitle(TITLE);
  const [searchParams] = useSearchParams();
  const photoId = searchParams.get('photoId');
  const backToPhoto = photoId !== null && isPhotoId(photoId);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeading>{TITLE}</PageHeading>
      <p className="leading-7 text-fg-muted">
        Nem történt terhelés. A képet később is megveheted – a megkezdett fizetés magától lejár,
        nincs vele teendőd.
      </p>
      <div className="flex flex-wrap gap-2">
        {backToPhoto && (
          <ButtonLink to={`/photos/${photoId}`} variant="primary" icon={ArrowLeft}>
            Vissza a képhez
          </ButtonLink>
        )}
        <ButtonLink to="/">Galéria böngészése</ButtonLink>
      </div>
    </div>
  );
}
