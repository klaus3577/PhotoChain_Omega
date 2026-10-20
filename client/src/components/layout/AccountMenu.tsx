// Fiókmenü (L17 drótváz: „FN – fiókmenü”): monogramos gomb, amely egy panelt nyit és zár (WAI-ARIA
// disclosure minta – nem menü szerepkör: a panelben közönséges szöveg és gomb van, a Tab-sorrend
// természetes). Escape-re bezárul, és ha a fókusz a menüben volt (vagy sehol), a gombra kerül – máshonnan
// nem veszi el, és a más által már kezelt Escape-et figyelmen kívül hagyja. A panelből kilépve (Tab),
// máshová kattintva – a dokumentumszintű figyelő akkor is, ha a gomb kattintásra nem kapott fókuszt
// (Safari) – és oldalváltáskor is bezárul. A gomb hozzáférhető neve a látható monogrammal kezdődik
// (WCAG 2.5.3). Ha a kijelentkezés nem sikerül, a panel újra kinyílik a hibával (a hiba nem maradhat a
// bezárt panelben), és ha a fókusz a menüben volt, a Kijelentkezés gombra kerül – a gomb leírása a
// hiba, így a fókusz áthelyezése után is elhangzik. Ha a menü a fókusszal együtt tűnik el (a munkamenet
// a háttérben szűnt meg), a fókusz az oldal címére kerül.
// Forrás: WAI-ARIA APG – Disclosure (Show/Hide) Pattern, https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/;
// MDN – <button>: Clicking and focus, https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#clicking_and_focus;
// React – You Might Not Need an Effect (állapot igazítása renderelés közben),
// https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes (adaptálva)
import { ImageUp, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation } from 'react-router';

import type { AuthUser } from '../../api/auth.api';
import { monogram } from '../../auth/session';
import { useLogout } from '../../auth/useAuthActions';
import { dashboardSearch, parseDashboardParams } from '../../dashboard/dashboardParams';
import { useFocusRescueOnUnmount } from '../../hooks/useFocusRescue';
import { isModifiedClick } from '../../lib/pointer';
import { errorText } from '../../lib/text';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

/** A fókusz a menüben van, vagy sehol (a <body>-n) – ilyenkor a menü viheti tovább. */
function focusIsWithin(container: HTMLElement | null): boolean {
  const active = document.activeElement;
  return active === document.body || Boolean(container?.contains(active));
}

/** Az oldal alapnézete-e a lekérdezés (a vezérlőpulton a fül és az oldal alapértéke is az). */
function isDefaultView(path: string, search: string): boolean {
  if (path === '/dashboard') {
    return dashboardSearch(parseDashboardParams(new URLSearchParams(search))) === '';
  }
  return search === '';
}

export function AccountMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const errorId = useId();
  const logout = useLogout();
  const initials = monogram(user.displayName);
  /** A saját publikus profil (L23) */
  const profilePath = `/users/${user.id}`;
  useFocusRescueOnUnmount(containerRef);

  // Oldalváltáskor (hivatkozás, Vissza gomb) a nyitva hagyott panel bezárul – az állapot igazítása a
  // renderelés közben, az előző útvonal megjegyzésével (nem effektben, így nem villan fel nyitva)
  const { key: locationKey, pathname, search } = useLocation();
  const [seenLocationKey, setSeenLocationKey] = useState(locationKey);
  if (seenLocationKey !== locationKey) {
    setSeenLocationKey(locationKey);
    setOpen(false);
  }

  // A panel hivatkozása az éppen nyitott oldalra (annak alapnézetére – a vezérlőpult másik füléről
  // vagy oldaláról a hivatkozás az alapnézetre visz, mint a fejlécé; az alapnézet nem kanonikus címe,
  // pl. ?tab=kepeim, is alapnézet): nincs hova menni – a panel bezárul, a fókusz a gombra kerül (a
  // bezáruló panelben a fókusz különben elveszne, és az útvonalváltás fókusza sem indulna el)
  const onSamePageLinkClick = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== path || !isDefaultView(path, search) || isModifiedClick(event)) return;
    event.preventDefault();
    setOpen(false);
    toggleRef.current?.focus();
  };

  // Nyitott panelnél: kattintás a menün kívül, illetve Escape bárhol – bezárul
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setOpen(false);
      if (!focusIsWithin(containerRef.current)) return;
      event.preventDefault();
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // A fókusz a fiókmenün kívülre került (Tab): bezárul
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  const signOut = () =>
    logout.mutate(undefined, {
      onError: () => {
        const moveFocus = focusIsWithin(containerRef.current);
        flushSync(() => setOpen(true));
        if (moveFocus) logoutRef.current?.focus();
      },
    });

  return (
    <div ref={containerRef} className="relative" onBlur={onBlur}>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${initials} – fiókmenü`}
        onClick={() => setOpen((shown) => !shown)}
        className="grid size-10 place-items-center rounded-full border border-line-strong bg-canvas text-sm font-medium hover:bg-surface"
      >
        {initials}
      </button>
      {/* tabIndex=-1: a panelre kattintva a fókusz a fiókmenün belül marad (nem zárul be) */}
      <div
        id={panelId}
        hidden={!open}
        tabIndex={-1}
        className="absolute top-full right-0 z-40 mt-2 w-72 rounded-lg border border-line-strong bg-canvas p-4 shadow-card focus:outline-none"
      >
        <p className="font-medium break-words">{user.displayName}</p>
        <p className="text-sm break-all text-fg-muted">{user.email}</p>
        {/* A hivatkozások külön sorban (flex, nem inline-flex): egymás mellett összeérnének */}
        <Link
          to={profilePath}
          aria-current={pathname === profilePath ? 'page' : undefined}
          onClick={onSamePageLinkClick(profilePath)}
          className="mt-3 flex min-h-10 items-center gap-2 text-sm font-medium underline underline-offset-2"
        >
          <UserRound aria-hidden="true" className="size-4 shrink-0" />
          Profilom
        </Link>
        <Link
          to="/dashboard"
          aria-current={pathname === '/dashboard' ? 'page' : undefined}
          onClick={onSamePageLinkClick('/dashboard')}
          className="flex min-h-10 items-center gap-2 text-sm font-medium underline underline-offset-2"
        >
          <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
          Vezérlőpult
        </Link>
        <Link
          to="/upload"
          aria-current={pathname === '/upload' ? 'page' : undefined}
          onClick={onSamePageLinkClick('/upload')}
          className="flex min-h-10 items-center gap-2 text-sm font-medium underline underline-offset-2"
        >
          <ImageUp aria-hidden="true" className="size-4 shrink-0" />
          Kép feltöltése
        </Link>
        {logout.isError && (
          <div id={errorId} className="mt-3">
            <Alert key={logout.submittedAt} tone="danger" title="A kijelentkezés nem sikerült.">
              {errorText(logout.error)}
            </Alert>
          </div>
        )}
        <Button
          ref={logoutRef}
          icon={LogOut}
          busy={logout.isPending}
          aria-describedby={logout.isError ? errorId : undefined}
          onClick={signOut}
          className="mt-4 w-full"
        >
          Kijelentkezés
        </Button>
      </div>
    </div>
  );
}
