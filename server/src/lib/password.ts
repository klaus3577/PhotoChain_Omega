// Jelszavak hash-elése bcrypttel, a bcrypt.js tiszta JavaScript-implementációjával (nincs natív
// fordítás, így Windows alatt és a Docker-képben is ugyanúgy működik).
// Forrás: bcrypt.js README, https://github.com/dcodeIO/bcrypt.js (adaptálva)
import { compare, hash } from 'bcryptjs';

/** A bcrypt költségtényezője: 2^12 kör – hash-elésenként kb. 0,2–0,3 s, ez lassítja a jelszótörést. */
export const BCRYPT_COST = 12;

/** Az új jelszavak minimális hossza (regisztráció, seed). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A bcrypt a jelszónak csak az első 72 bájtját veszi figyelembe; hosszabb jelszót ezért nem fogadunk
 * el (különben két, az első 72 bájtjában egyező jelszó azonosnak számítana).
 */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Egy eldobott, véletlen érték bcrypt-hash-e (nem titok: a hozzá tartozó „jelszót” senki nem ismeri).
 * A bejelentkezés ismeretlen e-mail-címnél ezzel vet össze, hogy a válasz ugyanannyi ideig
 * tartson, mint rossz jelszónál – ezért a költségtényezője meg kell egyezzen a BCRYPT_COST-tal
 * (teszt ellenőrzi).
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$12afBP/X75MchcSxYd3wou5OQJqYRmCwyRWmPg/WHE5P9VUD/D6EW';

/** A jelszó bcrypt-hash-e (véletlen sóval); az adatbázisba csak ez kerül, a jelszó soha. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

/**
 * Igaz, ha a jelszó a hash-hez tartozik. Az összevetéshez a hash-ben tárolt sót és költségtényezőt
 * használja; nem bcrypt formátumú hash-re hamisat ad.
 */
export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}
