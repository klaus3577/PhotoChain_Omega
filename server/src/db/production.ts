// Az élesítési parancsok (L32) segédfüggvényei – a futtató a scripts/production.ts. A Render ingyenes
// csomagjában nincs migrációs lépés és parancssor, ezért a migrációt és a seedet a saját gépről
// futtatjuk a Supabase adatbázisán. A változók csak a server/.env.production fájlból jönnek: a
// fejlesztői .env (pl. a helyi jelszavak) nem keveredhet bele.
// Forrás: Node.js – util.parseEnv, https://nodejs.org/api/util.html#utilparseenvcontent; Prisma –
// PostgreSQL connection details (sslmode, sslcert),
// https://www.prisma.io/docs/orm/overview/databases/postgresql (adaptálva)
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseEnv } from 'node:util';

/** Az éles változók a megadott fájlból; a hiányzó vagy üres kötelezőket a nevükkel jelzi. */
export function loadProductionEnv(
  path: string,
  required: readonly string[],
): Record<string, string> {
  if (!existsSync(path)) {
    throw new Error(
      `Nincs ${basename(path)} fájl: másold le a server/.env.production.example mintát, és töltsd ki ` +
        '(a git és a Docker-build is kizárja)',
    );
  }
  const values = Object.fromEntries(
    Object.entries(parseEnv(readFileSync(path, 'utf8'))).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  const missing = required.filter((key) => !values[key]);
  if (missing.length > 0) {
    throw new Error(
      `Hiányzó vagy üres változók a(z) ${basename(path)} fájlban: ${missing.join(', ')}`,
    );
  }
  return values;
}

/**
 * A Prisma CLI (migrate deploy) kapcsolati URL-je: TLS kötelező, a kiszolgáló tanúsítványát a megadott
 * CA-hoz ellenőrzi (a Prisma a tanúsítvány útvonalát az URL-ben kapja; abszolút, perjeles alak).
 */
export function prismaCliDatabaseUrl(databaseUrl: string, caFile: string): string {
  // A new URL() hibaüzenete a teljes URL-t – a jelszóval – tartalmazná (L32 kódátnézés)
  if (!URL.canParse(databaseUrl)) {
    throw new Error(
      'A DATABASE_URL nem érvényes URL (az értékét a jelszó miatt nem írjuk ki) – a jelszó különleges ' +
        'karaktereit (/, @, #, %) URL-kódolni kell',
    );
  }
  const url = new URL(databaseUrl);
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslcert', resolve(caFile).replaceAll('\\', '/'));
  url.searchParams.set('sslaccept', 'strict');
  return url.toString();
}
