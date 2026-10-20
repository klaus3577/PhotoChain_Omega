// Linkek a blokklánc-böngészőhöz (Etherscan), ahol a regisztrációs tranzakciót bárki ellenőrizheti.
// Forrás: Etherscan – Sepolia Testnet Explorer (a tranzakcióoldal /tx/<hash>, a címoldal
// /address/<cím> alakú), https://sepolia.etherscan.io/

/** A hálózatok nyilvános blokklánc-böngészője; a lokális Hardhat-hálózatnak nincs ilyen. */
const EXPLORER_BASE_URLS: ReadonlyMap<number, string> = new Map([
  [11_155_111, 'https://sepolia.etherscan.io'],
]);

/** A tranzakció oldala a blokklánc-böngészőben; ha a hálózatnak nincs nyilvános böngészője, null. */
export function transactionUrl(chainId: number, txHash: string): string | null {
  const baseUrl = EXPLORER_BASE_URLS.get(chainId);
  return baseUrl === undefined ? null : `${baseUrl}/tx/${txHash}`;
}

/** Egy cím (pl. a PhotoRegistry szerződésé) oldala a blokklánc-böngészőben; ha nincs ilyen, null. */
export function addressUrl(chainId: number, address: string): string | null {
  const baseUrl = EXPLORER_BASE_URLS.get(chainId);
  return baseUrl === undefined ? null : `${baseUrl}/address/${address}`;
}

/** A regisztrációs tranzakció adatai (a kép tanúsítványában és a hitelesség-ellenőrzés válaszában). */
export interface TransactionProof {
  blockNumber: number | null;
  txHash: string | null;
  /** A tranzakció a blokklánc-böngészőben (Sepolián: Etherscan); a lokális hálózaton null */
  txUrl: string | null;
}

/** A kép lánc-mezői az adatbázisban. */
interface ChainColumns {
  chainTxHash: string | null;
  chainBlockNumber: number | null;
}

/**
 * A tranzakció adatai – csak a blokkba került (blokkszámmal lezárt) tranzakcióé: a küldés előtt
 * mentett hash (L11) még nem bizonyíték, ilyenkor minden mező null.
 */
export function transactionProof(
  chainId: number,
  { chainTxHash, chainBlockNumber }: ChainColumns,
): TransactionProof {
  if (chainTxHash === null || chainBlockNumber === null) {
    return { blockNumber: null, txHash: null, txUrl: null };
  }
  return {
    blockNumber: chainBlockNumber,
    txHash: chainTxHash,
    txUrl: transactionUrl(chainId, chainTxHash),
  };
}
