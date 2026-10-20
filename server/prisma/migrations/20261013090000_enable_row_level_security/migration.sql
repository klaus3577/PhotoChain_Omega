-- Kézzel írt migráció (L32): sorszintű védelem (row level security) minden táblán. A Supabase a
-- public séma tábláit a Data API-n (PostgREST) át a nyilvános kulccsal (anon, authenticated
-- szerepkör) is kiadná; RLS mellett, szabály nélkül ezek a szerepkörök semmit nem látnak és nem
-- írhatnak. A szerver a táblák tulajdonosaként kapcsolódik – a tulajdonosra az RLS nem vonatkozik,
-- így a működése nem változik. Mélységi védelem: a Data API-t a Supabase-projektben is ki kell
-- kapcsolni (README – Élesítés). Egy később felvett táblán is be kell kapcsolni (tests/db/schema.test.ts).
-- Forrás: PostgreSQL 17 – Row Security Policies, https://www.postgresql.org/docs/17/ddl-rowsecurity.html;
-- Supabase – Row Level Security, https://supabase.com/docs/guides/database/postgres/row-level-security
-- (adaptálva)

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;

-- A Prisma saját nyilvántartása: a valódi adatbázisokban létezik, a `migrate dev` árnyék-adatbázisában
-- (ahol a migrációk próbafuttatása zajlik) nem – ezért csak akkor, ha megvan
DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;
