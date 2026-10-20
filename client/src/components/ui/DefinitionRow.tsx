// Forrás: W3C WAI – Understanding SC 1.4.10 Reflow, https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
// (adaptálva)
import type { ReactNode } from 'react';

/**
 * Egy sor az adatlistában (dl): a megnevezés balra, az érték jobbra; ha egy sorban nem férnek el (320
 * képpontos képernyő, 400%-os nagyítás – WCAG 1.4.10), az érték a megnevezés alá kerül, és a hosszú,
 * töretlen érték (hash) is tördelődik. A tanúsítvány (L20) és az ellenőrzés eredménye (L24) használja.
 */
export function DefinitionRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="min-w-0 text-fg-muted">{term}</dt>
      <dd className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1 text-right wrap-anywhere">
        {children}
      </dd>
    </div>
  );
}
