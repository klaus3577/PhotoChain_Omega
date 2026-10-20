// A telepített PhotoRegistry ellenőrzése az exportált adatokból (server/src/contracts/PhotoRegistry.json):
// van-e szerződéskód a címen, ki a tulajdonosa, és válaszol-e a lekérdezésekre.
// Futtatás: npm run check:sepolia  |  npm run check:local (a `npm run node` + `deploy:local` után)
import { readFile } from 'node:fs/promises';

import { ZeroHash } from 'ethers';
import { network } from 'hardhat';

import type { ContractExport } from './contract-export.js';

const EXPORT_FILE = new URL('../../server/src/contracts/PhotoRegistry.json', import.meta.url);

const connection = await network.create();
const { ethers } = connection;
const { chainId } = await ethers.provider.getNetwork();

const exported: ContractExport = JSON.parse(await readFile(EXPORT_FILE, 'utf8'));
const deployment = exported.networks[chainId.toString()];
if (deployment === undefined) {
  throw new Error(
    `Nincs exportált telepítés a(z) ${chainId} hálózatra – futtasd: npm run export-abi`,
  );
}

const code = await ethers.provider.getCode(deployment.address);
if (code === '0x') {
  throw new Error(
    `A(z) ${deployment.address} címen nincs szerződéskód – telepítsd újra a szerződést.`,
  );
}

const registry = await ethers.getContractAt('PhotoRegistry', deployment.address);
const [signer] = await ethers.getSigners();
const owner = await registry.owner();

console.log(`Hálózat:            ${connection.networkName} (chainId ${chainId})`);
console.log(`Szerződés címe:     ${deployment.address}`);
console.log(`Bájtkód mérete:     ${(code.length - 2) / 2} bájt`);
console.log(`Tulajdonos:         ${owner}`);
console.log(`Platform-tárca:     ${signer.address}`);
console.log(`A platform-tárca a tulajdonos: ${owner === signer.address ? 'igen ✓' : 'NEM ✗'}`);
console.log(`isRegistered(0x0…0): ${await registry.isRegistered(ZeroHash)} (várt: false)`);
