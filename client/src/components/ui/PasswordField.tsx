// Jelszómező megjelenítő kapcsolóval: a beírt jelszó ellenőrizhető (kevesebb elgépelés – megerősítő
// mező helyett). A gomb a mező után áll (a Tab a mezőből rá visz, nem fordítva), felirata és ikonja
// állandó, az állapotát az aria-pressed és a látvány jelzi: benyomva sötét, inverz gomb. Beküldéskor
// – még az űrlap feldolgozása előtt – és a vissza-gyorsítótárból (bfcache) visszaállított oldalon a
// jelszó újra rejtett: a jelszókezelő jelszómezőként látja, és a visszatérő felhasználó előtt sem
// marad látható. A beillesztés és a jelszókezelő engedélyezett (WCAG 3.3.8).
// Forrás: GOV.UK Design System – Password input, https://design-system.service.gov.uk/components/password-input/,
// és a password-input.mjs (submit, pageshow), https://github.com/alphagov/govuk-frontend/blob/main/packages/govuk-frontend/src/govuk/components/password-input/password-input.mjs;
// WAI-ARIA APG – Button (toggle), https://www.w3.org/WAI/ARIA/apg/patterns/button/;
// MDN – Window: pageshow event, https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event (adaptálva)
import { Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { TextField, type TextFieldProps } from './TextField';

type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'action'>;

// Benyomva inverz (fehér a feketén, 21:1) – a halvány háttérváltás (#fff → #fafafa) nem volna látható
const TOGGLE =
  'inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-canvas px-3 text-sm font-medium text-fg hover:bg-surface aria-pressed:border-black aria-pressed:bg-black aria-pressed:text-white aria-pressed:hover:bg-neutral-800';

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = wrapper.current?.closest('form');
    // Az űrlap saját figyelője a React onSubmit előtt fut: a mező a feldolgozáskor már jelszómező
    const hideOnSubmit = () => flushSync(() => setVisible(false));
    const hideOnRestore = (event: PageTransitionEvent) => {
      if (event.persisted) setVisible(false);
    };
    form?.addEventListener('submit', hideOnSubmit);
    window.addEventListener('pageshow', hideOnRestore);
    return () => {
      form?.removeEventListener('submit', hideOnSubmit);
      window.removeEventListener('pageshow', hideOnRestore);
    };
  }, []);

  return (
    <div ref={wrapper}>
      <TextField
        {...props}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        spellCheck={false}
        action={
          <button
            type="button"
            aria-pressed={visible}
            onClick={() => setVisible((shown) => !shown)}
            className={TOGGLE}
          >
            <Eye aria-hidden="true" className="size-4 shrink-0" />
            Jelszó megjelenítése
          </button>
        }
      />
    </div>
  );
}
