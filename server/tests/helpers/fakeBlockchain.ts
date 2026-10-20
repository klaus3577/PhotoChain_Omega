// Tesztsegéd: a blokklánc-szolgáltatás memóriában működő utánzata (mock). A PhotoRegistry lényeges
// viselkedését adja valódi lánc nélkül: egy hash csak egyszer regisztrálható, a tranzakció hash-ét
// a „küldés” előtt átadja (beforeBroadcast), a nyugtát a hash alapján később is visszaadja. A
// függvények vi.fn()-ek: a tesztek hibát adathatnak vissza belőlük, és ellenőrizhetik a hívásokat.
import { randomBytes } from 'node:crypto';

import { vi } from 'vitest';

import {
  type BlockchainService,
  ChainError,
  type ChainConnectionStatus,
  type ChainRecord,
  type ChainRegistration,
  type RegisterPhotoInput,
  type RegisterPhotoOptions,
} from '../../src/services/blockchain.service.js';

/** Egy regisztráció gázigénye a lokális Hardhat-hálózaton mérve (L11). */
export const REGISTRATION_GAS = 72_820n;
const FIRST_BLOCK = 1_000;
const MS_PER_SECOND = 1_000;

export const randomTxHash = (): string => `0x${randomBytes(32).toString('hex')}`;

const HEALTHY_CONNECTION: ChainConnectionStatus = {
  chainId: 31_337,
  expectedChainId: 31_337,
  walletAddress: `0x${'1'.repeat(40)}`,
  contractAddress: `0x${'2'.repeat(40)}`,
  hasContractCode: true,
  isContractOwner: true,
  balanceWei: 10n ** 18n,
};

export function createFakeBlockchain() {
  const records = new Map<string, ChainRecord>();
  const mined = new Map<string, ChainRegistration>();
  let blockNumber = FIRST_BLOCK;

  /** A tranzakció „blokkba kerül”: a kép regisztrálva van, a nyugta a hash-sel lekérhető. */
  function mine(input: RegisterPhotoInput, txHash: string): ChainRegistration {
    blockNumber += 1;
    // A lánc időbélyege másodperc pontosságú
    const registeredAt = new Date(Math.floor(Date.now() / MS_PER_SECOND) * MS_PER_SECOND);
    records.set(input.sha256, { ownerRef: input.ownerRef, dHash: input.dHash, registeredAt });
    const registration = { txHash, blockNumber, gasUsed: REGISTRATION_GAS, registeredAt };
    mined.set(txHash, registration);
    return registration;
  }

  async function registerPhoto(
    input: RegisterPhotoInput,
    { beforeBroadcast }: RegisterPhotoOptions,
  ): Promise<ChainRegistration> {
    if (records.has(input.sha256)) {
      throw new ChainError('ALREADY_REGISTERED', 'A kép tartalom-hash-e már regisztrálva van');
    }
    const txHash = randomTxHash();
    await beforeBroadcast(txHash);
    return mine(input, txHash);
  }

  const blockchain = {
    isRegistered: vi.fn(async (sha256: string) => records.has(sha256)),
    getRecord: vi.fn(async (sha256: string) => records.get(sha256) ?? null),
    registerPhoto: vi.fn(registerPhoto),
    waitForRegistration: vi.fn(async (txHash: string) => mined.get(txHash) ?? null),
    checkConnection: vi.fn(async () => HEALTHY_CONNECTION),
  } satisfies BlockchainService;

  /** A megadott kép regisztrációja a megadott hibával meghiúsul; a többié rendben lefut. */
  function failRegistration(sha256: string, error: Error): void {
    blockchain.registerPhoto.mockImplementation(async (input, options) => {
      if (input.sha256 === sha256) throw error;
      return registerPhoto(input, options);
    });
  }

  // registerPhoto: az utánzat alapértelmezett (hibátlan) regisztrációja – a tesztek saját
  // megvalósításai ebbe továbbíthatnak
  return { blockchain, records, mined, mine, failRegistration, registerPhoto };
}

export type FakeBlockchain = ReturnType<typeof createFakeBlockchain>;
