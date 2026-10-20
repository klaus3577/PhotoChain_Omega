// Fejlesztői komponenslap (/_komponensek): az UI-alapkomponensek élő bemutatója a stílusútmutató
// (docs/design/stilusutmutato.html) mintájára. Csak fejlesztői módban érhető el – a produktív buildbe
// nem kerül be (routes/router.ts, DEV_ROUTES).
import { Clock, EyeOff, ShieldCheck, ShoppingCart, TriangleAlert, Upload } from 'lucide-react';

import { Alert } from '../../components/ui/Alert';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeading } from '../../components/ui/PageHeading';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TextField } from '../../components/ui/TextField';
import { useAnnounce } from '../../components/ui/useAnnounce';
import { usePageTitle } from '../../hooks/usePageTitle';

export function ComponentsPage() {
  usePageTitle('UI-alapkomponensek');
  const announce = useAnnounce();

  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-3">
        <PageHeading>UI-alapkomponensek</PageHeading>
        <p className="leading-7 text-fg-muted">
          Fejlesztői bemutató: a felület építőkövei a design tokenekkel (L17). Ez az oldal a
          produktív buildben nem érhető el.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Gombok">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" icon={ShoppingCart}>
              Megvásárlom
            </Button>
            <Button variant="secondary" icon={Upload}>
              Feltöltés
            </Button>
            <Button>Mégse</Button>
            <Button variant="danger" icon={EyeOff}>
              Kép elrejtése
            </Button>
            <Button busy>Mentés…</Button>
            <Button disabled>Nem elérhető</Button>
            <ButtonLink to="/">Kezdőlap</ButtonLink>
          </div>
        </Card>

        <Card title="Űrlapmező">
          <div className="space-y-5">
            <TextField
              label="Cím"
              defaultValue="Hajnal a Balatonon"
              help="Legfeljebb 120 karakter."
            />
            <TextField
              label="Ár (Ft)"
              inputMode="numeric"
              defaultValue="150"
              help="Egész forint."
              error="Az ár legalább 175 Ft legyen."
            />
          </div>
        </Card>

        <Card title="Állapotjelvények">
          <div className="flex flex-wrap gap-3">
            <StatusBadge tone="trust" icon={ShieldCheck}>
              Hitelesítve
            </StatusBadge>
            <StatusBadge tone="caution" icon={Clock}>
              Rögzítés folyamatban
            </StatusBadge>
            <StatusBadge tone="danger" icon={TriangleAlert}>
              Sikertelen rögzítés
            </StatusBadge>
            <StatusBadge tone="neutral" icon={EyeOff}>
              Elrejtve
            </StatusBadge>
          </div>
        </Card>

        <Card title="Visszajelzés">
          <div className="space-y-4">
            <Alert tone="danger" title="A feltöltés nem sikerült.">
              Ez a kép (vagy módosított másolata) már szerepel a rendszerben.
            </Alert>
            <Alert tone="info" title="Tudnivaló:">
              A blokkláncos rögzítés néhány percig is eltarthat.
            </Alert>
            <Button onClick={() => announce('Próbabejelentés az élő régióban.')}>
              Bejelentés az élő régióban
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
