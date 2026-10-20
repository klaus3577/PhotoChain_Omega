// „Nincs jogosultság” oldal: bejelentkezett, de nem adminisztrátor felhasználónak az adminoldalon. Nem
// irányít a belépésre (be van jelentkezve), és nem árulja el, mi van az oldalon.
import { House } from 'lucide-react';

import { ButtonLink } from '../components/ui/Button';
import { PageHeading } from '../components/ui/PageHeading';
import { usePageTitle } from '../hooks/usePageTitle';

export function ForbiddenPage() {
  usePageTitle('Nincs jogosultság');

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeading>Nincs jogosultságod</PageHeading>
      <p className="leading-7 text-fg-muted">Ezt az oldalt csak adminisztrátor nyithatja meg.</p>
      <ButtonLink to="/" variant="primary" icon={House}>
        Vissza a kezdőlapra
      </ButtonLink>
    </div>
  );
}
