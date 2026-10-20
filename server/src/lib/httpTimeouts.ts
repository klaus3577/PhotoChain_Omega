// A HTTP-szerver időkorlátai. A fordított proxy (élesben a Render) a szerverrel nyitott kapcsolatot
// a kérések között üresjáratban is életben tartja, és újrahasznosítja. A Node alapból 5 másodperc
// üresjárat után zárja le a kapcsolatot: ha ez a proxy előtt történik, a proxy egy már lezárt
// kapcsolatra küldheti a következő kérést – a látogató ilyenkor időnként 502-es hibát kap, a szerver
// naplójában pedig nem jelenik meg semmi. Ezért az üresjárati időkorlát hosszabb a proxyénál
// (a Render közösségi ajánlása szerint 120 s), a fejléceké pedig annál is hosszabb.
// Forrás: Render – Troubleshooting Your Deploy (502 Bad Gateway: keepAliveTimeout, headersTimeout),
// https://render.com/docs/troubleshooting-deploys; Node.js – HTTP (server.keepAliveTimeout,
// server.headersTimeout, server.requestTimeout), https://nodejs.org/api/http.html (adaptálva)
import type { Server } from 'node:http';

/** Egy 15 MB-os kép lassú (kb. 1 Mbit/s-os) feltöltéssel is belefér. */
export const REQUEST_TIMEOUT_MS = 180_000;
/** Az üresjárati kapcsolat ennyi ideig marad nyitva – tovább, mint a proxyé (120 s). */
export const KEEP_ALIVE_TIMEOUT_MS = 125_000;
/** A fejlécek megérkezésének határideje: az üresjárati időnél hosszabb, a teljes kérésénél rövidebb. */
export const HEADERS_TIMEOUT_MS = 126_000;

/** Leállítás közben ilyen gyakran zárjuk le az időközben üresjáratba került kapcsolatokat. */
const IDLE_SWEEP_INTERVAL_MS = 1_000;

/**
 * A szerver leállítása: új kapcsolatot nem fogad, a folyamatban lévő kéréseket befejezi, utána hív
 * vissza. A server.close() csak a már üresjárati kapcsolatokat bontja; a leállítás közben befejeződő
 * kérés kapcsolata a hosszú üresjárati időkorlát (KEEP_ALIVE_TIMEOUT_MS) végéig nyitva maradna – ezért
 * az üresjáratba kerülőket másodpercenként lezárjuk, így a leállás nem vár két percet.
 */
export function closeGracefully(
  server: Pick<Server, 'close' | 'closeIdleConnections'>,
  onClosed: () => void,
): void {
  const sweep = setInterval(() => server.closeIdleConnections(), IDLE_SWEEP_INTERVAL_MS);
  sweep.unref();
  server.close(() => {
    clearInterval(sweep);
    onClosed();
  });
}

/** A szerver időkorlátainak beállítása (a listen után, a server.ts-ből). */
export function configureHttpTimeouts(
  server: Pick<Server, 'requestTimeout' | 'headersTimeout' | 'keepAliveTimeout'>,
): void {
  // Egy kérés (a feltöltött fájllal együtt) legfeljebb ennyi idő alatt érkezzen meg; a nagyon lassan
  // csordogáló feltöltés így nem foglalhatja sokáig a feltöltési helyek egyikét (a Node alapértéke
  // 5 perc). Élesben ezt a fordított proxy is korlátozza (L32).
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
}
