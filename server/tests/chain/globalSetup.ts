// A lánc-integrációs tesztek előkészítése: elindít egy lokális Hardhat-hálózatot (`hardhat node`)
// egy szabad porton, a tesztek után leállítja. A tesztek a PhotoRegistry lefordított bájtkódját a
// blockchain/ alprojekt artefaktjából olvassák; ha a szerződés még nincs lefordítva, itt fordul le.
// Forrás: Vitest – globalSetup, provide/inject, https://vitest.dev/config/globalsetup; Hardhat 3 –
// `hardhat node`, https://hardhat.org/docs (adaptálva)
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TestProject } from 'vitest/node';

const BLOCKCHAIN_ROOT = fileURLToPath(new URL('../../../blockchain', import.meta.url));
const HARDHAT_CLI = join(BLOCKCHAIN_ROOT, 'node_modules', 'hardhat', 'dist', 'src', 'cli.js');
const ARTIFACT = join(
  BLOCKCHAIN_ROOT,
  'artifacts',
  'contracts',
  'PhotoRegistry.sol',
  'PhotoRegistry.json',
);
/** Az első indítás (a Hardhat bővítményeinek betöltése) lassú lehet */
const STARTUP_TIMEOUT_MS = 120_000;
/** Indítási hibánál a Hardhat hibakimenetének legfeljebb ennyi utolsó karaktere kerül az üzenetbe */
const ERROR_OUTPUT_CHARS = 2_000;

declare module 'vitest' {
  export interface ProvidedContext {
    chainRpcUrl: string;
    photoRegistryArtifact: string;
  }
}

function assertBlockchainProject(): void {
  if (!existsSync(HARDHAT_CLI)) {
    throw new Error(
      'A lánctesztekhez a blockchain/ alprojekt függőségei kellenek: cd blockchain && npm install',
    );
  }
}

function compileIfNeeded(): void {
  if (existsSync(ARTIFACT)) return;
  const result = spawnSync(process.execPath, [HARDHAT_CLI, 'compile'], {
    cwd: BLOCKCHAIN_ROOT,
    env: isolatedEnvironment(),
    encoding: 'utf8',
  });
  if (result.status !== 0 || !existsSync(ARTIFACT)) {
    throw new Error(
      `A PhotoRegistry fordítása nem sikerült (cd blockchain && npm run compile)\n${result.stderr}`,
    );
  }
}

/** Egy éppen szabad TCP-port a helyi gépen. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (address === null || typeof address === 'string') throw new Error('Nincs szabad port');
  return address.port;
}

/**
 * A Hardhat-folyamat környezete: a blockchain/hardhat.config.ts betölti a blockchain/.env-et (a
 * Sepolia-kulcsokat) – a már beállított változókat viszont nem írja felül. Ezért ártalmatlan
 * helyettesítő értékeket adunk, így a valódi titkok be sem kerülnek a tesztlánc folyamatába.
 */
function isolatedEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SEPOLIA_RPC_URL: 'http://127.0.0.1:1',
    SEPOLIA_PRIVATE_KEY: `0x${'0'.repeat(63)}1`,
    ETHERSCAN_API_KEY: 'nincs',
  };
}

function startNode(port: number): Promise<ChildProcess> {
  // Közvetlenül a node futtatja a Hardhat CLI-t (npx és parancsértelmező nélkül): így leállításkor
  // ez az egy folyamat áll le, és nem marad árva folyamat a porton (Windows). Csak a helyi gépről
  // érhető el (--hostname), akkor is, ha a tesztek konténerben futnak.
  const child = spawn(
    process.execPath,
    [HARDHAT_CLI, 'node', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: BLOCKCHAIN_ROOT, env: isolatedEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  let started = false;
  // A kimenetet végig ki kell olvasni (a Hardhat minden kérést naplóz): a megtelt csővezeték
  // megakasztaná a folyamatot. Az indulás után már csak eldobjuk.
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-ERROR_OUTPUT_CHARS);
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`A Hardhat-hálózat nem indult el ${STARTUP_TIMEOUT_MS / 1000} s alatt`));
    }, STARTUP_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (started) return;
      stdout += chunk.toString();
      if (stdout.includes('Started HTTP')) {
        started = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`A Hardhat-hálózat kilépett (kód: ${code})\n${stderr}`));
    });
  });
}

async function stopNode(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  assertBlockchainProject();
  compileIfNeeded();
  const port = await freePort();
  const node = await startNode(port);
  project.provide('chainRpcUrl', `http://127.0.0.1:${port}`);
  project.provide('photoRegistryArtifact', ARTIFACT);
  return () => stopNode(node);
}
