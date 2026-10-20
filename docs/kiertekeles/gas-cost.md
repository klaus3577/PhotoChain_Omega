# A lánc-regisztráció költsége (L29)

Mérés ideje: 2026-10-12T09:18:37.811Z (`npm run experiment:gas`, `server/scripts/gas-cost.ts`). A gázfelhasználás saját
mérésből (Sepolia-tranzakció, Hardhat), a gázár a hálózatok nyilvános RPC-végpontjáról: a ténylegesen
fizetett ár (alapdíj + prioritási díj) az utolsó 1024 blokk `eth_feeHistory` adataiból – „most” = a
következő blokk alapdíja + a legutóbbi blokkok medián prioritási díja –, a díjplafon (`maxFeePerGas`)
külön. Az L1-adatdíj az OP Stack hálózatok `GasPriceOracle.getL1Fee` hívásából egy `registerPhoto` hívás
aláíratlan tranzakciójára (véletlen adattal), az operátordíj a `getOperatorFee`-ből (ha van). Az
ETH-árfolyam a CoinGecko API-ból ugyanebben a pillanatban: 2552,03 USD, 832 472 HUF.

## Gázfelhasználás regisztrációnként

| Forrás | Gáz |
| --- | --- |
| Sepolia, optimalizált bájtkód (L11, 0x8c326b…) | 71 686 |
| lokális Hardhat-hálózat, fejlesztői profil (L04, `npm run test:gas`) | 72 820 |
| fejlesztői adatbázis, 1 láncon regisztrált kép (ugyanaz a Sepolia-tranzakció) | 71 686 |
| a szerződés telepítése (egyszeri) | 325 903 |

A szerződésben nincs számláló vagy lista: minden regisztráció ugyanannyi friss tárhelyet ír és egy
eseményt bocsát ki, ezért a gáz képenként gyakorlatilag állandó (csak a hívásadat nulla bájtjai miatt
ingadozik néhány tucat gázzal). A becslés **71 686 gázzal** számol – a Sepolia-mérés (L11).

## Becsült díj regisztrációnként

| Hálózat | Gázár most (gwei) | Tartomány, 1024 blokk (gwei) | Díjplafon (gwei) | L1-adatdíj + operátordíj (ETH) | Díj (ETH) | Díj (USD) | Díj (Ft) | Díj a 90. percentilis áron (Ft) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ethereum (főhálózat) | 0,109 | 0,0662–0,154 (medián 0,09) | 0,14 | – | 0,00000779 | 0,0199 | 6,48 | 9,16 |
| Base (L2, OP Stack) | 0,006 | 0,006–0,0061 (medián 0,006) | 0,011 | 0,000000000791 | 0,000000431 | 0,0011 | 0,36 | 0,36 |
| OP Mainnet (L2, OP Stack) | 0,00000493 | 0,00000164–0,00000585 (medián 0,00000263) | 0,001 | 0,00000000108 | 0,00000000143 | 0,00000365 | 0 | 0 |
| Ethereum, forgatókönyv 10 gwei | 10 | – | – | – | 0,000717 | 1,83 | 596,77 | – |
| Ethereum, forgatókönyv 30 gwei | 30 | – | – | – | 0,00215 | 5,49 | 1790,3 | – |
| Ethereum, a szerver díjplafonja (50 gwei) – felső korlát regisztrációnként | 50 | – | – | – | 0,00358 | 9,15 | 2983,83 | – |

A forgatókönyv-sorok a főhálózat korábbi éveiben jellemző, 10 és 30 gwei-es gázárral számolnak ugyanarra a
gázfelhasználásra (a napi átlagos gázár alakulása: Etherscan gázár-grafikon); a mai árfolyammal szorozva
ezek forgatókönyvek, nem korabeli tényleges költségek. A szerver a `CHAIN_MAX_FEE_GWEI` plafon (alapértéke
50 gwei) fölött nem küldi el a tranzakciót, hanem később újrapróbálja, ezért egy regisztráció díja
legfeljebb 0,00358 ETH (2983,83 Ft a mai árfolyamon). A szerződés egyszeri telepítése a főhálózaton az
aktuális áron 0,0000354 ETH (29,47 Ft) volna.

## Fenntartások

- Egyetlen pillanatkép: a gázár és az árfolyam óráról órára változik; a tartomány-oszlop a legutóbbi
  1024 blokk szórását mutatja.
- Az L2-díj a végrehajtás díja + az L1-adatdíj (+ az esetleges operátordíj); a sorrendet és az
  időbélyeget az L2-n a sequencer adja, ami más bizalmi modell, mint a főhálózaté.
- A szerződés nincs L2-re telepítve: a becslés az EVM-egyenértékűségre épít, a gázfelhasználást a
  főhálózatéval azonosnak veszi.
- A díjat a platform fizeti (nem a felhasználó); a Sepolia teszthálózaton ingyenes.
- A gázütemezés hálózatfrissítéssel változhat; a telepítési költség egyszeri.
