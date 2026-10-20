// Az űrlapok közös állapota (L19: belépés, regisztráció; L21: feltöltés): mezőértékek, mezőhibák, a
// hibás mezőre ugró fókusz és a szerver hibája. Beküldéskor minden mezőt ellenőriz, a korábbi
// hibaüzenetet törli; gépelés közben csak a már látható hibát frissíti (a hiba eltűnik, amint javítod),
// új hibát nem tesz ki gépelés közben. A fókusz a hibaüzenet megjelenése UTÁN kerül az első hibás
// mezőre – így a képernyőolvasó a mezővel együtt a hibát is felolvassa (WCAG 3.3.1). Ha a fókusz már
// azon a mezőn van (Enterrel küldte be), az áthelyezés semmit nem olvasna fel: ilyenkor egy rejtett
// riasztás mondja el a hibát a mező nevével. A mező szöveges beviteli mező, többsoros mező vagy
// választó lehet.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { serverFieldErrors, type FieldErrors } from '../auth/validation';
import { errorText } from '../lib/text';

/** Üzenet, minden újnál új azonosítóval – a képernyőolvasó az ismétlődő szöveget is újra felolvassa. */
export interface FormMessage {
  id: number;
  text: string;
}

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function useForm<F extends string>(
  fields: readonly F[],
  validate: (values: Record<F, string>) => FieldErrors<F>,
  /** A mezők kiinduló értéke (pl. a kép meglévő adatai a szerkesztésnél – L22); alapból üres */
  initialValues: Partial<Record<F, string>> = {},
) {
  const startValues = () =>
    Object.fromEntries(fields.map((field) => [field, initialValues[field] ?? ''])) as Record<
      F,
      string
    >;
  const [values, setValues] = useState(startValues);
  // A legfrissebb értékek: egy ütemben érkező két változás (pl. automatikus kitöltés) sem vész el
  const latestValues = useRef(values);
  const [errors, setErrors] = useState<FieldErrors<F>>({});
  /** A szerver nem mezőhöz köthető hibája (pl. hibás adatok, túl sok próbálkozás) */
  const [failure, setFailure] = useState<FormMessage | null>(null);
  /** A már fókuszban lévő hibás mező hibája – rejtett riasztásként */
  const [fieldAlert, setFieldAlert] = useState<FormMessage | null>(null);
  // Új objektum minden kéréskor: ugyanarra a mezőre is újra fókuszál
  const [focusRequest, setFocusRequest] = useState<{ field: F } | null>(null);
  const inputs = useRef(new Map<F, FormControl>());
  // Mezőnként egyetlen ref-visszahívás: különben minden rendereléskor le- és visszacsatolódnának a mezők
  const refCallbacks = useRef(new Map<F, (element: FormControl | null) => void>());
  const messageCount = useRef(0);

  const refFor = (field: F) => {
    let callback = refCallbacks.current.get(field);
    if (!callback) {
      callback = (element) => {
        if (element) inputs.current.set(field, element);
        else inputs.current.delete(field);
      };
      refCallbacks.current.set(field, callback);
    }
    return callback;
  };

  useEffect(() => {
    if (focusRequest) inputs.current.get(focusRequest.field)?.focus();
  }, [focusRequest]);

  const message = (text: string): FormMessage => {
    messageCount.current += 1;
    return { id: messageCount.current, text };
  };

  /**
   * A hibák megjelenítése, és az első hibás mező jelzése (fókusz vagy rejtett riasztás) – a fókusz
   * elhagyható, ha az űrlapnak egy korábbi vezérlője (pl. a fájlválasztó) is hibás. Igaz, ha volt hiba.
   */
  const showErrors = (found: FieldErrors<F>, { focus = true } = {}): boolean => {
    setErrors(found);
    const first = fields.find((field) => found[field]);
    if (first === undefined) return false;
    if (!focus) return true;
    const input = inputs.current.get(first);
    if (input && input === document.activeElement) {
      // Rádiócsoportnál a csoport neve (legend), nem az egyik gomb címkéje („1 csillag”)
      const legend =
        input instanceof HTMLInputElement && input.type === 'radio'
          ? input.closest('fieldset')?.querySelector('legend')?.textContent
          : undefined;
      const label = legend ?? input.labels?.[0]?.textContent ?? '';
      setFieldAlert(message(`${label}: ${found[first]}`));
    } else {
      setFocusRequest({ field: first });
    }
    return true;
  };

  /** A szerver mezőhibái a mezők mellé. Igaz, ha volt ilyen – különben a hívó máshogy jelzi a hibát. */
  const showServerFieldErrors = (error: unknown): boolean =>
    showErrors(serverFieldErrors(error, fields));

  /** A szerver hibája: mezőhiba (pl. foglalt e-mail-cím) a mező mellé, más hiba riasztásként. */
  const showServerError = (error: unknown) => {
    if (!showServerFieldErrors(error)) setFailure(message(errorText(error)));
  };

  /** Általános (nem mezőhöz kötött) hiba riasztásként. */
  const showFailure = (text: string) => setFailure(message(text));

  /** Fókusz egy mezőre (pl. a kategóriák sikeres újratöltése után, az eltűnő gomb helyett). */
  const focusField = (field: F) => setFocusRequest({ field });

  /** Az előző beküldés üzenetei törlődnek (új beküldés előtt). */
  const clearMessages = () => {
    setFailure(null);
    setFieldAlert(null);
  };

  /** Az űrlap a kiinduló értékekkel (pl. újabb kép feltöltéséhez: üresen). */
  const reset = () => {
    latestValues.current = startValues();
    setValues(latestValues.current);
    setErrors({});
    clearMessages();
  };

  const fieldProps = (field: F) => ({
    value: values[field],
    error: errors[field],
    ref: refFor(field),
    onChange: (event: ChangeEvent<FormControl>) => {
      const next = { ...latestValues.current, [field]: event.target.value };
      latestValues.current = next;
      setValues(next);
      if (errors[field]) setErrors((current) => ({ ...current, [field]: validate(next)[field] }));
      // A rejtett riasztás elhangzott; javítás közben ne maradjon (olvasó módban elavult volna)
      setFieldAlert(null);
    },
  });

  const handleSubmit =
    (onValid: (values: Record<F, string>) => void) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearMessages();
      if (!showErrors(validate(values))) onValid(values);
    };

  return {
    values,
    fieldProps,
    handleSubmit,
    showErrors,
    showServerError,
    showServerFieldErrors,
    showFailure,
    focusField,
    clearMessages,
    reset,
    failure,
    fieldAlert,
  };
}
