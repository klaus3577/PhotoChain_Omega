// Hibaoldal (útvonal-ErrorBoundary): ha egy oldal megjelenítése közben hiba történik, a layouton belül
// általános üzenet jelenik meg. A hiba részletei (üzenet, veremkivonat) nem kerülnek a felületre – az
// a felhasználónak nem segít, a támadónak viszont belső információt adhatna. A hiba útvonalváltás
// nélkül is bekövetkezhet (pl. egy gombnyomásra): a fókusz ekkor egy eltűnt elemen maradna, ezért a
// hibaoldal címére kerül – így a képernyőolvasó is jelzi, hogy az oldal helyett hibaüzenet áll.
// Ha egyetlen útvonal sem illeszkedik (a „*” sem – pl. sortörést tartalmazó címnél), a React Router
// 404-es hibaválaszt ad: ilyenkor a 404-oldal jelenik meg.
// Forrás: React Router – Error Boundaries (isRouteErrorResponse), https://reactrouter.com/how-to/error-boundary (adaptálva)
import { House } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { ButtonLink } from '../components/ui/Button';
import { PageHeading } from '../components/ui/PageHeading';
import { usePageTitle } from '../hooks/usePageTitle';
import { focusElement } from '../lib/focus';
import { NotFoundPage } from './NotFoundPage';

const HTTP_NOT_FOUND = 404;

interface RouteErrorPageProps {
  /** Gyökérszinten (a layout helyett) jelenik meg – a kezdőlapra ekkor teljes újratöltés visz */
  atRoot?: boolean;
}

export function RouteErrorPage({ atRoot = false }: RouteErrorPageProps) {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === HTTP_NOT_FOUND) {
    return <NotFoundPage reloadDocument={atRoot} />;
  }
  return <UnexpectedError />;
}

function UnexpectedError() {
  usePageTitle('Hiba');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (headingRef.current) focusElement(headingRef.current);
  }, []);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeading ref={headingRef}>Váratlan hiba történt</PageHeading>
      <p className="leading-7 text-fg-muted">
        Az oldal megjelenítése közben hiba történt. Töltsd újra az oldalt, vagy térj vissza a
        kezdőlapra.
      </p>
      {/* Teljes újratöltés: váratlan hiba után ez a biztos helyreállás, és a böngésző a megszokott
          módon kezeli a fókuszt (kliensoldali navigációnál ugyanarra az útvonalra elveszne) */}
      <ButtonLink to="/" reloadDocument variant="primary" icon={House}>
        Vissza a kezdőlapra
      </ButtonLink>
    </div>
  );
}

/** A gyökérszintű hibaoldal (ha maga a layout hibás): fejléc nélkül is legyen fő tartalom (main). */
export function RootErrorPage() {
  return (
    <main id="tartalom" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <RouteErrorPage atRoot />
    </main>
  );
}
