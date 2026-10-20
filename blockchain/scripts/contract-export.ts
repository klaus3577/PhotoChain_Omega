// A szerver számára exportált szerződésadatok (ABI + hálózatonkénti cím) összeállítása.
// Tiszta függvények, fájlműveletek nélkül – így tesztelhetők (test/ContractExport.test.ts).

/** Egy hálózaton telepített szerződés adatai. */
export interface NetworkDeployment {
  address: string;
}

/** A server/src/contracts/<Szerződés>.json szerkezete. */
export interface ContractExport {
  contractName: string;
  abi: readonly unknown[];
  /** chainId (szövegként) → telepítés, pl. "11155111" = Sepolia, "31337" = lokális Hardhat */
  networks: Record<string, NetworkDeployment>;
}

/** chainId → az Ignition deployed_addresses.json tartalma ("<modul>#<szerződés>" → cím). */
export type DeploymentsByChain = Record<string, Record<string, string>>;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const CHAIN_DIRECTORY_PATTERN = /^chain-(\d+)$/;

/** Az Ignition telepítési mappájának nevéből (pl. "chain-11155111") a chainId, egyébként null. */
export function chainIdFromDirectory(directoryName: string): string | null {
  return CHAIN_DIRECTORY_PATTERN.exec(directoryName)?.[1] ?? null;
}

/**
 * Összeállítja az exportot. Csak azok a hálózatok kerülnek bele, ahol a szerződés telepítve van.
 * @param futureId az Ignition-azonosító, pl. "PhotoRegistryModule#PhotoRegistry"
 * @throws ha egyetlen hálózaton sincs telepítés, vagy egy cím formátuma hibás
 */
export function buildContractExport(
  contractName: string,
  abi: readonly unknown[],
  deployments: DeploymentsByChain,
  futureId: string,
): ContractExport {
  const networks: Record<string, NetworkDeployment> = {};
  for (const [chainId, addresses] of Object.entries(deployments)) {
    const address = addresses[futureId];
    if (address === undefined) continue;
    if (!ADDRESS_PATTERN.test(address)) {
      throw new Error(`Hibás szerződéscím a(z) ${chainId} hálózaton: ${address}`);
    }
    networks[chainId] = { address };
  }
  if (Object.keys(networks).length === 0) {
    throw new Error(`A(z) ${futureId} egyetlen hálózaton sincs telepítve – előbb telepítsd.`);
  }
  return { contractName, abi, networks };
}
