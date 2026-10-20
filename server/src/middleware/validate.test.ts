import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { errorHandler } from './errorHandler.js';
import { withValidatedBody } from './validate.js';

const schema = z.object({
  name: z.string().trim().min(1),
  age: z.coerce.number().int(),
});

/** Egy minimális alkalmazás, amelynek a kezelője csak az ellenőrzött törzset kapja meg. */
function createEchoApp(handler = vi.fn()): Express {
  const app = express();
  app.use(express.json());
  app.post(
    '/echo',
    withValidatedBody(schema, (body, _req, res) => {
      handler(body);
      res.json({ data: body });
    }),
  );
  app.use(errorHandler);
  return app;
}

describe('withValidatedBody', () => {
  it('érvényes törzsnél a kezelő a séma által átalakított értéket kapja', async () => {
    const response = await request(createEchoApp())
      .post('/echo')
      .send({ name: '  Anna ', age: '31', extra: 'eldobandó' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { name: 'Anna', age: 31 } });
  });

  it('érvénytelen törzsnél 400-as VALIDATION_ERROR hibát ad, a kezelő le sem fut', async () => {
    const handler = vi.fn();

    const response = await request(createEchoApp(handler))
      .post('/echo')
      .send({ name: '', age: 'sok' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.map((detail: { path: string }) => detail.path)).toEqual([
      'name',
      'age',
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('törzs nélküli kérésnél is 400-as hibát ad', async () => {
    const response = await request(createEchoApp()).post('/echo');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('az aszinkron kezelő hibája is a központi hibakezelőhöz jut', async () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/echo',
      withValidatedBody(schema, async () => {
        await Promise.reject(new Error('belső részlet'));
      }),
    );
    app.use(errorHandler);

    const response = await request(app).post('/echo').send({ name: 'Anna', age: 31 });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
