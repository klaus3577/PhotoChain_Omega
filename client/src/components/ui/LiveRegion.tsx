// Az oldal egyetlen, végig jelen lévő élő régiója (L17, WCAG 4.1.3): ide kerül minden nem hibajellegű
// bejelentés (mentés, másolás, állapotváltás). A régió az első bejelentés előtt már a DOM-ban van –
// a később beszúrt élő régiót több képernyőolvasó nem figyeli. Minden bejelentés új szövegcsomópont,
// így ugyanaz a szöveg ismételve is újra felolvasásra kerül. Az oldalváltás utánra kért bejelentést
// (L19) a layout küldi ki, miután a fókuszt az új oldal címére tette. A látható értesítés (L26,
// stílusútmutató „Visszajelzés”) ugyanez a régió, rövid fekete dobozként a képernyő alján: így a
// képernyőolvasó egyszer olvassa, a látó felhasználó is látja. Az értesítés kiegészítő visszajelzés
// – az eredmény az oldalon is látszik (a frissült lista, a jelvény) –, ezért az eltűnése nem időkorlát
// (WCAG 2.2.1 nem vonatkozik rá); mégis legalább 5 másodpercig látszik, rámutatáskor nem tűnik el,
// Escape-pel eltüntethető (ha eltakarna valamit), és nincs benne kezelőelem. Egy üzenethely van: az
// újabb bejelentés – rejtett is – a korábbit váltja. Amíg modális párbeszédablak van nyitva, a
// bejelentések várnak (a háttér inert: nem hangzanának el, nem látszanának), és az ablak bezárása után
// egybefűzve hangzanak el.
// Forrás: MDN – ARIA live regions, https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions;
// W3C WAI – Understanding SC 4.1.3 Status Messages, https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html (adaptálva)
import { Check, CircleAlert, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cx } from '../../lib/cx';
import {
  type AnnounceOptions,
  type AnnounceTone,
  LIVE_MESSAGE_TTL_MS,
  LiveRegionContext,
  type LiveRegion,
} from './liveRegionContext';

interface Message {
  message: string;
  /** Látható értesítésként is */
  visible: boolean;
  tone: AnnounceTone;
}

interface Announcement extends Message {
  id: number;
}

const ICONS: Record<AnnounceTone, typeof Check> = {
  success: Check,
  info: Info,
  warning: CircleAlert,
};

/** A tónusok erősorrendje: egybefűzött üzeneteknél a legerősebb marad */
const TONE_RANK: Record<AnnounceTone, number> = { success: 0, info: 1, warning: 2 };

/** A várakozó üzenetek egyetlen bejelentésként: a szövegek egymás után, a legerősebb tónussal */
function mergeMessages(messages: Message[]): Message {
  return messages.reduce((merged, next) => ({
    message: `${merged.message} ${next.message}`,
    visible: merged.visible || next.visible,
    tone: TONE_RANK[next.tone] > TONE_RANK[merged.tone] ? next.tone : merged.tone,
  }));
}

/**
 * A látható értesítés doboza: a képernyő alján, középen; keskeny képernyőn a szélekig, szélesen
 * legfeljebb 28 rem (a hosszú sor nehezen olvasható); a hosszú, szóköz nélküli szöveg (cím, név) is
 * tördelődik; érintőképernyőn nem fogja el a koppintást (alatta a lap kezelhető marad); kontrasztos
 * módban az átlátszó keret látható keretté válik (a doboz nem olvad a háttérbe)
 */
const TOAST = cx(
  'fixed bottom-4 left-1/2 z-50 flex w-max max-w-[min(100%-2rem,28rem)] -translate-x-1/2 items-start gap-3',
  'rounded-lg border border-transparent bg-black px-4 py-3 text-sm text-white shadow-card wrap-anywhere',
  'pointer-coarse:pointer-events-none',
);

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  // Rámutatáskor a látható értesítés nem tűnik el: az idő megáll, elvételkor újra a teljes idő jár
  const [paused, setPaused] = useState(false);
  const pending = useRef<Message | null>(null);
  /** A nyitott modális ablakok száma és az alattuk várakozó bejelentések */
  const openDialogs = useRef(0);
  const held = useRef<Message[]>([]);
  const region = useMemo<LiveRegion>(() => {
    const show = (next: Message) =>
      setAnnouncement((previous) => ({ ...next, id: (previous?.id ?? 0) + 1 }));
    const announce = (next: Message) => {
      if (openDialogs.current > 0) held.current = [...held.current, next];
      else show(next);
    };
    return {
      announce: (message, options?: AnnounceOptions) => {
        const next: Message = {
          message,
          visible: options?.visible ?? false,
          tone: options?.tone ?? 'success',
        };
        if (options?.afterNavigation) pending.current = next;
        else announce(next);
      },
      flushPending: () => {
        const next = pending.current;
        pending.current = null;
        if (next !== null) announce(next);
      },
      dialogOpened: () => {
        openDialogs.current += 1;
      },
      dialogClosed: () => {
        openDialogs.current = Math.max(0, openDialogs.current - 1);
        if (openDialogs.current > 0 || held.current.length === 0) return;
        const messages = held.current;
        held.current = [];
        show(mergeMessages(messages));
      },
    };
  }, []);

  const visible = announcement?.visible ?? false;

  // A felolvasott üzenet kiürül (a törlést a képernyőolvasó nem olvassa fel); a rámutatás szünete csak
  // a látható értesítésé – a helyére lépő rejtett üzenet akkor is kiürül, ha az egér ott maradt
  useEffect(() => {
    if (!announcement || (paused && announcement.visible)) return;
    const timer = setTimeout(() => setAnnouncement(null), LIVE_MESSAGE_TTL_MS);
    return () => clearTimeout(timer);
  }, [announcement, paused]);

  // Escape: a látható értesítés eltűnik (ha eltakarná a fókuszban lévő elemet – WCAG 2.4.11); nem
  // állítja le az eseményt, így a párbeszédablak, a panel Escape-je is működik
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAnnouncement(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const Icon = announcement ? ICONS[announcement.tone] : Check;

  return (
    <LiveRegionContext value={region}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-tone={visible && announcement ? announcement.tone : undefined}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className={cx(visible ? TOAST : 'sr-only')}
      >
        {announcement && (
          <span key={announcement.id} className={visible ? 'contents' : undefined}>
            {visible && <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            {announcement.message}
          </span>
        )}
      </div>
    </LiveRegionContext>
  );
}
