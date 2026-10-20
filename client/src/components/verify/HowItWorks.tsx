// „Hogyan működik?” (L17 drótváz „Ellenőrzés”, 5. jegyzet; Nielsen H10): három rövid, szakzsargon nélküli
// magyarázat – a digitális és a vizuális ujjlenyomat, a blokklánc. Az adatlap tanúsítványának „Mit jelent
// ez?” hivatkozása ide (#hogyan-mukodik – verify/anchors.ts) mutat: útvonalváltáskor a layout a
// célrészletre teszi a fókuszt (useRouteFocus), a ScrollRestoration oda görget.
import { Fingerprint, Link as LinkIcon, type LucideIcon, ScanEye } from 'lucide-react';

import { HOW_IT_WORKS_ID } from '../../verify/anchors';

interface Explanation {
  icon: LucideIcon;
  title: string;
  text: string;
}

const EXPLANATIONS: readonly Explanation[] = [
  {
    icon: Fingerprint,
    title: 'Digitális ujjlenyomat (SHA-256)',
    text: 'A fájl tartalmából számolt 64 jegyű azonosító. Egyetlen bit változása is teljesen más értéket ad – így a bitre azonos másolatot ismeri fel.',
  },
  {
    icon: ScanEye,
    title: 'Vizuális ujjlenyomat (dHash)',
    text: 'A kép kicsinyített, szürke változatának világosságkülönbségeiből számolt 64 bit. Átméretezés vagy újratömörítés után is szinte ugyanaz – így a módosított másolatot is felismeri.',
  },
  {
    icon: LinkIcon,
    title: 'Blokklánc (Ethereum Sepolia)',
    text: 'Az ujjlenyomatot és az időpontot egy okosszerződés őrzi. A rekordot utólag senki nem módosíthatja – a PhotoChain sem –, és bárki ellenőrizheti.',
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby={HOW_IT_WORKS_ID} className="border-t border-line pt-8">
      {/* Programból fókuszálható célpont (ideiglenes tabindex – lib/focus.ts), keret nélkül */}
      <h2 id={HOW_IT_WORKS_ID} className="text-xl font-semibold tracking-tight focus:outline-none">
        Hogyan működik?
      </h2>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {EXPLANATIONS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-lg border border-line p-4 text-sm leading-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              {title}
            </h3>
            <p className="mt-2 text-fg-muted">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
