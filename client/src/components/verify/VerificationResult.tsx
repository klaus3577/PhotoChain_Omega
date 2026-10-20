// Az ellenőrzés eredménykártyája (L24; L17 drótváz „Ellenőrzés”, 2–4. jegyzet). A megjelenéskor a fókusz
// a címére kerül, ha elveszett – az űrlap (benne a megnyomott gomb) a kártya helyére lépve eltűnt –, és
// a képernyőolvasó így azonnal bemondja az eredményt a magyarázattal együtt (a cím leírása – WCAG 4.1.3);
// ha a felhasználó közben máshová lépett (pl. a fejlécbe), a fókusz ott marad, és az élő régió mondja be
// a címet. VERIFIED: a kép és a fotós (ha a kép nyilvános – a rejtett vagy máshonnan regisztrált képnél
// csak a lánc adatai), a regisztráció ideje a láncról, a blokk és a tranzakció, ha ismert (különben „A
// tranzakció adatai nem érhetők el” – design-README, L24-es sor); SIMILAR: az eltérés mértéke számmal és
// sávval, az eredeti adatlapja – tájékoztat, nem vádol; NOT_FOUND: semleges hangvétel, a kiszámolt hash
// másolható, így később újra ellenőrizhető.
import { useId, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router';

import { DHASH_BITS, type Verification, type VerifiedPhoto } from '../../api/verify.api';
import { cx } from '../../lib/cx';
import { focusLost } from '../../lib/focus';
import { formatDateTime } from '../../lib/format';
import type { VerificationSource } from '../../verify/verificationGate';
import { Sha256Row, TransactionRows } from '../photos/proofRows';
import { Thumbnail } from '../photos/Thumbnail';
import { Button, ButtonLink } from '../ui/Button';
import { DefinitionRow } from '../ui/DefinitionRow';
import { useAnnounce } from '../ui/useAnnounce';
import { RESULT_STATES } from './resultStates';

export type { VerificationSource } from '../../verify/verificationGate';

const PHOTO_UNAVAILABLE_NOTE =
  'A kép adatai nem nyilvánosak (a fotós levehette a galériából); a blokkláncon a regisztráció rekordja ettől még megvan.';
const RESET_LABELS: Record<VerificationSource, string> = {
  file: 'Másik kép ellenőrzése',
  hash: 'Másik hash ellenőrzése',
};
const SHA256_TERMS: Record<VerificationSource, string> = {
  file: 'A vizsgált fájl SHA-256 hash-e',
  hash: 'A megadott SHA-256 hash',
};

/**
 * A regisztrált kép – ha nyilvános: bélyegkép, a cím az adatlapra, a fotós a profiljára mutat. A két
 * hivatkozás egymás alatt legalább 24 képpont magas (WCAG 2.5.8), a hosszú cím vagy név tördelődik.
 */
function PhotoSummary({ photo }: { photo: VerifiedPhoto | null }) {
  if (photo === null) {
    return <p className="text-sm leading-6 text-fg-muted">{PHOTO_UNAVAILABLE_NOTE}</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <Thumbnail src={photo.thumbnailUrl} />
      <div className="min-w-0 space-y-0.5 text-sm wrap-anywhere">
        <Link
          to={`/photos/${photo.id}`}
          className="flex min-h-6 items-center font-medium underline underline-offset-2 hover:text-primary"
        >
          {photo.title}
        </Link>
        <Link
          to={`/users/${photo.photographer.id}`}
          className="flex min-h-6 w-fit items-center text-fg-muted underline underline-offset-2 hover:text-fg"
        >
          {/* A név és a cél egyetlen szövegcsomópontban (mint az adatlapon – L23) */}
          <span aria-hidden="true">{photo.photographer.displayName}</span>
          <span className="sr-only">{photo.photographer.displayName} profilja</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Az eltérés mértéke: a 64 bites vizuális ujjlenyomatból ennyi bit tér el – számmal (a képernyőolvasónak
 * nem „per”-ként olvasva) és sávval; a sáv csak megerősít.
 */
function DistanceRow({ distance }: { distance: number }) {
  return (
    <DefinitionRow term="Eltérés a vizuális ujjlenyomatban">
      <strong aria-hidden="true" className="tabular-nums">
        {distance} / {DHASH_BITS} bit
      </strong>
      <span className="sr-only">
        a {DHASH_BITS} bitből {distance} tér el
      </span>
      <span aria-hidden="true" className="ml-2 h-2 w-24 overflow-hidden rounded-full bg-line">
        <span
          className="block h-full bg-caution-700"
          style={{ width: `${(distance / DHASH_BITS) * 100}%` }}
        />
      </span>
    </DefinitionRow>
  );
}

interface VerificationResultProps {
  result: Verification;
  source: VerificationSource;
  /** Új ellenőrzés: a kártya helyére az üres űrlap lép */
  onReset: () => void;
}

export function VerificationResult({ result, source, onReset }: VerificationResultProps) {
  const announce = useAnnounce();
  const headingId = useId();
  const leadId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const state = RESULT_STATES[result.result];
  const Icon = state.icon;

  // A kártya az űrlapok helyére lép: ha a fókusz elveszett (a megnyomott gomb eltűnt), a címre kerül –
  // még a kirajzolás előtt, hogy a képernyőolvasó ne a <body>-t jelentse közben; ha máshol van, ott
  // marad, és az élő régió mondja be az eredményt. (StrictMode kettős futásnál a cím már fókuszban van.)
  useLayoutEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    if (focusLost() || document.activeElement === heading) heading.focus();
    else announce(state.title);
  }, [announce, state.title]);

  return (
    <section
      aria-labelledby={headingId}
      className={cx('rounded-lg border-2 bg-canvas', state.border)}
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        aria-describedby={leadId}
        className={cx(
          'flex items-center gap-2 rounded-t-md border-b px-5 py-3 text-lg font-semibold tracking-tight focus:outline-none',
          state.header,
        )}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {state.title}
      </h2>
      <div className="space-y-4 p-5">
        <p id={leadId} className="leading-7">
          {state.lead[source]}
        </p>
        {result.result !== 'NOT_FOUND' && <PhotoSummary photo={result.photo} />}
        <dl className="divide-y divide-line border-y border-line text-sm">
          {result.result === 'SIMILAR' && result.distance !== null && (
            <DistanceRow distance={result.distance} />
          )}
          {result.registration && (
            <>
              <DefinitionRow term="Regisztrálva">
                {formatDateTime(result.registration.registeredAt)}
              </DefinitionRow>
              <TransactionRows proof={result.registration} />
            </>
          )}
          {result.result === 'NOT_FOUND' && (
            <>
              <Sha256Row sha256={result.sha256} term={SHA256_TERMS[source]} />
              {result.dHash !== null && (
                <DefinitionRow term="dHash">
                  <span className="font-mono">{result.dHash}</span>
                </DefinitionRow>
              )}
            </>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          {result.photo && (
            <ButtonLink to={`/photos/${result.photo.id}`} variant="primary">
              {result.result === 'SIMILAR' ? 'Az eredeti adatlapja' : 'Adatlap megnyitása'}
            </ButtonLink>
          )}
          <Button onClick={onReset}>{RESET_LABELS[source]}</Button>
        </div>
      </div>
    </section>
  );
}
