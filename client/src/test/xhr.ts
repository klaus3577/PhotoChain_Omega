// Hamis XMLHttpRequest a feltöltés tesztjeihez (L21): a kérés adatai (metódus, cím, fejlécek, az
// elküldött űrlap) megnézhetők, a feltöltés haladása, a válasz, a hálózati hiba és a megszakítás a
// tesztből váltható ki. A vi.stubGlobal cseréjét a setup minden teszt után visszavonja.
import { vi } from 'vitest';

export class FakeXhr extends EventTarget {
  static instances: FakeXhr[] = [];

  method = '';
  url = '';
  requestHeaders: Record<string, string> = {};
  body: unknown;
  responseType = '';
  status = 0;
  responseText = '';
  readyState = 0;
  aborted = false;
  /** A feltöltés haladásának eseményei ezen érkeznek (xhr.upload) */
  upload = new EventTarget();
  private responseHeaders = new Map<string, string>();

  constructor() {
    super();
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value;
  }

  send(body?: unknown): void {
    this.body = body;
  }

  abort(): void {
    // A már lezárult kérésnél – mint a böngészőben – nincs hatása
    if (this.readyState === 4) return;
    this.aborted = true;
    this.dispatchEvent(new Event('abort'));
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders.get(name.toLowerCase()) ?? null;
  }

  // --- A teszt oldaláról ---

  /** A feltöltés haladása (bájtban) */
  progress(loaded: number, total: number): void {
    this.upload.dispatchEvent(
      new ProgressEvent('progress', { lengthComputable: true, loaded, total }),
    );
  }

  /** A törzs hiánytalanul elment (az xhr.upload „load” eseménye): a szerver már feldolgozza */
  sent(): void {
    this.upload.dispatchEvent(
      new ProgressEvent('load', { lengthComputable: true, loaded: 1, total: 1 }),
    );
  }

  /** A szerver válasza – alapból JSON; a szöveges törzs változatlanul megy */
  respond(status: number, body: unknown, headers: Record<string, string> = {}): void {
    this.status = status;
    const allHeaders: Record<string, string> =
      typeof body === 'string' ? headers : { 'content-type': 'application/json', ...headers };
    this.responseHeaders = new Map(
      Object.entries(allHeaders).map(([name, value]) => [name.toLowerCase(), value]),
    );
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.readyState = 4;
    this.dispatchEvent(new Event('load'));
  }

  /** Hálózati hiba (a kérés nem jutott el a szerverig, vagy a kapcsolat megszakadt) */
  fail(): void {
    this.dispatchEvent(new Event('error'));
  }
}

/** A globális XMLHttpRequest cseréje a hamisra; a példányok a FakeXhr.instances listában. */
export function stubXhr(): typeof FakeXhr {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return FakeXhr;
}

/** A legutóbb létrehozott kérés. */
export function lastXhr(): FakeXhr {
  const xhr = FakeXhr.instances.at(-1);
  if (!xhr) throw new Error('Nem indult XMLHttpRequest-kérés');
  return xhr;
}

/** Az elküldött űrlap mezői (a fájl a neve és a típusa szerint). */
export function sentFields(xhr: FakeXhr): Record<string, string | { name: string; type: string }> {
  if (!(xhr.body instanceof FormData)) throw new Error('Az elküldött törzs nem FormData');
  const fields: Record<string, string | { name: string; type: string }> = {};
  for (const [name, value] of xhr.body.entries()) {
    fields[name] = value instanceof File ? { name: value.name, type: value.type } : value;
  }
  return fields;
}
