// Automatikus akadálymentességi ellenőrzés a komponenstesztekben (axe-core, WCAG 2.2 A/AA szabályok).
// Teljes oldalnál a „best-practice” szabályok is futnak (tájékozódási pontok, címsorrend, egy h1) – egy
// önálló komponensnél ezek értelmetlenek (nincs körülötte oldal). A színkontrasztot a jsdom nem tudja
// kiszámolni (nincs elrendezés) – azt a tools/design ellenőrzi. Az axe nem látja a React
// eseménykezelőit (pl. kattintható div) – ezt a kódáttekintés pótolja.
// Forrás: Deque – axe-core API (axe.run, runOnly), https://github.com/dequelabs/axe-core/blob/develop/doc/API.md (adaptálva)
import axe from 'axe-core';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** A talált szabálysértések röviden („szabály: elem”) – üres tömb, ha nincs. */
export async function axeViolations(
  container: Element,
  { page = false }: { page?: boolean } = {},
): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: page ? [...WCAG_TAGS, 'best-practice'] : WCAG_TAGS },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
}
