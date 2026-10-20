// A sorok műveleteinek állapota az admin táblázataiban (L25). Egy szakasz egy mutációval szolgál ki
// minden sort, a useMutation állapota viszont csak a legutóbbi hívásé: ezért a futó kérések sorait a
// mutációs gyorsítótárból olvassuk (useMutationState – minden folyamatban lévő kérés változója), a
// hibát pedig saját állapotban tartjuk (a később érkező hiba is megjelenik, és a hiba a sorhoz
// köthető). A hiba törlődik a következő sikeres műveletnél és a nézet (szűrő, oldal) váltásakor. A
// korlátozás (429) után a szerver kérte várakozás alatt az újrapróbálás gombjai foglaltak
// (useCooldown): minden fölösleges kérés a közös keretet is fogyasztja.
// Forrás: TanStack Query – useMutationState (a mutációk állapota kulcs és állapot szerint szűrve),
// https://tanstack.com/query/latest/docs/framework/react/reference/useMutationState (adaptálva)
import { type MutationKey, useMutationState } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export interface ActionError {
  /** A sor azonosítója, amelynek a művelete nem sikerült */
  id: string;
  /** A riasztás címe („A feloldás nem sikerült.”) */
  title: string;
  error: unknown;
  /** Minden új hiba új riasztás (újra elhangzik) */
  at: number;
}

export function useActionError(viewKey: string) {
  const [error, setError] = useState<ActionError | null>(null);
  const [seenKey, setSeenKey] = useState(viewKey);
  // A nézet váltásakor a régi hiba nem marad: a riasztás a megelőző listáról szólt
  if (viewKey !== seenKey) {
    setSeenKey(viewKey);
    setError(null);
  }
  return {
    error,
    fail: (id: string, title: string, cause: unknown) =>
      setError({ id, title, error: cause, at: Date.now() }),
    clear: () => setError(null),
  };
}

/** A futó mutációk (a kulcs alatt) sorainak azonosítói – a változó az elem, amelyen a művelet fut. */
export function usePendingIds(mutationKey: MutationKey): ReadonlySet<string> {
  const ids = useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (mutation) => (mutation.state.variables as { id: string }).id,
  });
  return new Set(ids);
}

/** Visszaszámlálás a szerver kérte várakozáshoz (Retry-After): amíg tart, a művelet nem indítható. */
export function useCooldown() {
  const [until, setUntil] = useState<number | null>(null);

  useEffect(() => {
    if (until === null) return;
    // A már lejárt határidő is időzítővel törlődik (az effektusban közvetlen setState nem kell)
    const timer = window.setTimeout(() => setUntil(null), Math.max(until - Date.now(), 0));
    return () => window.clearTimeout(timer);
  }, [until]);

  return {
    active: until !== null,
    start: (seconds: number) => setUntil(Date.now() + seconds * 1000),
  };
}
