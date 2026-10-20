// A környezeti változók betöltése és ellenőrzése (Zod). Hibás vagy hiányzó érték esetén a szerver
// el sem indul – a hibaüzenet csak a változó nevét és a hiba okát tartalmazza, az értéket nem.
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/** PostgreSQL-kapcsolati URL: postgresql://felhasználó:jelszó@gép:port/adatbázis */
export const databaseUrlSchema = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'PostgreSQL-kapcsolati URL kell (postgresql://felhasználó:jelszó@gép:port/adatbázis)',
});

const DEFAULT_UPLOAD_DIR = fileURLToPath(new URL('../../uploads', import.meta.url));
const DEFAULT_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const MIN_JWT_SECRET_LENGTH = 32;
/** A dHash 64 bites, ennél több bitben két hash nem térhet el. */
const DHASH_BITS = 64;
/** Az Ethereum Sepolia teszthálózat azonosítója (chainId) */
const SEPOLIA_CHAIN_ID = 11_155_111;
/** A lokális Hardhat-hálózat azonosítója */
const HARDHAT_CHAIN_ID = 31_337;
/**
 * Csak teszthálózat engedélyezett (mint a Stripe-nál a teszt módú kulcs): valódi pénzt mozgató
 * hálózatra (pl. az Ethereum főhálózatra) a platform-tárca nem küldhet tranzakciót.
 */
const ALLOWED_CHAIN_IDS: readonly number[] = [SEPOLIA_CHAIN_ID, HARDHAT_CHAIN_ID];
/** A helyi gép címei: csak ezekre engedünk titkosítatlan (http) RPC-kapcsolatot */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Ennél rövidebb értéket nem takarunk ki a naplóból (minden naplósort elrontana) */
const MIN_SECRET_LENGTH = 8;
/** Az RPC-URL útvonalának ennél hosszabb szakasza kulcsnak számít (pl. az Alchemy-kulcs) */
const MIN_KEY_SEGMENT_LENGTH = 16;
/** A díjplafon felső korlátja gwei-ben (elírás ellen) */
const MAX_FEE_CEILING_GWEI = 10_000;
/** A megbízható proxyugrások felső korlátja (elírás ellen) */
const MAX_PROXY_HOPS = 10;
/** A feltöltött, illetve az ellenőrizendő fájl beérkezési határidejének felső korlátja (10 perc) */
const MAX_BODY_TIMEOUT_MS = 600_000;
/** A kliens alapértelmezett címe fejlesztéskor (a Vite fejlesztői szervere) */
const DEFAULT_APP_BASE_URL = 'http://localhost:5173';
/**
 * A képpontkorlát felső határa megapixelben: a memóriaigényt (config/imageMemory.ts) és a libvips
 * lemezre bontási küszöbét erre méreteztük (L12)
 */
const MAX_IMAGE_MEGAPIXELS = 50;
/** Egyszerre futó képfeldolgozások felső korlátja (elírás ellen) */
const MAX_IMAGE_PROCESSING_CONCURRENCY = 8;
/** A Supabase bucket nevének szabálya (kisbetű, szám, pont, kötőjel, aláhúzás) */
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/;

/** A kapcsolat titkosított (https), vagy a helyi gépre mutat (pl. a lokális Hardhat-hálózat). */
function isSecureUrl(value: string): boolean {
  // Az érvénytelen URL-t a z.url() már jelezte (a Zod a további ellenőrzéseket is lefuttatja)
  if (!URL.canParse(value)) return true;
  const { protocol, hostname } = new URL(value);
  return protocol === 'https:' || (protocol === 'http:' && LOOPBACK_HOSTS.has(hostname));
}

/** Csak eredet (séma, gép, port): útvonal, lekérdezés, részlet és belépési adat nélkül. */
function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) return true;
  const { pathname, search, hash, username, password } = new URL(value);
  return pathname === '/' && search === '' && hash === '' && username === '' && password === '';
}

/** A PostgreSQL-kiszolgáló tanúsítványát aláíró CA PEM-fájlja (a szerver és a seed is használja) */
export const databaseSslCaFileSchema = z
  .string()
  .min(1, { error: 'nem lehet üres' })
  .refine((path) => existsSync(path), { error: 'a fájl nem létezik' });

/** A Compose saját adatbázis-szolgáltatásának neve (docker-compose.yml) */
const COMPOSE_DATABASE_HOST = 'db';
/** A 127.0.0.0/8 tartomány (a helyi gép) */
const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;

/**
 * Távoli az adatbázis, ha nem a helyi gépen (localhost, 127.0.0.0/8, ::1) és nem a Compose db
 * szolgáltatásában fut – engedélylista: minden más gép (más egytagú név és IPv6-cím is) távoli (L32).
 * Az érvénytelen URL-t a séma már elutasította; itt nem dobunk (a hibaüzenet a jelszót is tartalmazná).
 */
export function isRemoteDatabaseUrl(databaseUrl: string): boolean {
  if (!URL.canParse(databaseUrl)) return false;
  const { hostname } = new URL(databaseUrl);
  const isLocal =
    LOOPBACK_HOSTS.has(hostname) ||
    LOOPBACK_IPV4.test(hostname) ||
    hostname === COMPOSE_DATABASE_HOST;
  return !isLocal;
}

/** A kapcsolat ellenőrzött TLS-sel megy: CA-fájl, vagy az URL-ben verify-full mód. */
function hasVerifiedDatabaseTls(databaseUrl: string, caFile: string | undefined): boolean {
  if (caFile !== undefined) return true;
  return (
    URL.canParse(databaseUrl) && new URL(databaseUrl).searchParams.get('sslmode') === 'verify-full'
  );
}

const bucketNameSchema = z.string().regex(BUCKET_NAME_PATTERN, {
  error: 'kisbetűs név kell (betű, szám, pont, kötőjel, aláhúzás; 2–63 karakter)',
});

const envObjectSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Sebességkorlát az /api útvonalakra: ennyi kérés engedélyezett egy időablakon belül, IP-címenként
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  // Szigorúbb korlát a bejelentkezésre és a regisztrációra (jelszó-próbálgatás ellen), ugyanabban
  // az időablakban
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  // Fiókonként (a megadott e-mail-címre) ennyi sikertelen belépés engedélyezett egy időablakban –
  // a sok IP-címről elosztott jelszó-próbálgatás ellen (L30); a sikeres belépés nem számít bele
  LOGIN_ACCOUNT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // A munkamenet-tokenek (JWT) aláíró kulcsa: véletlen érték. A séma csak a hosszát tudja
  // ellenőrizni, a véletlenségét nem – az ajánlott előállítás (48 véletlen bájt) a .env.example-ben
  JWT_SECRET: z.string({ error: 'kötelező' }).min(MIN_JWT_SECRET_LENGTH, {
    error: `legalább ${MIN_JWT_SECRET_LENGTH} karakter hosszú véletlen érték kell`,
  }),
  // Két kép akkor számít egymás másolatának, ha a dHash-ük legfeljebb ennyi bitben tér el. Az
  // alapérték a hashing.service.ts DEFAULT_DHASH_THRESHOLD értéke (az egyezést teszt ellenőrzi).
  // Szándékosan nem z.coerce: az az üresen hagyott értéket (DHASH_THRESHOLD=) 0-nak venné, ami
  // csendben kikapcsolná a hasonlóság felismerését.
  DHASH_THRESHOLD: z
    .string()
    .regex(/^\d+$/, { error: `0 és ${DHASH_BITS} közötti egész szám kell` })
    .transform(Number)
    .pipe(z.number().max(DHASH_BITS, { error: `legfeljebb ${DHASH_BITS} lehet` }))
    .default(10),
  // A helyi tárhely gyökérmappája (alapból server/uploads – a git figyelmen kívül hagyja)
  UPLOAD_DIR: z.string().min(1, { error: 'nem lehet üres' }).default(DEFAULT_UPLOAD_DIR),
  // Egy feltöltött képfájl legnagyobb mérete bájtban (alapból 15 MB)
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(DEFAULT_UPLOAD_MAX_BYTES),
  // Ennyi feltöltést fogad egyszerre a szerver (a fájlok a memóriában vannak: ez szab határt a
  // memóriaigénynek); a többi kérés 503-at kap
  UPLOAD_MAX_CONCURRENT: z.coerce.number().int().positive().default(4),
  // Ennyi feltöltési kísérlet engedélyezett felhasználónként egy időablakban (RATE_LIMIT_WINDOW_MS)
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  // Napi feltöltési keret (az elmúlt 24 óra feltöltései az adatbázisból): fiókonként, illetve a
  // platformon összesen. Minden elfogadott feltöltés egy lánc-tranzakció, amelyet a platform-tárca
  // fizet – a közös keret a bábfiókokkal szemben is véges költséget ad (L30)
  UPLOAD_DAILY_LIMIT: z.coerce.number().int().positive().default(30),
  UPLOAD_GLOBAL_DAILY_LIMIT: z.coerce.number().int().positive().default(500),
  // A feltöltött fájlnak ennyi ezredmásodpercen belül meg kell érkeznie (alapból 150 s: a legnagyobb,
  // 15 MiB-os fájl kb. 1 Mbit/s-os feltöltéssel – 126 s + a multipart többlete – is belefér) – mint
  // az ellenőrzésnél. A kérés teljes időkorlátja (server.ts, 3 perc) fölött nincs hatása.
  UPLOAD_BODY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_BODY_TIMEOUT_MS, { error: `legfeljebb ${MAX_BODY_TIMEOUT_MS} lehet (10 perc)` })
    .default(150_000),
  // A nyilvános hitelesség-ellenőrző (/api/verify) korlátjai ugyanabban az időablakban: ennyi
  // ellenőrzés IP-címenként, illetve legfeljebb ennyi láncolvasás minden kliensre együtt – utóbbi
  // szab felső határt az RPC-szolgáltató havi kvótája fogyásának (a hibás kérések nem számítanak)
  VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  VERIFY_CHAIN_READ_LIMIT: z.coerce.number().int().positive().default(200),
  // Ennyi fájl-ellenőrzés futhat egyszerre (IP-címenként egy); a többi kérés 503-at kap
  VERIFY_MAX_CONCURRENT: z.coerce.number().int().positive().default(2),
  // Az ellenőrizendő fájlnak ennyi ezredmásodpercen belül meg kell érkeznie (alapból 30 s: egy
  // 15 MB-os fájl kb. 4 Mbit/s-os feltöltéssel belefér) – a lassan csepegtetett kérés nem
  // foglalhatja sokáig az egyidejűségi korlát helyét
  // (legfeljebb 10 perc: 2^31 ms fölött a Node az időzítőt 1 ms-ra állítaná)
  VERIFY_BODY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_BODY_TIMEOUT_MS, { error: `legfeljebb ${MAX_BODY_TIMEOUT_MS} lehet (10 perc)` })
    .default(30_000),
  DATABASE_URL: databaseUrlSchema,
  // Az URL-ben az API-kulcs is benne van: titkosítatlanul csak a helyi gépen mehet
  RPC_URL: z
    .url({ error: 'érvényes URL kell (pl. az Alchemy Sepolia-végpontja)' })
    .refine(isSecureUrl, {
      error: 'https:// kell (titkosítatlan http csak a helyi gépre: localhost, 127.0.0.1)',
    }),
  // A blokklánc-hálózat azonosítója: 11155111 = Sepolia, 31337 = lokális Hardhat-hálózat. A
  // PhotoRegistry címét ehhez a hálózathoz a server/src/contracts/PhotoRegistry.json adja (L05).
  CHAIN_ID: z.coerce
    .number()
    .refine((chainId) => ALLOWED_CHAIN_IDS.includes(chainId), {
      error: `csak ${SEPOLIA_CHAIN_ID} (Sepolia) vagy ${HARDHAT_CHAIN_ID} (lokális Hardhat) lehet`,
    })
    .default(SEPOLIA_CHAIN_ID),
  // A tranzakció díjának plafonja gwei-ben (gázegységenként): ha a hálózat ennél többet kér, a
  // regisztráció nem megy ki (CHAIN_FAILED, később újrapróbálható) – díjugráskor nem ürül ki a tárca
  CHAIN_MAX_FEE_GWEI: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_FEE_CEILING_GWEI, { error: `legfeljebb ${MAX_FEE_CEILING_GWEI} lehet` })
    .default(50),
  PLATFORM_PRIVATE_KEY: z
    .string({ error: 'kötelező' })
    .regex(/^0x[0-9a-fA-F]{64}$/, { error: '0x előtag + 64 hexadecimális karakter kell' }),
  // A Stripe titkos API-kulcsa: kizárólag teszt módú, így valódi pénzmozgás nem történhet
  STRIPE_SECRET_KEY: z
    .string({ error: 'kötelező' })
    .startsWith('sk_test_', { error: 'csak teszt módú (sk_test_) Stripe-kulcs engedélyezett' })
    .regex(/^sk_test_\w+$/, {
      error: 'érvénytelen formátum (szóköz vagy idegen karakter van benne)',
    }),
  // A webhook-aláírás titka: a Stripe CLI (stripe listen) vagy a Dashboard adja, whsec_ előtaggal
  STRIPE_WEBHOOK_SECRET: z.string({ error: 'kötelező' }).regex(/^whsec_[A-Za-z0-9+/=]{24,}$/, {
    error: 'whsec_ kezdetű, legalább 24 karakteres titok kell (a Stripe CLI vagy a Dashboard adja)',
  }),
  // Ennyi fizetésindítás engedélyezett felhasználónként egy időablakban (RATE_LIMIT_WINDOW_MS)
  CHECKOUT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  // Ennyi lánc-regisztráció újrapróbálás engedélyezett adminonként egy időablakban
  // (RATE_LIMIT_WINDOW_MS) – minden újrapróbálás tranzakció, gázdíjba kerül (L16)
  CHAIN_RETRY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // A kliens előtt álló, megbízható fordított proxyk száma (L31, L08): a kliens IP-címét a korlátok
  // ennyi ugrásig olvassák az X-Forwarded-For fejlécből. Alapból élesben 1 (legalább egy fordított
  // proxy), egyébként 0; a proxy nélküli konténerben 0 kell – különben egy hamis fejléccel bárki új
  // IP-címnek adhatná ki magát. A Renderen mért érték 3 (render.yaml, L32). Szándékosan nem z.coerce
  // (az üres értéket 0-nak venné).
  TRUST_PROXY_HOPS: z
    .string()
    .regex(/^\d+$/, { error: `0 és ${MAX_PROXY_HOPS} közötti egész szám kell` })
    .transform(Number)
    .pipe(z.number().max(MAX_PROXY_HOPS, { error: `legfeljebb ${MAX_PROXY_HOPS} lehet` }))
    .optional(),
  // A kliens buildjének mappája (L31): ha meg van adva, a szerver a webes felületet is kiszolgálja
  // (a konténerben); fejlesztéskor a Vite szolgálja ki
  CLIENT_DIST_DIR: z.string().min(1, { error: 'nem lehet üres' }).optional(),
  // A kliens (webes felület) címe: a Stripe a fizetés után ide irányít vissza (a success és a
  // cancel URL a szerver konfigurációjából jön, soha nem a klienstől). Csak eredet adható meg;
  // titkosítatlan http csak a helyi gépen (alapból a Vite fejlesztői szervere)
  APP_BASE_URL: z
    .url({ protocol: /^https?$/, error: 'érvényes http(s) URL kell (pl. http://localhost:5173)' })
    .refine(isSecureUrl, {
      error: 'https:// kell (titkosítatlan http csak a helyi gépre: localhost, 127.0.0.1)',
    })
    .refine(isOrigin, {
      error: 'csak a kliens eredete adható meg (útvonal, lekérdezés és belépési adat nélkül)',
    })
    .transform((url) => new URL(url).origin)
    // Fejlesztéskor a Vite szervere az alapértéke; élesben kötelező (lásd checkCrossFieldRules)
    .optional(),
  // A PostgreSQL-kiszolgáló tanúsítványát aláíró CA (PEM-fájl, pl. a Supabase prod-ca-2021.crt):
  // ha meg van adva, a kapcsolat titkosított, és a szerver tanúsítványát ehhez ellenőrizzük (L32)
  DATABASE_SSL_CA_FILE: databaseSslCaFileSchema.optional(),
  // A képek tárhelye (terv D11): fejlesztéskor a helyi lemez, élesben a Supabase Storage (L32)
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  // A Supabase-projekt címe (https://<projekt>.supabase.co) és a szerver titkos kulcsa (sb_secret_):
  // a kulcs minden jogosultsági szabályt megkerül, ezért csak a szerveren lehet
  SUPABASE_URL: z
    .url({
      protocol: /^https$/,
      error: 'https:// kezdetű URL kell (https://<projekt>.supabase.co)',
    })
    .refine(isOrigin, { error: 'csak a projekt címe adható meg (útvonal nélkül)' })
    .transform((url) => new URL(url).origin)
    .optional(),
  SUPABASE_SECRET_KEY: z
    .string()
    .regex(/^sb_secret_[\w-]{16,}$/, {
      error: 'a Supabase titkos kulcsa kell (sb_secret_ kezdetű; a nyilvános kulcs nem jó)',
    })
    .optional(),
  // A két privát bucket: az eredeti képeké és a nyilvános előnézeteké (ezeket a szerver adja tovább
  // a /media alatt, L32)
  SUPABASE_ORIGINALS_BUCKET: bucketNameSchema.default('originals'),
  SUPABASE_PREVIEWS_BUCKET: bucketNameSchema.default('previews'),
  // Egy tárhely-művelet (mentés, olvasás, törlés) legfeljebb ennyi ezredmásodpercig tarthat – egy
  // nem válaszoló tárhely ne foglalja a feltöltési sort (L10)
  STORAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  // A feltöltött és az ellenőrzött kép legfeljebb ennyi megapixeles lehet: a kisebb memóriájú
  // tárhelyen (az ingyenes Render-példány 512 MB) élesben kisebb korlát kell (L32)
  IMAGE_MAX_MEGAPIXELS: z.coerce.number().int().min(1).max(MAX_IMAGE_MEGAPIXELS).default(50),
  // Egyszerre legfeljebb ennyi kép feldolgozása (bontása) fut a feltöltés, az ellenőrzés és az
  // admin-visszaállítás között összesen (L32)
  IMAGE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_IMAGE_PROCESSING_CONCURRENCY)
    .default(4),
  // Távoli tárhelynél a /media képei IP-címenként ennyiszer kérhetők egy időablakban
  // (RATE_LIMIT_WINDOW_MS): minden kérés egy tárhely-letöltés, a kimenő forgalom kerete véges (L32)
  MEDIA_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
});

type EnvInput = z.output<typeof envObjectSchema>;

/** A node-postgres a kapcsolati URL ssl-paramétereivel felülírná a megadott tanúsítványt */
const hasSslParameters = (databaseUrl: string): boolean =>
  URL.canParse(databaseUrl) &&
  [...new URL(databaseUrl).searchParams.keys()].some((key) => key.startsWith('ssl'));

/** A több változót érintő szabályok (pl. a Supabase-hez a címe és a kulcsa is kell). */
function checkCrossFieldRules(env: EnvInput, context: z.RefinementCtx): void {
  const fail = (path: keyof EnvInput, message: string): void => {
    context.addIssue({ code: 'custom', path: [path], message });
  };
  if (env.STORAGE_DRIVER === 'supabase') {
    if (!env.SUPABASE_URL) fail('SUPABASE_URL', 'kötelező, ha STORAGE_DRIVER=supabase');
    if (!env.SUPABASE_SECRET_KEY)
      fail('SUPABASE_SECRET_KEY', 'kötelező, ha STORAGE_DRIVER=supabase');
  }
  if (env.SUPABASE_ORIGINALS_BUCKET === env.SUPABASE_PREVIEWS_BUCKET) {
    fail('SUPABASE_PREVIEWS_BUCKET', 'nem lehet azonos az eredeti képek bucketjével');
  }
  if (env.DATABASE_SSL_CA_FILE && hasSslParameters(env.DATABASE_URL)) {
    fail('DATABASE_URL', 'a DATABASE_SSL_CA_FILE mellett az URL-ben nem lehet ssl-paraméter');
  }
  // Az alapérték élesben a Stripe visszairányítását a fejlesztői gép címére küldené (L31)
  if (env.NODE_ENV === 'production' && !env.APP_BASE_URL) {
    fail('APP_BASE_URL', 'élesben kötelező (a kliens nyilvános címe, pl. https://…)');
  }
  // Élesben a távoli adatbázis csak ellenőrzött TLS-sel (L32 biztonsági átnézés: figyelmeztetés kevés)
  if (
    env.NODE_ENV === 'production' &&
    isRemoteDatabaseUrl(env.DATABASE_URL) &&
    !hasVerifiedDatabaseTls(env.DATABASE_URL, env.DATABASE_SSL_CA_FILE)
  ) {
    fail(
      'DATABASE_SSL_CA_FILE',
      'élesben a távoli adatbázishoz kötelező (a kiszolgáló tanúsítványát aláíró CA)',
    );
  }
}

const envSchema = envObjectSchema
  .superRefine(checkCrossFieldRules)
  .transform((env) => ({ ...env, APP_BASE_URL: env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL }));

/** Az alkalmazás ellenőrzött konfigurációja. */
export type Env = z.output<typeof envSchema>;

/**
 * Elfogadható, de valószínűleg elfelejtett beállítások – a szerver induláskor figyelmeztetésként
 * naplózza őket (L32).
 */
export function configWarnings(env: Env): string[] {
  const warnings: string[] = [];
  // L31: https-cím mellett az éles mód hiánya feledékenység – nincs Secure süti, trust proxy
  if (new URL(env.APP_BASE_URL).protocol === 'https:' && env.NODE_ENV !== 'production') {
    warnings.push(
      'Az APP_BASE_URL https-cím, de a mód nem éles: a munkamenet-süti Secure jelző nélkül, a ' +
        'proxy figyelmen kívül hagyásával készül – élesben NODE_ENV=production kell',
    );
  }
  return warnings;
}

/**
 * A megbízható proxyugrások száma (TRUST_PROXY_HOPS): ha nincs megadva, élesben 1 (legalább egy
 * fordított proxy), egyébként 0. A pontos számot a telepítés adja meg (Renderen 3, L32).
 */
export function trustedProxyHops(env: Pick<Env, 'NODE_ENV' | 'TRUST_PROXY_HOPS'>): number {
  return env.TRUST_PROXY_HOPS ?? (env.NODE_ENV === 'production' ? 1 : 0);
}

/** Az URL %-kódolt részének visszafejtése; hibás kódolásnál a nyers alak. */
function decodedOrRaw(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Az RPC-URL titkot hordozó részei: a teljes útvonal és a hosszú útvonal-szakaszok (az Alchemy-kulcs
 * az útvonal része), a lekérdezési rész és a paraméterek értékei, a felhasználónév és a jelszó.
 */
function rpcUrlParts(rpcUrl: string): string[] {
  const { pathname, search, searchParams, username, password } = new URL(rpcUrl);
  return [
    pathname,
    ...pathname.split('/').filter((segment) => segment.length >= MIN_KEY_SEGMENT_LENGTH),
    search,
    ...searchParams.values(),
    decodedOrRaw(username),
    decodedOrRaw(password),
  ];
}

/**
 * A konfiguráció titkos értékei – a napló ezeket minden sorban kitakarja (lásd lib/logger.ts): az
 * RPC-URL és a benne lévő kulcs, a privát kulcs (kis- és nagybetűvel, 0x-szel és nélküle), a többi
 * titok, valamint az adatbázis-jelszó (kódolt és visszafejtett alakban is).
 */
export function sensitiveValues(env: Env): string[] {
  const privateKey = env.PLATFORM_PRIVATE_KEY;
  const databasePassword = new URL(env.DATABASE_URL).password;
  const values = [
    env.RPC_URL,
    ...rpcUrlParts(env.RPC_URL),
    privateKey,
    privateKey.slice(2),
    privateKey.toLowerCase(),
    privateKey.slice(2).toLowerCase(),
    env.JWT_SECRET,
    env.STRIPE_SECRET_KEY,
    env.STRIPE_WEBHOOK_SECRET,
    env.DATABASE_URL,
    databasePassword,
    decodedOrRaw(databasePassword),
    ...(env.SUPABASE_SECRET_KEY ? [env.SUPABASE_SECRET_KEY] : []),
  ];
  return [...new Set(values)].filter((secret) => secret.length >= MIN_SECRET_LENGTH);
}

/** Érvénytelen környezeti változók – a `issues` a változók nevét és a hiba okát tartalmazza. */
export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Érvénytelen környezeti változók:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * A környezetet a megadott sémával ellenőrzi (a szerver és a seed-script is ezt használja).
 * Hibánál `EnvValidationError`-t dob, amely csak a változók nevét és a hiba okát tartalmazza.
 */
export function validateEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined>,
): z.output<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

/** Ellenőrzi és típusosra alakítja a szerver környezetét. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return validateEnv(envSchema, source);
}

/** A server/.env alapértelmezett helye (a src/config és a dist/config mappából is). */
export const DEFAULT_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

/**
 * Betölti a .env fájlt (ha létezik – élesben a tárhelyszolgáltató adja a változókat), majd
 * ellenőrzi a teljes környezetet.
 */
export function loadEnv(envFile: string = DEFAULT_ENV_FILE): Env {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  return parseEnv(process.env);
}
