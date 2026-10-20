// Fejléc: logó (kezdőlap), fő navigáció és a fiókrész. A menüpontokat a lépések bővítik (feltöltés –
// L21, vezérlőpult – L22, ellenőrzés – L24, admin – L25) – halott hivatkozás nincs: a vezérlőpult csak
// bejelentkezve látszik (vendégnek a belépésre vinne), az admin csak adminisztrátornak (másnak „nincs
// jogosultság” oldalt adna). Az aktuális oldalt a NavLink
// aria-current="page" attribútummal is jelöli, nem csak aláhúzással. A fiókrész kijelentkezve Belépés
// és Regisztráció, bejelentkezve a fiókmenü; amíg a munkamenet ellenőrzése tart, üres (ne villanjon
// fel a rossz állapot). Ha az ellenőrzés nem sikerül (pl. szerverhiba), a belépési lehetőség látszik:
// a sikeres belépés úgyis rendezi az állapotot. Ha a fiókrész a fókusszal együtt cserélődik (a
// munkamenet a háttérben változott), a fókusz nem vész el.
import { useRef, type MouseEvent } from 'react';
import { Link, NavLink, useLocation } from 'react-router';

import { returnTo } from '../../auth/session';
import { useAuth } from '../../auth/useAuth';
import { useFocusRescueOnUnmount } from '../../hooks/useFocusRescue';
import { cx } from '../../lib/cx';
import { isModifiedClick } from '../../lib/pointer';
import { ButtonLink } from '../ui/Button';
import { AccountMenu } from './AccountMenu';

interface NavItem {
  to: string;
  label: string;
  /** Csak pontos egyezésnél aktív (a „/” különben minden oldalon az lenne) */
  end?: boolean;
}

/** Bejelentkezés nélkül is: a galéria és a nyilvános hitelesség-ellenőrző (L24) */
const PUBLIC_NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Galéria', end: true },
  { to: '/verify', label: 'Ellenőrzés' },
];
/** Csak bejelentkezve: a vendégnek a védett oldal a belépésre vinne (L22) */
const MEMBER_NAV_ITEMS: readonly NavItem[] = [{ to: '/dashboard', label: 'Vezérlőpult' }];
/** Csak adminisztrátornak (L25) */
const ADMIN_NAV_ITEMS: readonly NavItem[] = [{ to: '/admin', label: 'Admin' }];

/** Belépés és Regisztráció – a belépés után a felhasználó oda tér vissza, ahol a hivatkozásra kattintott. */
function GuestLinks() {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useFocusRescueOnUnmount(ref);
  const returnHere = returnTo(location);

  return (
    <div ref={ref} className="flex items-center gap-2">
      <ButtonLink to="/login" state={returnHere}>
        Belépés
      </ButtonLink>
      <ButtonLink to="/register" state={returnHere} variant="secondary">
        Regisztráció
      </ButtonLink>
    </div>
  );
}

export function Header() {
  const auth = useAuth();
  const location = useLocation();
  const authenticated = auth.status === 'authenticated';
  const admin = authenticated && auth.user.role === 'ADMIN';
  const navItems = [
    ...PUBLIC_NAV_ITEMS,
    ...(authenticated ? MEMBER_NAV_ITEMS : []),
    ...(admin ? ADMIN_NAV_ITEMS : []),
  ];
  const onUploadPage = location.pathname === '/upload';
  // Az aktuális oldalra mutató hivatkozás: a sima kattintás nem indít új navigációt (feltöltés közben
  // megerősítést sem kérne); a módosított kattintás (új lap) a böngészőé marad
  const onUploadClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onUploadPage && !isModifiedClick(event)) event.preventDefault();
  };

  return (
    <header className="border-b border-line bg-canvas">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 sm:px-6">
        <Link
          to="/"
          aria-label="PhotoChain – kezdőlap"
          className="inline-flex min-h-10 items-center text-lg font-semibold tracking-tight"
        >
          Photo<span className="text-primary">Chain</span>
        </Link>
        <nav aria-label="Fő navigáció">
          <ul className="flex flex-wrap items-center gap-x-6 text-sm font-medium">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cx(
                      'inline-flex min-h-10 items-center border-b-2',
                      isActive
                        ? 'border-primary text-fg'
                        : 'border-transparent text-fg-muted hover:text-fg',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {authenticated && (
            <>
              {/* A fejléc elsődleges gombja; keskeny képernyőn a fiókmenüből érhető el (variánssal rejtve: a
                  gomb saját inline-flex osztályát a sima „hidden” a kaszkádban nem írná felül) */}
              <ButtonLink
                to="/upload"
                variant="primary"
                aria-current={onUploadPage ? 'page' : undefined}
                onClick={onUploadClick}
                className="max-sm:hidden"
              >
                Feltöltés
              </ButtonLink>
              <AccountMenu user={auth.user} />
            </>
          )}
          {(auth.status === 'anonymous' || auth.status === 'error') && <GuestLinks />}
          {/* A munkamenet ellenőrzése alatt a fiókrész helyét a belépési hivatkozások rejtett mása
              foglalja: a válasz megérkezésekor a fejléc nem ugrik (elrendezés-eltolódás – L26).
              A visibility: hidden a fókuszból is kiveszi, az aria-hidden a képernyőolvasótól is rejti */}
          {auth.status === 'loading' && (
            <div aria-hidden="true" className="invisible">
              <GuestLinks />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
