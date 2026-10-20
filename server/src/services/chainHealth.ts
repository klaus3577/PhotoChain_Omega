// A lánc-kapcsolat ellenőrzése és naplózása – induláskor és időszakosan (L30). A hálózat, a
// szerződés, a tulajdonos és a tárca egyenlege egy kiszivárgott platform-kulcs vagy egy kifogyó tárca
// első jele lehet (pl. a tulajdonjogot valaki átruházta: „nem tulajdonosa a szerződésnek”), ezért a
// beállítási hiba hibaszinten (riasztható) kerül a naplóba, nem csak induláskor; az alacsony egyenleg
// figyelmeztetésként (teendő, nem hiba). Csak naplóz: az
// elérhetetlen lánc nem akadályozza a szerver működését – a feltöltés ilyenkor is működik, a
// regisztráció CHAIN_FAILED lesz, és később újrapróbálható.
import { formatEther } from 'ethers';
import type { Logger } from 'pino';

import {
  type BlockchainService,
  ChainError,
  connectionProblems,
  lowBalanceWarning,
} from './blockchain.service.js';

/** Induláskor egy összegző sor is kell; az időszakos ellenőrzés csak a hibát jelzi. */
export type ChainHealthMode = 'startup' | 'periodic';

export async function reportChainHealth(
  blockchain: Pick<BlockchainService, 'checkConnection'>,
  logger: Logger,
  mode: ChainHealthMode,
): Promise<void> {
  try {
    const status = await blockchain.checkConnection();
    for (const problem of connectionProblems(status)) {
      logger.error({ event: 'chain_config_problem' }, problem);
    }
    const lowBalance = lowBalanceWarning(status);
    if (lowBalance !== null) logger.warn({ event: 'chain_low_balance' }, lowBalance);
    if (mode === 'startup') {
      logger.info(
        {
          chainId: status.chainId,
          contract: status.contractAddress,
          wallet: status.walletAddress,
          balanceEth: formatEther(status.balanceWei),
        },
        'A blokklánc-kapcsolat ellenőrizve',
      );
    }
  } catch (error) {
    // Csak a saját (titokmentes) hibaüzenet kerülhet a naplóba – egy ismeretlen hibáé nem
    const reason = error instanceof ChainError ? error.message : 'ismeretlen hiba';
    logger.warn(`A blokklánc most nem érhető el (${reason}) – a feltöltés ettől még működik`);
  }
}
