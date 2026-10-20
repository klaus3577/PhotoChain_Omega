// A regisztráció bizonyítékának közös sorai (L20 tanúsítvány, L24 ellenőrzés eredménye): a blokk és a
// tranzakció – ha ismertek; különben „A tranzakció adatai nem érhetők el” (design-README, L24-es sor) –,
// és a SHA-256 rövidítve, a teljes értékkel a vágólapra másolhatóan.
import { formatInteger, shortenHex } from '../../lib/format';
import { CopyButton } from '../ui/CopyButton';
import { DefinitionRow } from '../ui/DefinitionRow';
import { HexValue } from './ExplorerLink';

/** A lezárt tranzakció adatai (server/src/services/chainExplorer.ts – TransactionProof) */
export interface TransactionProofLike {
  blockNumber: number | null;
  txHash: string | null;
  /** A tranzakció a blokklánc-böngészőben; a lokális hálózaton null */
  txUrl: string | null;
}

export function TransactionRows({ proof }: { proof: TransactionProofLike }) {
  return (
    <>
      {proof.blockNumber !== null && (
        <DefinitionRow term="Blokk">
          <span className="tabular-nums">{formatInteger(proof.blockNumber)}</span>
        </DefinitionRow>
      )}
      <DefinitionRow term="Tranzakció">
        {proof.txHash === null ? (
          <span className="text-fg-muted">A tranzakció adatai nem érhetők el</span>
        ) : (
          <HexValue value={proof.txHash} url={proof.txUrl} target="a tranzakció" />
        )}
      </DefinitionRow>
    </>
  );
}

export function Sha256Row({ sha256, term = 'SHA-256' }: { sha256: string; term?: string }) {
  return (
    <DefinitionRow term={term}>
      <span className="font-mono">{shortenHex(sha256)}</span>
      <CopyButton
        value={sha256}
        label="A teljes SHA-256 másolása"
        copiedMessage="Az SHA-256 a vágólapra másolva."
        fieldLabel="A teljes SHA-256"
      />
    </DefinitionRow>
  );
}
