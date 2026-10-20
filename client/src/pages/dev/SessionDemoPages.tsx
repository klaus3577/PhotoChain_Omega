// Fejlesztői próbaoldalak a védett útvonalakhoz (/_vedett, /_admin): a valódi védett oldalak
// (feltöltés, vezérlőpult, admin – L21–L25) elkészültéig ezeken látszik és tesztelhető a
// ProtectedRoute és az AdminRoute. Csak fejlesztői módban részei az útvonalfának (routes/router.ts).
import { useAuth } from '../../auth/useAuth';
import { PageHeading } from '../../components/ui/PageHeading';
import { usePageTitle } from '../../hooks/usePageTitle';

function SessionSummary() {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return null;
  const { user } = auth;

  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="text-fg-muted">Bejelentkezve</dt>
      <dd>{user.displayName}</dd>
      <dt className="text-fg-muted">E-mail-cím</dt>
      <dd className="break-all">{user.email}</dd>
      <dt className="text-fg-muted">Szerepkör</dt>
      <dd>{user.role === 'ADMIN' ? 'adminisztrátor' : 'felhasználó'}</dd>
    </dl>
  );
}

export function ProtectedDemoPage() {
  usePageTitle('Védett oldal');

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeading>Védett oldal</PageHeading>
      <p className="leading-7 text-fg-muted">
        Fejlesztői próbaoldal: csak bejelentkezett felhasználó láthatja (ProtectedRoute).
      </p>
      <SessionSummary />
    </div>
  );
}

export function AdminDemoPage() {
  usePageTitle('Adminoldal');

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeading>Adminoldal</PageHeading>
      <p className="leading-7 text-fg-muted">
        Fejlesztői próbaoldal: csak adminisztrátor láthatja (AdminRoute).
      </p>
      <SessionSummary />
    </div>
  );
}
