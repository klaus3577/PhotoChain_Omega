// A piactér fő folyamata végig a böngészőből (L28, a terv négy forgatókönyve), lokális
// Hardhat-lánccal és a tesztadatbázison: (1) regisztráció → feltöltés → „Hitelesítve”; (2) ugyanaz a
// kép másik fiókkal → elutasítás; (3) vásárlás a Stripe oldaláig, a fizetés aláírt teszt-webhookkal,
// letöltés, értékelés; (4) a nyilvános ellenőrző oldal. A forgatókönyvek egymásra épülnek (ugyanaz a
// kép), ezért sorban futnak, és az első hibája után a többi kimarad.
// Forrás: Playwright – Locators, https://playwright.dev/docs/locators; Assertions,
// https://playwright.dev/docs/test-assertions; APIRequestContext (page.request – a böngésző
// sütijeivel), https://playwright.dev/docs/api-testing (adaptálva)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { newAccount, registerViaUi } from '../helpers/accounts';
import { expectUploadAccepted, FIXTURE, submitUpload, waitForRegistered } from '../helpers/photos';
import { signedCheckoutCompleted } from '../helpers/stripe';
import { ENV_KEYS } from '../setup/env';

test.describe.configure({ mode: 'serial' });

const sha256Of = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

const PHOTO = {
  file: FIXTURE.tocsa,
  title: 'Tócsa tükröződéssel (E2E)',
  description: 'Eső után az udvaron – end-to-end teszt.',
  priceHuf: 2500,
  category: 'Természet',
};
const photographer = newAccount('E2E Fotós', 'fotos');
let photoId = '';

interface Order {
  id: string;
  status: string;
  amountHuf: number;
}

test('regisztráció → feltöltés → a kép a lokális láncon hitelesítve, a galériában „Hitelesítve” jelvénnyel', async ({
  page,
}) => {
  await registerViaUi(page, photographer);

  await submitUpload(page, PHOTO);
  await expectUploadAccepted(page);
  photoId = await waitForRegistered(page);

  // Az adatlap: a tanúsítványdoboz a lokális lánc adataival
  await page.goto(`/photos/${photoId}`);
  await expect(page.getByRole('heading', { level: 1, name: PHOTO.title })).toBeVisible();
  const certificate = page.getByRole('region', { name: 'Hitelesítve a blokkláncon' });
  await expect(certificate).toBeVisible();
  await expect(certificate.getByText(/Lokális Hardhat-hálózat/)).toBeVisible();
  // A galéria csak hitelesített képet mutat: a kártyán a „Hitelesítve” jelvény
  await page.goto('/');
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('link', { name: PHOTO.title }) });
  await expect(card).toBeVisible();
  await expect(card.getByText('Hitelesítve', { exact: true })).toBeVisible();
});

test('ugyanaz a kép másik fiókkal: a feltöltés elutasítva (bitre azonos), a kép nem kerül fel újra', async ({
  page,
}) => {
  await registerViaUi(page, newAccount('E2E Másoló', 'masolo'));

  await submitUpload(page, { ...PHOTO, title: 'Ugyanaz a tócsa', priceHuf: 1000 });

  await expect(page.getByText('A fájl bitre azonos egy már feltöltött képpel.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Másik kép választása' })).toBeVisible();
  // A fiók képei között nincs feltöltés
  const own = await page.request.get('/api/me/photos?page=1');
  expect(own.ok()).toBe(true);
  expect(((await own.json()) as { data: { photos: unknown[] } }).data.photos).toHaveLength(0);
});

test('vásárlás: „Megveszem” → Stripe Checkout; a fizetést aláírt teszt-webhook igazolja → letöltés és értékelés', async ({
  page,
}) => {
  test.skip(
    process.env[ENV_KEYS.stripe] !== 'on',
    `${process.env[ENV_KEYS.stripeSkipReason] ?? 'A Stripe-tesztkulcs nem használható'}: a Stripe Checkout munkamenete nem hozható létre`,
  );
  await registerViaUi(page, newAccount('E2E Vásárló', 'vasarlo'));

  await page.goto(`/photos/${photoId}`);
  await page.getByRole('button', { name: 'Megveszem' }).click();
  // A kliens a Stripe fizetési oldalára irányít – a teszt idáig megy, kártyaadatot nem ad meg
  // (csak a navigáció megkezdését várjuk, a Stripe oldalának betöltését nem)
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000, waitUntil: 'commit' });
  const sessionId = new URL(page.url()).pathname
    .split('/')
    .find((segment) => segment.startsWith('cs_test_'));
  expect(sessionId, 'a Stripe munkamenet-azonosítója az URL-ben').toBeDefined();

  // A szerver rendelése a munkamenethez (a sütivel, mint a visszatérési oldal)
  await page.goto('/');
  const fetchOrder = async () => {
    const response = await page.request.get(`/api/orders/by-session/${sessionId}`);
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { data: { order: Order } }).data.order;
  };
  const order = await fetchOrder();
  expect(order.status).toBe('PENDING');
  expect(order.amountHuf).toBe(PHOTO.priceHuf);

  // A sikeres fizetés eseménye, a Stripe aláírásával – hamis aláírással a szerver elutasítja, és a
  // rendelés függő marad; a valódival kifizetetté válik
  const { body, signature } = signedCheckoutCompleted({
    sessionId: sessionId!,
    orderId: order.id,
    amountHuf: order.amountHuf,
  });
  const forged = await page.request.post('/api/webhooks/stripe', {
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=hamis' },
    data: body,
  });
  expect(forged.status()).toBe(400);
  expect((await fetchOrder()).status).toBe('PENDING');
  const webhook = await page.request.post('/api/webhooks/stripe', {
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    data: body,
  });
  expect(webhook.status()).toBe(200);
  expect((await fetchOrder()).status).toBe('PAID');

  // A visszatérési oldal: sikeres fizetés, az eredeti letölthető
  await page.goto(`/checkout/success?session_id=${sessionId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Sikeres fizetés' })).toBeVisible();
  await page.goto(`/photos/${photoId}`);
  await expect(page.getByText('Már megvetted.')).toBeVisible();
  const download = page.getByRole('link', { name: 'Eredeti letöltése' });
  await expect(download).toBeVisible();
  // Az eredeti fájl jön le: bitre azonos a feltöltöttel
  const file = await page.request.get((await download.getAttribute('href'))!);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toMatch(/^image\/jpeg/);
  expect(
    createHash('sha256')
      .update(await file.body())
      .digest('hex'),
  ).toBe(sha256Of(PHOTO.file));

  // Vevőként értékelés írása – a csillagok rádiógombjai vizuálisan rejtettek (a címke a csillag),
  // ezért a felhasználóhoz hasonlóan a címkére kattintunk
  const form = page.getByRole('form', { name: 'Értékelés írása' });
  // (a `has` belső lokátora a címkéhez képest értendő, ezért nem az űrlapból indul)
  await form
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '5 csillag' }) })
    .click();
  await expect(form.getByRole('radio', { name: '5 csillag' })).toBeChecked();
  await form
    .getByLabel('Vélemény (nem kötelező)')
    .fill('Gyönyörű tükröződés, a nyomat is tökéletes.');
  await form.getByRole('button', { name: 'Értékelés küldése' }).click();
  await expect(page.getByText('A te értékelésed')).toBeVisible();
  await expect(page.getByText('Gyönyörű tükröződés, a nyomat is tökéletes.')).toBeVisible();
});

test('ellenőrző oldal (bejelentkezés nélkül): a regisztrált kép hiteles, más kép nincs a nyilvántartásban, a hash alapján is ellenőrizhető', async ({
  page,
}) => {
  await page.goto('/verify');
  await page.getByLabel(/Tallózás/).setInputFiles(PHOTO.file);
  await page.getByRole('button', { name: 'Kép ellenőrzése' }).click();
  await expect(page.getByRole('heading', { name: 'Hiteles, regisztrált kép' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: PHOTO.title })).toBeVisible();

  // Másik (nem regisztrált) kép
  await page.getByRole('button', { name: 'Másik kép ellenőrzése' }).click();
  await page.getByLabel(/Tallózás/).setInputFiles(FIXTURE.gyertyak);
  await page.getByRole('button', { name: 'Kép ellenőrzése' }).click();
  await expect(page.getByRole('heading', { name: 'Nincs a nyilvántartásban' })).toBeVisible({
    timeout: 30_000,
  });

  // Hash alapján: a fájl SHA-256-a, ahogy egy tanúsítványból másolnák
  await page.getByRole('button', { name: 'Másik kép ellenőrzése' }).click();
  const sha256 = sha256Of(PHOTO.file);
  // (pontos címke: az űrlap neve – „Ellenőrzés SHA-256 hash alapján” – is tartalmazza a szöveget)
  await page.getByLabel('SHA-256 hash', { exact: true }).fill(sha256);
  await page.getByRole('button', { name: 'Hash ellenőrzése' }).click();
  await expect(page.getByRole('heading', { name: 'Hiteles, regisztrált kép' })).toBeVisible();
});
