// A Playwright beállításai (L28): a tesztek a lefordított kliens ellen futnak (vite preview, 4173-as
// port, a /api és a /media proxyval a szerverhez), a szerver a tesztadatbázison és egy lokális
// Hardhat-láncon dolgozik – mindezt a globalSetup indítja és állítja le (setup/global.ts). A
// forgatókönyvek egymásra épülnek és közös adatbázist használnak, ezért egy folyamatban, sorban
// futnak. Minden futásról nyomkövetés (trace) készül: a HTML-riportból a trace viewerben nézhető
// vissza lépésről lépésre.
// Forrás: Playwright – Test configuration, https://playwright.dev/docs/test-configuration; Global
// setup and teardown, https://playwright.dev/docs/test-global-setup-teardown; Trace viewer,
// https://playwright.dev/docs/trace-viewer (adaptálva)
import { defineConfig, devices } from '@playwright/test';

import { CLIENT_URL } from './setup/env';

export default defineConfig({
  testDir: './tests',
  globalSetup: './setup/global.ts',
  // Közös adatbázis és lánc: a fájlok és a tesztek sorban futnak
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A lánc-regisztráció és a Stripe oldalának betöltése időt kér; a teljes futás (a környezet
  // felépítésével) sem ragadhat be
  timeout: 90_000,
  globalTimeout: 30 * 60 * 1000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: CLIENT_URL,
    // Helyben minden futásról nyomkövetés (a riportból a trace viewerben nézhető vissza); a CI
    // mellékletébe csak a bukott teszteké kerül (a trace-ben a kitöltött űrlapok – jelszavak – is
    // benne vannak, bár mind eldobható)
    trace: process.env.CI ? 'retain-on-failure' : 'on',
    screenshot: 'only-on-failure',
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
