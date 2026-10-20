import { Spinner } from './Spinner';

/**
 * Egész oldalas betöltésjelző (L26): az oldal első betöltése alatt (adatlap, profil, a munkamenet
 * ellenőrzése) a jelzés a tartalom helyén, fent áll, a nézet pedig a hajtásig ér – a lábléc így már
 * a betöltés alatt is a hajtás alatt van, és a megérkező tartalom nem tolja el (elrendezés-ugrás,
 * CLS). A magasság a keret méreteiből adódik: fejléc 4 rem + a fő tartalom 2×2,5 rem belső margója.
 * Forrás: web.dev – Optimize Cumulative Layout Shift (a betöltődő tartalom helyének előre foglalása),
 * https://web.dev/articles/optimize-cls (adaptálva)
 */
export function LoadingView({ text }: { text: string }) {
  return (
    <p className="flex min-h-[calc(100dvh-9rem)] items-start gap-2 text-sm text-fg-muted">
      <Spinner className="mt-0.5" />
      {text}
    </p>
  );
}
