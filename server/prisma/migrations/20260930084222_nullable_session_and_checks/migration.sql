-- A rendelés (PENDING) a Stripe Checkout munkamenet előtt jön létre, ezért a munkamenet azonosítója
-- kezdetben üres (az egyedi index több NULL értéket is megenged).
-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "stripeSessionId" DROP NOT NULL;

-- Kézzel írt rész: CHECK megszorítások. A Prisma-séma ezeket nem tudja kifejezni (a schema.prisma
-- „CHECK:” megjegyzései jelzik őket), a Prisma Migrate pedig változatlanul hagyja.
-- Forrás: Prisma ORM – Customizing migrations,
-- https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations; PostgreSQL 17 –
-- Constraints, https://www.postgresql.org/docs/17/ddl-constraints.html (adaptálva)

-- Az ujjlenyomatok csak kisbetűs hexadecimális karakterekből állhatnak, pontos hosszal: nagybetűvel
-- (vagy rövidebb, szóközzel kiegészített értékkel) megkerülhető lenne a sha256 egyedisége.
ALTER TABLE "photos" ADD CONSTRAINT "photos_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "photos" ADD CONSTRAINT "photos_dHash_check" CHECK ("dHash" ~ '^[0-9a-f]{16}$');

-- Az ár és a fizetett összeg nem lehet negatív
ALTER TABLE "photos" ADD CONSTRAINT "photos_priceHuf_check" CHECK ("priceHuf" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amountHuf_check" CHECK ("amountHuf" >= 0);

-- Az értékelés 1–5 csillag
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
