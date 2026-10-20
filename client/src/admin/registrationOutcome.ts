// A várakozó képek kimenetének figyelése az adminfelületen (L25; a vezérlőpult registrationNotices
// mintájára): amikor egy regisztrációra váró kép a listában hitelesítve lett vagy a regisztrációja
// sikertelen – vagy a szűrt listából („Folyamatban”) eltűnt, mert az állapota megváltozott –, az élő
// régió bemondja (a jelvény váltása önmagában néma), a statisztika újratöltődik (a darabszámok
// változtak), a hitelesített kép megjelent a galériában (a galéria listái és az adatlapja
// érvénytelenednek). Csak ugyanazon lekérdezésen belül számít a változás: a szűrő vagy az oldal
// váltásakor eltűnő kép nem változott. A helykitöltő (régi) lista nem számít. Egy lekérdezésben több
// kép is változhat: az élő régió egy üzenetet tart, ezért egyetlen bemondás sorolja fel őket.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { type AdminPhoto, adminKeys } from '../api/admin.api';
import { photoKeys, type PhotoStatus } from '../api/photos.api';
import { useAnnounce } from '../components/ui/useAnnounce';
import { noticeOf } from '../dashboard/registrationNotices';

interface SeenPhoto {
  title: string;
  status: PhotoStatus;
}

interface SeenList {
  /** A lekérdezés (szűrő és oldal), amelyhez a lista tartozik */
  key: string;
  photos: Map<string, SeenPhoto>;
}

/** A várakozó képek sorsa a friss listában: hitelesítve, sikertelen, vagy kikerült a szűrt listából. */
function outcomesOf(previous: Map<string, SeenPhoto>, current: Map<string, SeenPhoto>) {
  const registered: string[] = [];
  const failed: string[] = [];
  const gone: string[] = [];
  const ids: string[] = [];
  for (const [id, before] of previous) {
    if (before.status !== 'PENDING_CHAIN') continue;
    const now = current.get(id);
    if (!now) gone.push(before.title);
    else if (now.status === 'REGISTERED') registered.push(before.title);
    else if (now.status === 'CHAIN_FAILED') failed.push(before.title);
    else continue;
    ids.push(id);
  }
  return { registered, failed, gone, ids };
}

export function useRegistrationOutcome(
  photos: readonly AdminPhoto[] | undefined,
  key: string,
  /** A régi lista látszik (lapozás, szűrés közben): nem számít */
  placeholder: boolean,
): void {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const seen = useRef<SeenList | null>(null);

  useEffect(() => {
    if (!photos || placeholder) return;
    const previous = seen.current;
    const current = new Map(
      photos.map((photo) => [photo.id, { title: photo.title, status: photo.status }]),
    );
    seen.current = { key, photos: current };
    if (!previous || previous.key !== key) return;

    const { registered, failed, gone, ids } = outcomesOf(previous.photos, current);
    if (ids.length === 0) return;
    void queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    for (const id of ids) void queryClient.invalidateQueries({ queryKey: photoKeys.detail(id) });
    if (registered.length > 0 || gone.length > 0) {
      void queryClient.invalidateQueries({ queryKey: photoKeys.lists() });
    }

    const messages: string[] = [];
    if (registered.length > 0) {
      messages.push(
        noticeOf(
          registered,
          (title) => `„${title}” hitelesítve a blokkláncon, és megjelent a galériában.`,
          'hitelesítve a blokkláncon, és megjelent a galériában',
        ),
      );
    }
    if (failed.length > 0) {
      messages.push(
        noticeOf(
          failed,
          (title) => `„${title}” regisztrációja nem sikerült – újrapróbálható.`,
          'regisztrációja nem sikerült – újrapróbálható',
        ),
      );
    }
    if (gone.length > 0) {
      messages.push(
        noticeOf(
          gone,
          (title) => `„${title}” már nem vár a regisztrációra; a szűrt listából kikerült.`,
          'már nem vár a regisztrációra; a szűrt listából kikerültek',
        ),
      );
    }
    // Látható értesítés: a sikertelen regisztráció figyelmeztetés, a listából kikerült kép tájékoztatás
    // (nem pipás siker – L26)
    const tone = failed.length > 0 ? 'warning' : gone.length > 0 ? 'info' : 'success';
    announce(messages.join(' '), { visible: true, tone });
  }, [photos, key, placeholder, queryClient, announce]);
}
