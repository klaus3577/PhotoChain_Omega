-- Kézzel írt migráció (L16, a második átnézési kör nyomán): a tulajdonos és az adminisztrátor
-- elrejtése egyszerre is érvényben lehet. Enélkül a tulajdonos a saját elrejtésével felülírhatta
-- volna a moderátori levételt (a vásárlók újra letölthették volna az eredetit), illetve a már
-- elrejtett képen az adminisztrátor nem tudott volna levételt rögzíteni.
-- Forrás: PostgreSQL 17 – ALTER TYPE (ADD VALUE), https://www.postgresql.org/docs/17/sql-altertype.html

-- AlterEnum
ALTER TYPE "HiddenBy" ADD VALUE 'OWNER_AND_ADMIN';
