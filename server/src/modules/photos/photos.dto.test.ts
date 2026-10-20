// A képek kliensnek küldött alakja (DTO): explicit mezőlista (az eredeti fájl kulcsa, a gázadat és
// a tulajdonos e-mailje le sem jön az adatbázisból), a tanúsítvány csak a regisztrált képnél, és az
// elrejtett kép törölt fájljainak nincs URL-je.
import { describe, expect, it } from 'vitest';

import type { PhotoStatus } from '../../generated/prisma/client.js';
import { createLocalStorage } from '../../services/storage/local.storage.js';
import {
  OWN_PHOTO_SELECT,
  type OwnPhotoRow,
  pendingTransactionOf,
  PHOTO_DETAIL_SELECT,
  PHOTO_SUMMARY_SELECT,
  type PhotoDetailRow,
  toOwnPhotoListItemDto,
  toPhotoDetailDto,
  toPhotoListItemDto,
  toPhotoSummaryDto,
} from './photos.dto.js';

const FILE_ID = '0b8f6c1e-2d4a-4f5b-9c3d-7e1f2a3b4c5d';
const TX_HASH = `0x${'cd'.repeat(32)}`;
const SEPOLIA_CHAIN_ID = 11_155_111;
const HARDHAT_CHAIN_ID = 31_337;
const REGISTERED_AT = new Date('2026-10-01T10:00:00.000Z');
const CREATED_AT = new Date('2026-10-01T09:59:48.000Z');

// A publicUrl csak a kulcsból számol, a lemezhez nem nyúl
const storage = createLocalStorage('nem-hasznalt-mappa');
const CONTRACT = `0x${'5f'.repeat(20)}`;
const SEPOLIA = { storage, chainId: SEPOLIA_CHAIN_ID, contractAddress: CONTRACT };
const HARDHAT = { storage, chainId: HARDHAT_CHAIN_ID, contractAddress: CONTRACT };

function row(overrides: Partial<PhotoDetailRow> = {}): PhotoDetailRow {
  return {
    id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    title: 'Tócsa',
    description: 'Eső után',
    priceHuf: 2500,
    status: 'REGISTERED',
    sha256: 'ab'.repeat(32),
    dHash: 'f0e8f2f2b6f3f0f0',
    width: 1067,
    height: 1600,
    previewKey: `previews/${FILE_ID}.jpg`,
    thumbnailKey: `thumbnails/${FILE_ID}.jpg`,
    chainTxHash: TX_HASH,
    chainBlockNumber: 11_820_993,
    registeredAt: REGISTERED_AT,
    createdAt: CREATED_AT,
    category: { id: 3, name: 'Természet', slug: 'termeszet' },
    owner: { id: '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e', displayName: 'Fotós Fanni' },
    ...overrides,
  };
}

describe('a DTO-k mezőlistája (Prisma select)', () => {
  it('az eredeti fájl kulcsát, a gázadatot és a tulajdonos e-mailjét le sem kéri', () => {
    for (const select of [PHOTO_SUMMARY_SELECT, PHOTO_DETAIL_SELECT, OWN_PHOTO_SELECT]) {
      expect(select).not.toHaveProperty('originalKey');
      expect(select).not.toHaveProperty('gasUsed');
      expect(select.owner).toEqual({ select: { id: true, displayName: true } });
    }
  });

  it('a galéria listája nem kéri le, ki rejtette el a képet, és a tranzakció hash-ét sem – a saját képek listája igen, a leírással együtt (L22)', () => {
    expect(PHOTO_SUMMARY_SELECT).not.toHaveProperty('hiddenBy');
    expect(PHOTO_SUMMARY_SELECT).not.toHaveProperty('chainTxHash');
    expect(PHOTO_SUMMARY_SELECT).not.toHaveProperty('description');
    expect(OWN_PHOTO_SELECT).toMatchObject({
      description: true,
      hiddenBy: true,
      chainTxHash: true,
    });
  });
});

describe('toOwnPhotoListItemDto (L22 – a tulajdonos saját képei)', () => {
  const ownRow = (overrides: Partial<OwnPhotoRow> = {}): OwnPhotoRow => ({
    ...row(),
    hiddenBy: null,
    ...overrides,
  });
  const rating = { average: 4.5, count: 2 };

  it('a lista eleme és mellette: a leírás (a szerkesztéshez), ki rejtette el (null, ha nincs elrejtve), függő tranzakció (null, ha nincs)', () => {
    expect(toOwnPhotoListItemDto(ownRow(), storage, rating, SEPOLIA_CHAIN_ID)).toEqual({
      ...toPhotoListItemDto(row(), storage, rating),
      description: 'Eső után',
      hiddenBy: null,
      pendingTransaction: null,
    });
  });

  it('a regisztrációra váró kép már elküldött tranzakciója – Sepolián Etherscan-linkkel, a lokális láncon link nélkül', () => {
    const pending = ownRow({ status: 'PENDING_CHAIN' });

    expect(
      toOwnPhotoListItemDto(pending, storage, rating, SEPOLIA_CHAIN_ID).pendingTransaction,
    ).toEqual({ txHash: TX_HASH, txUrl: `https://sepolia.etherscan.io/tx/${TX_HASH}` });
    expect(
      toOwnPhotoListItemDto(pending, storage, rating, HARDHAT_CHAIN_ID).pendingTransaction,
    ).toEqual({ txHash: TX_HASH, txUrl: null });
  });

  it('az elrejtett képnél látszik, ki döntött róla (tulajdonos, admin, mindkettő); függő tranzakciója nincs', () => {
    for (const hiddenBy of ['OWNER', 'ADMIN', 'OWNER_AND_ADMIN'] as const) {
      const dto = toOwnPhotoListItemDto(
        ownRow({ status: 'HIDDEN', hiddenBy }),
        storage,
        rating,
        SEPOLIA_CHAIN_ID,
      );

      expect(dto).toMatchObject({ hiddenBy, pendingTransaction: null, thumbnailUrl: null });
    }
  });
});

describe('toPhotoDetailDto', () => {
  it('a regisztrált kép adatlapja a tanúsítvánnyal és az Etherscan-linkkel', () => {
    expect(toPhotoDetailDto(row(), SEPOLIA)).toEqual({
      id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      title: 'Tócsa',
      description: 'Eső után',
      priceHuf: 2500,
      status: 'REGISTERED',
      sha256: 'ab'.repeat(32),
      dHash: 'f0e8f2f2b6f3f0f0',
      width: 1067,
      height: 1600,
      previewUrl: `/media/previews/${FILE_ID}.jpg`,
      thumbnailUrl: `/media/thumbnails/${FILE_ID}.jpg`,
      category: { id: 3, name: 'Természet', slug: 'termeszet' },
      owner: { id: '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e', displayName: 'Fotós Fanni' },
      createdAt: CREATED_AT,
      certificate: {
        registeredAt: REGISTERED_AT,
        blockNumber: 11_820_993,
        txHash: TX_HASH,
        txUrl: `https://sepolia.etherscan.io/tx/${TX_HASH}`,
        chainId: SEPOLIA_CHAIN_ID,
        contractAddress: CONTRACT,
        contractUrl: `https://sepolia.etherscan.io/address/${CONTRACT}`,
      },
    });
  });

  it('a lokális Hardhat-hálózaton a tranzakciónak nincs nyilvános linkje', () => {
    const { certificate } = toPhotoDetailDto(row(), HARDHAT);

    expect(certificate).toEqual({
      registeredAt: REGISTERED_AT,
      blockNumber: 11_820_993,
      txHash: TX_HASH,
      txUrl: null,
      chainId: HARDHAT_CHAIN_ID,
      contractAddress: CONTRACT,
      contractUrl: null,
    });
  });

  it.each<PhotoStatus>(['PENDING_CHAIN', 'CHAIN_FAILED', 'HIDDEN'])(
    '%s állapotban nincs tanúsítvány – a lánc-mezők akkor sem kerülnek ki, ha vannak',
    (status) => {
      const dto = toPhotoDetailDto(row({ status }), SEPOLIA);

      expect(dto.certificate).toBeNull();
      expect(JSON.stringify(dto)).not.toContain(TX_HASH);
    },
  );

  it('a regisztrált, de lezárt tranzakció nélküli képnél (elveszett nyugta) csak az idő', () => {
    const dto = toPhotoDetailDto(row({ chainTxHash: null, chainBlockNumber: null }), SEPOLIA);

    expect(dto.certificate).toEqual({
      registeredAt: REGISTERED_AT,
      blockNumber: null,
      txHash: null,
      txUrl: null,
      chainId: SEPOLIA_CHAIN_ID,
      contractAddress: CONTRACT,
      contractUrl: `https://sepolia.etherscan.io/address/${CONTRACT}`,
    });
  });

  it('az elrejtett kép előnézete és bélyegképe törlődött: az URL-jük null', () => {
    const dto = toPhotoDetailDto(row({ status: 'HIDDEN' }), SEPOLIA);

    expect(dto.previewUrl).toBeNull();
    expect(dto.thumbnailUrl).toBeNull();
  });
});

describe('pendingTransactionOf (L21 – a tulajdonos függő tranzakciója)', () => {
  it('a regisztrációra váró kép már elküldött tranzakciója, Sepolián az Etherscan-linkkel', () => {
    expect(pendingTransactionOf(row({ status: 'PENDING_CHAIN' }), SEPOLIA_CHAIN_ID)).toEqual({
      txHash: TX_HASH,
      txUrl: `https://sepolia.etherscan.io/tx/${TX_HASH}`,
    });
    expect(pendingTransactionOf(row({ status: 'PENDING_CHAIN' }), HARDHAT_CHAIN_ID)).toEqual({
      txHash: TX_HASH,
      txUrl: null,
    });
  });

  it('amíg a tranzakció nincs elküldve (nincs hash), nincs mit mutatni: null', () => {
    expect(
      pendingTransactionOf(row({ status: 'PENDING_CHAIN', chainTxHash: null }), SEPOLIA_CHAIN_ID),
    ).toBeNull();
  });

  it.each<PhotoStatus>(['REGISTERED', 'CHAIN_FAILED', 'HIDDEN'])(
    '%s állapotban nincs függő tranzakció (a lezártat a tanúsítvány adja)',
    (status) => {
      expect(pendingTransactionOf(row({ status }), SEPOLIA_CHAIN_ID)).toBeNull();
    },
  );
});

describe('toPhotoSummaryDto', () => {
  it('a galéria adatai: leírás, ujjlenyomatok, előnézet és tanúsítvány nélkül', () => {
    expect(toPhotoSummaryDto(row(), storage)).toEqual({
      id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      title: 'Tócsa',
      priceHuf: 2500,
      status: 'REGISTERED',
      width: 1067,
      height: 1600,
      thumbnailUrl: `/media/thumbnails/${FILE_ID}.jpg`,
      category: { id: 3, name: 'Természet', slug: 'termeszet' },
      owner: { id: '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e', displayName: 'Fotós Fanni' },
      createdAt: CREATED_AT,
    });
  });

  it('az elrejtett kép bélyegképének URL-je null', () => {
    expect(toPhotoSummaryDto(row({ status: 'HIDDEN' }), storage).thumbnailUrl).toBeNull();
  });
});

describe('toPhotoListItemDto', () => {
  it('a lista eleme: a galéria adatai és a kép értékeléseinek összesítése', () => {
    expect(toPhotoListItemDto(row(), storage, { average: 4.5, count: 2 })).toEqual({
      ...toPhotoSummaryDto(row(), storage),
      rating: { average: 4.5, count: 2 },
    });
  });
});
