// Forrás: a Hardhat 3.18 „mocha-ethers” projektsablonja (npx hardhat --init), https://hardhat.org/docs
// (adaptálva: a sablon szimulált mintahálózatai – hardhatMainnet, hardhatOp – kimaradtak, mert a
// projekt nem használja őket).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import hardhatToolboxMochaEthersPlugin from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import { configVariable, defineConfig } from 'hardhat/config';

// A blockchain/.env betöltése a Node beépített függvényével (külön dotenv csomag nélkül). A
// configVariable() értékeit a Hardhat előbb a keystore-ból, majd a környezeti változókból olvassa.
// Forrás: Node.js dokumentáció – process.loadEnvFile(), https://nodejs.org/api/process.html
const envFile = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      // Fejlesztés és tesztek
      default: {
        version: '0.8.34',
      },
      // Telepítés: optimalizált bájtkód (a `hardhat ignition deploy` alapértelmezése)
      production: {
        version: '0.8.34',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    // Ethereum Sepolia teszthálózat (változónevek: blockchain/.env.example).
    // A lokális fejlesztői hálózat (`npx hardhat node`) a beépített `localhost` hálózat.
    sepolia: {
      type: 'http',
      chainType: 'l1',
      url: configVariable('SEPOLIA_RPC_URL'),
      accounts: [configVariable('SEPOLIA_PRIVATE_KEY')],
    },
  },
  // A telepített szerződés forráskódjának ellenőrzése (verifikáció) az Etherscanen és a Blockscouton.
  // A Sourcify-ra nem küldünk külön: a Blockscout a sikeres verifikációt oda is továbbítja, és a
  // párhuzamos beküldés „already being verified” hibával (kilépési kód 1) zárult.
  verify: {
    etherscan: {
      apiKey: configVariable('ETHERSCAN_API_KEY'),
    },
    sourcify: {
      enabled: false,
    },
  },
});
