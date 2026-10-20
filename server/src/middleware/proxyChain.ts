// A tárhely proxyláncának hossza (L32): a saját, jelölt mérőkérésünknél (GET /api/health?proxy_probe)
// a szerver naplózza, hány bejegyzés van az X-Forwarded-For fejlécben – IP-cím nélkül. Ha a mérőkérés
// maga nem küld ilyen fejlécet, ez a szám a kliens és a szerver közötti proxyk száma: ennyi legyen a
// TRUST_PROXY_HOPS. A Render nem dokumentálja a lánc hosszát (a Cloudflare és a saját
// terheléselosztója is előtte áll), ezért mérjük. Csak a jelölt kérést naplózza (nem egy tetszőleges
// első kérést, amely egy robot hamis fejléce is lehetne), és legfeljebb PROBE_LOG_LIMIT-szer, hogy a
// napló ne legyen elárasztható (L32 biztonsági átnézés).
// Forrás: Express – Express behind proxies (trust proxy: a megbízható ugrások száma),
// https://expressjs.com/en/guide/behind-proxies.html (adaptálva)
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

/** A mérőkérés jelölése (lekérdezési paraméter) */
const PROBE_PARAMETER = 'proxy_probe';
/** Ennyi mérőkérést naplózunk folyamatonként */
const PROBE_LOG_LIMIT = 10;

export function createProxyChainProbe(logger: Logger, trustedProxyHops: number): RequestHandler {
  let reported = 0;
  return (req, _res, next) => {
    const isProbe =
      req.method === 'GET' && req.path === '/api/health' && PROBE_PARAMETER in req.query;
    if (isProbe && reported < PROBE_LOG_LIMIT) {
      reported += 1;
      const header = req.headers['x-forwarded-for'] ?? '';
      const forwardedForEntries = String(header)
        .split(',')
        .filter((entry) => entry.trim() !== '').length;
      logger.info(
        { event: 'proxy_chain', forwardedForEntries, trustedProxyHops },
        `Proxylánc: az X-Forwarded-For fejlécben ${forwardedForEntries} bejegyzés van ` +
          `(beállítva: TRUST_PROXY_HOPS=${trustedProxyHops})`,
      );
    }
    next();
  };
}
