/**
 * A lista első betöltése alatt a táblázat helyét foglaló váz (L26): a megérkező táblázat így nem tolja
 * el az alatta lévő szakaszt (elrendezés-ugrás, CLS). Dekoratív – a betöltést a találatszám sora
 * mondja el (ListSummary). A magasság a teljes oldal (10 sor) táblázatáé.
 */
export function ListPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-[30rem] rounded-lg border border-line bg-surface motion-safe:animate-pulse"
    />
  );
}
