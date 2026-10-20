// Ha a szerver vendégnek látja a nézőt (pl. lejárt vagy letiltott munkamenet – a választ úgy adta,
// mintha nem lenne süti), a kliens viszont még bejelentkezettnek tudja, a munkamenet újraellenőrzése
// (GET /api/auth/me) feloldja az ellentmondást: a megszűnt munkamenet kijelentkezett állapot lesz. Így
// pl. a „Megveszem” a belépő oldalra visz, nem zsákutcába – a belépő oldal a bejelentkezettet
// visszairányítaná.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { authQueryKey } from '../api/auth.api';
import { useAuth } from './useAuth';

/** seenAsGuest: a szerver legutóbbi válasza szerint a néző vendég. */
export function useSessionRecheck(seenAsGuest: boolean): void {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const contradicts = seenAsGuest && auth.status === 'authenticated';

  useEffect(() => {
    if (contradicts) void queryClient.invalidateQueries({ queryKey: authQueryKey });
  }, [contradicts, queryClient]);
}
