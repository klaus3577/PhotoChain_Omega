// A blokklánc-szolgáltatás unit tesztjei Hardhat-hálózat nélkül: a segédfüggvények, a lánchibák
// besorolása, és a hibás vagy elérhetetlen RPC-csomópont kezelése (helyi, hamis HTTP-szerverekkel).
// A valódi, lokális láncon futó tesztek: tests/chain/blockchain.service.test.ts.
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inspect } from 'node:util';

import { Interface, keccak256, toUtf8Bytes, Wallet } from 'ethers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import photoRegistry from '../contracts/PhotoRegistry.json' with { type: 'json' };
import {
  ChainConfigError,
  ChainError,
  type ChainErrorKind,
  connectionProblems,
  type ChainConnectionStatus,
  createBlockchainService,
  type BlockchainServiceConfig,
  isDefiniteRejection,
  LOW_BALANCE_WEI,
  lowBalanceWarning,
  ownerRefOf,
  resolveContractAddress,
  toChainError,
} from './blockchain.service.js';

const registryInterface = new Interface(photoRegistry.abi);
const SHA256 = 'ab'.repeat(32);
const DHASH = '8f3c1a2b4d5e6f70';
const OWNER_REF = ownerRefOf('3f1c2a9e-5b7d-4e2f-9a61-0c8d7e6b5a41');
const LOCAL_CONTRACT = photoRegistry.networks['31337'].address;
/** A hamis RPC-URL „API-kulcsa”: sehol nem jelenhet meg (hibaüzenet, verem, JSON). */
const API_KEY = 'TITKOS-API-KULCS-123';
const SECRET_URL = `https://eth-sepolia.g.alchemy.com/v2/${API_KEY}`;

/** Az ethers hibáinak alakját utánzó hiba (az ethers `isError` a `code` mezőt vizsgálja). */
const ethersError = (code: string, fields: Record<string, unknown> = {}): Error =>
  Object.assign(new Error(`${code} (requestUrl=${SECRET_URL})`), { code, ...fields });

const revertData = (name: string, args: unknown[]): string =>
  registryInterface.encodeErrorResult(name, args);

/** Az ígéret elutasításának oka (a teszt így a hibaobjektumot részletesen vizsgálhatja). */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

/** A hibát ChainError-ként, a megadott fajtával várja, az RPC-URL kulcsa nélkül. */
async function expectChainError(promise: Promise<unknown>, kind: ChainErrorKind): Promise<Error> {
  const error = await rejectionOf(promise);
  expect(error).toBeInstanceOf(ChainError);
  expect((error as ChainError).kind).toBe(kind);
  expect(inspect(error, { depth: 8 })).not.toContain(API_KEY);
  return error as Error;
}

describe('ownerRefOf', () => {
  it('a felhasználói azonosító keccak256-hash-e: álnevesített azonosító, személyes adat nélkül', () => {
    const userId = '3f1c2a9e-5b7d-4e2f-9a61-0c8d7e6b5a41';

    expect(ownerRefOf(userId)).toBe(keccak256(toUtf8Bytes(userId)));
    expect(ownerRefOf(userId)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ownerRefOf('7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d')).not.toBe(ownerRefOf(userId));
  });
});

describe('resolveContractAddress', () => {
  it('az exportált fájlból (PhotoRegistry.json) a hálózat szerződéscímét adja', () => {
    expect(resolveContractAddress(11_155_111)).toBe(photoRegistry.networks['11155111'].address);
    expect(resolveContractAddress(31_337)).toBe(LOCAL_CONTRACT);
  });

  it('ismeretlen hálózatnál ChainConfigError, a teendővel', () => {
    expect(() => resolveContractAddress(1)).toThrow(ChainConfigError);
    expect(() => resolveContractAddress(1)).toThrow(/export-abi/);
  });

  it('hibás formátumú címnél is ChainConfigError', () => {
    expect(() => resolveContractAddress(5, { '5': { address: '0x1234' } })).toThrow(
      ChainConfigError,
    );
  });
});

describe('toChainError – a lánchibák besorolása', () => {
  const cases: [string, unknown, ChainErrorKind, RegExp?][] = [
    [
      'a szerződés AlreadyRegistered hibája',
      ethersError('CALL_EXCEPTION', { data: revertData('AlreadyRegistered', [`0x${SHA256}`]) }),
      'ALREADY_REGISTERED',
    ],
    [
      'a szerződés más hibája (a tárca nem tulajdonos)',
      ethersError('CALL_EXCEPTION', {
        data: revertData('OwnableUnauthorizedAccount', [Wallet.createRandom().address]),
      }),
      'REVERTED',
      /OwnableUnauthorizedAccount/,
    ],
    ['visszautasítás ok nélkül', ethersError('CALL_EXCEPTION', { data: null }), 'REVERTED'],
    [
      'visszautasítás ismeretlen hibakóddal',
      ethersError('CALL_EXCEPTION', { data: '0xdeadbeef' }),
      'REVERTED',
    ],
    [
      'visszautasítás értelmezhetetlen adattal',
      ethersError('CALL_EXCEPTION', { data: 'nem-hexa' }),
      'REVERTED',
    ],
    [
      'az ethers által már értelmezett visszautasítás (pl. require üzenettel)',
      ethersError('CALL_EXCEPTION', { revert: { name: 'Error', args: ['ok'] } }),
      'REVERTED',
      /\(Error\)/,
    ],
    [
      'a visszautasítás neve csak azonosító lehet (más szöveg nem kerül az üzenetbe)',
      ethersError('CALL_EXCEPTION', { revert: { name: `Hiba ${SECRET_URL}` } }),
      'REVERTED',
    ],
    [
      'az ethers INSUFFICIENT_FUNDS hibája',
      ethersError('INSUFFICIENT_FUNDS'),
      'INSUFFICIENT_FUNDS',
    ],
    [
      'a csomópont „nincs elég pénz” üzenete (Hardhat)',
      ethersError('UNKNOWN_ERROR', {
        error: { message: "Sender doesn't have enough funds to send tx." },
      }),
      'INSUFFICIENT_FUNDS',
    ],
    ['időtúllépés', ethersError('TIMEOUT'), 'TIMEOUT'],
    ['hálózati időtúllépés (ETIMEDOUT)', ethersError('ETIMEDOUT'), 'TIMEOUT'],
    ['elutasított kapcsolat', ethersError('ECONNREFUSED'), 'UNAVAILABLE'],
    ['ismeretlen gépnév', ethersError('ENOTFOUND'), 'UNAVAILABLE'],
    ['hálózati hiba', ethersError('NETWORK_ERROR'), 'UNAVAILABLE'],
    [
      'HTTP-hiba (pl. rossz API-kulcs)',
      ethersError('SERVER_ERROR', {
        info: { requestUrl: SECRET_URL, responseStatus: '401 Unauthorized' },
      }),
      'UNAVAILABLE',
      /HTTP 401/,
    ],
    ['elhasznált nonce', ethersError('NONCE_EXPIRED'), 'NONCE_CONFLICT', /nonce/],
    [
      'ugyanazzal a nonce-szal már vár egy tranzakció',
      ethersError('REPLACEMENT_UNDERPRICED'),
      'NONCE_CONFLICT',
    ],
    ['ismeretlen ethers-hibakód', ethersError('BAD_DATA'), 'UNKNOWN', /BAD_DATA/],
    ['bármilyen más hiba', new Error(`váratlan: ${SECRET_URL}`), 'UNKNOWN'],
    ['nem Error típusú érték', `szöveg ${SECRET_URL}`, 'UNKNOWN'],
  ];

  it.each(cases)('%s', (_label, error, kind, message) => {
    const result = toChainError(error);

    expect(result).toBeInstanceOf(ChainError);
    expect(result.kind).toBe(kind);
    if (message) expect(result.message).toMatch(message);
    // Az eredeti hibából semmi nem kerül át: se az üzenete (benne az RPC-URL a kulccsal), se ő maga
    // okként (cause) – a naplóba így titok nem juthat
    expect(inspect(result, { depth: 8 })).not.toContain(API_KEY);
    expect(result.cause).toBeUndefined();
  });

  it('biztos elutasítás: a tranzakció nem került és nem is kerül a láncra (a hash-e eldobható)', () => {
    const definite: ChainErrorKind[] = [
      'ALREADY_REGISTERED',
      'REVERTED',
      'INSUFFICIENT_FUNDS',
      'FEE_TOO_HIGH',
      'NONCE_CONFLICT',
    ];
    // Ezeknél nem tudható, hogy a tranzakció eljutott-e a csomópontig
    const uncertain: ChainErrorKind[] = ['TIMEOUT', 'UNAVAILABLE', 'UNKNOWN'];
    const isDefinite = (kind: ChainErrorKind) => isDefiniteRejection(new ChainError(kind, 'hiba'));

    expect(definite.filter(isDefinite)).toEqual(definite);
    expect(uncertain.filter(isDefinite)).toEqual([]);
  });

  it('a már ChainError típusú hibát változatlanul adja tovább', () => {
    const error = new ChainError('TIMEOUT', 'időtúllépés');

    expect(toChainError(error)).toBe(error);
  });
});

describe('connectionProblems', () => {
  const HEALTHY: ChainConnectionStatus = {
    chainId: 31_337,
    expectedChainId: 31_337,
    walletAddress: Wallet.createRandom().address,
    contractAddress: LOCAL_CONTRACT,
    hasContractCode: true,
    isContractOwner: true,
    balanceWei: 10n ** 18n,
  };

  it('helyes beállításnál nincs probléma', () => {
    expect(connectionProblems(HEALTHY)).toEqual([]);
  });

  it.each([
    ['más hálózatra mutat az RPC_URL', { chainId: 1 }, /hálózat/],
    ['a címen nincs szerződés', { hasContractCode: false, isContractOwner: false }, /szerződés/],
    ['a platform-tárca nem tulajdonos', { isContractOwner: false }, /tulajdonos/],
    ['elfogyott a teszt-ETH', { balanceWei: 0n }, /ETH/],
  ])('%s → egy figyelmeztetés', (_label, change, message) => {
    const problems = connectionProblems({ ...HEALTHY, ...change });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(message);
  });

  it('az alacsony (de nem üres) egyenleg nem beállítási hiba – arról a lowBalanceWarning szól', () => {
    expect(connectionProblems({ ...HEALTHY, balanceWei: 10n ** 16n })).toEqual([]);
  });
});

// L30: a tárca kiürülését előre jelezze, ne csak az első sikertelen regisztráció – figyelmeztetésként
// (a faucetből töltött teszttárca gyakran kevesebbet tart; ez nem hiba, csak teendő)
describe('lowBalanceWarning', () => {
  const status: ChainConnectionStatus = {
    chainId: 31_337,
    expectedChainId: 31_337,
    walletAddress: Wallet.createRandom().address,
    contractAddress: LOCAL_CONTRACT,
    hasContractCode: true,
    isContractOwner: true,
    balanceWei: 10n ** 18n,
  };

  it('0,05 ETH alatt figyelmeztet, az egyenleggel', () => {
    expect(lowBalanceWarning({ ...status, balanceWei: 10n ** 16n })).toMatch(
      /egyenlege alacsony \(0\.01 ETH\)/,
    );
  });

  it('0,05 ETH-tól és üres tárcánál nem (az utóbbiról a connectionProblems szól)', () => {
    expect(lowBalanceWarning({ ...status, balanceWei: LOW_BALANCE_WEI })).toBeNull();
    expect(lowBalanceWarning({ ...status, balanceWei: 0n })).toBeNull();
    expect(lowBalanceWarning(status)).toBeNull();
  });
});

describe('createBlockchainService – hibás konfiguráció', () => {
  const config = (overrides: Partial<BlockchainServiceConfig> = {}): BlockchainServiceConfig => ({
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31_337,
    contractAddress: LOCAL_CONTRACT,
    privateKey: Wallet.createRandom().privateKey,
    ...overrides,
  });

  it('érvénytelen privát kulcsnál ChainConfigError, a hibaüzenetben a kulcs nélkül', () => {
    // Formailag helyes (0x + 64 hexa), de nagyobb a görbe rendjénél: nem lehet privát kulcs
    const invalidKey = `0x${'ff'.repeat(32)}`;

    const error = (() => {
      try {
        createBlockchainService(config({ privateKey: invalidKey }));
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ChainConfigError);
    expect(inspect(error, { depth: 8 })).not.toContain('ff'.repeat(32));
  });

  it('hibás szerződéscímnél ChainConfigError', () => {
    expect(() => createBlockchainService(config({ contractAddress: '0x1234' }))).toThrow(
      ChainConfigError,
    );
  });
});

describe('createBlockchainService – elérhetetlen vagy hibás RPC-csomópont', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    vi.restoreAllMocks();
  });

  /** Helyi HTTP-szerver a megadott viselkedéssel; az URL-jében a titkos „API-kulcs”. */
  async function startRpcServer(listener: RequestListener): Promise<string> {
    const server = createServer(listener);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/v2/${API_KEY}`;
  }

  /** Egy port, amelyen biztosan nem fut semmi (a szerver elindult, majd leállt). */
  async function closedPortUrl(): Promise<string> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise((resolve) => server.close(resolve));
    return `http://127.0.0.1:${port}/v2/${API_KEY}`;
  }

  const serviceAt = (rpcUrl: string, overrides: Partial<BlockchainServiceConfig> = {}) =>
    createBlockchainService({
      rpcUrl,
      chainId: 31_337,
      contractAddress: LOCAL_CONTRACT,
      privateKey: Wallet.createRandom().privateKey,
      ...overrides,
    });

  const photo = { sha256: SHA256, dHash: DHASH, ownerRef: OWNER_REF };

  it('ha a csomópont nem érhető el: UNAVAILABLE minden műveletnél, és a konzolra sem ír', async () => {
    const consoleLog = vi.spyOn(console, 'log');
    const chain = serviceAt(await closedPortUrl());
    const beforeBroadcast = vi.fn(async () => undefined);

    await expectChainError(chain.isRegistered(SHA256), 'UNAVAILABLE');
    await expectChainError(chain.getRecord(SHA256), 'UNAVAILABLE');
    await expectChainError(chain.registerPhoto(photo, { beforeBroadcast }), 'UNAVAILABLE');
    await expectChainError(chain.waitForRegistration(`0x${SHA256}`, SHA256), 'UNAVAILABLE');
    await expectChainError(chain.checkConnection(), 'UNAVAILABLE');

    expect(beforeBroadcast).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('ha a csomópont HTTP-hibát ad (pl. rossz API-kulcs): UNAVAILABLE, az URL és a kulcs nélkül', async () => {
    const rpcUrl = await startRpcServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `érvénytelen kulcs: ${API_KEY}` }));
    });

    const error = await expectChainError(serviceAt(rpcUrl).isRegistered(SHA256), 'UNAVAILABLE');

    expect(error.message).toMatch(/HTTP 401/);
  });

  it('ha a csomópont nem válaszol: a feltöltéskori olvasás readTimeoutMs után TIMEOUT', async () => {
    const rpcUrl = await startRpcServer(() => undefined);
    const chain = serviceAt(rpcUrl, { readTimeoutMs: 200 });
    const started = Date.now();

    await expectChainError(chain.isRegistered(SHA256), 'TIMEOUT');

    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('ha a csomópont nem válaszol: a tranzakció küldése requestTimeoutMs után TIMEOUT, beforeBroadcast nélkül', async () => {
    const rpcUrl = await startRpcServer(() => undefined);
    const chain = serviceAt(rpcUrl, { requestTimeoutMs: 300 });
    const beforeBroadcast = vi.fn(async () => undefined);

    await expectChainError(chain.registerPhoto(photo, { beforeBroadcast }), 'TIMEOUT');

    expect(beforeBroadcast).not.toHaveBeenCalled();
  });

  it('hibás bemenetnél (nem hexadecimális hash) TypeError, hálózati kérés nélkül', async () => {
    let requests = 0;
    const rpcUrl = await startRpcServer((_req, res) => {
      requests += 1;
      res.end();
    });
    const chain = serviceAt(rpcUrl);
    const beforeBroadcast = vi.fn(async () => undefined);

    await expect(chain.isRegistered('XYZ')).rejects.toThrow(TypeError);
    await expect(chain.getRecord(SHA256.toUpperCase())).rejects.toThrow(TypeError);
    await expect(
      chain.registerPhoto({ ...photo, dHash: 'nem-hexa' }, { beforeBroadcast }),
    ).rejects.toThrow(TypeError);
    await expect(
      chain.registerPhoto({ ...photo, ownerRef: '0x1234' }, { beforeBroadcast }),
    ).rejects.toThrow(TypeError);
    await expect(chain.waitForRegistration('0x1234', SHA256)).rejects.toThrow(TypeError);

    expect(requests).toBe(0);
  });
});
