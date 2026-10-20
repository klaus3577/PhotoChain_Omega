# PhotoChain – end-to-end tesztek (Playwright)

A teljes folyamat a böngészőből (L28): regisztráció, feltöltés és lánc-regisztráció, a másolat
elutasítása, vásárlás a Stripe fizetési oldaláig (a fizetést aláírt teszt-webhook igazolja),
letöltés és értékelés, a nyilvános ellenőrző oldal, valamint az adminfolyamat (elrejtés,
visszaállítás).

## Előfeltételek

- a PostgreSQL-konténer fut (`docker compose up -d` a gyökérben), a `server/.env`-ben megvan a
  `TEST_DATABASE_URL` (helyi cím, `_test` végű név – a futás kiüríti; ugyanezt az adatbázist a
  szerver adatbázis-tesztjei is ürítik, ezért a kettő ne fusson egyszerre);
- a `blockchain/`, `server/`, `client/` és `e2e/` függőségei telepítve (`npm run install:all`);
- a Chromium a Playwrighthoz: `npm run install:browsers` (ebben a mappában);
- a vásárlás forgatókönyvéhez a `server/.env` `STRIPE_SECRET_KEY`-e (Stripe teszt mód) – nélküle, ha
  nem teszt módú kulcs, ha a Stripe nem fogadja el (pl. saját Stripe-fiók híján beírt helyettesítő
  `sk_test_…` érték), vagy ha a Stripe nem érhető el, ez az egy teszt kimarad (az okát a futás eleje
  és a riport is kiírja), a többi fut; a kulcsot a futás elején egy ingyenes, csak olvasó
  Stripe-lekérdezés ellenőrzi (`setup/stripeKey.ts`) – a nem teszt módú kulcsot el sem küldi;
- a 4000-es, 4173-as és 8545-ös port szabad.

## Futtatás

```bash
npm test                 # a gyökérből: npm run test:e2e (előbb a setup egységtesztjei, majd a Playwright)
npm run test:setup       # csak a környezet-előkészítés egységtesztjei (node:test)
npm run test:headed      # látható böngészővel
npm run report           # a legutóbbi futás HTML-riportja (benne a trace viewer)
```

A környezetet a `setup/global.ts` építi fel: lefordítja a szervert és a klienst, elindít egy lokális
Hardhat-láncot és telepíti rá a `PhotoRegistry` szerződést, migrálja, kiüríti és seedeli a
tesztadatbázist, majd elindítja a lefordított szervert (eldobható JWT- és webhook-titokkal, `NODE_ENV=test`
módban, az alapértelmezett sebességkorlátokkal – a `server/.env` többi beállítását, pl. a
`DHASH_THRESHOLD`-ot, a szerver megtartja) és a kliens `vite preview` kiszolgálóját. A portokat
közvetlenül az indítás előtt is ellenőrzi, és hibával áll le, ha a saját folyamata kilép (így a
tesztek nem futhatnak egy idegen, pl. fejlesztői szerver ellen). A futás végén – hibás előkészítés
után is – minden indított folyamatot leállít. A folyamatok naplói a `logs/` mappába kerülnek (nem
kerülnek a repóba). A nyomkövetés helyben minden tesztről készül; a CI-ban csak a bukottakról.
