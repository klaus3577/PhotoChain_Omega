// A hitelesség-ellenőrző oldal (L24; L17 drótváz „Ellenőrzés”): nyilvános oldal. Kép húzással vagy
// tallózással (a feltöltés szabályai, de a rövidebb oldal már 100 képponttól), a kérés
// XMLHttpRequest-tel, haladással és megszakítással; vagy a SHA-256 hash megadása. Az eredmény kártyája
// a három eset (hiteles, hasonló, nincs találat) a bizalom vizuális nyelvén, a címén a fókusszal; a
// hibák a helyükre kerülnek (a kép hibája a fogadóterülethez, a hash hibája a mezőhöz, a többi
// riasztásként a gomb mellett, a várakozás idejével); a „Hogyan működik?” magyarázat az adatlap
// „Mit jelent ez?” hivatkozásának célja.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NETWORK_ERROR_MESSAGE } from '../api/http';
import { axeViolations } from '../test/axe';
import { DeferredResponse, jsonResponse, requestedUrls, stubFetch } from '../test/fetch';
import {
  detailResponses,
  galleryResponses,
  OWNER_ID,
  PHOTO_ID,
  SHA256,
  TX_HASH,
} from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse } from '../test/users';
import { notFoundResult, similarResult, verifiedResult, verifyResponse } from '../test/verify';
import { FakeXhr, lastXhr, sentFields, stubXhr } from '../test/xhr';
import { VERIFY_HINT } from '../verify/verifyValidation';

const PATH = '/verify';

/** Képfájl a megadott (csak jelzett) mérettel – a tartalom nem számít, a méretet a mező mondja. */
function image(name = 'tocsa.jpg', type = 'image/jpeg', size = 2_457_600): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** Az oldal bejelentkezés nélkül; a fájl ellenőrzése hamis XMLHttpRequest-tel megy. */
function renderVerify(path = PATH) {
  stubXhr();
  return renderRoute(path);
}

const fileInput = () => screen.getByLabelText('Tallózás…') as HTMLInputElement;
const fileSubmit = () => screen.getByRole('button', { name: 'Kép ellenőrzése' });
const hashField = () => screen.getByRole('textbox', { name: 'SHA-256 hash' });
const hashSubmit = () => screen.getByRole('button', { name: 'Hash ellenőrzése' });
const status = () => screen.getByRole('status');

/** A kép „betöltődött” a megadott felbontással (a jsdom nem dekódol képet). */
function loadPreview(width: number, height: number) {
  const img = screen.getByAltText('') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  fireEvent.load(img);
}

/** Kiválasztott, betöltött kép elküldve; a szerver válasza a megadott eredmény. */
async function verifyWith(user: ReturnType<typeof renderRoute>['user'], body: unknown) {
  await user.upload(fileInput(), image());
  loadPreview(1600, 1067);
  await user.click(fileSubmit());
  act(() => lastXhr().respond(200, { data: body }));
}

describe('VerifyPage – az oldal és a fájl kiválasztása', () => {
  it('bejelentkezés nélkül: cím, magyarázat, a kép űrlapja (egyetlen elsődleges gomb) és a hash űrlapja, a működés magyarázata; a fejléc jelöli az aktuális oldalt', async () => {
    const { container } = renderVerify();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kép ellenőrzése' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bejelentkezés nem kell, a képet nem tároljuk/)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Fő navigáció' });
    expect(within(nav).getByRole('link', { name: 'Ellenőrzés' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Galéria' })).not.toHaveAttribute('aria-current');

    const fileForm = screen.getByRole('form', { name: 'Ellenőrzés képpel' });
    const input = fileInput();
    expect(fileForm).toContainElement(input);
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(input).toHaveAccessibleName('Kép Tallózás…');
    expect(input).toHaveAccessibleDescription(VERIFY_HINT);
    expect(fileSubmit()).toHaveClass('bg-primary');

    const hashForm = screen.getByRole('form', { name: 'Ellenőrzés SHA-256 hash alapján' });
    expect(hashForm).toContainElement(hashField());
    expect(hashField()).toHaveAccessibleDescription(
      '64 hexadecimális karakter; a 0x előtag elhagyható.',
    );
    expect(hashSubmit()).not.toHaveClass('bg-primary');

    expect(screen.getByRole('heading', { level: 2, name: 'Hogyan működik?' })).toBeInTheDocument();
    for (const name of [
      'Digitális ujjlenyomat (SHA-256)',
      'Vizuális ujjlenyomat (dHash)',
      'Blokklánc (Ethereum Sepolia)',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
    }
    await waitFor(() => expect(document.title).toBe('Kép ellenőrzése · PhotoChain'));
    expect(await axeViolations(container, { page: true })).toEqual([]);
  });

  it('fájl kiválasztása: név, méret, előnézet, bemondás; a 100 képpontnál kisebb oldalú kép hibája a fogadóterületnél, a beküldés nem indul', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });

    await user.upload(fileInput(), image('belyegkep.jpg'));

    expect(screen.getByText('belyegkep.jpg')).toBeInTheDocument();
    expect(status()).toHaveTextContent(/Kiválasztott kép: belyegkep\.jpg \(2,3\sMB\)\./);
    loadPreview(400, 300);
    expect(screen.getByText(/400 × 300 képpont/)).toBeInTheDocument();
    expect(fileInput()).not.toHaveAttribute('aria-invalid');

    await user.upload(fileInput(), image('ikon.png', 'image/png', 4096));
    loadPreview(96, 96);
    expect(fileInput()).toHaveAccessibleDescription(
      /a rövidebb oldala legalább 100 képpont legyen \(a kiválasztott kép 96 × 96 képpontos\)/,
    );
    await user.click(fileSubmit());
    expect(FakeXhr.instances).toHaveLength(0);
    expect(fileInput()).toHaveFocus();
  });

  it('beküldés fájl nélkül: „Válassz egy képfájlt.”, a fókusz a fájlválasztón, kérés nem indul', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });

    await user.click(fileSubmit());

    expect(fileInput()).toHaveAccessibleDescription(/Válassz egy képfájlt\./);
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
    expect(fileInput()).toHaveFocus();
    expect(FakeXhr.instances).toHaveLength(0);
  });
});

describe('VerifyPage – kép ellenőrzése', () => {
  it('POST /api/verify a képpel, haladással; VERIFIED: a kártya a címén a fókusszal, a kép, a fotós és a lánc adatai; „Másik kép ellenőrzése” üres űrlapot ad, a fókusz a fájlválasztón', async () => {
    const { user, container } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);

    await user.click(fileSubmit());

    const xhr = lastXhr();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/verify');
    // A fájl saját neve nem megy el (adattakarékosság – verify.api.ts)
    expect(sentFields(xhr)).toEqual({ image: { name: 'kep', type: 'image/jpeg' } });
    expect(status()).toHaveTextContent('Az ellenőrzés elindult.');
    expect(screen.getByRole('button', { name: 'Ellenőrzés…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    act(() => xhr.progress(1_228_800, 2_457_600));
    // A sáv a küldést méri (az ellenőrzés a szerveren utána jön), a neve is ezt mondja
    expect(screen.getByRole('progressbar', { name: 'A kép küldése' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(screen.getByRole('button', { name: 'Mégse' })).toBeInTheDocument();
    act(() => xhr.sent());
    expect(screen.getByText('A fájl elküldve, a szerver ellenőrzi a képet…')).toBeInTheDocument();
    expect(status()).toHaveTextContent('A fájl elküldve, a szerver ellenőrzi a képet.');
    expect(screen.queryByRole('button', { name: 'Mégse' })).toBeNull();

    act(() => xhr.respond(200, { data: verifiedResult() }));

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Hiteles, regisztrált kép',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    // Az űrlapok helyére a kártya lép; a magyarázat marad
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('link', { name: 'Őszi erdő ködben' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Fotós Fanni profilja' })).toHaveAttribute(
      'href',
      `/users/${OWNER_ID}`,
    );
    expect(
      screen.getByRole('link', { name: /a tranzakció megnyitása az Etherscanen/ }),
    ).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${TX_HASH}`);
    expect(screen.getByRole('link', { name: 'Adatlap megnyitása' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Hogyan működik?' })).toBeInTheDocument();
    expect(await axeViolations(container, { page: true })).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Másik kép ellenőrzése' }));

    expect(screen.queryByRole('heading', { name: 'Hiteles, regisztrált kép' })).toBeNull();
    expect(fileInput()).toHaveFocus();
    expect(screen.queryByText('tocsa.jpg')).toBeNull();
    expect(fileInput()).not.toHaveAttribute('aria-invalid');
  });

  it('SIMILAR: „Hasonló regisztrált kép” az eltéréssel és az eredeti adatlapjával; NOT_FOUND: „Nincs a nyilvántartásban” a másolható hash-sel', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });

    await verifyWith(user, similarResult());

    const similar = await screen.findByRole('region', { name: 'Hasonló regisztrált kép' });
    expect(similar).toHaveTextContent('3 / 64 bit');
    expect(within(similar).getByRole('link', { name: 'Az eredeti adatlapja' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    await user.click(screen.getByRole('button', { name: 'Másik kép ellenőrzése' }));

    await verifyWith(user, notFoundResult());

    const notFound = await screen.findByRole('region', { name: 'Nincs a nyilvántartásban' });
    expect(notFound).toHaveTextContent('Ez nem jelenti, hogy a kép hamis');
    expect(notFound).toHaveTextContent('3be1f07c…7d10c58e');
    expect(
      within(notFound).getByRole('button', { name: 'A teljes SHA-256 másolása' }),
    ).toBeInTheDocument();
    expect(within(notFound).queryByRole('link')).toBeNull();
  });

  it('a szerver a képet utasítja el (400): a hiba a fogadóterületnél (a szerver üzenete mondatként), a fókusz a fájlválasztón; a következő kiválasztás törli', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image('egyszinu.png', 'image/png', 50_000));
    loadPreview(800, 600);
    await user.click(fileSubmit());

    act(() =>
      lastXhr().respond(400, {
        error: { code: 'LOW_DETAIL_IMAGE', message: 'a kép túl egyszínű, nem ellenőrizhető' },
      }),
    );

    await waitFor(() =>
      expect(fileInput()).toHaveAccessibleDescription(/A kép túl egyszínű, nem ellenőrizhető\./),
    );
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
    // A fókusz egy effektusban mozdul (a hiba megjelenése utáni rendereléskor): lassabb futáson
    // (lefedettség, CI) várni kell rá – mint az L27-es javításnál
    await waitFor(() => expect(fileInput()).toHaveFocus());
    expect(screen.getByText('egyszinu.png')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();

    await user.upload(fileInput(), image());

    expect(fileInput()).not.toHaveAttribute('aria-invalid');
    expect(fileInput()).not.toHaveAccessibleDescription(/egyszínű/);
  });

  it('hálózati hiba, majd korlátozás (429): riasztás a gomb mellett a várakozás idejével (a gomb leírása), a fájl megmarad', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);

    await user.click(fileSubmit());
    act(() => lastXhr().fail());
    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(screen.getByText('tocsa.jpg')).toBeInTheDocument();

    await user.click(fileSubmit());
    act(() =>
      lastXhr().respond(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Túl sok ellenőrzés – próbáld újra később' } },
        { 'Retry-After': '120' },
      ),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Az ellenőrzés nem sikerült. Túl sok ellenőrzés – próbáld újra később. Kb. 2 perc múlva próbálhatod újra.',
    );
    expect(fileSubmit()).toHaveAccessibleDescription(/Kb\. 2 perc múlva próbálhatod újra\./);
    expect(fileSubmit()).toHaveFocus();
    expect(screen.getByText('tocsa.jpg')).toBeInTheDocument();
    expect(FakeXhr.instances).toHaveLength(2);
  });

  it('a lánc elérhetetlensége (503, Retry-After): a szerver üzenete a várakozás idejével', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);

    await user.click(fileSubmit());
    act(() =>
      lastXhr().respond(
        503,
        {
          error: {
            code: 'CHAIN_UNAVAILABLE',
            message: 'A blokklánc most nem érhető el – az ellenőrzés később megismételhető',
          },
        },
        { 'Retry-After': '60' },
      ),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A blokklánc most nem érhető el – az ellenőrzés később megismételhető. Kb. 1 perc múlva próbálhatod újra.',
    );
  });

  it('a Mégse megszakítja a kérést (amíg a törzs el nem ment): az űrlap és a fájl megmarad, bemondás, a fókusz a gombon', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());
    act(() => lastXhr().progress(100, 2_457_600));

    await user.click(screen.getByRole('button', { name: 'Mégse' }));

    expect(lastXhr().aborted).toBe(true);
    expect(await screen.findByRole('button', { name: 'Kép ellenőrzése' })).toHaveFocus();
    expect(status()).toHaveTextContent('Az ellenőrzést megszakítottad.');
    expect(screen.getByText('tocsa.jpg')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(FakeXhr.instances).toHaveLength(1);
  });
});

describe('VerifyPage – ellenőrzés hash alapján', () => {
  it('üres és hibás hash: mezőhiba (a fókusz a mezőn, illetve rejtett riasztás), kérés nem indul; a jó hash kisbetűs, előtag nélküli alakban megy (GET), a gomb addig foglalt; az eredmény dHash nélkül; „Másik hash ellenőrzése” az üres mezőre fókuszál', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });

    await user.click(hashSubmit());

    expect(hashField()).toHaveAccessibleDescription(/Add meg a SHA-256 hash-t\./);
    expect(hashField()).toHaveAttribute('aria-invalid', 'true');
    expect(hashField()).toHaveFocus();

    await user.type(hashField(), 'nem-hash{Enter}');

    // A fókusz már a mezőn van: rejtett riasztás mondja el a hibát a mező nevével
    expect(screen.getByRole('alert')).toHaveTextContent(
      'SHA-256 hash: A SHA-256 hash 64 hexadecimális karakter (0–9, a–f).',
    );

    const deferred = new DeferredResponse();
    const fetchMock = stubFetch(deferred);
    await user.clear(hashField());
    await user.type(hashField(), `0x${SHA256.toUpperCase()}{Enter}`);

    await waitFor(() => expect(requestedUrls(fetchMock)).toEqual([`/api/verify/${SHA256}`]));
    expect(screen.getByRole('button', { name: 'Ellenőrzés…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    deferred.resolve(verifyResponse(verifiedResult({ dHash: null })));

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Hiteles, regisztrált kép',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      screen.getByText('Ezzel a SHA-256 hash-sel a blokkláncon regisztráltak egy képet.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Másik hash ellenőrzése' }));

    expect(hashField()).toHaveFocus();
    expect(hashField()).toHaveValue('');
  });

  it('a szerver hibái hash alapján: a 400 a mezőnél (a szerver üzenete), a 429 riasztásként a várakozással', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    stubFetch(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Érvénytelen bemenet',
          details: [
            {
              path: 'sha256',
              message: 'SHA-256 hash kell (64 hexadecimális karakter, a 0x előtag elhagyható)',
            },
          ],
        },
      }),
    );

    await user.type(hashField(), `${SHA256}{Enter}`);

    await waitFor(() =>
      expect(hashField()).toHaveAccessibleDescription(
        /SHA-256 hash kell \(64 hexadecimális karakter, a 0x előtag elhagyható\)\./,
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/^SHA-256 hash: SHA-256 hash kell/);

    stubFetch(
      errorResponse(429, 'RATE_LIMITED', 'Túl sok ellenőrzés – próbáld újra később', {
        'Retry-After': '30',
      }),
    );
    await user.click(hashSubmit());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Az ellenőrzés nem sikerült. Túl sok ellenőrzés – próbáld újra később. Kb. 30 másodperc múlva próbálhatod újra.',
    );
    expect(hashSubmit()).toHaveAccessibleDescription(/Kb\. 30 másodperc múlva próbálhatod újra\./);
    expect(hashField()).not.toHaveAttribute('aria-invalid');
  });
});

describe('VerifyPage – egyszerre egy ellenőrzés, a várakozás és a fókusz szabályai', () => {
  it('amíg a kép ellenőrzése tart, a hash űrlap nem indít kérést (riasztás a gomb mellett) – és fordítva', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());
    expect(FakeXhr.instances).toHaveLength(1);

    // Nincs fetch-csonk: egy mégis elinduló kérés más hibát adna, és a teszt végén sem maradhatna válasz
    await user.type(hashField(), `${SHA256}{Enter}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Az ellenőrzés nem sikerült. Egyszerre egy ellenőrzés futhat – várd meg az eredményt.',
    );
    expect(hashSubmit()).toHaveAccessibleDescription(/Egyszerre egy ellenőrzés futhat/);
    act(() => lastXhr().respond(200, { data: verifiedResult() }));
    await screen.findByRole('heading', { level: 2, name: 'Hiteles, regisztrált kép' });

    // Visszafelé: a hash ellenőrzése alatt a kép űrlapja nem indít kérést
    await user.click(screen.getByRole('button', { name: 'Másik kép ellenőrzése' }));
    const deferred = new DeferredResponse();
    stubFetch(deferred);
    await user.type(hashField(), `${SHA256}{Enter}`);
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());

    expect(FakeXhr.instances).toHaveLength(1);
    expect(await screen.findByRole('alert')).toHaveTextContent('Egyszerre egy ellenőrzés futhat');
    deferred.resolve(verifyResponse(notFoundResult({ sha256: SHA256, dHash: null })));
    await screen.findByRole('heading', { level: 2, name: 'Nincs a nyilvántartásban' });
  });

  it('a szerver kérte várakozás (Retry-After) alatt egyik űrlap sem indít új kérést: riasztás a hátralévő idővel', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());
    act(() =>
      lastXhr().respond(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Túl sok ellenőrzés – próbáld újra később' } },
        { 'Retry-After': '120' },
      ),
    );
    await screen.findByRole('alert');

    await user.type(hashField(), `${SHA256}{Enter}`);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.at(-1)).toHaveTextContent(
      /Még nem indítható új ellenőrzés\. Kb\. 2 perc múlva próbálhatod újra\./,
    );
    await user.click(fileSubmit());
    expect(FakeXhr.instances).toHaveLength(1);
    expect(fileSubmit()).toHaveAccessibleDescription(/Még nem indítható új ellenőrzés/);
  });

  it('ha az eredmény érkezésekor a fókusz máshol van (pl. a fejlécben), ott marad, és az élő régió mondja be az eredményt; a kártya címének leírása a magyarázat', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());
    const galleryLink = within(screen.getByRole('navigation', { name: 'Fő navigáció' })).getByRole(
      'link',
      { name: 'Galéria' },
    );
    act(() => galleryLink.focus());

    act(() => lastXhr().respond(200, { data: notFoundResult() }));

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Nincs a nyilvántartásban',
    });
    expect(galleryLink).toHaveFocus();
    expect(status()).toHaveTextContent('Nincs a nyilvántartásban');
    expect(heading).toHaveAccessibleDescription(/Ez nem jelenti, hogy a kép hamis/);
  });

  it('a hash ellenőrzés indulását az élő régió mondja be; a kérés alatt az újabb Enter nem indít másikat', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    const deferred = new DeferredResponse();
    const fetchMock = stubFetch(deferred);

    await user.type(hashField(), `${SHA256}{Enter}`);

    await waitFor(() => expect(requestedUrls(fetchMock)).toHaveLength(1));
    expect(status()).toHaveTextContent('Az ellenőrzés elindult.');
    await user.keyboard('{Enter}{Enter}');
    expect(requestedUrls(fetchMock)).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    deferred.resolve(verifyResponse(notFoundResult({ sha256: SHA256, dHash: null })));
    await screen.findByRole('heading', { level: 2, name: 'Nincs a nyilvántartásban' });
  });

  it('az oldal elhagyása a futó ellenőrzést megszakítja (a kérés nem fut tovább a háttérben)', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());
    stubFetch(...galleryResponses());

    await user.click(
      within(screen.getByRole('navigation', { name: 'Fő navigáció' })).getByRole('link', {
        name: 'Galéria',
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    expect(lastXhr().aborted).toBe(true);
  });

  it('a szerver képhibája nem rántja el a fókuszt, ha a felhasználó közben máshová lépett: rejtett riasztás mondja el', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());
    act(() => hashField().focus());

    act(() =>
      lastXhr().respond(400, { error: { code: 'IMAGE_TOO_SMALL', message: 'a kép túl kicsi' } }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Kép: A kép túl kicsi.');
    expect(hashField()).toHaveFocus();
    expect(fileInput()).toHaveAccessibleDescription(/A kép túl kicsi\./);
  });

  it('ha a Mégse gombon volt a fókusz, amikor a törzs elment, az állapotsorra kerül (külön bemondás nélkül); a hiba utána a küldő gombra viszi', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());
    act(() => lastXhr().progress(100, 2_457_600));
    act(() => screen.getByRole('button', { name: 'Mégse' }).focus());

    act(() => lastXhr().sent());

    const statusLine = await screen.findByText('A fájl elküldve, a szerver ellenőrzi a képet…');
    await waitFor(() => expect(statusLine).toHaveFocus());
    expect(status()).not.toHaveTextContent('A fájl elküldve');

    act(() =>
      lastXhr().respond(
        503,
        {
          error: {
            code: 'SERVER_BUSY',
            message: 'A szerver most túl sok ellenőrzést kapott – próbáld újra később',
          },
        },
        { 'Retry-After': '30' },
      ),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/Kb\. 30 másodperc/);
    // A fókuszt egy effekt mozgatja a hibaüzenet kirajzolása után: lassabb gépen (CI) a riasztás
    // már látszik, amikor a gomb még nem kapta meg – ezért várakozással ellenőrizzük
    await waitFor(() => expect(fileSubmit()).toHaveFocus());
  });

  it('a hibás vagy megszakadt kérés (INVALID_UPLOAD) a felhasználónak szóló szöveggel jelenik meg', async () => {
    const { user } = renderVerify();
    await screen.findByRole('heading', { level: 1 });
    await user.upload(fileInput(), image());
    loadPreview(1600, 1067);
    await user.click(fileSubmit());

    act(() =>
      lastXhr().respond(400, { error: { code: 'INVALID_UPLOAD', message: 'Unexpected field' } }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A kérés nem érkezett meg hiánytalanul – próbáld újra.',
    );
    expect(screen.queryByText('Unexpected field')).toBeNull();
  });
});

describe('VerifyPage – a működés magyarázata', () => {
  it('az adatlap „Mit jelent ez?” hivatkozása ide visz (a neve megmondja, hogy másik oldalra), és a fókusz a „Hogyan működik?” címre kerül', async () => {
    stubFetch(...detailResponses());
    const { user, router } = renderVerify(`/photos/${PHOTO_ID}`);

    await user.click(
      await screen.findByRole('link', {
        name: 'Mit jelent ez? – magyarázat az Ellenőrzés oldalon',
      }),
    );

    expect(router.state.location.pathname).toBe('/verify');
    expect(router.state.location.hash).toBe('#hogyan-mukodik');
    const heading = await screen.findByRole('heading', { level: 2, name: 'Hogyan működik?' });
    expect(heading).toHaveAttribute('id', 'hogyan-mukodik');
    await waitFor(() => expect(heading).toHaveFocus());
  });
});
