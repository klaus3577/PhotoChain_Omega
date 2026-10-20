-- Kézzel kiegészített migráció (L16): ki rejtette el a képet (a tulajdonos vagy az adminisztrátor).
-- A visszaállítás csak az adminisztrátor által elrejtett képre engedélyezett, ezért az elrejtett
-- képnél ez kötelező, a többinél üres – ezt a CHECK megszorítás az adatbázisban is kikényszeríti.
-- Forrás: Prisma ORM – Customizing migrations,
-- https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations; PostgreSQL 17 –
-- Constraints, https://www.postgresql.org/docs/17/ddl-constraints.html (adaptálva)

-- CreateEnum
CREATE TYPE "HiddenBy" AS ENUM ('OWNER', 'ADMIN');

-- AlterTable
ALTER TABLE "photos" ADD COLUMN "hiddenBy" "HiddenBy";

-- A korábban elrejtett képeknél nem tudni, ki rejtette el: a tulajdonosé a döntés (így az admin
-- nem állíthatja vissza őket – ez a biztonságos feltételezés)
UPDATE "photos" SET "hiddenBy" = 'OWNER' WHERE "status" = 'HIDDEN';

-- Elrejtett képnél kötelező, másnál üres
ALTER TABLE "photos" ADD CONSTRAINT "photos_hiddenBy_check" CHECK (("status" = 'HIDDEN') = ("hiddenBy" IS NOT NULL));
