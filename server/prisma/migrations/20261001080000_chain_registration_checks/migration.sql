-- Kézzel írt migráció (L11): a lánc-regisztráció adatainak CHECK megszorításai. A Prisma-séma ezeket
-- nem tudja kifejezni (a schema.prisma „CHECK:” megjegyzései jelzik őket).
-- Forrás: Prisma ORM – Customizing migrations,
-- https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations; PostgreSQL 17 –
-- Constraints, https://www.postgresql.org/docs/17/ddl-constraints.html (adaptálva)

-- A tranzakció-hash: 0x + 64 kisbetűs hexadecimális karakter (az ethers is így adja)
ALTER TABLE "photos" ADD CONSTRAINT "photos_chainTxHash_check" CHECK ("chainTxHash" ~ '^0x[0-9a-f]{64}$');

-- A blokkszám nem negatív, a regisztráció gázfelhasználása pozitív
ALTER TABLE "photos" ADD CONSTRAINT "photos_chainBlockNumber_check" CHECK ("chainBlockNumber" >= 0);
ALTER TABLE "photos" ADD CONSTRAINT "photos_gasUsed_check" CHECK ("gasUsed" > 0);

-- A láncon regisztrált képnek mindig van regisztrációs ideje (a lánc szerinti időbélyeg)
ALTER TABLE "photos" ADD CONSTRAINT "photos_registeredAt_check" CHECK ("status" <> 'REGISTERED' OR "registeredAt" IS NOT NULL);
