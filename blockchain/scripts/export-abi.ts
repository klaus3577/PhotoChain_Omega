// A PhotoRegistry ABI-jának és hálózatonkénti címének exportálása a szerver számára.
// Futtatás: npm run export-abi (= hardhat run scripts/export-abi.ts)
// Kimenet: server/src/contracts/PhotoRegistry.json
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import hre from 'hardhat';

import {
  buildContractExport,
  chainIdFromDirectory,
  type DeploymentsByChain,
} from './contract-export.js';

const CONTRACT_NAME = 'PhotoRegistry';
const FUTURE_ID = `PhotoRegistryModule#${CONTRACT_NAME}`;
const BLOCKCHAIN_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEPLOYMENTS_DIR = join(BLOCKCHAIN_ROOT, 'ignition', 'deployments');
const OUTPUT_FILE = join(
  BLOCKCHAIN_ROOT,
  '..',
  'server',
  'src',
  'contracts',
  `${CONTRACT_NAME}.json`,
);

/** Beolvassa az Ignition chain-<id>/deployed_addresses.json fájljait. */
async function readDeployments(): Promise<DeploymentsByChain> {
  if (!existsSync(DEPLOYMENTS_DIR)) return {};
  const deployments: DeploymentsByChain = {};
  for (const entry of await readdir(DEPLOYMENTS_DIR, { withFileTypes: true })) {
    const chainId = chainIdFromDirectory(entry.name);
    const addressesFile = join(DEPLOYMENTS_DIR, entry.name, 'deployed_addresses.json');
    if (!entry.isDirectory() || chainId === null || !existsSync(addressesFile)) continue;
    deployments[chainId] = JSON.parse(await readFile(addressesFile, 'utf8'));
  }
  return deployments;
}

const artifact = await hre.artifacts.readArtifact(CONTRACT_NAME);
const contractExport = buildContractExport(
  CONTRACT_NAME,
  artifact.abi,
  await readDeployments(),
  FUTURE_ID,
);

await mkdir(dirname(OUTPUT_FILE), { recursive: true });
await writeFile(OUTPUT_FILE, `${JSON.stringify(contractExport, null, 2)}\n`, 'utf8');

console.log(`Exportálva: ${relative(join(BLOCKCHAIN_ROOT, '..'), OUTPUT_FILE)}`);
for (const [chainId, { address }] of Object.entries(contractExport.networks)) {
  console.log(`  chainId ${chainId}: ${address}`);
}
