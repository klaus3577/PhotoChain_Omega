import { compare, getRounds } from 'bcryptjs';
import { describe, expect, it } from 'vitest';

import { BCRYPT_COST, DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';

const PASSWORD = 'nagyon-titkos-jelszo';

describe('hashPassword', () => {
  it('bcrypt-hasht ad 12-es költségtényezővel, a jelszó nélkül', async () => {
    const hash = await hashPassword(PASSWORD);

    expect(BCRYPT_COST).toBe(12);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(getRounds(hash)).toBe(BCRYPT_COST);
    expect(hash).not.toContain(PASSWORD);
    await expect(compare(PASSWORD, hash)).resolves.toBe(true);
    await expect(compare('rossz-jelszo', hash)).resolves.toBe(false);
  });

  it('ugyanahhoz a jelszóhoz is minden alkalommal más hasht ad (véletlen só)', async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);

    expect(first).not.toBe(second);
  });
});

describe('verifyPassword', () => {
  it('a helyes jelszóra igazat, a hibásra hamisat ad', async () => {
    const hash = await hashPassword(PASSWORD);

    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true);
    await expect(verifyPassword('rossz-jelszo', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('nem bcrypt-hash-sel összevetve hamisat ad, nem dob hibát', async () => {
    await expect(verifyPassword(PASSWORD, 'nem-valodi-hash')).resolves.toBe(false);
  });
});

describe('DUMMY_PASSWORD_HASH', () => {
  it('érvényes bcrypt-hash, ugyanazzal a költségtényezővel, mint a valódi jelszavaké', () => {
    // Így az ismeretlen e-mail-címre adott válasz ugyanannyi ideig tart, mint a rossz jelszóra adott
    expect(DUMMY_PASSWORD_HASH).toHaveLength(60);
    expect(getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_COST);
  });
});
