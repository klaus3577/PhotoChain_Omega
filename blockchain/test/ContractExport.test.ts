// Az ABI-export összeállításának tesztjei (scripts/contract-export.ts).
import { expect } from 'chai';

import { buildContractExport, chainIdFromDirectory } from '../scripts/contract-export.js';

const FUTURE_ID = 'PhotoRegistryModule#PhotoRegistry';
const ABI = [{ type: 'function', name: 'isRegistered' }];
const SEPOLIA_ADDRESS = '0x1111111111111111111111111111111111111111';
const LOCAL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

describe('ContractExport', function () {
  describe('chainIdFromDirectory', function () {
    it('az Ignition mappanevéből kiolvassa a chainId-t', function () {
      expect(chainIdFromDirectory('chain-11155111')).to.equal('11155111');
      expect(chainIdFromDirectory('chain-31337')).to.equal('31337');
    });

    it('más mappanévre null-t ad', function () {
      expect(chainIdFromDirectory('artifacts')).to.equal(null);
      expect(chainIdFromDirectory('chain-abc')).to.equal(null);
    });
  });

  describe('buildContractExport', function () {
    it('hálózatonként összegyűjti a szerződés címét az ABI mellé', function () {
      const result = buildContractExport(
        'PhotoRegistry',
        ABI,
        {
          '11155111': { [FUTURE_ID]: SEPOLIA_ADDRESS },
          '31337': { [FUTURE_ID]: LOCAL_ADDRESS },
        },
        FUTURE_ID,
      );

      expect(result).to.deep.equal({
        contractName: 'PhotoRegistry',
        abi: ABI,
        networks: {
          '11155111': { address: SEPOLIA_ADDRESS },
          '31337': { address: LOCAL_ADDRESS },
        },
      });
    });

    it('kihagyja azt a hálózatot, ahol más modul van telepítve', function () {
      const result = buildContractExport(
        'PhotoRegistry',
        ABI,
        {
          '11155111': { [FUTURE_ID]: SEPOLIA_ADDRESS },
          '31337': { 'CounterModule#Counter': LOCAL_ADDRESS },
        },
        FUTURE_ID,
      );

      expect(Object.keys(result.networks)).to.deep.equal(['11155111']);
    });

    it('hibát dob, ha a szerződés sehol sincs telepítve', function () {
      expect(() => buildContractExport('PhotoRegistry', ABI, {}, FUTURE_ID)).to.throw(
        'egyetlen hálózaton sincs telepítve',
      );
    });

    it('hibát dob hibás formátumú címre', function () {
      expect(() =>
        buildContractExport(
          'PhotoRegistry',
          ABI,
          { '31337': { [FUTURE_ID]: '0x1234' } },
          FUTURE_ID,
        ),
      ).to.throw('Hibás szerződéscím');
    });
  });
});
