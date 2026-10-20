// A hitelesség-ellenőrző bemenetének ellenőrzése (Zod).
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import { z } from 'zod';

/**
 * A GET /api/verify/:sha256 paramétere: SHA-256 hash, 64 hexadecimális karakter. A nagybetűs és a
 * 0x előtagú alakot is elfogadjuk – az Etherscan a tartalom-hash-t így mutatja (bytes32) –, és a
 * tárolt alakra (kisbetűs, előtag nélkül) hozzuk.
 */
export const verifyHashParamsSchema = z.object({
  sha256: z
    .string()
    .regex(/^(0[xX])?[0-9a-fA-F]{64}$/, {
      error: 'SHA-256 hash kell (64 hexadecimális karakter, a 0x előtag elhagyható)',
    })
    .transform((value) => value.replace(/^0x/i, '').toLowerCase()),
});
