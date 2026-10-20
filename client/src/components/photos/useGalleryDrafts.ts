// A galéria szűrősávjának szerkesztési állapota (GalleryFilters): a szöveges mezők (keresőszó, ár-tartomány)
// piszkozata és a nézet alkalmazása az URL-re. Szabályok:
// - A szöveges mezők gépelés után 400 ms-mal alkalmazódnak, Enterre azonnal; érvénytelen árnál
//   hibaüzenet (riasztás: gépelés közben egyszer, Enterre újra), csak a hibás mező jelölt, és az ár nem
//   változik. A mezők elhagyása csak a hibát mutatja meg, nem alkalmaz (az oldal ne rendeződjön át a
//   következő kattintás alatt). A késleltetett alkalmazás mindig a legfrissebb nézethez igazodik (pl. ha
//   közben kategóriát választott).
// - Egy szerkesztési sorozat egyetlen előzmény-bejegyzés: az első alkalmazás új bejegyzés, a folytatás
//   (ugyanabban a mezőcsoportban vagy választóban) annak helyére lép – a vissza gomb így a sorozat előtti
//   nézetre visz, nem minden gépelési szünetre (és a választóban nyilakkal lépkedés sem hagy sok
//   bejegyzést). Új sorozatot kezd egy vezérlő fókusza, az Enter, a címke törlése és az URL külső
//   változása (pl. a vissza gomb).
// - Ha az URL kívülről változik (vissza gomb, címke törlése), a mezők követik – a saját alkalmazásunk
//   megérkezése viszont nem írja felül a közben gépelt szöveget: a navigáció a hívás után, külön lépésben
//   fut le (a flushSync csak a renderelését teszi szinkronná), addig újabb betű érkezhet.
// Forrás: React – useEffectEvent, https://react.dev/reference/react/useEffectEvent; React – You Might
// Not Need an Effect (állapot igazítása renderelés közben),
// https://react.dev/learn/you-might-not-need-an-effect (adaptálva)
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import {
  type GalleryParams,
  gallerySearchParams,
  parsePriceInput,
  searchFromInput,
} from '../../photos/galleryParams';

/** Gépelés után ennyi idő múlva frissül a nézet (a gyors gépelés nem indít kérést minden betűnél) */
const SEARCH_DELAY_MS = 400;

/** A formátumhiba üzenete megnevezi a hibás mezőt (nem csak a keret színe mutatja – WCAG 1.4.1) */
const PRICE_FORMAT_ERRORS = {
  min: 'A legalacsonyabb ár egész forintösszeg legyen (pl. 5 000).',
  max: 'A legmagasabb ár egész forintösszeg legyen (pl. 5 000).',
  both: 'Az ár egész forintösszeg legyen (pl. 5 000).',
};
const PRICE_ORDER_ERROR = 'A legalacsonyabb ár nem lehet nagyobb a legmagasabbnál.';

export interface GalleryUpdate {
  /** Az előzményekben a mostani bejegyzés helyére lép */
  replace?: boolean;
}

/** Az ár hibája: a fajtája, az üzenet és a hibás mező(k) */
interface PriceProblem {
  kind: 'format' | 'order';
  message: string;
  min: boolean;
  max: boolean;
}

export interface PriceError extends PriceProblem {
  /** Minden új riasztás új kulcs: a képernyőolvasó újra felolvassa */
  key: number;
}

/** A szerkesztési sorozat vezérlője: a szöveges mezők együtt, a választók külön */
type EditControl = 'text' | 'category' | 'sort';

/** A folyamatban lévő szerkesztési sorozat: a vezérlő és az utoljára általa beállított nézet (URL) */
interface EditSeries {
  control: EditControl;
  search: string;
}

/** A szöveges mezők jelentése az URL-ben */
interface TextValues {
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
}

const textValuesOf = ({ q, minPrice, maxPrice }: GalleryParams): TextValues => ({
  q,
  minPrice,
  maxPrice,
});

const sameTextValues = (a: TextValues, b: TextValues) =>
  a.q === b.q && a.minPrice === b.minPrice && a.maxPrice === b.maxPrice;

const priceText = (price: number | null) => (price === null ? '' : String(price));

type PriceReading =
  | { ok: true; minPrice: number | null; maxPrice: number | null }
  | { ok: false; problem: PriceProblem };

function readPrices(minText: string, maxText: string): PriceReading {
  const min = parsePriceInput(minText);
  const max = parsePriceInput(maxText);
  if (min === 'invalid' || max === 'invalid') {
    const fields =
      min === 'invalid' && max === 'invalid' ? 'both' : min === 'invalid' ? 'min' : 'max';
    const message = PRICE_FORMAT_ERRORS[fields];
    const problem: PriceProblem = {
      kind: 'format',
      message,
      min: min === 'invalid',
      max: max === 'invalid',
    };
    return { ok: false, problem };
  }
  if (min !== null && max !== null && min > max) {
    const problem: PriceProblem = {
      kind: 'order',
      message: PRICE_ORDER_ERROR,
      min: true,
      max: true,
    };
    return { ok: false, problem };
  }
  return { ok: true, minPrice: min, maxPrice: max };
}

const sameProblem = (a: PriceProblem, b: PriceProblem) =>
  a.message === b.message && a.min === b.min && a.max === b.max;

export function useGalleryDrafts(
  params: GalleryParams,
  onChange: (next: GalleryParams, update?: GalleryUpdate) => void,
  /** A keresés és a szűrők törlésekor nő: a félbehagyott gépelés és a hibaüzenet sem marad meg */
  generation: number,
) {
  const [text, setText] = useState(params.q);
  const [minText, setMinText] = useState(priceText(params.minPrice));
  const [maxText, setMaxText] = useState(priceText(params.maxPrice));
  const [priceError, setPriceError] = useState<PriceError | null>(null);
  /** Az URL szöveges értékei, amelyekhez a mezők legutóbb igazodtak */
  const [synced, setSynced] = useState(() => textValuesOf(params));
  /** A saját, még meg nem érkezett alkalmazásunk értékei */
  const [committed, setCommitted] = useState<TextValues | null>(null);
  const [seenGeneration, setSeenGeneration] = useState(generation);
  const editing = useRef<EditSeries | null>(null);

  // Törlés: a mezők a törölt (üres) állapotot mutatják – még az URL frissülése előtt, így a késleltetett
  // alkalmazás sem írhatja vissza a félbehagyott gépelést
  if (generation !== seenGeneration) {
    setSeenGeneration(generation);
    setText('');
    setMinText('');
    setMaxText('');
    setPriceError(null);
    setCommitted(null);
  }

  const current = textValuesOf(params);
  if (!sameTextValues(current, synced)) {
    const own = committed !== null && sameTextValues(current, committed);
    setSynced(current);
    if (committed !== null) setCommitted(null);
    // Kívülről változott: a mezők követik – az azonos jelentésű gépelt szöveget (pl. a záró szóközt) nem
    // írja felül
    if (!own) {
      if (searchFromInput(text) !== params.q) setText(params.q);
      if (parsePriceInput(minText) !== params.minPrice) setMinText(priceText(params.minPrice));
      if (parsePriceInput(maxText) !== params.maxPrice) setMaxText(priceText(params.maxPrice));
      setPriceError(null);
    }
  }

  /**
   * A nézet alkalmazása (az első oldallal); a sorozat folytatása az előző bejegyzés helyére lép – ha az
   * URL azóta kívülről nem változott (pl. a vissza gomb új sorozatot kezd).
   */
  const apply = (control: EditControl, next: GalleryParams) => {
    const target = { ...next, page: 1 };
    const series = editing.current;
    const replace =
      series?.control === control && series.search === gallerySearchParams(params).toString();
    editing.current = { control, search: gallerySearchParams(target).toString() };
    onChange(target, { replace });
  };

  const reportPrice = (problem: PriceProblem | null, explicit: boolean) =>
    setPriceError((previous) => {
      if (problem === null) return null;
      // Ugyanaz a hiba gépelés közben nem hangzik el újra, Enterre igen
      if (previous !== null && !explicit && sameProblem(previous, problem)) return previous;
      return { ...problem, key: (previous?.key ?? 0) + 1 };
    });

  /**
   * A beírt keresőszó és ár alkalmazása; érvénytelen árnál hibaüzenet, és az ár nem változik. Gépelés
   * közben (nem kifejezett alkalmazásnál) a fordított tartomány még nem hiba – pl. 50 000 írása közben az
   * 5 –, csak Enterre, a mezők elhagyásakor, vagy ha már látszik egy árhiba. A visszatérési érték: az ár
   * rendben van-e.
   */
  const commitText = (explicit: boolean): boolean => {
    const prices = readPrices(minText, maxText);
    const problem = prices.ok ? null : prices.problem;
    const premature = problem?.kind === 'order' && !explicit && priceError === null;
    reportPrice(premature ? null : problem, explicit);
    const q = searchFromInput(text);
    const next: GalleryParams = prices.ok
      ? { ...params, q, minPrice: prices.minPrice, maxPrice: prices.maxPrice }
      : { ...params, q };
    if (!sameTextValues(textValuesOf(next), current)) {
      setCommitted(textValuesOf(next));
      apply('text', next);
    }
    return prices.ok;
  };

  // A késleltetett alkalmazás mindig a legfrissebb nézethez igazodik
  const commitTyped = useEffectEvent(() => commitText(false));
  useEffect(() => {
    const timer = window.setTimeout(commitTyped, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, minText, maxText]);

  return {
    text,
    setText,
    minText,
    setMinText,
    maxText,
    setMaxText,
    priceError,
    /** Enter: azonnali alkalmazás, és a sorozat vége; az érték: az ár rendben van-e */
    submit: (): boolean => {
      const ok = commitText(true);
      editing.current = null;
      return ok;
    },
    /**
     * Az ármezők elhagyása: a még fennálló hiba (pl. fordított tartomány) most már hiba – de nem alkalmaz
     * (azt a késleltetés vagy az Enter teszi): az oldal nem rendeződik át a következő kattintás alatt
     */
    checkPrices: () => {
      const prices = readPrices(minText, maxText);
      reportPrice(prices.ok ? null : prices.problem, true);
    },
    /** Választó (kategória, rendezés) módosítása */
    select: (control: 'category' | 'sort', patch: Partial<GalleryParams>) =>
      apply(control, { ...params, ...patch }),
    /** Egy szűrő törlése (címke): mindig új bejegyzés */
    remove: (patch: Partial<GalleryParams>) => {
      editing.current = null;
      onChange({ ...params, ...patch, page: 1 });
    },
    /** Egy vezérlő fókusza új szerkesztési sorozatot kezd */
    startEditing: () => {
      editing.current = null;
    },
  };
}
