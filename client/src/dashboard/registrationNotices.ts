// A saját képek regisztrációjának figyelése a vezérlőpulton (L22): amíg van regisztrációra váró kép, a
// lista magától frissül (DashboardPage); amikor egy kép hitelesítve lesz, az élő régió bemondja, és a
// galéria listái érvénytelenednek (a kép megjelent a galériában); a sikertelen regisztrációt is
// bemondja – a jelvény pirosra váltása önmagában néma. Az oldal szintjén fut, hogy a másik fülön
// (Vásárlásaim) történt változás se maradjon el. Egy lekérdezésben több kép is változhat (egymás után
// feltöltött képek gyakran ugyanabba a blokkba kerülnek): az élő régió egy üzenetet tart, ezért egyetlen
// bemondás sorolja fel őket. Lapozáskor a még nem látott képek nem számítanak.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { type OwnPhotoListItem, photoKeys, type PhotoStatus } from '../api/photos.api';
import { useAnnounce } from '../components/ui/useAnnounce';

const quoted = (titles: string[]) => titles.map((title) => `„${title}”`).join(', ');

/** Egy képnél a címmel, többnél a darabszámmal és a felsorolással (az adminfelület is használja – L25) */
export function noticeOf(
  titles: string[],
  single: (title: string) => string,
  many: string,
): string {
  if (titles.length === 1) return single(titles[0]!);
  return `${titles.length} kép ${many}: ${quoted(titles)}.`;
}

export function useRegistrationNotices(photos: OwnPhotoListItem[] | undefined): void {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const seen = useRef(new Map<string, PhotoStatus>());

  useEffect(() => {
    if (!photos) return;
    const previous = seen.current;
    const registered: string[] = [];
    const failed: string[] = [];
    for (const photo of photos) {
      if (previous.get(photo.id) !== 'PENDING_CHAIN') continue;
      if (photo.status === 'REGISTERED') registered.push(photo.title);
      else if (photo.status === 'CHAIN_FAILED') failed.push(photo.title);
    }
    seen.current = new Map(photos.map((photo) => [photo.id, photo.status]));

    const messages: string[] = [];
    if (registered.length > 0) {
      messages.push(
        noticeOf(
          registered,
          (title) => `„${title}” hitelesítve a blokkláncon, és megjelent a galériában.`,
          'hitelesítve a blokkláncon, és megjelent a galériában',
        ),
      );
      void queryClient.invalidateQueries({ queryKey: photoKeys.lists() });
    }
    if (failed.length > 0) {
      messages.push(
        noticeOf(
          failed,
          (title) => `„${title}” regisztrációja nem sikerült – az adminisztrátor újrapróbálja.`,
          'regisztrációja nem sikerült – az adminisztrátor újrapróbálja',
        ),
      );
    }
    // Látható értesítés: a sikertelen regisztráció figyelmeztető tónussal (nem pipás siker – L26)
    if (messages.length > 0) {
      announce(messages.join(' '), {
        visible: true,
        tone: failed.length > 0 ? 'warning' : 'success',
      });
    }
  }, [photos, announce, queryClient]);
}
