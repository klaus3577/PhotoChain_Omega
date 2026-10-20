// A hitelesség-ellenőrző oldal (L24; L17 drótváz „Ellenőrzés”): nyilvános – bejelentkezés nélkül bárki
// megnézheti, szerepel-e egy kép a PhotoChain blokkláncon vezetett nyilvántartásában (terv 1.2/7. pont).
// Két bemenet: a kép (VerifyFileForm) vagy a SHA-256 hash (VerifyHashForm) – egyszerre egy ellenőrzés
// futhat, és a szerver kérte várakozás alatt egyik sem indul (verificationGate.ts); az eredmény kártyája
// (VerificationResult) az űrlapok helyére lép, és a címére kerül a fókusz, ha az űrlapban volt; a „Másik
// kép / hash ellenőrzése” üres űrlapot ad, a fókusz az indító vezérlőre. A „Hogyan működik?” magyarázat
// mindig látszik – az adatlap „Mit jelent ez?” hivatkozásának célja. A vizsgált fájlt a szerver nem
// tárolja.
import { useState } from 'react';

import type { Verification } from '../api/verify.api';
import { PageHeading } from '../components/ui/PageHeading';
import { HowItWorks } from '../components/verify/HowItWorks';
import { VerificationResult } from '../components/verify/VerificationResult';
import { VerifyFileForm } from '../components/verify/VerifyFileForm';
import { VerifyHashForm } from '../components/verify/VerifyHashForm';
import { useFileDropGuard } from '../hooks/useFileDropGuard';
import { usePageTitle } from '../hooks/usePageTitle';
import { useVerificationGate, type VerificationSource } from '../verify/verificationGate';

type Phase =
  | { kind: 'forms'; focus: VerificationSource | null }
  | { kind: 'result'; result: Verification; source: VerificationSource };

export function VerifyPage() {
  usePageTitle('Kép ellenőrzése');
  useFileDropGuard();
  const gateFor = useVerificationGate();
  const [phase, setPhase] = useState<Phase>({ kind: 'forms', focus: null });

  const resultOf = (source: VerificationSource) => (result: Verification) =>
    setPhase({ kind: 'result', result, source });
  /** Új ellenőrzés: üres űrlapok, a fókusz annak az indító vezérlőjén, amelyik az eredményt adta */
  const reset = () => {
    if (phase.kind === 'result') setPhase({ kind: 'forms', focus: phase.source });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <PageHeading>Kép ellenőrzése</PageHeading>
        <p className="leading-7 text-fg-muted">
          Tölts fel egy képet – vagy add meg a SHA-256 hash-ét –, és megmutatjuk, szerepel-e a
          PhotoChain blokkláncon vezetett nyilvántartásában. Bejelentkezés nem kell, a képet nem
          tároljuk.
        </p>
      </div>

      {phase.kind === 'result' ? (
        <VerificationResult result={phase.result} source={phase.source} onReset={reset} />
      ) : (
        <div className="space-y-8 rounded-lg border border-line bg-canvas p-5 shadow-card sm:p-6">
          <VerifyFileForm
            onResult={resultOf('file')}
            gate={gateFor('file')}
            autoFocus={phase.focus === 'file'}
          />
          <div className="border-t border-line pt-8">
            <VerifyHashForm
              onResult={resultOf('hash')}
              gate={gateFor('hash')}
              autoFocus={phase.focus === 'hash'}
            />
          </div>
        </div>
      )}

      <HowItWorks />
    </div>
  );
}
