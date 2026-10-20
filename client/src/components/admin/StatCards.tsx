// A platform statisztikája kártyákon (L25; L17 drótváz „Adminisztráció”, 1. jegyzet): felhasználók
// (tiltott, admin), képek és rendelések állapotonként, bevétel, a láncon regisztrált hash-ek száma.
// Leíró lista (dl): a kártya címe a kifejezés, a szám és a bontás a leírása – a képernyőolvasó párban
// olvassa; a szakasz rejtett címe (h2) a címsor-navigációban is megtalálható. Mobilon két oszlop,
// szélesen öt (az ötödik kártya mobilon teljes sor); a szám keskeny képernyőn kisebb, hogy a bevétel
// („612 300 Ft” – nem törhet) 320 képponton is a kártyában maradjon. A betöltés alatt a kártyák
// helyét ugyanakkora vázak foglalják (a címkék valódiak, a szám és a bontás helye üres sáv): a
// megérkező számok nem tolják el az alattuk lévő listákat (elrendezés-ugrás, CLS – L26); a vázak
// dekoratívak, a képernyőolvasónak rejtett felirat mondja a betöltést. A hiba a kártyák helyén; a
// sikeres újrapróbálás után a fókusz a szakaszra kerül (a hibanézet gombja eltűnt).
import type { UseQueryResult } from '@tanstack/react-query';
import { useId, useRef } from 'react';

import type { PlatformStats } from '../../api/admin.api';
import { useFocusAfterRecovery } from '../../hooks/useFocusAfterRecovery';
import { cx } from '../../lib/cx';
import { formatInteger, formatPrice } from '../../lib/format';
import { loadStateOf, showsLoadError } from '../../lib/loadState';
import { LoadError } from '../ui/LoadError';

const LOADING_TEXT = 'Statisztika betöltése…';
const SEPARATOR = ' · ';
/** A kártyák címkéi a betöltés vázához (a kártyák sorrendjében) */
const CARD_LABELS = ['Felhasználók', 'Képek', 'Rendelések', 'Bevétel', 'Hash a láncon'] as const;
const GRID = 'grid grid-cols-2 gap-3 lg:grid-cols-5';
const CARD = 'rounded-lg border border-line bg-canvas p-4';
/** A szám (text-xl, szélesen text-2xl) és a bontás (text-xs) sormagassága */
const VALUE_BAR = 'mt-1 h-7 w-16 rounded bg-surface sm:h-8';
const NOTE_BAR = 'mt-1 h-4 w-28 rounded bg-surface';

interface StatCard {
  label: string;
  value: string;
  /** A bontás a szám alatt („2 tiltott · 1 admin”) */
  note: string;
  /** Keskeny képernyőn teljes sor (a páratlan ötödik kártya) */
  wide?: boolean;
}

const counted = (count: number, noun: string) => `${formatInteger(count)} ${noun}`;

function cardsOf(stats: PlatformStats): StatCard[] {
  const { users, photos, orders } = stats;
  return [
    {
      label: 'Felhasználók',
      value: formatInteger(users.total),
      note: [counted(users.blocked, 'tiltott'), counted(users.admins, 'admin')].join(SEPARATOR),
    },
    {
      label: 'Képek',
      value: formatInteger(photos.total),
      note: [
        counted(photos.byStatus.REGISTERED, 'hitelesítve'),
        counted(photos.byStatus.PENDING_CHAIN, 'folyamatban'),
        counted(photos.byStatus.CHAIN_FAILED, 'sikertelen'),
        counted(photos.byStatus.HIDDEN, 'rejtett'),
      ].join(SEPARATOR),
    },
    {
      label: 'Rendelések',
      value: formatInteger(orders.total),
      note: [
        counted(orders.byStatus.PAID, 'kifizetett'),
        counted(orders.byStatus.PENDING, 'függő'),
        counted(orders.byStatus.EXPIRED + orders.byStatus.FAILED, 'lejárt vagy sikertelen'),
      ].join(SEPARATOR),
    },
    {
      label: 'Bevétel',
      value: formatPrice(stats.revenueHuf),
      note: 'a kifizetett rendelésekből',
    },
    {
      label: 'Hash a láncon',
      value: formatInteger(stats.registeredHashes),
      note: 'regisztrált ujjlenyomat (a rejtetteké is)',
      wide: true,
    },
  ];
}

export function StatCards({ query }: { query: UseQueryResult<PlatformStats> }) {
  const sectionRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const state = loadStateOf({
    data: query.data,
    error: query.error,
    errorUpdateCount: query.errorUpdateCount,
  });
  const failed = showsLoadError(state);
  useFocusAfterRecovery(failed, sectionRef, 'A statisztika betöltődött.');

  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="focus:outline-none">
      <h2 id={headingId} className="sr-only">
        Statisztika
      </h2>
      {failed ? (
        <LoadError
          title="A statisztika betöltése nem sikerült."
          state={state}
          error={query.error}
          failedAt={query.errorUpdatedAt}
          onRetry={() => void query.refetch()}
          retryingText={LOADING_TEXT}
        />
      ) : query.data ? (
        <dl className={GRID}>
          {cardsOf(query.data).map((card) => (
            <div key={card.label} className={cx(CARD, card.wide && 'col-span-2 lg:col-span-1')}>
              <dt className="text-sm text-fg-muted">{card.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{card.value}</dd>
              <dd className="mt-1 text-xs text-fg-muted">{card.note}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <StatCardsSkeleton />
      )}
    </section>
  );
}

/** A betöltés váza: a kártyák a valódi címkékkel, a szám és a bontás helyén üres sáv */
function StatCardsSkeleton() {
  return (
    <>
      <p className="sr-only">{LOADING_TEXT}</p>
      <div aria-hidden="true" className={cx(GRID, 'motion-safe:animate-pulse')}>
        {CARD_LABELS.map((label, index) => (
          <div
            key={label}
            className={cx(CARD, index === CARD_LABELS.length - 1 && 'col-span-2 lg:col-span-1')}
          >
            <div className="text-sm text-fg-muted">{label}</div>
            <div className={VALUE_BAR} />
            <div className={NOTE_BAR} />
          </div>
        ))}
      </div>
    </>
  );
}
