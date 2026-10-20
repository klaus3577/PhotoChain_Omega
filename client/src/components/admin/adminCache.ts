// Az adminfelület gyorsítótárának frissítése egy művelet után (L25): a módosult sor azonnal a szerver
// válaszából frissül minden betöltött oldalon (setQueriesData), aztán a listák és a statisztika
// újratöltődnek – a szűrt lista összetétele és a darabszámok is változhattak. A galéria, az adatlap
// és a fotósprofil gyorsítótára is érvénytelenedik: a tiltott felhasználó képei és profilja, az
// elrejtett kép eltűnnek onnan, a feloldott, visszaállított kép visszakerül. A szerver hibája után a
// lista szintén újratöltődik: a módosítás meg is történhetett (hálózati hiba, hiba a végrehajtás
// után, váratlan válasz) – a kliens hibájánál (400) és a korlátozásnál (429) biztosan nem.
import type { QueryClient } from '@tanstack/react-query';

import {
  type AdminPhoto,
  type AdminPhotoPage,
  type AdminUser,
  type AdminUserPage,
  adminKeys,
} from '../../api/admin.api';
import { ApiError } from '../../api/http';
import { photoKeys } from '../../api/photos.api';
import { userKeys } from '../../api/users.api';

const invalidate = (queryClient: QueryClient, queryKey: readonly unknown[]) =>
  void queryClient.invalidateQueries({ queryKey });

/** A hiba után újra kell tölteni a listát (a módosítás meg is történhetett)? */
export const shouldRefreshAfterError = (error: unknown): boolean =>
  !(error instanceof ApiError && (error.status === 400 || error.status === 429));

/** A felhasználó sora a válaszból; a listák, a statisztika, a galéria, az adatlapok és a profil frissülnek. */
export function applyUserChange(queryClient: QueryClient, user: AdminUser): void {
  queryClient.setQueriesData<AdminUserPage>(
    { queryKey: adminKeys.users() },
    (current) =>
      current && {
        ...current,
        users: current.users.map((item) => (item.id === user.id ? user : item)),
      },
  );
  invalidate(queryClient, adminKeys.all());
  invalidate(queryClient, photoKeys.lists());
  invalidate(queryClient, photoKeys.details());
  invalidate(queryClient, userKeys.profile(user.id));
}

/** A kép sora a válaszból; a képek listája, a statisztika, a galéria és a kép adatlapja frissül. */
export function applyPhotoChange(queryClient: QueryClient, photo: AdminPhoto): void {
  queryClient.setQueriesData<AdminPhotoPage>(
    { queryKey: adminKeys.photos() },
    (current) =>
      current && {
        ...current,
        photos: current.photos.map((item) => (item.id === photo.id ? photo : item)),
      },
  );
  invalidate(queryClient, adminKeys.photos());
  invalidate(queryClient, adminKeys.stats());
  invalidate(queryClient, photoKeys.lists());
  invalidate(queryClient, photoKeys.detail(photo.id));
}

/**
 * Az újrapróbálás elfogadva: a sikertelen (vagy már várakozó) kép újra regisztrációra vár – a többi
 * adata változatlan; egy másik oldal elavult, rejtett példányához nem nyúl (a rejtett ⇔ hiddenBy
 * szabály megmarad).
 */
export function applyRetryStarted(queryClient: QueryClient, id: string): void {
  queryClient.setQueriesData<AdminPhotoPage>(
    { queryKey: adminKeys.photos() },
    (current) =>
      current && {
        ...current,
        photos: current.photos.map((item) =>
          item.id === id && (item.status === 'CHAIN_FAILED' || item.status === 'PENDING_CHAIN')
            ? { ...item, status: 'PENDING_CHAIN' as const, hiddenBy: null }
            : item,
        ),
      },
  );
  invalidate(queryClient, adminKeys.photos());
  invalidate(queryClient, adminKeys.stats());
  invalidate(queryClient, photoKeys.detail(id));
}
