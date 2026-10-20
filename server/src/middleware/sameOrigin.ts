// CSRF elleni második védvonal a SameSite=Lax süti mellé. A böngészők minden kéréshez elküldik a
// Sec-Fetch-Site fejlécet, amely megmondja, honnan indult a kérés; ezt egy weboldal JavaScriptje
// nem tudja meghamisítani. Erre a multipart feltöltés miatt van szükség: azt – a JSON-kéréssel
// ellentétben – egy idegen weboldal sima űrlapja is el tudná küldeni.
// Forrás: MDN – Sec-Fetch-Site, https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site;
// OWASP CSRF Prevention Cheat Sheet (Fetch Metadata),
// https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
import type { Request, RequestHandler } from 'express';

import { AppError } from '../lib/errors.js';

/** Az adatot nem módosító metódusok – ezeket más webhelyről is kiszolgáljuk. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * A fejléc elfogadott értékei: „same-origin” (a saját oldalunk) és „none” (a felhasználó maga
 * indította, pl. a címsorból). A „same-site” (ugyanaz a webhely, de másik port vagy aldomain) nem
 * elég: a SameSite=Lax süti az ilyen kéréssel is elmenne. A kliens és az API ezért ugyanarról az
 * eredetről érhető el (fejlesztéskor a Vite proxyján át).
 */
const TRUSTED_SITES: ReadonlySet<string> = new Set(['same-origin', 'none']);

/**
 * A nem saját eredetről indított módosító kéréseket elutasítja. A fejléc nélküli kérések (curl,
 * REST Client, szerver–szerver hívás, régi böngésző) átmennek: azokat nem egy idegen weboldal
 * indítja a felhasználó böngészőjéből.
 */
export const rejectCrossSiteRequests: RequestHandler = (req, _res, next) => {
  if (!SAFE_METHODS.has(req.method)) assertTrustedSite(req);
  next();
};

/**
 * Minden metódusra (az olvasókra is): a költséges, névtelen olvasó végpontot (pl. a láncot olvasó
 * hitelesség-ellenőrzést) egy idegen oldal a látogatói böngészőjéből sem indíthatja – pl. egy
 * <img src="…"> elemmel, a látogató keretét és a közös láncolvasási keretet égetve.
 */
export const rejectCrossSiteReads: RequestHandler = (req, res, next) => {
  // A válasz (200 vagy 403) a fejléctől függ: egy köztes gyorsítótár ne adja ki a más webhelyről
  // kiváltott 403-at a saját oldalnak (és fordítva)
  res.vary('Sec-Fetch-Site');
  assertTrustedSite(req);
  next();
};

/** A Sec-Fetch-Site szabványos értékei – a naplóba csak ezek kerülnek szó szerint. */
const KNOWN_SITES: ReadonlySet<string> = new Set([
  'cross-site',
  'same-site',
  'same-origin',
  'none',
]);

function assertTrustedSite(req: Request): void {
  const site = req.get('Sec-Fetch-Site');
  if (site !== undefined && !TRUSTED_SITES.has(site)) {
    // L30 (A09): az elutasított kísérlet nyoma a naplóban; a nem szabványos érték nem kerül be szó
    // szerint (a kliens bármit írhat a fejlécbe)
    req.log?.warn(
      { event: 'cross_site_rejected', secFetchSite: KNOWN_SITES.has(site) ? site : 'ismeretlen' },
      'Más webhelyről indított kérés elutasítva',
    );
    throw new AppError(403, 'FORBIDDEN', 'Más webhelyről indított kérés nem engedélyezett');
  }
}
