// Az adminfolyamat a böngészőből (L28; az L25-ben halasztott Playwright-próba): a seedelt admin
// elrejt egy hitelesített képet – megerősítő ablakkal –, a vendég ezután nem látja (galéria, adatlap),
// a visszaállítás után újra látja. A kép egy külön böngésző-kontextusban regisztrált fotósé.
// Forrás: Playwright – Browser contexts (több, egymástól független munkamenet egy tesztben),
// https://playwright.dev/docs/browser-contexts; Assertions (toBeFocused, toHaveCount),
// https://playwright.dev/docs/test-assertions (adaptálva)
import { expect, type Page, test } from '@playwright/test';

import { loginViaUi, newAccount, registerViaUi } from '../helpers/accounts';
import { expectUploadAccepted, FIXTURE, submitUpload, waitForRegistered } from '../helpers/photos';
import { ENV_KEYS, requiredEnv } from '../setup/env';

const TITLE = 'Basszusgitár (E2E admin)';

/** A galéria betöltve (a találatszám vagy a „Nincs találat” látszik), vendégként. */
async function openGalleryAsGuest(guest: Page): Promise<void> {
  await guest.goto('/');
  await expect(guest.getByRole('heading', { level: 1, name: 'Galéria' })).toBeVisible();
  await expect(guest.getByText(/találat/).first()).toBeVisible();
}

test('admin: a kép elrejtése eltünteti a galériából, a visszaállítás visszahozza', async ({
  browser,
  page,
}) => {
  // A fotós külön kontextusban (saját sütivel) tölt fel
  const photographerContext = await browser.newContext();
  const photographerPage = await photographerContext.newPage();
  await registerViaUi(photographerPage, newAccount('E2E Basszista', 'basszista'));
  await submitUpload(photographerPage, {
    file: FIXTURE.basszus,
    title: TITLE,
    priceHuf: 4000,
    category: 'Absztrakt',
  });
  await expectUploadAccepted(photographerPage);
  const photoId = await waitForRegistered(photographerPage);
  await photographerContext.close();

  // Elrejtés előtt a vendég látja a galériában (pozitív kontroll)
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await openGalleryAsGuest(guest);
  await expect(guest.getByRole('link', { name: TITLE })).toBeVisible();

  // Az admin elrejti – a megerősítő ablak a Mégse gombon nyílik (a fókusz nem a veszélyes műveleten)
  await loginViaUi(page, requiredEnv(ENV_KEYS.adminEmail), requiredEnv(ENV_KEYS.adminPassword));
  await page.goto('/admin');
  await page.getByRole('button', { name: `Elrejtés: ${TITLE}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Mégse' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Elrejtés', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`„${TITLE}” elrejtve`);

  // A vendég nem látja: a betöltött galériában nincs, az adatlap nem található
  await openGalleryAsGuest(guest);
  await expect(guest.getByRole('link', { name: TITLE })).toHaveCount(0);
  await guest.goto(`/photos/${photoId}`);
  await expect(guest.getByRole('heading', { level: 1, name: 'A kép nem található' })).toBeVisible();

  // Visszaállítás után újra látszik: az adatlap és a galéria is
  await page.getByRole('button', { name: `Visszaállítás: ${TITLE}` }).click();
  await expect(page.getByRole('status')).toContainText(`„${TITLE}” visszaállítva`);
  await guest.reload();
  await expect(guest.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await openGalleryAsGuest(guest);
  await expect(guest.getByRole('link', { name: TITLE })).toBeVisible();
  await guestContext.close();
});
