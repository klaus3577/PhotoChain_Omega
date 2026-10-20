// Védett útvonalak (React Router layout-útvonal): bejelentkezés nélkül a belépésre irányít – a
// megnyitott oldalt az útvonal-állapotban megjegyzi, belépés után oda tér vissza –, az AdminRoute a nem
// admin felhasználónak „nincs jogosultság” oldalt mutat. Amíg a munkamenet ellenőrzése tart, ezt
// jelzi; ha az ellenőrzés nem sikerül (pl. szerverhiba), nem dobja ki a felhasználót, hanem
// újrapróbálást kínál. A jogosultságot a szerver minden kérésnél maga is ellenőrzi – ez csak a felület.
// Forrás: React Router – Navigate, Outlet, https://reactrouter.com/api/components/Navigate (adaptálva)
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import type { Role } from '../api/auth.api';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { LoadingView } from '../components/ui/LoadingView';
import { PageHeading } from '../components/ui/PageHeading';
import { Spinner } from '../components/ui/Spinner';
import { useAnnounce } from '../components/ui/useAnnounce';
import { usePageTitle } from '../hooks/usePageTitle';
import { focusPageHeading } from '../lib/focus';
import { errorText } from '../lib/text';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import type { AuthState } from './authContext';
import type { AuthRedirectState } from './session';
import { useAuth } from './useAuth';

/**
 * Az ellenőrzés alatt nincs oldalcím (h1): a fókusz a megjelenő oldal címére kerül majd. A nézet a
 * hajtásig ér, hogy a megjelenő oldal ne tolja el a láblécet (CLS – L26).
 */
function SessionCheckView() {
  usePageTitle('A bejelentkezés ellenőrzése');

  return <LoadingView text="A bejelentkezés ellenőrzése…" />;
}

// Az újrapróbálás gombja végig a helyén marad (ellenőrzés közben foglalt), így a fókusz rajta marad
// (WCAG 2.4.3); az ellenőrzést az élő régió jelenti be, az új hibát az új riasztás (role="alert",
// minden hibánál új elem).
function SessionErrorView({ auth }: { auth: Extract<AuthState, { status: 'error' }> }) {
  usePageTitle('Az oldal most nem nyitható meg');
  const announce = useAnnounce();

  const retry = () => {
    announce('Ellenőrzés folyamatban…');
    auth.retry();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeading>Az oldal most nem nyitható meg</PageHeading>
      {auth.retrying ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner />A bejelentkezés ellenőrzése…
        </p>
      ) : (
        <Alert key={auth.failedAt} tone="danger" title="A bejelentkezés ellenőrzése nem sikerült.">
          {errorText(auth.error)}
        </Alert>
      )}
      <Button icon={RefreshCw} busy={auth.retrying} onClick={retry}>
        Újrapróbálás
      </Button>
    </div>
  );
}

/**
 * A várakozás végén megjelenő oldal címére teszi a fókuszt, ha közben elveszett: a sikeres
 * újrapróbálás után a gomb eltűnt, vagy az ellenőrzés alatt megnyitott oldalon a fókusz a fő
 * tartalomra került (ott még nem volt cím). Az első betöltéskor – mint a useRouteFocus – nem mozdítja.
 * Ha a felhasználó az újrapróbálás közben máshová vitte a fókuszt, ott hagyja, és bejelenti az
 * eredményt (különben a megjelenő oldalról nem szerezne tudomást).
 */
function useHeadingFocusAfterCheck(status: AuthState['status']) {
  const previous = useRef(status);
  const announce = useAnnounce();

  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    // A belépésre irányításnál az útvonalváltás teszi a fókuszt a belépő oldal címére
    if (before === status || status === 'anonymous') return;
    const active = document.activeElement;
    const main = document.getElementById('tartalom');
    if (active === main || (before === 'error' && active === document.body)) focusPageHeading();
    else if (before === 'error') announce('Az oldal betöltődött.');
  }, [status, announce]);
}

/**
 * Felhasználóváltás a háttérben (a munkamenet másik felhasználóra cserélődött): az oldal újraindul
 * (Outlet key) – ha a fókusz az eltűnt tartalmon volt, az oldal címére kerül, és az élő régió elmondja,
 * mi történt.
 */
function useUserSwitchNotice(userId: string | null) {
  const announce = useAnnounce();
  const seenUserId = useRef(userId);
  useEffect(() => {
    const previous = seenUserId.current;
    seenUserId.current = userId;
    if (userId === null || previous === null || previous === userId) return;
    if (document.activeElement === document.body) focusPageHeading();
    announce('A munkamenet megváltozott, az oldal újraindult.');
  }, [userId, announce]);
}

function SessionGate({ role }: { role?: Role }) {
  const auth = useAuth();
  const location = useLocation();
  useHeadingFocusAfterCheck(auth.status);
  useUserSwitchNotice(auth.status === 'authenticated' ? auth.user.id : null);

  if (auth.status === 'loading') return <SessionCheckView />;
  if (auth.status === 'error') return <SessionErrorView auth={auth} />;
  if (auth.status === 'anonymous') {
    const state: AuthRedirectState = { from: location, required: true };
    return <Navigate to="/login" replace state={state} />;
  }
  if (role && auth.user.role !== role) return <ForbiddenPage />;
  // Felhasználóváltáskor (a munkamenet a háttérben cserélődött) az oldal újraindul: az előző felhasználó
  // félbehagyott űrlapja, kiválasztott képe nem marad a következőnek (közös gép – sessionCache.ts)
  return <Outlet key={auth.user.id} />;
}

/** Csak bejelentkezett felhasználónak (feltöltés, vezérlőpult – L21, L22). */
export function ProtectedRoute() {
  return <SessionGate />;
}

/** Csak adminisztrátornak (L25). */
export function AdminRoute() {
  return <SessionGate role="ADMIN" />;
}
