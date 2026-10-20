import { useEffect } from 'react';

const APP_NAME = 'PhotoChain';

/**
 * A böngészőfül címe: „Oldal · PhotoChain” (a kezdőlapon is: „Galéria · PhotoChain”). Minden oldal
 * egyedi, leíró címet kap (WCAG 2.4.2), így a képernyőolvasó és az előzmények is megkülönböztetik.
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}
