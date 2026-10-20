// A fetch lecserélése a tesztekben: a megadott válaszokat (vagy hibákat) adja sorban; a vártnál több
// hívás hibát ad, a teszt végén fel nem használt válasz pedig a tesztet buktatja (test/setup.ts) – így
// sem fölösleges, sem elmaradt kérés nem maradhat észrevétlen. Mint a valódi fetch, a megszakított
// kérés AbortError-ral végződik, és nem fogyaszt a sorból – így a StrictMode kettős effektusa (az első,
// megszakított lekérés) sem keveri össze a sorrendet. Az útvonalhoz kötött válasz (forPath) csak arra
// az útvonalra érvényes: az egyszerre induló kérések (pl. a galéria képei és kategóriái) sorrendje így
// nem számít. A késleltetett válasz (DeferredResponse) kézzel zárható le, így a köztes állapot
// (betöltés, foglalt gomb) is tesztelhető.
import { vi } from 'vitest';

/** JSON-válasz a szerver formájában. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Kézzel lezárható válasz: a teszt dönti el, mikor és mivel érkezik. */
export class DeferredResponse {
  readonly promise: Promise<Response>;
  resolve!: (response: Response) => void;
  reject!: (error: unknown) => void;

  constructor() {
    this.promise = new Promise<Response>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

export type Outcome = Response | Error | DOMException | DeferredResponse;

/** Csak a megadott útvonalra (a lekérdezés nélkül, pl. „/api/categories”) érvényes válasz. */
interface RoutedOutcome {
  path: string;
  outcome: Outcome;
}

export type QueuedOutcome = Outcome | RoutedOutcome;

export const forPath = (path: string, outcome: Outcome): RoutedOutcome => ({ path, outcome });

const isRouted = (item: QueuedOutcome): item is RoutedOutcome => 'outcome' in item;

const abortError = () => new DOMException('A kérés megszakadt.', 'AbortError');

/** A kiszolgált (választ kapott) kérések címe fetch-csonkonként, sorrendben. */
const servedUrls = new WeakMap<object, string[]>();
/** A legutóbbi csonk sora – a teszt végén üresnek kell lennie (test/setup.ts). */
let activeQueue: QueuedOutcome[] = [];

export function stubFetch(...outcomes: QueuedOutcome[]) {
  const queue = [...outcomes];
  const served: string[] = [];
  const fetchMock = vi.fn<typeof fetch>(
    (input, init) =>
      new Promise<Response>((resolve, reject) => {
        const url = String(input);
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(abortError()), { once: true });
        // A kimenet a hívás utáni mikrotaszkban dől el: az addig megszakított kérés nem fogyaszt
        queueMicrotask(() => {
          if (signal?.aborted) {
            reject(abortError());
            return;
          }
          const path = url.split('?')[0];
          const index = queue.findIndex((item) => !isRouted(item) || item.path === path);
          if (index === -1) {
            reject(new Error(`Váratlan fetch-hívás: ${url}`));
            return;
          }
          const [item] = queue.splice(index, 1);
          const outcome = isRouted(item!) ? item.outcome : item!;
          served.push(url);
          if (outcome instanceof Response) resolve(outcome);
          else if (outcome instanceof DeferredResponse) outcome.promise.then(resolve, reject);
          else reject(outcome);
        });
      }),
  );
  servedUrls.set(fetchMock, served);
  activeQueue = queue;
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * A ténylegesen kiszolgált kérések címe, sorrendben – a választ nem kapott (pl. a StrictMode kettős
 * effektusa miatt azonnal megszakított) kérések nélkül.
 */
export function requestedUrls(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return [...(servedUrls.get(fetchMock) ?? [])];
}

/** A teszt végén fel nem használt válaszok száma; egyúttal elengedi a sort. */
export function takeUnusedOutcomeCount(): number {
  const count = activeQueue.length;
  activeQueue = [];
  return count;
}
