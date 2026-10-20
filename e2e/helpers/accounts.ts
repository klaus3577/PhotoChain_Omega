// Fiókok a böngészőből: regisztráció, belépés, kilépés – ugyanúgy, ahogy a felhasználó teszi (a
// mezők a látható címkéjükkel, a gombok a feliratukkal).
import { randomBytes } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

/** Minden E2E-fiók közös jelszava (a regisztráció szabályainak megfelel) */
export const PASSWORD = 'E2e-jelszo-2026!';

export interface Account {
  name: string;
  email: string;
}

/** Egyedi e-mail-cím a photochain.test tartományban (a futások nem ütköznek egymással). */
export function newAccount(name: string, prefix: string): Account {
  return { name, email: `${prefix}.${randomBytes(4).toString('hex')}@photochain.test` };
}

/** A bejelentkezett fejléc jele: a monogramos fiókmenü gombja. */
export const accountMenu = (page: Page) => page.getByRole('button', { name: /fiókmenü/ });

export async function registerViaUi(page: Page, account: Account): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Megjelenített név').fill(account.name);
  await page.getByLabel('E-mail-cím').fill(account.email);
  await page.getByLabel('Jelszó', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Regisztráció' }).click();
  await expect(accountMenu(page)).toBeVisible();
}

export async function loginViaUi(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail-cím').fill(email);
  await page.getByLabel('Jelszó', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Belépés' }).click();
  await expect(accountMenu(page)).toBeVisible();
}

export async function logoutViaUi(page: Page): Promise<void> {
  await accountMenu(page).click();
  await page.getByRole('button', { name: 'Kijelentkezés' }).click();
  await expect(page.getByRole('link', { name: 'Belépés' })).toBeVisible();
}
