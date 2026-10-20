// A blokklánc-szolgáltatás integrációs tesztjei egy valódi, lokális Hardhat-hálózaton (a globalSetup
// indítja el). Minden teszt friss PhotoRegistry-szerződést telepít egy véletlen, ETH-val feltöltött
// „platform-tárcával” – így a tesztek egymástól függetlenek, és a kulcsok futás közben keletkeznek
// (a repóban nincs privát kulcs).
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  Contract,
  ContractFactory,
  type HDNodeWallet,
  type InterfaceAbi,
  JsonRpcProvider,
  type JsonRpcSigner,
  parseEther,
  Wallet,
} from 'ethers';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  type BlockchainService,
  type BlockchainServiceConfig,
  ChainError,
  type ChainErrorKind,
  connectionProblems,
  createBlockchainService,
  ownerRefOf,
  type RegisterPhotoInput,
} from '../../src/services/blockchain.service.js';

const HARDHAT_CHAIN_ID = 31_337;
const rpcUrl = inject('chainRpcUrl');
const artifact = JSON.parse(readFileSync(inject('photoRegistryArtifact'), 'utf8')) as {
  abi: InterfaceAbi;
  bytecode: string;
};

let admin: JsonRpcProvider;
let funder: JsonRpcSigner;

beforeAll(async () => {
  // A tesztek saját kapcsolata: a Hardhat előre feltöltött fiókjából utal ETH-t, és ellenőriz
  admin = new JsonRpcProvider(rpcUrl, HARDHAT_CHAIN_ID, { staticNetwork: true, cacheTimeout: -1 });
  funder = await admin.getSigner(0);
});

afterAll(() => {
  admin.destroy();
});

interface Deployment {
  contractAddress: string;
  platform: HDNodeWallet;
}

async function fundedWallet(): Promise<HDNodeWallet> {
  const wallet = Wallet.createRandom(admin);
  await (await funder.sendTransaction({ to: wallet.address, value: parseEther('10') })).wait();
  return wallet;
}

/** Friss PhotoRegistry-szerződés; a tulajdonosa (a „platform-tárca”) egy új, feltöltött tárca. */
async function deployRegistry(): Promise<Deployment> {
  const platform = await fundedWallet();
  const registry = await new ContractFactory(artifact.abi, artifact.bytecode, platform).deploy();
  await registry.waitForDeployment();
  return { contractAddress: await registry.getAddress(), platform };
}

function serviceFor(
  { contractAddress, platform }: Deployment,
  overrides: Partial<BlockchainServiceConfig> = {},
): BlockchainService {
  return createBlockchainService({
    rpcUrl,
    chainId: HARDHAT_CHAIN_ID,
    contractAddress,
    privateKey: platform.privateKey,
    // A lokális hálózat minden tranzakciót azonnal blokkba tesz: elég a sűrű, rövid várakozás
    pollingIntervalMs: 50,
    confirmationTimeoutMs: 10_000,
    ...overrides,
  });
}

const newPhoto = (): RegisterPhotoInput => ({
  sha256: randomBytes(32).toString('hex'),
  dHash: randomBytes(8).toString('hex'),
  ownerRef: ownerRefOf(randomUUID()),
});
const randomTxHash = (): string => `0x${randomBytes(32).toString('hex')}`;
const noop = async (): Promise<void> => undefined;
const nonceOf = (wallet: HDNodeWallet): Promise<number> =>
  admin.getTransactionCount(wallet.address);

async function expectChainError(promise: Promise<unknown>, kind: ChainErrorKind): Promise<Error> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ChainError);
  expect((error as ChainError).kind).toBe(kind);
  return error as Error;
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Mit tegyen a proxy egy kéréssel: továbbítja; 503-as hibát ad (mint egy túlterhelt
 * RPC-szolgáltató); vagy továbbítja, de a válasz „elvész” (a kliens 503-at kap).
 */
type ProxyAction = 'forward' | 'fail' | 'forwardButFail';

/** A Hardhat-hálózat elé tett proxy; a kérésenkénti viselkedést a `decide` adja meg. */
async function rpcProxy(
  decide: (body: string) => ProxyAction,
): Promise<{ url: string; close: () => Promise<void> }> {
  const forward = async (body: string) =>
    fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const server = createServer((req, res) => {
    void (async () => {
      const body = await bodyOf(req);
      const action = decide(body);
      if (action === 'fail') {
        res.writeHead(503).end();
        return;
      }
      const upstream = await forward(body);
      if (action === 'forwardButFail') {
        res.writeHead(503).end();
        return;
      }
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(await upstream.text());
    })().catch(() => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** Proxy, amely a tranzakció-nyugta első `failures` lekérdezésére 503-as hibát ad. */
function flakyProxy(failures: number): ReturnType<typeof rpcProxy> {
  let remaining = failures;
  return rpcProxy((body) => {
    if (!body.includes('eth_getTransactionReceipt') || remaining <= 0) return 'forward';
    remaining -= 1;
    return 'fail';
  });
}

/** A művelet idejére a Hardhat nem bányászik magától: a tranzakciók függőben maradnak. */
async function withoutAutomine<T>(action: () => Promise<T>): Promise<T> {
  await admin.send('evm_setAutomine', [false]);
  try {
    return await action();
  } finally {
    await admin.send('evm_setAutomine', [true]);
  }
}

describe('lekérdezések', () => {
  it('a még nem regisztrált hash-re isRegistered hamis, getRecord null', async () => {
    const chain = serviceFor(await deployRegistry());
    const photo = newPhoto();

    await expect(chain.isRegistered(photo.sha256)).resolves.toBe(false);
    await expect(chain.getRecord(photo.sha256)).resolves.toBeNull();
  });
});

describe('registerPhoto', () => {
  it('a tranzakció blokkba kerül: a nyugta, az esemény és a lánc rekordja egyezik', async () => {
    const chain = serviceFor(await deployRegistry());
    const photo = newPhoto();

    const registration = await chain.registerPhoto(photo, { beforeBroadcast: noop });

    const receipt = await admin.getTransactionReceipt(registration.txHash);
    const block = await admin.getBlock(registration.blockNumber);
    expect(registration.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(receipt?.status).toBe(1);
    expect(registration.blockNumber).toBe(receipt?.blockNumber);
    expect(registration.gasUsed).toBe(receipt?.gasUsed);
    expect(registration.registeredAt).toEqual(new Date(Number(block?.timestamp) * 1000));
    // A PhotoRegistered esemény
    expect(receipt?.logs).toHaveLength(1);
    await expect(chain.isRegistered(photo.sha256)).resolves.toBe(true);
    await expect(chain.getRecord(photo.sha256)).resolves.toEqual({
      ownerRef: photo.ownerRef,
      dHash: photo.dHash,
      registeredAt: registration.registeredAt,
    });
  });

  it('a tranzakció hash-ét még a küldés előtt átadja: ekkor a csomópont még nem ismeri', async () => {
    const chain = serviceFor(await deployRegistry());
    const seen: { txHash: string; knownToNode: boolean }[] = [];

    const registration = await chain.registerPhoto(newPhoto(), {
      beforeBroadcast: async (txHash) => {
        seen.push({ txHash, knownToNode: (await admin.getTransaction(txHash)) !== null });
      },
    });

    expect(seen).toEqual([{ txHash: registration.txHash, knownToNode: false }]);
  });

  it('ha a beforeBroadcast hibát dob, a tranzakció nem megy ki, és a hiba változatlanul továbbmegy', async () => {
    const deployment = await deployRegistry();
    const chain = serviceFor(deployment);
    const photo = newPhoto();
    const databaseDown = new Error('az adatbázis nem érhető el');
    const nonceBefore = await nonceOf(deployment.platform);

    await expect(
      chain.registerPhoto(photo, { beforeBroadcast: () => Promise.reject(databaseDown) }),
    ).rejects.toBe(databaseDown);

    expect(await nonceOf(deployment.platform)).toBe(nonceBefore);
    await expect(chain.isRegistered(photo.sha256)).resolves.toBe(false);
  });

  it('már regisztrált hash: ALREADY_REGISTERED, tranzakció és díj nélkül', async () => {
    const deployment = await deployRegistry();
    const chain = serviceFor(deployment);
    const photo = newPhoto();
    await chain.registerPhoto(photo, { beforeBroadcast: noop });
    const nonceBefore = await nonceOf(deployment.platform);
    const balanceBefore = await admin.getBalance(deployment.platform.address);
    let signed = false;

    await expectChainError(
      chain.registerPhoto(photo, {
        beforeBroadcast: async () => {
          signed = true;
        },
      }),
      'ALREADY_REGISTERED',
    );

    expect(signed).toBe(false);
    expect(await nonceOf(deployment.platform)).toBe(nonceBefore);
    expect(await admin.getBalance(deployment.platform.address)).toBe(balanceBefore);
  });

  it('az egyszerre indított regisztrációk egyenként, egymást követő nonce-okkal mennek ki', async () => {
    const chain = serviceFor(await deployRegistry());
    const signedHashes: string[] = [];
    // A tranzakció-sor miatt minden tranzakciót csak az előző blokkba kerülése után ír alá
    const beforeBroadcast = async (txHash: string): Promise<void> => {
      const previous = signedHashes.at(-1);
      if (previous !== undefined) {
        expect(await admin.getTransactionReceipt(previous)).not.toBeNull();
      }
      signedHashes.push(txHash);
    };

    const registrations = await Promise.all(
      Array.from({ length: 5 }, () => chain.registerPhoto(newPhoto(), { beforeBroadcast })),
    );

    const nonces = await Promise.all(
      registrations.map(async ({ txHash }) => (await admin.getTransaction(txHash))?.nonce),
    );
    // A 0-s nonce a szerződés telepítéséé
    expect(nonces).toEqual([1, 2, 3, 4, 5]);
  });

  it('ha a platform-tárca nem a szerződés tulajdonosa: REVERTED (OwnableUnauthorizedAccount)', async () => {
    const deployment = await deployRegistry();
    const stranger = serviceFor({ ...deployment, platform: await fundedWallet() });

    const error = await expectChainError(
      stranger.registerPhoto(newPhoto(), { beforeBroadcast: noop }),
      'REVERTED',
    );

    expect(error.message).toMatch(/OwnableUnauthorizedAccount/);
  });

  it('ha elfogyott a teszt-ETH: INSUFFICIENT_FUNDS, a lánc nem változik', async () => {
    const deployment = await deployRegistry();
    const chain = serviceFor(deployment);
    const photo = newPhoto();
    await admin.send('hardhat_setBalance', [deployment.platform.address, '0x0']);

    await expectChainError(
      chain.registerPhoto(photo, { beforeBroadcast: noop }),
      'INSUFFICIENT_FUNDS',
    );

    await expect(chain.isRegistered(photo.sha256)).resolves.toBe(false);
  });

  it('időtúllépésnél TIMEOUT – a később blokkba került tranzakciót egy újraindított példány lezárja', async () => {
    const deployment = await deployRegistry();
    const photo = newPhoto();
    let txHash = '';

    await withoutAutomine(async () => {
      await expectChainError(
        serviceFor(deployment, { confirmationTimeoutMs: 500 }).registerPhoto(photo, {
          beforeBroadcast: async (hash) => {
            txHash = hash;
          },
        }),
        'TIMEOUT',
      );
      // A tranzakció nem veszett el, csak még nincs blokkban
      expect(await admin.getTransaction(txHash)).not.toBeNull();

      const restarted = serviceFor(deployment);
      const waiting = restarted.waitForRegistration(txHash, photo.sha256);
      await admin.send('evm_mine', []);

      await expect(waiting).resolves.toMatchObject({ txHash });
    });
    await expect(serviceFor(deployment).isRegistered(photo.sha256)).resolves.toBe(true);
  });

  // Az ethers saját várakozása (TransactionResponse.wait) egy átmeneti RPC-hibánál kezeletlen
  // ígéret-elutasítást okoz, amitől a Node-folyamat (a szerver) leállna
  it('a várakozás közbeni átmeneti RPC-hibát kibírja: a regisztráció sikerül, nincs kezeletlen hiba', async () => {
    const deployment = await deployRegistry();
    const proxy = await flakyProxy(3);
    const chain = serviceFor(deployment, { rpcUrl: proxy.url });
    const photo = newPhoto();

    // A tranzakció egy ideig függőben marad (200 ms-onként jön blokk): közben a nyugta első három
    // lekérdezése hibát kap
    const registration = await withoutAutomine(async () => {
      await admin.send('evm_setIntervalMining', [200]);
      try {
        return await chain.registerPhoto(photo, { beforeBroadcast: noop });
      } finally {
        await admin.send('evm_setIntervalMining', [0]);
        await proxy.close();
      }
    });

    expect(registration.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    await expect(serviceFor(deployment).isRegistered(photo.sha256)).resolves.toBe(true);
  });

  it('ha a csomópont a várakozás végéig sem válaszol: UNAVAILABLE, de a hash-t előtte megkaptuk', async () => {
    const deployment = await deployRegistry();
    const proxy = await flakyProxy(Number.POSITIVE_INFINITY);
    let txHash = '';
    try {
      const chain = serviceFor(deployment, { rpcUrl: proxy.url, confirmationTimeoutMs: 500 });

      const error = await expectChainError(
        chain.registerPhoto(newPhoto(), {
          beforeBroadcast: async (hash) => {
            txHash = hash;
          },
        }),
        'UNAVAILABLE',
      );

      expect(error.message).toMatch(/HTTP 503/);
    } finally {
      await proxy.close();
    }
    // A tranzakció közben blokkba került: a hash alapján később lezárható
    expect((await admin.getTransactionReceipt(txHash))?.status).toBe(1);
  });

  // Ha a küldés válasza elvész, nem tudni, megkapta-e a csomópont a tranzakciót: a sor ilyenkor nem
  // engedi tovább a következőt (ugyanazzal a nonce-szal), hanem megvárja a nyugtát
  it('ha a küldés válasza elvész, de a tranzakció megérkezett: a regisztráció sikerül, nincs nonce-ütközés', async () => {
    const deployment = await deployRegistry();
    let lostResponses = 1;
    const proxy = await rpcProxy((body) => {
      if (!body.includes('eth_sendRawTransaction') || lostResponses <= 0) return 'forward';
      lostResponses -= 1;
      return 'forwardButFail';
    });
    try {
      const chain = serviceFor(deployment, { rpcUrl: proxy.url });

      const [first, second] = await Promise.all([
        chain.registerPhoto(newPhoto(), { beforeBroadcast: noop }),
        chain.registerPhoto(newPhoto(), { beforeBroadcast: noop }),
      ]);

      const nonces = await Promise.all(
        [first, second].map(async ({ txHash }) => (await admin.getTransaction(txHash))?.nonce),
      );
      expect(nonces).toEqual([1, 2]);
    } finally {
      await proxy.close();
    }
  });

  it('ha a tranzakció el sem jutott a csomópontig: a várakozás után a küldés hibája, a következő rendben megy', async () => {
    const deployment = await deployRegistry();
    let dropped = 1;
    const proxy = await rpcProxy((body) => {
      if (!body.includes('eth_sendRawTransaction') || dropped <= 0) return 'forward';
      dropped -= 1;
      return 'fail';
    });
    try {
      const chain = serviceFor(deployment, { rpcUrl: proxy.url, confirmationTimeoutMs: 500 });
      const lost = newPhoto();

      // A hibaüzenet a küldés valódi okát adja (nem azt, hogy a tranzakció később még bekerülhet)
      const error = await expectChainError(
        chain.registerPhoto(lost, { beforeBroadcast: noop }),
        'UNAVAILABLE',
      );
      expect(error.message).toMatch(/HTTP 503/);
      expect(error.message).toMatch(/sem jelent meg a láncon/);
      const next = await chain.registerPhoto(newPhoto(), { beforeBroadcast: noop });

      expect((await admin.getTransaction(next.txHash))?.nonce).toBe(1);
      await expect(chain.isRegistered(lost.sha256)).resolves.toBe(false);
    } finally {
      await proxy.close();
    }
  });

  it('ha a hálózat díja a beállított plafon fölött van: FEE_TOO_HIGH, a tranzakció nem megy ki', async () => {
    const deployment = await deployRegistry();
    const chain = serviceFor(deployment, { maxFeePerGasWei: 1n });
    const nonceBefore = await nonceOf(deployment.platform);
    let signed = false;

    await expectChainError(
      chain.registerPhoto(newPhoto(), {
        beforeBroadcast: async () => {
          signed = true;
        },
      }),
      'FEE_TOO_HIGH',
    );

    expect(signed).toBe(false);
    expect(await nonceOf(deployment.platform)).toBe(nonceBefore);
  });
});

describe('waitForRegistration', () => {
  it('a bányászott tranzakció adatait adja, az ismeretlen hash-re null', async () => {
    const chain = serviceFor(await deployRegistry());
    const photo = newPhoto();
    const registration = await chain.registerPhoto(photo, { beforeBroadcast: noop });

    await expect(chain.waitForRegistration(registration.txHash, photo.sha256)).resolves.toEqual(
      registration,
    );
    await expect(chain.waitForRegistration(randomTxHash(), photo.sha256)).resolves.toBeNull();
  });

  it('ha a tranzakció nem ehhez a képhez tartozik, hibát ad', async () => {
    const chain = serviceFor(await deployRegistry());
    const registration = await chain.registerPhoto(newPhoto(), { beforeBroadcast: noop });

    await expectChainError(
      chain.waitForRegistration(registration.txHash, newPhoto().sha256),
      'UNKNOWN',
    );
  });

  it('a blokkba került, de visszautasított tranzakcióra REVERTED', async () => {
    const deployment = await deployRegistry();
    const chain = serviceFor(deployment);
    const photo = newPhoto();
    await chain.registerPhoto(photo, { beforeBroadcast: noop });
    // Ugyanaz a regisztráció még egyszer, gázbecslés nélkül, kézi bányászással: így a hálózat
    // elfogadja, és a szerződés csak a blokkban utasítja vissza
    const registry = new Contract(deployment.contractAddress, artifact.abi, deployment.platform);
    const reverted = await withoutAutomine(async () => {
      const response = await registry
        .getFunction('registerPhoto')
        .send(`0x${photo.sha256}`, `0x${photo.dHash}`, photo.ownerRef, { gasLimit: 100_000 });
      await admin.send('evm_mine', []);
      return response;
    });
    expect((await admin.getTransactionReceipt(reverted.hash))?.status).toBe(0);

    await expectChainError(chain.waitForRegistration(reverted.hash, photo.sha256), 'REVERTED');
  });
});

describe('checkConnection', () => {
  it('helyes beállításnál nincs probléma', async () => {
    const deployment = await deployRegistry();

    const status = await serviceFor(deployment).checkConnection();

    expect(status).toMatchObject({
      chainId: HARDHAT_CHAIN_ID,
      expectedChainId: HARDHAT_CHAIN_ID,
      walletAddress: deployment.platform.address,
      contractAddress: deployment.contractAddress,
      hasContractCode: true,
      isContractOwner: true,
    });
    expect(status.balanceWei).toBeGreaterThan(0n);
    expect(connectionProblems(status)).toEqual([]);
  });

  it('jelzi, ha más hálózatra, szerződés nélküli címre mutat, vagy a tárca nem tulajdonos', async () => {
    const deployment = await deployRegistry();
    const stranger = await fundedWallet();

    const otherChain = await serviceFor(deployment, { chainId: 1 }).checkConnection();
    const noContract = await serviceFor({
      ...deployment,
      contractAddress: stranger.address,
    }).checkConnection();
    const notOwner = await serviceFor({ ...deployment, platform: stranger }).checkConnection();

    expect(connectionProblems(otherChain)).toEqual([expect.stringMatching(/hálózat/)]);
    expect(connectionProblems(noContract)).toEqual([expect.stringMatching(/szerződés/)]);
    expect(connectionProblems(notOwner)).toEqual([expect.stringMatching(/tulajdonos/)]);
  });
});
