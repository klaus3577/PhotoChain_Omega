// Regisztrációs oldal (L19): megjelenített név, e-mail-cím és új jelszó – a szerver szabályait követő
// kliensoldali ellenőrzéssel, súgóval a mezők alatt. A szerver mezőhibái (foglalt e-mail-cím,
// validáció) a megfelelő mező mellé kerülnek, és oda ugrik a fókusz; más hiba riasztásként jelenik
// meg. A sikeres regisztráció egyben be is jelentkeztet, és oda visz, ahonnan a felhasználó jött – a
// bejelentés ott, a fókusz áthelyezése után hangzik el.
import { Link, Navigate, useLocation } from 'react-router';

import { isAuthRequired, redirectTarget } from '../auth/session';
import { useAuth } from '../auth/useAuth';
import { useRegister } from '../auth/useAuthActions';
import { REGISTER_FIELDS, validateRegister } from '../auth/validation';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { PageHeading } from '../components/ui/PageHeading';
import { PasswordField } from '../components/ui/PasswordField';
import { TextField } from '../components/ui/TextField';
import { useAnnounce } from '../components/ui/useAnnounce';
import { useForm } from '../hooks/useForm';
import { usePageTitle } from '../hooks/usePageTitle';

export function RegisterPage() {
  usePageTitle('Regisztráció');
  const auth = useAuth();
  const location = useLocation();
  const announce = useAnnounce();
  const register = useRegister();
  const form = useForm(REGISTER_FIELDS, validateRegister);

  if (auth.status === 'authenticated') {
    return <Navigate to={redirectTarget(location.state) ?? '/'} replace />;
  }

  // A hívásonkénti visszahívás csak addig fut le, amíg az oldal látható (lásd LoginPage)
  const submit = form.handleSubmit(({ displayName, email, password }) =>
    register.mutate(
      { displayName: displayName.trim(), email: email.trim(), password },
      {
        onSuccess: (user) =>
          announce(`Sikeres regisztráció – bejelentkeztél, ${user.displayName}.`, {
            afterNavigation: true,
            visible: true,
          }),
        onError: form.showServerError,
      },
    ),
  );

  return (
    <div className="mx-auto max-w-md space-y-6">
      {/* A regisztráció oka közvetlenül a cím után: a címre kerülő fókusz után ezt hallja először */}
      <div className="space-y-3">
        <PageHeading>Regisztráció</PageHeading>
        {isAuthRequired(location.state) && (
          <Alert tone="info">A folytatáshoz regisztrálj vagy jelentkezz be.</Alert>
        )}
        <p className="leading-7 text-fg-muted">
          Hozz létre fiókot: feltöltheted a fotóidat, és vásárolhatsz. Minden mező kitöltése
          kötelező.
        </p>
      </div>
      {form.failure && (
        <Alert key={form.failure.id} tone="danger" title="A regisztráció nem sikerült.">
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
          label="Megjelenített név"
          autoComplete="nickname"
          help="Ez a név jelenik meg a képeid és az értékeléseid mellett."
          required
          {...form.fieldProps('displayName')}
        />
        <TextField
          label="E-mail-cím"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          {...form.fieldProps('email')}
        />
        <PasswordField
          label="Jelszó"
          autoComplete="new-password"
          help="Legalább 8 karakter. Jelszókezelő használatát javasoljuk."
          required
          {...form.fieldProps('password')}
        />
        <Button type="submit" variant="primary" busy={register.isPending} className="w-full">
          Regisztráció
        </Button>
      </form>
      <p className="text-sm text-fg-muted">
        Már van fiókod?{' '}
        <Link
          to="/login"
          state={location.state}
          className="font-medium text-fg underline underline-offset-2"
        >
          Lépj be
        </Link>
      </p>
    </div>
  );
}
