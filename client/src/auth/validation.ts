// A belépés és a regisztráció kliensoldali ellenőrzése. Ugyanazokat a szabályokat követi, mint a
// szerver (server/src/modules/auth/auth.schemas.ts, lib/text.ts, lib/password.ts) – így a felhasználó
// már beküldés előtt, a mező mellett, teljes mondatban látja a hibát (WCAG 3.3.1, 3.3.3). A végső
// döntés a szerveré: az ő mezőhibáit (validáció, foglalt e-mail-cím) is a mezőkhöz rendeljük.
// Forrás: az e-mail-minta a Zod v4 „practical email” mintája (zod/v4/core/regexes.js, MIT),
// https://zod.dev/api#emails (adaptálva)
import { ApiError } from '../api/http';
import {
  codePointLength as codePoints,
  CONTROL_CHARACTER,
  hasVisibleLetterOrDigit,
  toSentence,
  visibleLength,
} from '../lib/text';

export const LOGIN_FIELDS = ['email', 'password'] as const;
export const REGISTER_FIELDS = ['displayName', 'email', 'password'] as const;

export type LoginField = (typeof LOGIN_FIELDS)[number];
export type RegisterField = (typeof REGISTER_FIELDS)[number];
export type FieldErrors<F extends string> = Partial<Record<F, string>>;
export type LoginValues = Record<LoginField, string>;
export type RegisterValues = Record<RegisterField, string>;

const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;
const EMAIL_TAKEN_TEXT = 'Ezzel az e-mail-címmel már regisztráltak.';

const EMAIL_PATTERN =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (email === '') return 'Add meg az e-mail-címedet.';
  if (codePoints(email) > MAX_EMAIL_LENGTH)
    return `Az e-mail-cím legfeljebb ${MAX_EMAIL_LENGTH} karakter lehet.`;
  if (!EMAIL_PATTERN.test(email))
    return 'Az e-mail-cím formátuma nem megfelelő (pl. nev@pelda.hu).';
  return undefined;
}

function validateNewPassword(password: string): string | undefined {
  if (password === '') return 'Add meg a jelszót.';
  if (codePoints(password) < MIN_PASSWORD_LENGTH)
    return `A jelszó legalább ${MIN_PASSWORD_LENGTH} karakter legyen.`;
  if (utf8Length(password) > MAX_PASSWORD_BYTES) {
    return `A jelszó legfeljebb ${MAX_PASSWORD_BYTES} bájt lehet (egy ékezetes betű 2 bájt).`;
  }
  return undefined;
}

/** A megjelenített név szabályai – a regisztráció és a profil szerkesztése (L23) is ezt használja. */
export function validateDisplayName(value: string): string | undefined {
  const name = value.trim();
  if (name === '') return 'Add meg a megjelenített nevet.';
  if (visibleLength(name) < MIN_NAME_LENGTH)
    return `A név legalább ${MIN_NAME_LENGTH} karakter legyen.`;
  if (codePoints(name) > MAX_NAME_LENGTH)
    return `A név legfeljebb ${MAX_NAME_LENGTH} karakter lehet.`;
  if (CONTROL_CHARACTER.test(name))
    return 'A név nem tartalmazhat sortörést vagy vezérlőkaraktert.';
  if (!hasVisibleLetterOrDigit(name)) return 'A név tartalmazzon legalább egy betűt vagy számot.';
  return undefined;
}

/** Csak a hibás mezők maradnak meg. */
export function onlyErrors<F extends string>(
  entries: Record<F, string | undefined>,
): FieldErrors<F> {
  return Object.fromEntries(
    Object.entries(entries).filter(([, message]) => message),
  ) as FieldErrors<F>;
}

export function validateLogin(values: LoginValues): FieldErrors<LoginField> {
  return onlyErrors({
    email: validateEmail(values.email),
    // Belépésnél nincs hosszszabály: a hibás jelszóra a szerver egységesen válaszol
    password: values.password === '' ? 'Add meg a jelszavadat.' : undefined,
  });
}

export function validateRegister(values: RegisterValues): FieldErrors<RegisterField> {
  return onlyErrors({
    displayName: validateDisplayName(values.displayName),
    email: validateEmail(values.email),
    password: validateNewPassword(values.password),
  });
}

interface ServerIssue {
  path: string;
  message: string;
}

const isServerIssue = (value: unknown): value is ServerIssue =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ServerIssue).path === 'string' &&
  typeof (value as ServerIssue).message === 'string';

/**
 * A szerver mezőhibái (400 validáció, 409 foglalt e-mail-cím) a megadott mezőkhöz rendelve; mezőnként
 * az első nem üres üzenet (üres hibaszöveg nem kerülhet a mező alá).
 */
export function serverFieldErrors<F extends string>(
  error: unknown,
  fields: readonly F[],
): FieldErrors<F> {
  if (!(error instanceof ApiError)) return {};
  const known = (path: string): path is F => (fields as readonly string[]).includes(path);
  if (error.code === 'EMAIL_TAKEN' && known('email')) {
    return { email: toSentence(error.message) || EMAIL_TAKEN_TEXT } as FieldErrors<F>;
  }
  if (error.code !== 'VALIDATION_ERROR' || !Array.isArray(error.details)) return {};
  const found: FieldErrors<F> = {};
  for (const issue of error.details.filter(isServerIssue)) {
    const message = toSentence(issue.message);
    if (message !== '' && known(issue.path) && !found[issue.path]) found[issue.path] = message;
  }
  return found;
}
