// Az adminfelület (L25; L17 drótváz „Adminisztráció”): csak adminisztrátornak (AdminRoute) – a szerver
// minden kérésnél maga is ellenőrzi a szerepkört. Három, egymástól független lekérdezés: a platform
// statisztikája (kártyák), a felhasználók és a képek listája; a nézet az URL-ben van (adminParams.ts),
// a két lista szűrője és oldala külön paraméter, ezért a szűrés és a lapozás csak a saját listáját
// tölti újra (a másik a gyorsítótárból marad). Amíg a képek közt van regisztrációra váró, a lista
// 3 másodpercenként frissül (pollInterval.ts – mint a vezérlőpulton; az újrapróbálás az időkeretet
// újraindítja, mert egy már látott kép is várakozhat újra), és amikor egy várakozó kép hitelesítve
// lett vagy a regisztrációja sikertelen, az élő régió bemondja, a statisztika és a galéria is
// frissül (registrationOutcome.ts). A szűrés és a lapozás nem görgeti az oldal tetejére: a lista a
// helyén frissül.
// Forrás: TanStack Query – Paginated Queries (placeholderData: keepPreviousData),
// https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries; useQuery:
// refetchInterval (függvény alak), https://tanstack.com/query/latest/docs/framework/react/reference/useQuery (adaptálva)
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { adminKeys, getPlatformStats, listAdminPhotos, listAdminUsers } from '../api/admin.api';
import {
  type AdminParams,
  adminSearchParams,
  adminTitle,
  parseAdminParams,
  photosApiQuery,
  usersApiQuery,
} from '../admin/adminParams';
import { useRegistrationOutcome } from '../admin/registrationOutcome';
import { PhotosSection } from '../components/admin/PhotosSection';
import { StatCards } from '../components/admin/StatCards';
import { UsersSection } from '../components/admin/UsersSection';
import { pendingPhotoIds } from '../components/dashboard/ownPhotoStatus';
import { PageHeading } from '../components/ui/PageHeading';
import { usePageTitle } from '../hooks/usePageTitle';
import { createPollClock, pollIntervalOf } from '../upload/pollInterval';

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = parseAdminParams(searchParams);
  usePageTitle(adminTitle(params));
  // A lekérdezési ütem stoppere: akkor indul (újra), amikor új függő kép jelenik meg a listában,
  // vagy egy újrapróbálás indul
  const [clock] = useState(createPollClock);

  const stats = useQuery({
    queryKey: adminKeys.stats(),
    queryFn: ({ signal }) => getPlatformStats(signal),
  });
  const usersQuery = usersApiQuery(params);
  const users = useQuery({
    queryKey: adminKeys.usersPage(usersQuery),
    queryFn: ({ signal }) => listAdminUsers(usersQuery, signal),
    placeholderData: keepPreviousData,
  });
  const photosQuery = photosApiQuery(params);
  const photos = useQuery({
    queryKey: adminKeys.photosPage(photosQuery),
    queryFn: ({ signal }) => listAdminPhotos(photosQuery, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const pending = pendingPhotoIds(query.state.data?.photos);
      clock.trackPending(pending);
      return pollIntervalOf({
        pending: pending.length > 0,
        elapsedMs: clock.elapsedMs(),
        error: query.state.error,
      });
    },
  });
  useRegistrationOutcome(photos.data?.photos, photosQuery, photos.isPlaceholderData);

  const update = (next: AdminParams) =>
    setSearchParams(adminSearchParams(next), { preventScrollReset: true });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <PageHeading>Adminisztráció</PageHeading>
        <p className="leading-7 text-fg-muted">
          Felhasználók tiltása, képek moderálása és a lánc-regisztráció újrapróbálása.
        </p>
      </div>
      <StatCards query={stats} />
      <UsersSection params={params} query={users} onChange={update} />
      <PhotosSection
        params={params}
        query={photos}
        stats={stats.data}
        onChange={update}
        onRetryStarted={() => clock.restart()}
      />
    </div>
  );
}
