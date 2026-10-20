// A más webhelyről indított, módosító kérések tiltásának tesztjei (CSRF elleni második védvonal).
import express, { type Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { errorHandler } from './errorHandler.js';
import { rejectCrossSiteReads, rejectCrossSiteRequests } from './sameOrigin.js';

function createProbeApp(): Express {
  const app = express();
  app.use(rejectCrossSiteRequests);
  app.all('/probe', (_req, res) => {
    res.json({ data: { ok: true } });
  });
  app.use(errorHandler);
  return app;
}

describe('rejectCrossSiteRequests', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'más webhelyről indított módosító kérést (%s) 403-mal elutasít',
    async (method) => {
      const agent = request(createProbeApp());

      const response = await agent[method]('/probe').set('Sec-Fetch-Site', 'cross-site');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    },
  );

  // A „same-site” más eredetet jelent ugyanazon a webhelyen (másik port vagy aldomain): a
  // SameSite=Lax süti az ilyen kéréssel is elmegy, ezért ezt sem engedjük át
  it.each(['same-site', 'ismeretlen-ertek'])(
    'a nem saját eredetű („%s”) módosító kérést is elutasítja',
    async (site) => {
      const response = await request(createProbeApp()).post('/probe').set('Sec-Fetch-Site', site);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    },
  );

  it('a saját oldalról, a címsorból és a nem böngészőből érkező kérést átengedi', async () => {
    for (const site of ['same-origin', 'none']) {
      await request(createProbeApp()).post('/probe').set('Sec-Fetch-Site', site).expect(200);
    }
    // curl, REST Client, szerver–szerver hívás (pl. Stripe-webhook): nincs Sec-Fetch-Site fejléc
    await request(createProbeApp()).post('/probe').expect(200);
  });

  it('az olvasó kéréseket (GET, HEAD) más webhelyről is kiszolgálja', async () => {
    await request(createProbeApp()).get('/probe').set('Sec-Fetch-Site', 'cross-site').expect(200);
    await request(createProbeApp()).head('/probe').set('Sec-Fetch-Site', 'cross-site').expect(200);
    await request(createProbeApp()).get('/probe').set('Sec-Fetch-Site', 'same-site').expect(200);
  });

  // L30 (A09): az elutasított CSRF-kísérlet nyoma a naplóban – a fejléc értékével, a túl hosszú
  // vagy furcsa érték nem kerül be szó szerint
  it('az elutasított kérést figyelmeztetésként naplózza, a Sec-Fetch-Site értékével', async () => {
    const lines: Array<Record<string, unknown>> = [];
    const app = express();
    app.use((req, _res, next) => {
      req.log = pino({ level: 'info' }, { write: (line: string) => lines.push(JSON.parse(line)) });
      next();
    });
    app.use(rejectCrossSiteRequests);
    app.post('/probe', (_req, res) => {
      res.json({ data: { ok: true } });
    });
    app.use(errorHandler);

    await request(app).post('/probe').set('Sec-Fetch-Site', 'cross-site').expect(403);
    await request(app)
      .post('/probe')
      .set('Sec-Fetch-Site', `x${'y'.repeat(100)}`)
      .expect(403);
    await request(app).post('/probe').set('Sec-Fetch-Site', 'same-origin').expect(200);

    expect(lines).toMatchObject([
      { level: 40, event: 'cross_site_rejected', secFetchSite: 'cross-site' },
      { level: 40, event: 'cross_site_rejected', secFetchSite: 'ismeretlen' },
    ]);
  });
});

// A költséges, névtelen olvasó végpontokhoz (pl. a láncot olvasó hitelesség-ellenőrzés): egy idegen
// oldal ezeket a látogatói böngészőjéből sem indíthatja (pl. <img src="…"> elemmel)
describe('rejectCrossSiteReads', () => {
  function createReadProbeApp(): Express {
    const app = express();
    app.get('/probe', rejectCrossSiteReads, (_req, res) => {
      res.json({ data: { ok: true } });
    });
    app.use(errorHandler);
    return app;
  }

  it.each(['cross-site', 'same-site'])(
    'a más eredetről („%s”) indított olvasó kérést is 403-mal elutasítja',
    async (site) => {
      const response = await request(createReadProbeApp())
        .get('/probe')
        .set('Sec-Fetch-Site', site);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    },
  );

  it('a saját oldalról, a címsorból és a nem böngészőből érkező kérést átengedi', async () => {
    for (const site of ['same-origin', 'none']) {
      await request(createReadProbeApp()).get('/probe').set('Sec-Fetch-Site', site).expect(200);
    }
    await request(createReadProbeApp()).get('/probe').expect(200);
  });
});
