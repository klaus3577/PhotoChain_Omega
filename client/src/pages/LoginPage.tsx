// Belépő oldal (L19): e-mail-cím és jelszó, kliensoldali ellenőrzéssel (a hiba a mező mellett, a
// fókusz az első hibás mezőre kerül), a szerver hibája riasztásként (hibás adatok, letiltott fiók,
// túl sok próbálkozás – a várakozás idejével). A mezők jelszókezelőhöz illő autocomplete-et kapnak,
// a beillesztés engedélyezett, kognitív teszt nincs (WCAG 3.3.8). Sikeres belépés után oda tér vissza,
// ahonnan a felhasználó jött (védett oldal vagy a fejléc hivatkozása) – a bejelentés ott, a fókusz
// áthelyezése után hangzik el; a már bejelentkezett felhasználót továbbirányítja.
import { Link, Navigate, useLocation } from 'react-router';

import { isAuthRequired, redirectTarget } from '../auth/session';
import { useAuth } from '../auth/useAuth';
import { useLogin } from '../auth/useAuthActions';
import { LOGIN_FIELDS, validateLogin } from '../auth/validation';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { PageHeading } from '../components/ui/PageHeading';
import { PasswordField } from '../components/ui/PasswordField';
import { TextField } from '../components/ui/TextField';
import { useAnnounce } from '../components/ui/useAnnounce';
import { useForm } from '../hooks/useForm';
import { usePageTitle } from '../hooks/usePageTitle';

export function LoginPage() {
  usePageTitle('Belépés');
  const auth = useAuth();
  const location = useLocation();
  const announce = useAnnounce();
  const login = useLogin();
  const form = useForm(LOGIN_FIELDS, validateLogin);

  if (auth.status === 'authenticated') {
    return <Navigate to={redirectTarget(location.state) ?? '/'} replace />;
  }

  // A hívásonkénti visszahívás csak addig fut le, amíg az oldal látható: ha a felhasználó a válasz előtt
  // elnavigált, a sikerüzenet nem kerül sorba (egy későbbi, idegen oldalon hangzana el)
  const submit = form.handleSubmit(({ email, password }) =>
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (user) =>
          announce(`Bejelentkeztél, ${user.displayName}.`, {
            afterNavigation: true,
            visible: true,
          }),
        onError: form.showServerError,
      },
    ),
  );

  return (
    <div className="mx-auto max-w-md space-y-6">
      {/* A belépés oka közvetlenül a cím után: a címre kerülő fókusz után ezt hallja először */}
      <div className="space-y-3">
        <PageHeading>Belépés</PageHeading>
        {isAuthRequired(location.state) && <Alert tone="info">A folytatáshoz jelentkezz be.</Alert>}
        <p className="leading-7 text-fg-muted">
          Lépj be a fiókodba – a feltöltéshez és a vásárláshoz szükséges.
        </p>
      </div>
      {form.failure && (
        <Alert key={form.failure.id} tone="danger" title="A belépés nem sikerült.">
          {form.failure.text}
        </Alert>
      )}
      <form noValidate onSubmit={submit} className="space-y-5">
        {form.fieldAlert && (
          <p key={form.fieldAlert.id} role="alert" className="sr-only">
            {form.fieldAlert.text}
          </p>
        )}
        <TextField
          label="E-mail-cím"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          {...form.fieldProps('email')}
        />
        <PasswordField
          label="Jelszó"
          autoComplete="current-password"
          required
          {...form.fieldProps('password')}
        />
        <Button type="submit" variant="primary" busy={login.isPending} className="w-full">
          Belépés
        </Button>
      </form>
      <p className="text-sm text-fg-muted">
        Még nincs fiókod?{' '}
        <Link
          to="/register"
          state={location.state}
          className="font-medium text-fg underline underline-offset-2"
        >
          Regisztrálj
        </Link>
      </p>
    </div>
  );
}
