// Hivatkozás a blokklánc-böngészőre (L20 tanúsítvány, L21 állapotkártya): új lapon nyílik, a hivatkozó
// nem megy át. A neve a látható szöveggel kezdődik (WCAG 2.5.3), megmondja, mit nyit meg, és hogy új
// lapon. A HexValue a rövidített hexa értéket adja – ha van böngészőoldala, hivatkozásként.
import { ExternalLink } from 'lucide-react';

import { shortenHex } from '../../lib/format';

interface ExplorerLinkProps {
  href: string;
  text: string;
  /** Mit nyit meg (pl. „a tranzakció”) – a hivatkozáslistában is érthető legyen */
  target: string;
}

export function ExplorerLink({ href, text, target }: ExplorerLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${text} – ${target} megnyitása az Etherscanen (új lapon)`}
      className="inline-flex items-center gap-1 font-mono text-fg underline underline-offset-2 hover:text-primary"
    >
      {text}
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
    </a>
  );
}

/** Hexa érték: ha van böngészőoldala, oda mutató hivatkozás, különben szöveg. */
export function HexValue({
  value,
  url,
  target,
}: {
  value: string;
  url: string | null;
  target: string;
}) {
  const shown = shortenHex(value, 4);
  return url === null ? (
    <span className="font-mono">{shown}</span>
  ) : (
    <ExplorerLink href={url} text={shown} target={target} />
  );
}
