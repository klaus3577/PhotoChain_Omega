import type { ReactNode, Ref } from 'react';

interface PageHeadingProps {
  children: ReactNode;
  ref?: Ref<HTMLHeadingElement>;
}

/**
 * Az oldal címe (h1). Programból fókuszálható (tabIndex=-1): útvonalváltáskor a layout ide teszi a
 * fókuszt, így a képernyőolvasó az új oldal címével kezd (WCAG 2.4.3). Keretet nem kap: nem kezelőelem,
 * a fókusz csak a felolvasás kiindulópontja. A felhasználói cím (pl. egy fájlnévszerű, szóköz nélküli
 * képcím) keskeny képernyőn is tördelődik, nem lóg ki (WCAG 1.4.10).
 */
export function PageHeading({ children, ref }: PageHeadingProps) {
  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className="text-3xl font-semibold tracking-tight break-words focus:outline-none"
    >
      {children}
    </h1>
  );
}
