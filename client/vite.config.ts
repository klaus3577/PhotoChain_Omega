// A kliens Vite-konfigurációja (L18): React, Tailwind CSS v4 (Vite plugin), fejlesztői proxy és Vitest.
// A proxy miatt fejlesztéskor is egyetlen origin szolgálja ki a felületet, az API-t (/api) és a
// képeket (/media): a szerver a módosító kérést csak azonos eredetről fogadja el (Sec-Fetch-Site), a
// képeket pedig a helmet Cross-Origin-Resource-Policy: same-origin fejléce védi – a klienskód ezért
// soha nem hívja közvetlenül a 4000-es portot.
// Forrás: Vite – server.proxy, https://vite.dev/config/server-options#server-proxy; Tailwind CSS –
// Installing with Vite, https://tailwindcss.com/docs/installation/using-vite; Vitest – Configuring,
// https://vitest.dev/config/ (adaptálva)
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** A szerver címe fejlesztéskor (a szerver PORT változójának alapértéke). */
const API_TARGET = 'http://localhost:4000';
// Teljes útvonalszakaszra illeszt (a „^” kezdetű kulcs reguláris kifejezés): a /api és a /media
// alatti kérés megy a szerverhez, egy későbbi /mediatar-szerű kliensoldali útvonal viszont nem
const proxy = {
  '^/api(/|$)': { target: API_TARGET },
  '^/media(/|$)': { target: API_TARGET },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // A szerver APP_BASE_URL alapértéke (a Stripe visszairányítás címe) http://localhost:5173 – ezért a
  // port rögzített: foglalt port esetén a Vite ne válasszon csendben másikat
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // A gépelést szimuláló, időzítős tesztek lefedettséggel műszerezve, párhuzamos futásban az
    // alapértelmezett 5 s fölé nyúlhatnak (L21); a sikeres teszt ideje nem változik
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
      reporter: [['text', { skipFull: false }], 'html'],
      // Bukó teszt mellett is készüljön jelentés: a CI mellékletként így is megőrzi (L27)
      reportOnFailure: true,
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
