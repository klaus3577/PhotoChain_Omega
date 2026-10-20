// A feltöltés utáni állapotkártya (L21; L17 drótváz „Feltöltés”, 8. jegyzet): a regisztráció lépései
// (feltöltve → ujjlenyomat, nincs egyezés → rögzítés a láncon → hitelesítve), a tranzakció hivatkozása
// (függőként, majd a tanúsítványból; sikertelen regisztrációnál az utoljára ismert – ugyanaz a
// hivatkozás marad, a fókusz nem vész el), végül a „Hitelesítve” – ugyanazzal a címmel és színekkel,
// mint az adatlap tanúsítványa (a zöld csak az igazolt hitelességé). Amikor a kártya az űrlap helyére
// lép, a fókusz a címére kerül (az űrlap gombja eltűnt), és csak ezután hangzik el a siker bemondása
// (a fókuszváltás megszakíthatná). A kép állapotát 3 másodpercenként kérdezi le, amíg PENDING_CHAIN
// (két perc után ritkábban, tíz perc után leáll – pollInterval.ts); a gyorsítótárat a 201-es válasszal a
// feltöltés oldala tölti fel régi keltezéssel, így itt nem indul azonnali lekérdezés, más oldal pedig
// frissnek nem tekinti. A 404 (a kép már nem látható ebben a munkamenetben – pl. lejárt munkamenet)
// leállítja a lekérdezést és újraellenőrzi a munkamenetet. A hitelesítést és az elrejtést az élő régió
// mondja be, a hitelesítéskor a galéria listái érvénytelenednek (a kép nyilvános lett); a sikertelen
// regisztrációt riasztás jelzi. Az oldal elhagyásával a lekérdezés magától leáll.
// Forrás: TanStack Query – useQuery: refetchInterval (függvény alak), refetchOnMount,
// https://tanstack.com/query/latest/docs/framework/react/reference/useQuery; React – You Might Not
// Need an Effect (állapot igazítása renderelés közben), https://react.dev/learn/you-might-not-need-an-effect (adaptálva)
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Circle, type LucideIcon, Minus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';

import { authQueryKey } from '../../api/auth.api';
import { ApiError } from '../../api/http';
import {
  detailOfUploaded,
  getPhoto,
  photoKeys,
  type PhotoDetail,
  type PhotoStatus,
  type UploadedPhoto,
} from '../../api/photos.api';
import { cx } from '../../lib/cx';
import {
  createPollClock,
  POLL_LIMIT_MS,
  pollErrorNoteOf,
  pollIntervalOf,
} from '../../upload/pollInterval';
import { useRegistrationTransition } from '../../upload/useRegistrationTransition';
import { PANEL_STATES } from '../photos/certificatePanels';
import { HexValue } from '../photos/ExplorerLink';
import { Alert } from '../ui/Alert';
import { Button, ButtonLink } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { useAnnounce } from '../ui/useAnnounce';

type StepState = 'done' | 'active' | 'pending' | 'failed' | 'skipped';

interface Step {
  text: string;
  state: StepState;
}

/** A lépés állapota a képernyőolvasónak (a látható jel az ikon) */
const STATE_LABELS: Record<StepState, string> = {
  done: 'Kész',
  active: 'Folyamatban',
  pending: 'Hátravan',
  failed: 'Nem sikerült',
  skipped: 'Elmaradt',
};

const STATE_ICONS: Record<Exclude<StepState, 'active'>, { icon: LucideIcon; className: string }> = {
  done: { icon: Check, className: 'text-trust-700' },
  pending: { icon: Circle, className: 'text-fg-muted' },
  skipped: { icon: Minus, className: 'text-fg-muted' },
  failed: { icon: X, className: 'text-danger' },
};

/** A négy lépés a kép állapota szerint (a 201 után az első kettő mindig kész: nem volt egyezés). */
function stepsOf(photo: PhotoDetail): Step[] {
  const registered = photo.status === 'REGISTERED' || photo.certificate !== null;
  const chain: StepState =
    photo.status === 'PENDING_CHAIN'
      ? 'active'
      : photo.status === 'CHAIN_FAILED'
        ? 'failed'
        : registered
          ? 'done'
          : 'skipped';
  const verified: StepState =
    photo.status === 'PENDING_CHAIN' ? 'pending' : registered ? 'done' : 'skipped';
  return [
    { text: 'Feltöltve', state: 'done' },
    { text: 'Ujjlenyomat elkészült, nincs egyezés', state: 'done' },
    { text: 'Rögzítés a blokkláncon', state: chain },
    { text: 'Hitelesítve', state: verified },
  ];
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'active') return <Spinner className="text-caution-700" />;
  const { icon: Icon, className } = STATE_ICONS[state];
  return <Icon aria-hidden="true" className={cx('size-4 shrink-0', className)} />;
}

function StepItem({ text, state }: Step) {
  const muted = state === 'pending' || state === 'skipped';
  return (
    <li className={cx('flex items-center gap-2', muted ? 'text-fg-muted' : 'text-fg')}>
      <StepIcon state={state} />
      <span className="sr-only">{`${STATE_LABELS[state]}: `}</span>
      {text}
      {state === 'active' && '…'}
    </li>
  );
}

interface Transaction {
  txHash: string;
  txUrl: string | null;
}

/** A tranzakció a kép adataiból: a függő tranzakció, vagy a tanúsítványé (ha a nyugtája ismert). */
function transactionOf(photo: PhotoDetail): Transaction | null {
  if (photo.pendingTransaction) return photo.pendingTransaction;
  const certificate = photo.certificate;
  if (certificate === null || certificate.txHash === null) return null;
  return { txHash: certificate.txHash, txUrl: certificate.txUrl };
}

/** A tranzakció sorának címkéje az állapot szerint */
function transactionLabelOf(status: PhotoStatus): string {
  if (status === 'PENDING_CHAIN') return 'Függő tranzakció: ';
  if (status === 'CHAIN_FAILED') return 'Tranzakció (nem ment át): ';
  return 'Tranzakció: ';
}

/** A 404 megjegyzése: a kép ebben a munkamenetben már nem látható (a lekérdezés leállt – pollInterval.ts) */
const UNAVAILABLE_NOTE =
  'A kép állapota most nem érhető el ebben a munkamenetben; nézd meg a kép adatlapján.';

const SUCCESS_MESSAGE =
  'A kép feltöltése sikerült. A blokklánc-regisztráció folyamatban van, ez általában fél–egy percig tart.';
const TIMEOUT_NOTE =
  'A regisztráció a szokásosnál tovább tart. Az állapotot a kép adatlapján később is megnézheted.';
/** A regisztráció előtt elrejtett képnél a tanúsítványdoboz megjegyzése (lánc-rekord) hamis lenne */
const HIDDEN_BEFORE_CHAIN_NOTE =
  'A képet elrejtették, mielőtt a regisztráció megtörtént volna; a láncra nem került rekord.';

interface RegistrationStatusProps {
  /** A feltöltés (201) válasza – a kiinduló állapot (a gyorsítótárban is ez van) */
  uploaded: UploadedPhoto;
  /** Újabb kép feltöltése: üres űrlap */
  onReset: () => void;
  /** A kártya címére (a szülő is ide teheti a fókuszt, pl. a megerősítő panel eltűnésekor) */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

export function RegistrationStatus({ uploaded, onReset, headingRef }: RegistrationStatusProps) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const headingId = useId();
  const ownHeadingRef = useRef<HTMLHeadingElement>(null);
  const heading = headingRef ?? ownHeadingRef;
  // A kártya megjelenésétől mérő stopper (effektben indul: a renderelés tiszta marad)
  const [clock] = useState(createPollClock);
  useEffect(() => clock.start(), [clock]);
  const [timedOut, setTimedOut] = useState(false);
  const { data, error } = useQuery({
    queryKey: photoKeys.detail(uploaded.id),
    queryFn: ({ signal }) => getPhoto(uploaded.id, signal),
    // A gyorsítótárban a 201 válasza van (UploadPage): az első lekérdezést az időzítő indítja
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      pollIntervalOf({
        pending: (query.state.data?.status ?? 'PENDING_CHAIN') === 'PENDING_CHAIN',
        elapsedMs: clock.elapsedMs(),
        error: query.state.error,
      }),
  });
  // Ha a gyorsítótár közben kiürült (pl. a munkamenet változott), a 201 válasza marad a kiinduló adat
  const photo = data ?? detailOfUploaded(uploaded);

  // Az űrlap (benne a fókuszált gomb) eltűnt a kártya helyéről: a fókusz a kártya címére kerül (görgetve
  // is, hogy a kártya látsszon), és csak utána a bemondás. Az eltávolított gombot egyes környezetek még
  // aktív elemként adják vissza – az is „elveszett” fókusz.
  const announced = useRef(false);
  useEffect(() => {
    const active = document.activeElement;
    const lost = active === null || active === document.body || !active.isConnected;
    if (lost) heading.current?.focus();
    if (!announced.current) {
      announced.current = true;
      announce(SUCCESS_MESSAGE, { visible: true });
    }
  }, [heading, announce]);

  // Állapotváltáskor: bemondás; a vezérlőpult saját képei frissülnek, a hitelesítéskor a galéria
  // listái is (a sikertelen regisztrációt a riasztás mondja)
  useRegistrationTransition(photo.status);

  // 404: a kép ebben a munkamenetben már nem látható – a munkamenet lejárhatott, ezt a felület így veszi
  // észre (mint az adatlapon: useSessionRecheck); a lekérdezés leállt (pollInterval.ts)
  const notFound = error instanceof ApiError && error.status === 404;
  useEffect(() => {
    if (notFound) void queryClient.invalidateQueries({ queryKey: authQueryKey });
  }, [notFound, queryClient]);

  // Tíz perc függés után a lekérdezés leáll (pollInterval.ts): a kártya elmondja, hol nézhető meg később
  useEffect(() => {
    if (photo.status !== 'PENDING_CHAIN') return;
    const timer = window.setTimeout(() => {
      setTimedOut(true);
      announce(TIMEOUT_NOTE);
    }, POLL_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [photo.status, announce]);

  // A tranzakció sora végig ugyanaz az elem: a függő tranzakció, majd a tanúsítványé; ha a szerver már
  // nem adja (sikertelen regisztráció, elrejtés), az utoljára ismert marad – állapot igazítása renderelés
  // közben, hogy a rajta álló fókusz ne vesszen el
  const current = transactionOf(photo);
  const [kept, setKept] = useState(current);
  if (current !== null && current.txHash !== kept?.txHash) setKept(current);
  const transaction = current ?? kept;

  const panel = PANEL_STATES[photo.status];
  const Icon = panel.icon;
  const pending = photo.status === 'PENDING_CHAIN';
  const note =
    photo.status === 'HIDDEN' && photo.certificate === null ? HIDDEN_BEFORE_CHAIN_NOTE : panel.note;

  return (
    <section
      aria-labelledby={headingId}
      className={cx('rounded-lg border-2 bg-canvas', panel.border)}
    >
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className={cx(
          'flex items-center gap-2 rounded-t-md border-b px-5 py-3 text-lg font-semibold tracking-tight focus:outline-none',
          panel.header,
        )}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {panel.title}
      </h2>
      <div className="space-y-4 p-5">
        <ol role="list" aria-label="A regisztráció lépései" className="space-y-2 text-sm">
          {stepsOf(photo).map((step) => (
            <StepItem key={step.text} {...step} />
          ))}
        </ol>
        {transaction && (
          <p className="text-sm">
            <span className="text-fg-muted">{transactionLabelOf(photo.status)}</span>
            <HexValue value={transaction.txHash} url={transaction.txUrl} target="a tranzakció" />
          </p>
        )}
        {photo.status === 'CHAIN_FAILED' && (
          <Alert tone="danger" title="A blokklánc-regisztráció nem sikerült.">
            A kép nem nyilvános. Nincs teendőd: az adminisztrátor újrapróbálja a regisztrációt, az
            eredményt a kép adatlapján látod.
          </Alert>
        )}
        {pending && error !== null && !timedOut && (
          <p className="text-sm text-fg-muted">{pollErrorNoteOf(error, UNAVAILABLE_NOTE)}</p>
        )}
        {pending && timedOut && <p className="text-sm text-fg-muted">{TIMEOUT_NOTE}</p>}
        {photo.status !== 'CHAIN_FAILED' && (
          <p className="text-sm leading-6 text-fg-muted">{note}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/photos/${photo.id}`} variant="primary">
            A kép adatlapja
          </ButtonLink>
          <Button onClick={onReset}>Újabb kép feltöltése</Button>
        </div>
      </div>
    </section>
  );
}
