// A PhotoRegistry okosszerződés telepítő modulja (Hardhat Ignition).
// Forrás: a Hardhat 3 „mocha-ethers” projektsablonjának ignition/modules/Counter.ts mintája és a
// Hardhat Ignition dokumentációja, https://hardhat.org/ignition/docs – adaptálva.
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('PhotoRegistryModule', (m) => {
  // A telepítő fiók lesz a szerződés tulajdonosa (Ownable(msg.sender)); a konstruktornak nincs
  // paramétere.
  const photoRegistry = m.contract('PhotoRegistry');

  return { photoRegistry };
});
