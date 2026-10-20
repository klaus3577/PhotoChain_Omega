// Az auth-service egységtesztje adatbázis nélkül (hamis Prisma-klienssel): az, amit a végponttesztek
// a válaszból nem látnak – ismeretlen e-mail-címnél is lefut egy jelszó-összevetés.
import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../lib/password.js';
import { createAuthService } from './auth.service.js';

// A valódi függvények futnak, de a verifyPassword hívásai megfigyelhetők
vi.mock('../../lib/password.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/password.js')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

describe('createAuthService – login', () => {
  it('ismeretlen e-mail-címnél is összevet egy (nem létező jelszóhoz tartozó) bcrypt-hash-sel', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const service = createAuthService(prisma);

    const attempt = service.login({ email: 'nincs@photochain.test', password: 'barmi-jelszo' });

    await expect(attempt).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    // Enélkül az ismeretlen címre adott gyorsabb válasz elárulná, hogy nincs ilyen fiók
    expect(verifyPassword).toHaveBeenCalledExactlyOnceWith('barmi-jelszo', DUMMY_PASSWORD_HASH);
  });
});
