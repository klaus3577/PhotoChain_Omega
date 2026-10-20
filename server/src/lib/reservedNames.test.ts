// A foglalt megjelenített nevek felismerése (L30): a platform és a moderátorok nevére emlékeztető
// név a kis- és nagybetűk, az ékezetek, a láthatatlan karakterek, a szóközök és írásjelek, a
// gyakori számjegy-helyettesítések és a latin betűre hasonlító cirill/görög betűk ellenére is
// felismerhető. A különleges karaktereket kódpontjukkal állítjuk elő.
import { describe, expect, it } from 'vitest';

import { isReservedDisplayName, nameSkeleton } from './reservedNames.js';

const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const CYRILLIC_A = String.fromCodePoint(0x430);
const CYRILLIC_O = String.fromCodePoint(0x43e);
const GREEK_OMICRON = String.fromCodePoint(0x3bf);
const FULLWIDTH_A = String.fromCodePoint(0xff21);

describe('nameSkeleton', () => {
  it('kisbetűs, ékezet, szóköz és írásjel nélküli alak', () => {
    expect(nameSkeleton('  Adminisztrátor ')).toBe('adminisztrator');
    expect(nameSkeleton('Ügyfél-szolgálat!')).toBe('ugyfelszolgalat');
  });

  it('a láthatatlan karaktereket és a kompatibilitási alakokat (teljes szélességű betű) egységesíti', () => {
    expect(nameSkeleton(`Ad${ZERO_WIDTH_SPACE}min${SOFT_HYPHEN}`)).toBe('admin');
    expect(nameSkeleton(`${FULLWIDTH_A}dmin`)).toBe('admin');
  });

  it('a latin betűre hasonlító cirill és görög betűt és a számjegy-helyettesítést is', () => {
    expect(nameSkeleton(`${CYRILLIC_A}dmin`)).toBe('admin');
    expect(nameSkeleton(`Ph${CYRILLIC_O}t${GREEK_OMICRON}Chain`)).toBe('photochain');
    expect(nameSkeleton('Ph0t0Cha1n')).toBe('photochain');
  });
});

describe('isReservedDisplayName', () => {
  it.each([
    'Adminisztrátor',
    'admin',
    'ADMIN',
    'Ádmin',
    'Adm1n',
    'A.d.m.i.n',
    `${CYRILLIC_A}dmin`,
    `Ad${ZERO_WIDTH_SPACE}min`,
    'Administrator',
    'Moderátor',
    'Moderátor Kati',
    'PhotoChain',
    'Photo Chain csapat',
    'Ph0t0Chain Support',
    'Ügyfélszolgálat',
    'Rendszergazda',
    'Support',
    // A rövid szavak egy több szóból álló név önálló szavaként is (L30, átnézés)
    'Admin Kati',
    'Admin Team',
    'Az Admin',
    'System Admin',
    'Support csapat',
    'Kiss-Admin',
    'Adm1n Béla',
  ])('foglalt: %s', (name) => {
    expect(isReservedDisplayName(name)).toBe(true);
  });

  // A rövid szavak (admin, support) csak önállóan foglaltak – egy hosszabb név részeként nem
  it.each(['Kiss Anna', 'Badminton Béla', 'Adrienn', 'Admira', 'Supporter Zsófi', 'Fotós Fanni'])(
    'szabad: %s',
    (name) => {
      expect(isReservedDisplayName(name)).toBe(false);
    },
  );
});
