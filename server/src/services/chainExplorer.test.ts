// A blokklánc-böngésző (Etherscan) linkjeinek tesztjei.
import { describe, expect, it } from 'vitest';

import { addressUrl, transactionProof, transactionUrl } from './chainExplorer.js';

const TX_HASH = `0x${'ab'.repeat(32)}`;
const CONTRACT = `0x${'5f'.repeat(20)}`;
const NO_TRANSACTION = { blockNumber: null, txHash: null, txUrl: null };

describe('transactionProof', () => {
  it('a blokkba került tranzakció adatai, Sepolián az Etherscan-linkkel', () => {
    expect(transactionProof(11_155_111, { chainTxHash: TX_HASH, chainBlockNumber: 42 })).toEqual({
      blockNumber: 42,
      txHash: TX_HASH,
      txUrl: `https://sepolia.etherscan.io/tx/${TX_HASH}`,
    });
    expect(
      transactionProof(31_337, { chainTxHash: TX_HASH, chainBlockNumber: 42 }).txUrl,
    ).toBeNull();
  });

  it('a küldés előtt mentett, blokkszám nélküli hash még nem bizonyíték: minden mező null', () => {
    expect(transactionProof(11_155_111, { chainTxHash: TX_HASH, chainBlockNumber: null })).toEqual(
      NO_TRANSACTION,
    );
    expect(transactionProof(11_155_111, { chainTxHash: null, chainBlockNumber: null })).toEqual(
      NO_TRANSACTION,
    );
  });
});

describe('transactionUrl', () => {
  it('a Sepolia-hálózaton az Etherscan tranzakcióoldalát adja', () => {
    expect(transactionUrl(11_155_111, TX_HASH)).toBe(`https://sepolia.etherscan.io/tx/${TX_HASH}`);
  });

  it('a lokális Hardhat-hálózatnak nincs nyilvános böngészője: null', () => {
    expect(transactionUrl(31_337, TX_HASH)).toBeNull();
  });
});

describe('addressUrl', () => {
  it('a Sepolia-hálózaton a szerződés Etherscan-oldalát adja; a lokális hálózaton null', () => {
    expect(addressUrl(11_155_111, CONTRACT)).toBe(
      `https://sepolia.etherscan.io/address/${CONTRACT}`,
    );
    expect(addressUrl(31_337, CONTRACT)).toBeNull();
  });
});
