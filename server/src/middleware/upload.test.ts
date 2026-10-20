// A fájlfogadó middleware tesztjei egy próbaalkalmazáson (adatbázis nélkül): korlátok és hibák.
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { errorHandler } from './errorHandler.js';
import { createImageUpload, IMAGE_FIELD_NAME } from './upload.js';

const MAX_BYTES = 1000;
const MAX_TEXT_FIELDS = 10;
const FILE = Buffer.alloc(500, 1);

function createProbeApp(): Express {
  const app = express();
  app.post('/feltoltes', createImageUpload(MAX_BYTES), (req, res) => {
    res.json({ data: { bytes: req.file?.size ?? null, fields: req.body as unknown } });
  });
  app.use(errorHandler);
  return app;
}

const post = (): request.Test => request(createProbeApp()).post('/feltoltes');

function postWithFields(count: number): request.Test {
  const pending = post();
  for (let index = 0; index < count; index += 1) pending.field(`mezo${index}`, 'x');
  return pending;
}

describe('createImageUpload', () => {
  it('az „image” mező fájlját a memóriába olvassa, a szöveges mezőket a req.body-ba', async () => {
    const response = await post().field('title', 'Cím').attach(IMAGE_FIELD_NAME, FILE, 'a.jpg');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ bytes: 500, fields: { title: 'Cím' } });
  });

  it('a megengedettnél nagyobb fájl: 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await post().attach(IMAGE_FIELD_NAME, Buffer.alloc(MAX_BYTES + 1), 'a.jpg');

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('nem multipart kérés: 415, érthető üzenettel', async () => {
    const response = await post().send({ title: 'Cím' });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(response.body.error.message).toContain('multipart/form-data');
  });

  it.each([
    ['más nevű mezőben küldött fájl', () => post().attach('kep', FILE, 'a.jpg')],
    [
      'két fájl',
      () => post().attach(IMAGE_FIELD_NAME, FILE, 'a.jpg').attach(IMAGE_FIELD_NAME, FILE, 'b.jpg'),
    ],
    ['túl sok szöveges mező', () => postWithFields(MAX_TEXT_FIELDS + 1)],
    ['túl hosszú szöveges mező', () => post().field('title', 'x'.repeat(11 * 1024))],
    // Az ilyen mezőnevekből a multer egymásba ágyazott objektumot, illetve óriási tömböt építene
    ['egymásba ágyazott mezőnév', () => post().field('a[b]', 'x')],
    ['tömbindexes mezőnév', () => post().field('a[999999999]', 'x')],
  ])('%s: 400 INVALID_UPLOAD', async (_name, send) => {
    const response = await send();

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_UPLOAD');
  });
});
