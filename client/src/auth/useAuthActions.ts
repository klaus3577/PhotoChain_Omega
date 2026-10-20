// Belépés, regisztráció és kijelentkezés (TanStack Query mutációk): a sikeres művelet a munkamenet
// gyorsítótárába írja az új állapotot – a fejléc, az oldalak és a védett útvonalak ebből frissülnek.
// A belépés és a regisztráció mutációja nem marad a gyorsítótárban (gcTime: 0): a beküldött jelszó a
// mutáció változói közt volna – így az oldal elhagyása után a memóriában sem marad.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { login, logout, register, type AuthUser } from '../api/auth.api';
import { useAnnounce } from '../components/ui/useAnnounce';
import { focusPageHeading } from '../lib/focus';
import { setSessionUser } from './sessionCache';

function useSetSession() {
  const queryClient = useQueryClient();
  return (user: AuthUser | null) => setSessionUser(queryClient, user);
}

export function useLogin() {
  const setSession = useSetSession();
  return useMutation({ mutationFn: login, gcTime: 0, onSuccess: (user) => setSession(user) });
}

/** Regisztráció – a szerver egyben be is jelentkeztet. */
export function useRegister() {
  const setSession = useSetSession();
  return useMutation({ mutationFn: register, gcTime: 0, onSuccess: (user) => setSession(user) });
}

export function useLogout() {
  const setSession = useSetSession();
  const navigate = useNavigate();
  const announce = useAnnounce();
  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      // Előbb a kezdőlapra, aztán szűnik meg a munkamenet – különben a még látható védett oldal a
      // belépésre irányítana. A router átmenetként (startTransition) frissít: a flushSync biztosítja,
      // hogy az új oldal a munkamenet törlése előtt ki is rajzolódjon. Feltétele, hogy a kezdőlapnak ne
      // legyen loadere, és ne lustán töltődjön (akkor a router a flushSync-et nem alkalmazza). A
      // kezdőlap az előzményekben az elhagyott oldal helyére lép (a Vissza nem a védett oldalra visz).
      // Az állapotjelzőből a folyamatban lévő műveletet őrző oldal (pl. a feltöltés – UploadPage) tudja,
      // hogy ez kijelentkezés: nem kér megerősítést, a műveletét megszakítja.
      await navigate('/', { replace: true, flushSync: true, state: { loggingOut: true } });
      setSession(null);
      // A fiókmenü eltűnt: ha vele a fókusz is elveszett, az oldal címére kerül – útvonalváltás nélkül
      // is (a kezdőlapon); ha a felhasználó közben máshová vitte, ott marad. A bejelentés csak ezután
      // hangzik el (a fókuszváltás megszakíthatná).
      window.setTimeout(() => {
        if (document.activeElement === document.body) focusPageHeading();
        announce('Kijelentkeztél.', { visible: true });
      }, 0);
    },
  });
}
