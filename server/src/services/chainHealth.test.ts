// A lánc-kapcsolat ellenőrzésének naplózása (induláskor és időszakosan, L30): a beállítási hibák
// (pl. a platform-tárca már nem tulajdonosa a szerződésnek, kifogyóban a teszt-ETH) hibaként
// kerülnek a naplóba, hogy egy riasztás észrevegye; az elérhetetlen lánc csak figyelmeztetés.
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { type BlockchainService, ChainError } from './blockchain.service.js';
import { reportChainHealth } from './chainHealth.js';

const HEALTHY = {
  chainId: 31_337,
  expectedChainId: 31_337,
  walletAddress: '0x1111111111111111111111111111111111111111',
  contractAddress: '0x2222222222222222222222222222222222222222',
  hasContractCode: true,
  isContractOwner: true,
  balanceWei: 10n ** 18n,
};

function setup(checkConnection: BlockchainService['checkConnection']) {
  const lines: Array<{ level: number; msg: string } & Record<string, unknown>> = [];
  const logger = pino({ level: 'info' }, { write: (line: string) => lines.push(JSON.parse(line)) });
  return { blockchain: { checkConnection: vi.fn(checkConnection) }, logger, lines };
}

describe('reportChainHealth', () => {
  it('induláskor a rendben lévő kapcsolatot egy info-sorral naplózza (hálózat, szerződés, tárca, egyenleg)', async () => {
    const { blockchain, logger, lines } = setup(async () => HEALTHY);

    await reportChainHealth(blockchain, logger, 'startup');

    expect(lines).toMatchObject([
      {
        level: 30,
        msg: 'A blokklánc-kapcsolat ellenőrizve',
        chainId: 31_337,
        wallet: HEALTHY.walletAddress,
        balanceEth: '1.0',
      },
    ]);
  });

  it('időszakosan a rendben lévő kapcsolatnál nem naplóz (nem árasztja el a naplót)', async () => {
    const { blockchain, logger, lines } = setup(async () => HEALTHY);

    await reportChainHealth(blockchain, logger, 'periodic');

    expect(blockchain.checkConnection).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([]);
  });

  it.each(['startup', 'periodic'] as const)(
    'a beállítási hibát (%s) hibaként naplózza – pl. ha a tárca már nem tulajdonos',
    async (mode) => {
      const { blockchain, logger, lines } = setup(async () => ({
        ...HEALTHY,
        isContractOwner: false,
      }));

      await reportChainHealth(blockchain, logger, mode);

      expect(lines.filter((line) => line.level === 50)).toMatchObject([
        { event: 'chain_config_problem', msg: expect.stringMatching(/nem tulajdonosa/) },
      ]);
    },
  );

  // Átnézés: a faucetből töltött teszttárca gyakran kevés ETH-t tart – ez teendő, nem hiba (a
  // 10 percenkénti error-sor elárasztaná a riasztást)
  it.each(['startup', 'periodic'] as const)(
    'az alacsony egyenleget (%s) figyelmeztetésként naplózza, nem hibaként',
    async (mode) => {
      const { blockchain, logger, lines } = setup(async () => ({
        ...HEALTHY,
        balanceWei: 10n ** 16n,
      }));

      await reportChainHealth(blockchain, logger, mode);

      expect(lines.filter((line) => line.level >= 40)).toMatchObject([
        { level: 40, event: 'chain_low_balance', msg: expect.stringMatching(/alacsony/) },
      ]);
    },
  );

  it('az elérhetetlen láncot figyelmeztetésként naplózza, a hiba okával, és nem dob', async () => {
    const { blockchain, logger, lines } = setup(async () => {
      throw new ChainError('UNAVAILABLE', 'A blokklánc-csomópont (RPC) nem érhető el (HTTP 503)');
    });

    await expect(reportChainHealth(blockchain, logger, 'periodic')).resolves.toBeUndefined();

    expect(lines).toMatchObject([
      { level: 40, msg: expect.stringMatching(/most nem érhető el \(A blokklánc-csomópont/) },
    ]);
  });

  it('ismeretlen hibánál az üzenetét nem írja ki (abban titok, pl. az RPC-URL is lehet)', async () => {
    const { blockchain, logger, lines } = setup(async () => {
      throw new Error('https://titkos.rpc/kulcs elérhetetlen');
    });

    await reportChainHealth(blockchain, logger, 'startup');

    expect(JSON.stringify(lines)).not.toContain('titkos');
    expect(lines).toMatchObject([{ level: 40, msg: expect.stringMatching(/ismeretlen hiba/) }]);
  });
});
