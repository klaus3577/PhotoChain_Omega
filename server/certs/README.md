# Adatbázis-tanúsítványok (L32)

Ide kerül a Supabase adatbázisának tanúsítványát aláíró CA (Supabase Dashboard → Project Settings →
Database → SSL Configuration → Download certificate). A letöltött `prod-ca-2021.crt` fájlt
**`supabase-prod-ca-2021.crt` néven** mentsd ide. Nyilvános tanúsítvány, titkot nem tartalmaz, ezért
a repóba is bekerül – az első Render-telepítés előtt commitolni kell (nélküle a szerver nem indul el).

- A szerver ehhez ellenőrzi az adatbázis tanúsítványát (`DATABASE_SSL_CA_FILE`, `src/lib/prisma.ts`);
  a Docker-kép a mappát a `/app/server/certs` alá másolja.
- A saját gépről futtatott élesítési parancsok (`npm run production:migrate`, `production:seed`) is
  ezt használják.

Forrás: Supabase – Postgres SSL Enforcement, https://supabase.com/docs/guides/platform/ssl-enforcement
