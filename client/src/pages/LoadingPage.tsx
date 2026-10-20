import { LoadingView } from '../components/ui/LoadingView';

/**
 * Betöltésjelző egy lustán betöltött útvonal közvetlen megnyitásakor (a gyökérútvonal HydrateFallback-je):
 * ilyenkor a layout még nem jelenik meg, ezért saját fő tartalma (main) van.
 */
export function LoadingPage() {
  return (
    <main id="tartalom" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <LoadingView text="Betöltés…" />
    </main>
  );
}
