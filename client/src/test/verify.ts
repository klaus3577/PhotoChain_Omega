// A hitelesség-ellenőrzés (L24) tesztadatai a szerver válaszának formájában
// (server/src/modules/verification/verification.service.ts – VerificationResult): a regisztrált kép
// (VERIFIED), egy hasonló kép módosított változata (SIMILAR) és egy ismeretlen fájl (NOT_FOUND).
import { jsonResponse } from './fetch';
import { DHASH, OWNER_ID, PHOTO_ID, SHA256, TX_HASH } from './photos';

/** Egy nem regisztrált fájl ujjlenyomatai */
export const UNKNOWN_SHA256 = `3be1f07c${'94'.repeat(24)}7d10c58e`;
export const UNKNOWN_DHASH = '0f1e2d3c4b5a6978';
/** A regisztrált kép dHash-étől 3 bitben eltérő ujjlenyomat (a SIMILAR eredményhez) */
export const SIMILAR_DHASH = 'f0e4c8d0b0a09087';

/** A regisztráció bizonyítéka (RegistrationProof) – Sepolián, Etherscan-linkkel. */
export function registration(overrides: Record<string, unknown> = {}) {
  return {
    registeredAt: '2026-10-04T12:32:15.000Z',
    blockNumber: 11_820_993,
    txHash: TX_HASH,
    txUrl: `https://sepolia.etherscan.io/tx/${TX_HASH}`,
    ...overrides,
  };
}

/** A nyilvános kép adatai (VerifiedPhoto). */
export function verifiedPhoto(overrides: Record<string, unknown> = {}) {
  return {
    id: PHOTO_ID,
    title: 'Őszi erdő ködben',
    thumbnailUrl: `/media/thumbnails/${PHOTO_ID}.webp`,
    photographer: { id: OWNER_ID, displayName: 'Fotós Fanni' },
    ...overrides,
  };
}

/** VERIFIED: a fájl a láncon regisztrált kép, az adatbázis ismeri (nyilvános). */
export function verifiedResult(overrides: Record<string, unknown> = {}) {
  return {
    result: 'VERIFIED',
    sha256: SHA256,
    dHash: DHASH,
    distance: null,
    registration: registration(),
    photo: verifiedPhoto(),
    ...overrides,
  };
}

/** SIMILAR: nem azonos fájl, de a regisztrált kép dHash-étől csak 3 bit tér el. */
export function similarResult(overrides: Record<string, unknown> = {}) {
  return {
    result: 'SIMILAR',
    sha256: UNKNOWN_SHA256,
    dHash: SIMILAR_DHASH,
    distance: 3,
    registration: registration(),
    photo: verifiedPhoto(),
    ...overrides,
  };
}

/** NOT_FOUND: sem azonos, sem hasonló regisztrált kép. */
export function notFoundResult(overrides: Record<string, unknown> = {}) {
  return {
    result: 'NOT_FOUND',
    sha256: UNKNOWN_SHA256,
    dHash: UNKNOWN_DHASH,
    distance: null,
    registration: null,
    photo: null,
    ...overrides,
  };
}

/** A GET /api/verify/:sha256 (és a POST /api/verify) válasza: az eredmény közvetlenül a data mezőben. */
export const verifyResponse = (value: unknown) => jsonResponse(200, { data: value });
