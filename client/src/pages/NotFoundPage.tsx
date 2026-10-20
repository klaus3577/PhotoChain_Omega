// 404-oldal a nem létező címekre. A keresett útvonal szövegként jelenik meg (a React escape-eli, HTML
// nem kerül az oldalba); a százalékkódolt (pl. ékezetes) cím olvasható formában, a hibás kódolású
// változatlanul. Mivel a címet bárki összeállíthatja és továbbküldheti, a vezérlő- és láthatatlan
// formázókarakterek (pl. jobbról balra váltás) kimaradnak, a hosszú cím pedig rövidítve jelenik meg –
// így a cím nem írhat megtévesztő szöveget az oldalba.
import { House } from 'lucide-react';
import { useLocation } from 'react-router';

import { ButtonLink } from '../components/ui/Button';
import { PageHeading } from '../components/ui/PageHeading';
import { usePageTitle } from '../hooks/usePageTitle';

const MAX_PATH_LENGTH = 100;

/** Vezérlőkarakterek (Cc) és láthatatlan formázókarakterek (Cf) */
const INVISIBLE_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;

function readablePath(pathname: string): string {
  let decoded: string;
  try {
    decoded = decodeURI(pathname);
  } catch {
    decoded = pathname;
  }
  // Kódpontonként (Array.from), hogy a rövidítés ne vágjon ketté egy karaktert
  const characters = Array.from(decoded.replace(INVISIBLE_CHARACTERS, ''));
  return characters.length > MAX_PATH_LENGTH
    ? `${characters.slice(0, MAX_PATH_LENGTH).join('')}…`
    : characters.join('');
}

interface NotFoundPageProps {
  /** A kezdőlapra teljes újratöltéssel visz (gyökérszintű hibaoldalon, ahol nincs layout) */
  reloadDocument?: boolean;
}

export function NotFoundPage({ reloadDocument = false }: NotFoundPageProps) {
  usePageTitle('Az oldal nem található');
  const { pathname } = useLocation();

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeading>Az oldal nem található</PageHeading>
      <p className="leading-7 text-fg-muted">
        A keresett cím (
        <code className="font-mono text-sm break-all text-fg">{readablePath(pathname)}</code>) nem
        létezik, vagy már nem érhető el.
      </p>
      <ButtonLink to="/" reloadDocument={reloadDocument} variant="primary" icon={House}>
        Vissza a kezdőlapra
      </ButtonLink>
    </div>
  );
}
