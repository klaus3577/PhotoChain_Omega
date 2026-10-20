// Állapotellenőrzés – a tárhelyszolgáltató (L32) és a fejlesztő is ezzel nézi, hogy fut-e a szerver.
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok' } });
});
