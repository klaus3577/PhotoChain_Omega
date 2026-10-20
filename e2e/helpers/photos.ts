// Képek a böngészőből: feltöltés az űrlapon át, a lánc-regisztráció megvárása a feltöltés
// állapotkártyáján (ahogy a felhasználó látja: a kártya maga kérdezi le az állapotot), a tesztfotók
// útvonalai.
// Forrás: Playwright – Locators (getByRole, getByLabel), https://playwright.dev/docs/locators;
// Assertions (toBeVisible időkorláttal), https://playwright.dev/docs/test-assertions (adaptálva)
import { join } from 'node:path';

import { expect, type Page } from '@playwright/test';

import { FIXTURES_DIR } from '../setup/env';

/** A szerző saját tesztfotói */
export const FIXTURE = {
  tocsa: join(FIXTURES_DIR, '01_tocsa_tukrozodes.jpg'),
  gyertyak: join(FIXTURES_DIR, '02_gyertyak.jpg'),
  basszus: join(FIXTURES_DIR, '03_basszusgitar.jpg'),
} as const;

export interface UploadInput {
  file: string;
  title: string;
  description?: string;
  priceHuf: number;
  /** A seed egyik kategóriájának neve (pl. „Természet”) */
  category: string;
}

/** Kitölti és elküldi a feltöltő űrlapot; a válaszra nem vár. */
export async function submitUpload(page: Page, input: UploadInput): Promise<void> {
  await page.goto('/upload');
  await page.getByLabel(/Tallózás/).setInputFiles(input.file);
  await page.getByLabel('Cím').fill(input.title);
  if (input.description) await page.getByLabel('Leírás (nem kötelező)').fill(input.description);
  await page.getByLabel('Ár (Ft)').fill(String(input.priceHuf));
  await page.getByLabel('Kategória').selectOption({ label: input.category });
  await page.getByRole('button', { name: 'Feltöltés és regisztráció' }).click();
}

/** A feltöltés elfogadva: a regisztráció állapotkártyája látszik (az adatlap hivatkozásával). */
export async function expectUploadAccepted(page: Page): Promise<void> {
  await expect(page.getByRole('link', { name: 'A kép adatlapja' })).toBeVisible({
    timeout: 30_000,
  });
}

/** A lánc-regisztráció megerősítésére ennyit várunk (a lokális lánc azonnal bányászik) */
const REGISTRATION_TIMEOUT_MS = 60_000;

/**
 * Megvárja, hogy a feltöltés állapotkártyája „Hitelesítve a blokkláncon” állapotba kerüljön (a kártya
 * maga kérdezi le a regisztráció állapotát), és visszaadja a kép azonosítóját az adatlap
 * hivatkozásából.
 */
export async function waitForRegistered(page: Page): Promise<string> {
  await expect(
    page.getByRole('heading', { level: 2, name: 'Hitelesítve a blokkláncon' }),
  ).toBeVisible({ timeout: REGISTRATION_TIMEOUT_MS });
  const href = await page.getByRole('link', { name: 'A kép adatlapja' }).getAttribute('href');
  const id = href?.split('/').at(-1);
  if (!id) throw new Error('A kép adatlapjának hivatkozása hiányzik az állapotkártyáról');
  return id;
}
