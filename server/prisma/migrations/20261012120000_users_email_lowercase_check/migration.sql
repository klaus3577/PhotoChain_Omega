-- Kézzel írt migráció (L30): az e-mail-cím csak kisbetűs alakban tárolható. A users.email
-- egyedisége kis- és nagybetű-érzékeny, ezért a sémák (auth.schemas.ts – emailSchema) minden
-- beszúrás és keresés előtt kisbetűsítenek; ez a megszorítás a mélységi védelem arra az esetre, ha
-- egy későbbi kódút kihagyná. (A cím az e-mail-séma szerint csak ASCII-karakter lehet, így a
-- PostgreSQL lower() és a JavaScript toLowerCase() ugyanazt adja.)
-- Forrás: Prisma ORM – Customizing migrations,
-- https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations; PostgreSQL 17 –
-- Constraints, https://www.postgresql.org/docs/17/ddl-constraints.html (adaptálva)

ALTER TABLE "users" ADD CONSTRAINT "users_email_check" CHECK ("email" = lower("email"));
