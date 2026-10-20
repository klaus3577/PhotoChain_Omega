// A feltöltés oldala (L21, L17 drótváz „Feltöltés”): védett oldal; fogadóterület húzással és
// tallózással, a fájl típusának és méretének ellenőrzése még a küldés előtt, előnézet a felbontással;
// űrlap (cím, leírás, kategória, ár) a szerver szabályaival; a feltöltés XMLHttpRequest-tel, haladással
// és megszakítással (amíg a törzs el nem ment); a 409 (már feltöltött kép) érthető kártyával; a 201 után
// az állapot követése 3 másodpercenként (PENDING_CHAIN → REGISTERED), a függő tranzakció linkjével;
// minden állapotváltást az élő régió mond be, a hibát riasztás; a fókusz egyetlen lépésben sem vész el.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authQueryKey } from '../api/auth.api';
import { photoKeys } from '../api/photos.api';
import { axeViolations } from '../test/axe';
import { forPath, requestedUrls, stubFetch } from '../test/fetch';
import {
  categoriesResponse,
  detailResponse,
  galleryResponse,
  OWNER_ID,
  PENDING_TX_HASH,
  pendingPhoto,
  PHOTO_ID,
  photoDetail,
  TX_HASH,
  uploadResponse,
  viewerFlags,
} from '../test/photos';
import { renderRoute } from '../test/renderRoute';
import { errorResponse, testUser, userResponse } from '../test/users';
import { FakeXhr, lastXhr, sentFields, stubXhr } from '../test/xhr';

const PATH = '/upload';
const NBSP = String.fromCharCode(0xa0);
const owner = { ...testUser, id: OWNER_ID };
const DETAIL_PATH = `/api/photos/${PHOTO_ID}`;
const UPLOAD_HINT =
  'JPEG, PNG vagy WebP · legfeljebb 15 MB és 50 megapixel · a rövidebb oldal legalább 600 képpont';

afterEach(() => {
  vi.useRealTimers();
});

/** Képfájl a megadott (csak jelzett) mérettel – a tartalom nem számít, a méretet a mező mondja. */
function image(name = 'oszi-erdo-kodben.jpg', type = 'image/jpeg', size = 8_808_038): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** Az oldal bejelentkezve, a kategóriák válaszával; a feltöltés hamis XMLHttpRequest-tel megy. */
function renderUpload() {
  stubXhr();
  const fetchMock = stubFetch(forPath('/api/categories', categoriesResponse()));
  return { ...renderRoute(PATH, undefined, { session: owner }), fetchMock };
}

const fileInput = () => screen.getByLabelText('Tallózás…') as HTMLInputElement;
const submitButton = () => screen.getByRole('button', { name: 'Feltöltés és regisztráció' });
const dropZone = () => screen.getByText('Húzd ide a képet, vagy').closest('div')!;
const status = () => screen.getByRole('status');
const dropFile = (target: Element, file: File) =>
  fireEvent.drop(target, { dataTransfer: { files: [file], types: ['Files'] } });

/** A kép „betöltődött” a megadott felbontással (a jsdom nem dekódol képet). */
function loadPreview(width: number, height: number) {
  const img = screen.getByAltText('') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  fireEvent.load(img);
}

/** Kitöltött űrlap: kép, cím, kategória, ár (és leírás). */
async function fillForm(user: ReturnType<typeof renderRoute>['user'], file = image()) {
  await user.upload(fileInput(), file);
  await user.type(screen.getByRole('textbox', { name: 'Cím' }), 'Tócsa tükröződéssel');
  await user.type(screen.getByRole('textbox', { name: /Leírás/ }), 'Eső után az udvaron.');
  await screen.findByRole('option', { name: 'Tájkép' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Kategória' }), 'Tájkép');
  await user.type(screen.getByRole('textbox', { name: 'Ár (Ft)' }), '12 500');
}

/** Kitöltött űrlap elküldve, a szerver 201-es válaszával; az állapot lekérdezései a megadott válaszokkal. */
async function uploaded(
  user: ReturnType<typeof renderRoute>['user'],
  ...polls: Parameters<typeof detailResponse>[0][]
) {
  await fillForm(user);
  await user.click(submitButton());
  const fetchMock = stubFetch(...polls.map((photo) => forPath(DETAIL_PATH, detailResponse(photo))));
  act(() => lastXhr().respond(201, uploadResponse()));
  const heading = await screen.findByRole('heading', {
    level: 2,
    name: 'Regisztrálás folyamatban',
  });
  // A kártya effektusai (a fókusz, a lekérdezés időzítője) a megjelenés után futnak: ezeket is megvárjuk
  await waitFor(() => expect(heading).toHaveFocus());
  return fetchMock;
}

const stepTexts = () =>
  within(screen.getByRole('list', { name: 'A regisztráció lépései' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('UploadPage – az oldal és a fájl kiválasztása', () => {
  it('az oldal: cím, magyarázat, fogadóterület a korlátokkal, mezők, egyetlen elsődleges gomb, a folyamat magyarázata; a kategóriák a választóban', async () => {
    renderUpload();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kép feltöltése' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ujjlenyomata a blokkláncon rögzül/)).toBeInTheDocument();
    const input = fileInput();
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    // A vezérlő neve a mező tárgyát is mondja, nem csak a műveletet; kötelező, mint a többi mező
    expect(input).toHaveAccessibleName('Kép Tallózás…');
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription(UPLOAD_HINT);
    // Érintőképernyőn a húzás szövege nem jelenik meg (nincs mit húzni)
    expect(screen.getByText('Húzd ide a képet, vagy')).toHaveClass('pointer-coarse:hidden');
    expect(screen.getByRole('textbox', { name: 'Cím' })).toBeRequired();
    expect(screen.getByRole('textbox', { name: 'Leírás (nem kötelező)' })).not.toBeRequired();
    expect(screen.getByRole('textbox', { name: 'Ár (Ft)' })).toHaveAccessibleDescription(
      /175 és 9 999 999 Ft között/,
    );
    const category = screen.getByRole('combobox', { name: 'Kategória' });
    expect(await within(category).findByRole('option', { name: 'Tájkép' })).toBeInTheDocument();
    expect(within(category).getByRole('option', { name: 'Válassz…' })).toBeInTheDocument();
    expect(submitButton()).toHaveClass('bg-primary');
    expect(screen.getByText('A blokklánc-regisztráció díját a PhotoChain fizeti.')).toBeVisible();
    // L30: a vevő az eredeti fájlt kapja – a benne tárolt metaadatokkal (pl. a helyszín GPS-adata)
    expect(
      screen.getByText(
        'A vevő az eredeti fájlt kapja meg, a benne tárolt adatokkal együtt (pl. a fényképezőgép típusa, a készítés helye GPS-koordinátával). Ha ezt nem szeretnéd, feltöltés előtt töröld őket a fájlból.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Mi történik a feltöltés után?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ha lehet – megmutatjuk, melyik képpel egyezik/)).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Kép feltöltése · PhotoChain'));
  });

  it('fájl kiválasztása Tallózással: a neve, a mérete és az előnézete; a felbontás a kép betöltése után; a kiválasztás bemondva és a vezérlő leírásában; a Kép cseréje gomb', async () => {
    const { user } = renderUpload();
    await screen.findByRole('option', { name: 'Tájkép' });

    await user.upload(fileInput(), image());

    expect(screen.getByText('oszi-erdo-kodben.jpg')).toBeInTheDocument();
    // A getByText a szöveg szóközeit normalizálja (az NBSP-t is), a textContent nem
    expect(screen.getByText(/^8,4\sMB/).textContent).toBe(`8,4${NBSP}MB`);
    const preview = screen.getByAltText('');
    expect(preview).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    loadPreview(6000, 4000);
    expect(screen.getByText(/6000 × 4000 képpont/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kép cseréje' })).toBeInTheDocument();
    // A képernyőolvasó is megtudja, mi van kiválasztva: bemondás, és a vezérlő leírása
    expect(status()).toHaveTextContent(/Kiválasztott kép: oszi-erdo-kodben\.jpg \(8,4\sMB\)\./);
    expect(fileInput()).toHaveAccessibleDescription(/oszi-erdo-kodben\.jpg/);
    expect(fileInput()).toHaveAccessibleDescription(new RegExp(`^${UPLOAD_HINT}`));
  });

  it('az előnézet objektum-URL-je a fájl cseréjekor és az űrlap törlésekor felszabadul', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { user } = renderUpload();
    await fillForm(user);
    const firstUrl = screen.getByAltText('').getAttribute('src');
    await user.upload(fileInput(), image('masik.jpg'));

    expect(revoke).toHaveBeenCalledWith(firstUrl);
    const secondUrl = screen.getByAltText('').getAttribute('src');
    expect(secondUrl).not.toBe(firstUrl);
    revoke.mockClear();

    await user.click(submitButton());
    act(() =>
      lastXhr().respond(409, {
        error: { code: 'DUPLICATE_EXACT', message: 'Ezt a képet már feltöltötték', details: {} },
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Másik kép választása' }));

    expect(revoke).toHaveBeenCalledWith(secondUrl);
  });

  it('húzd ide: a dobott fájl is kiválasztódik; húzás közben a terület a szövegével és a keretével is jelzi', async () => {
    renderUpload();
    await screen.findByRole('option', { name: 'Tájkép' });
    const zone = dropZone();

    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
    expect(zone).toHaveAttribute('data-dragging', 'true');
    expect(zone).toHaveClass('border-solid');
    expect(screen.getByText('Engedd el a képet')).toBeInTheDocument();
    // A terület fölött a dobás engedett (preventDefault – a fireEvent hamisat ad), másolás jelzéssel
    const transfer = { types: ['Files'], dropEffect: 'none' };
    expect(fireEvent.dragOver(zone, { dataTransfer: transfer })).toBe(false);
    expect(transfer.dropEffect).toBe('copy');
    fireEvent.dragLeave(zone, { dataTransfer: { types: ['Files'] } });
    expect(zone).not.toHaveAttribute('data-dragging');
    expect(zone).toHaveClass('border-dashed');
    expect(screen.getByText('Húzd ide a képet, vagy')).toBeInTheDocument();
    dropFile(zone, image('tocsa.jpg'));

    expect(await screen.findByText('tocsa.jpg')).toBeInTheDocument();
    expect(zone).not.toHaveAttribute('data-dragging');
  });

  it('a megszakított fájlválasztó (üres change) nem törli a már kiválasztott képet', async () => {
    const { user } = renderUpload();
    await screen.findByRole('option', { name: 'Tájkép' });
    await user.upload(fileInput(), image());
    expect(await screen.findByText('oszi-erdo-kodben.jpg')).toBeInTheDocument();

    // A böngésző a párbeszédablak megszakításakor kiüríti a vezérlőt – a kiválasztás megmarad
    fireEvent.change(fileInput(), { target: { files: [] } });

    expect(screen.getByText('oszi-erdo-kodben.jpg')).toBeInTheDocument();
  });

  it('a fogadóterületen kívülre dobott fájlt a böngésző nem nyitja meg (az űrlap nem vész el)', async () => {
    renderUpload();
    await screen.findByRole('option', { name: 'Tájkép' });

    // A fireEvent hamisat ad, ha az eseményen preventDefault() hívódott
    expect(fireEvent.dragOver(document.body, { dataTransfer: { types: ['Files'] } })).toBe(false);
    expect(fireEvent.drop(document.body, { dataTransfer: { types: ['Files'], files: [] } })).toBe(
      false,
    );
    // A szöveg húzását nem érinti
    expect(fireEvent.drop(document.body, { dataTransfer: { types: ['text/plain'] } })).toBe(true);
  });

  it('hibás fájl (nem kép, túl nagy): a hiba a fogadóterületnél és riasztásként, a fájl nem kerül kiválasztásra', async () => {
    const { user } = renderUpload();
    await screen.findByRole('option', { name: 'Tájkép' });

    // A fájlválasztó párbeszédablaka az accept szerint szűr (a user-event is), a húzás nem: dobással jön
    dropFile(dropZone(), image('jegyzet.txt', 'text/plain', 10));
    expect(fileInput()).toHaveAccessibleDescription(/Csak JPEG, PNG vagy WebP kép tölthető fel\./);
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
    // A hiba színe ne vesszen el a kaszkádban (az alapkeret osztálya ilyenkor nincs rajta)
    expect(dropZone()).toHaveClass('border-danger');
    expect(dropZone()).not.toHaveClass('border-line-strong');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Kép: Csak JPEG, PNG vagy WebP kép tölthető fel.',
    );
    expect(screen.queryByText('jegyzet.txt')).toBeNull();

    await user.upload(fileInput(), image('oriasi.jpg', 'image/jpeg', 16 * 1024 * 1024));
    expect(fileInput()).toHaveAccessibleDescription(
      /A fájl túl nagy: legfeljebb 15 MB lehet \(a kiválasztott fájl 16,0.MB\)\./,
    );
    expect(screen.queryByText('oriasi.jpg')).toBeNull();

    // Egy jó fájl után a hiba és a riasztás eltűnik
    await user.upload(fileInput(), image());
    expect(fileInput()).not.toHaveAttribute('aria-invalid');
    expect(dropZone()).toHaveClass('border-line-strong');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('oszi-erdo-kodben.jpg')).toBeInTheDocument();
  });

  it('Kép cseréje után elutasított fájl: a fókusz a fájlválasztóra kerül (a Kép cseréje gomb eltűnt), riasztás nélkül', async () => {
    const { user } = renderUpload();
    await screen.findByRole('option', { name: 'Tájkép' });
    await user.upload(fileInput(), image());
    const replace = screen.getByRole('button', { name: 'Kép cseréje' });
    act(() => replace.focus());

    dropFile(dropZone(), image('jegyzet.txt', 'text/plain', 10));

    expect(screen.queryByRole('button', { name: 'Kép cseréje' })).toBeNull();
    expect(fileInput()).toHaveFocus();
    expect(fileInput()).toHaveAccessibleDescription(/Csak JPEG, PNG vagy WebP kép tölthető fel\./);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('túl kicsi vagy túl nagy felbontású kép (a betöltése után derül ki): a hiba riasztásként is, a beküldés nem indul', async () => {
    const { user } = renderUpload();
    await fillForm(user, image('kicsi.jpg'));
    loadPreview(480, 320);

    expect(fileInput()).toHaveAccessibleDescription(
      /a rövidebb oldala legalább 600 képpont legyen \(a kiválasztott kép 480 × 320 képpontos\)/,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/^Kép: A kép túl kicsi/);
    // A fájl megmarad (látszik, mi a baj vele), de a fókusz nem ugrik el gépelés közben
    expect(screen.getByText('kicsi.jpg')).toBeInTheDocument();
    expect(fileInput()).not.toHaveFocus();
    await user.click(submitButton());

    expect(FakeXhr.instances).toHaveLength(0);
    expect(fileInput()).toHaveFocus();

    await user.upload(fileInput(), image('oriasfelbontas.jpg'));
    loadPreview(9000, 6000);
    expect(fileInput()).toHaveAccessibleDescription(
      /A kép túl nagy: legfeljebb 50 megapixel lehet \(a kiválasztott kép 9000 × 6000 képpontos\)/,
    );
    await user.click(submitButton());
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('üres beküldés: minden mező hibája látszik, a fókusz az első hibás vezérlőre (a fájlra) kerül, kérés nem indul', async () => {
    const { user } = renderUpload();
    await screen.findByRole('option', { name: 'Tájkép' });

    await user.click(submitButton());

    expect(fileInput()).toHaveAccessibleDescription(/Válassz egy képfájlt\./);
    expect(screen.getByRole('textbox', { name: 'Cím' })).toHaveAccessibleDescription(
      'Add meg a kép címét.',
    );
    expect(screen.getByRole('combobox', { name: 'Kategória' })).toHaveAccessibleDescription(
      'Válassz kategóriát.',
    );
    expect(screen.getByRole('textbox', { name: 'Ár (Ft)' })).toHaveAccessibleDescription(
      /Add meg az árat\./,
    );
    expect(fileInput()).toHaveFocus();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('ha a kategóriák nem töltődnek be: érthető hiba és újratöltés gomb, nem egy teljesíthetetlen „Válassz kategóriát”', async () => {
    stubXhr();
    stubFetch(
      forPath('/api/categories', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
    );
    const { user } = renderRoute(PATH, undefined, { session: owner });

    const retry = await screen.findByRole('button', { name: 'Kategóriák újratöltése' });
    expect(screen.getByRole('combobox', { name: 'Kategória' })).toHaveAccessibleDescription(
      /A kategóriák listája nem töltődött be/,
    );

    // Az első újratöltés is sikertelen: az élő régió bemondja, a gomb marad
    stubFetch(
      forPath('/api/categories', errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
    );
    await user.click(retry);
    await waitFor(() =>
      expect(status()).toHaveTextContent('A kategóriák betöltése most sem sikerült.'),
    );
    expect(screen.getByRole('button', { name: 'Kategóriák újratöltése' })).toBeInTheDocument();

    // A második sikerül: a gomb eltűnik, a fókusz a választóra kerül
    stubFetch(forPath('/api/categories', categoriesResponse()));
    await user.click(screen.getByRole('button', { name: 'Kategóriák újratöltése' }));

    expect(await screen.findByRole('option', { name: 'Tájkép' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kategóriák újratöltése' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kategória' })).toHaveFocus());
  });

  it('felhasználóváltáskor (a munkamenet a háttérben cserélődött) az előző felhasználó félbehagyott űrlapja eltűnik', async () => {
    const { user, queryClient } = renderUpload();
    await fillForm(user);
    expect(screen.getByRole('textbox', { name: 'Cím' })).toHaveValue('Tócsa tükröződéssel');

    act(() => {
      queryClient.setQueryData(authQueryKey, { ...testUser, id: 'u2', displayName: 'Más Mária' });
    });

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Cím' })).toHaveValue(''));
    expect(screen.queryByText('oszi-erdo-kodben.jpg')).toBeNull();
    // A fókusz (az eltűnt mezőről) az oldal címére kerül, az élő régió elmondja, mi történt
    expect(screen.getByRole('heading', { level: 1, name: 'Kép feltöltése' })).toHaveFocus();
    expect(status()).toHaveTextContent('A munkamenet megváltozott, az oldal újraindult.');
  });
});

describe('UploadPage – feltöltés és állapotkövetés', () => {
  it('sikeres feltöltés: a kérés mezői, a haladás, a feldolgozás, a 201 utáni állapotkártya (fókusszal), a lekérdezés 3 másodpercenként, végül Hitelesítve', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, queryClient } = renderUpload();
    queryClient.setQueryData(photoKeys.list('?page=1'), {
      photos: [],
      meta: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
    });
    // A vezérlőpult saját képeinek listája (L22) a feltöltés után frissül
    queryClient.setQueryData(photoKeys.ownPage(1), {
      photos: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    await fillForm(user);
    loadPreview(6000, 4000);

    await user.click(submitButton());
    const xhr = lastXhr();

    expect(sentFields(xhr)).toEqual({
      title: 'Tócsa tükröződéssel',
      description: 'Eső után az udvaron.',
      priceHuf: '12500',
      categoryId: '1',
      image: { name: 'oszi-erdo-kodben.jpg', type: 'image/jpeg' },
    });
    expect(status()).toHaveTextContent('A feltöltés elindult.');
    const busy = screen.getByRole('button', { name: 'Feltöltés…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    // A dupla kattintás nem indít második feltöltést
    await user.click(busy);
    expect(FakeXhr.instances).toHaveLength(1);
    // Az első haladás-esemény előtt a sáv határozatlan: nincs érték, nincs „0%”
    const bar = screen.getByRole('progressbar', { name: 'Feltöltés' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText('0%')).toBeNull();
    act(() => xhr.progress(5_400_000, 8_808_038));
    expect(bar).toHaveAttribute('aria-valuenow', '61');
    // A szöveges érték nem „per”-ként olvasandó
    expect(bar).toHaveAttribute('aria-valuetext', `61% – 8,4${NBSP}MB-ból 5,1${NBSP}MB`);
    expect(screen.getByText(/^5,1 \/ 8,4\sMB$/).textContent).toBe(`5,1 / 8,4${NBSP}MB`);
    expect(screen.getByText('61%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mégse' })).toBeInTheDocument();
    // Egy megabájt alatti törzsnél mindkét érték a saját egységével (kB)
    act(() => xhr.progress(10_240, 512_000));
    expect(screen.getByText(/^10\skB \/ 500\skB$/).textContent).toBe(`10${NBSP}kB / 500${NBSP}kB`);
    expect(bar).toHaveAttribute('aria-valuetext', `2% – 500${NBSP}kB-ból 10${NBSP}kB`);

    // A törzs elment: a szerver dolgozik, megszakítani már nem lehet (a kép elkészülne). A Mégse gombon
    // álló fókusz az állapotsorra kerül, az élő régió is elmondja
    act(() => screen.getByRole('button', { name: 'Mégse' }).focus());
    act(() => xhr.sent());
    const processing = screen.getByText(/A fájl elküldve, a szerver feldolgozza a képet/, {
      selector: 'p',
    });
    expect(screen.queryByRole('button', { name: 'Mégse' })).toBeNull();
    await waitFor(() => expect(processing).toHaveFocus());
    expect(status()).toHaveTextContent('A fájl elküldve, a szerver feldolgozza a képet.');

    // Az állapot lekérdezései: előbb még függő (a tranzakció elküldve), aztán regisztrált
    const fetchMock = stubFetch(
      forPath(DETAIL_PATH, detailResponse(pendingPhoto())),
      forPath(DETAIL_PATH, detailResponse(photoDetail({ viewer: viewerFlags() }))),
    );
    act(() => xhr.respond(201, uploadResponse()));

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Regisztrálás folyamatban',
    });
    // Az űrlap (benne a fókuszált gomb) eltűnt: a fókusz az állapotkártya címére kerül – a megjelenés
    // utáni effektusban, ezért megvárjuk
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole('button', { name: /Feltöltés/ })).toBeNull();
    expect(queryClient.getQueryState(photoKeys.ownPage(1))?.isInvalidated).toBe(true);
    expect(stepTexts()).toEqual([
      'Kész: Feltöltve',
      'Kész: Ujjlenyomat elkészült, nincs egyezés',
      'Folyamatban: Rögzítés a blokkláncon…',
      'Hátravan: Hitelesítve',
    ]);
    expect(status()).toHaveTextContent(
      'A kép feltöltése sikerült. A blokklánc-regisztráció folyamatban van, ez általában fél–egy percig tart.',
    );
    expect(screen.getByRole('link', { name: 'A kép adatlapja' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(screen.queryByText(/Függő tranzakció|^Tranzakció:/)).toBeNull();

    act(() => vi.advanceTimersByTime(3000));
    const txLink = await screen.findByRole('link', { name: /0x7a1c…2d9b/ });
    expect(txLink).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${PENDING_TX_HASH}`);
    expect(screen.getByText(/Függő tranzakció/)).toBeInTheDocument();
    act(() => txLink.focus());

    act(() => vi.advanceTimersByTime(3000));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Hitelesítve a blokkláncon' }),
    ).toBeInTheDocument();
    expect(stepTexts()).toEqual([
      'Kész: Feltöltve',
      'Kész: Ujjlenyomat elkészült, nincs egyezés',
      'Kész: Rögzítés a blokkláncon',
      'Kész: Hitelesítve',
    ]);
    expect(status()).toHaveTextContent(
      'A kép hitelesítve a blokkláncon, és megjelent a galériában.',
    );
    // A tranzakció sora megmarad (ugyanaz a hivatkozás, a fókusz rajta), most a tanúsítvány adatával
    const registeredLink = screen.getByRole('link', { name: /0x9c4e…1b7a/ });
    expect(registeredLink).toBe(txLink);
    expect(registeredLink).toHaveFocus();
    expect(registeredLink).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${TX_HASH}`);
    expect(screen.getByText(/^Tranzakció:/)).toBeInTheDocument();
    expect(screen.queryByText(/Függő tranzakció/)).toBeNull();
    expect(screen.getByRole('link', { name: 'A kép adatlapja' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Újabb kép feltöltése' })).toBeInTheDocument();
    // A galéria listái érvénytelenek (a kép nyilvános lett); hitelesítés után nincs több lekérdezés
    expect(queryClient.getQueryState(photoKeys.list('?page=1'))?.isInvalidated).toBe(true);
    const requests = requestedUrls(fetchMock).length;
    act(() => vi.advanceTimersByTime(6500));
    expect(requestedUrls(fetchMock)).toHaveLength(requests);
  });

  it('a lánc-regisztráció sikertelensége (CHAIN_FAILED): riasztás a teendővel (egyszer), a lépés hibás', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderUpload();
    await uploaded(
      user,
      photoDetail({ status: 'CHAIN_FAILED', certificate: null, viewer: viewerFlags() }),
    );

    act(() => vi.advanceTimersByTime(3000));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A blokklánc-regisztráció nem sikerült. A kép nem nyilvános. Nincs teendőd: az adminisztrátor újrapróbálja a regisztrációt, az eredményt a kép adatlapján látod.',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sikertelen regisztráció' }),
    ).toBeInTheDocument();
    expect(stepTexts()[2]).toBe('Nem sikerült: Rögzítés a blokkláncon');
    expect(stepTexts()[3]).toBe('Elmaradt: Hitelesítve');
    // A tanúsítványdoboz megjegyzése ugyanezt mondaná még egyszer: itt nem jelenik meg
    expect(screen.queryByText(/újrapróbálhatja/)).toBeNull();
  });

  it('a tranzakció sora a sikertelen regisztrációnál is megmarad (a rajta álló fókusz nem vész el)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderUpload();
    await uploaded(
      user,
      pendingPhoto(),
      photoDetail({ status: 'CHAIN_FAILED', certificate: null, viewer: viewerFlags() }),
    );
    act(() => vi.advanceTimersByTime(3000));
    const txLink = await screen.findByRole('link', { name: /0x7a1c…2d9b/ });
    act(() => txLink.focus());

    act(() => vi.advanceTimersByTime(3000));

    await screen.findByRole('heading', { level: 2, name: 'Sikertelen regisztráció' });
    expect(screen.getByRole('link', { name: /0x7a1c…2d9b/ })).toBe(txLink);
    expect(txLink).toHaveFocus();
    expect(screen.getByText(/^Tranzakció \(nem ment át\):/)).toBeInTheDocument();
  });

  it('ha a képet közben elrejtették (HIDDEN): a lekérdezés leáll, az élő régió bemondja', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderUpload();
    const fetchMock = await uploaded(
      user,
      photoDetail({
        status: 'HIDDEN',
        certificate: null,
        previewUrl: null,
        viewer: viewerFlags(),
      }),
    );

    act(() => vi.advanceTimersByTime(3000));

    expect(await screen.findByRole('heading', { level: 2, name: 'Elrejtve' })).toBeInTheDocument();
    expect(status()).toHaveTextContent('A képet elrejtették.');
    // A regisztráció előtt elrejtett képnél nincs lánc-rekord: a tanúsítványdoboz megjegyzése itt hamis lenne
    expect(screen.getByText(/mielőtt a regisztráció megtörtént volna/)).toBeInTheDocument();
    expect(screen.queryByText(/A láncon rögzített rekord megmarad/)).toBeNull();
    const requests = requestedUrls(fetchMock).length;
    act(() => vi.advanceTimersByTime(6500));
    expect(requestedUrls(fetchMock)).toHaveLength(requests);
  });

  it('ha a kép már nem érhető el (404 – pl. lejárt munkamenet): a lekérdezés leáll, a kártya az adatlapra irányít, a munkamenet újraellenőrződik', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderUpload();
    await uploaded(user);
    const recheck = stubFetch(
      forPath(DETAIL_PATH, errorResponse(404, 'NOT_FOUND', 'A kép nem található')),
      // A munkamenet újraellenőrzése (GET /api/auth/me) – itt még érvényes
      forPath('/api/auth/me', userResponse(owner)),
    );

    act(() => vi.advanceTimersByTime(3000));

    expect(await screen.findByText(/A kép állapota most nem érhető el/)).toBeInTheDocument();
    expect(screen.queryByText(/újra próbáljuk/)).toBeNull();
    // A munkamenet újraellenőrződik (a lejárt munkamenetet így veszi észre a felület); több lekérdezés nincs
    await waitFor(() => expect(requestedUrls(recheck)).toContain('/api/auth/me'));
    const requests = requestedUrls(recheck).length;
    act(() => vi.advanceTimersByTime(6500));
    expect(requestedUrls(recheck)).toHaveLength(requests);
  });

  it('ha egy lekérdezés nem sikerül: megjegyzés a kártyán, a következő sikeres lekérdezés eltünteti', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderUpload();
    await uploaded(user);
    stubFetch(
      forPath(DETAIL_PATH, errorResponse(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba')),
      forPath(DETAIL_PATH, detailResponse(pendingPhoto())),
    );

    act(() => vi.advanceTimersByTime(3000));
    expect(await screen.findByText(/Az állapot lekérdezése most nem sikerült/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => vi.advanceTimersByTime(3000));
    await screen.findByRole('link', { name: /0x7a1c…2d9b/ });
    expect(screen.queryByText(/Az állapot lekérdezése most nem sikerült/)).toBeNull();
  });

  it('Újabb kép feltöltése: üres űrlap, a fókusz a fájlválasztón', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderUpload();
    await uploaded(user, photoDetail({ viewer: viewerFlags() }));
    act(() => vi.advanceTimersByTime(3000));
    await screen.findByRole('heading', { level: 2, name: 'Hitelesítve a blokkláncon' });

    await user.click(screen.getByRole('button', { name: 'Újabb kép feltöltése' }));

    expect(screen.getByRole('textbox', { name: 'Cím' })).toHaveValue('');
    expect(screen.queryByText('oszi-erdo-kodben.jpg')).toBeNull();
    expect(fileInput()).toHaveFocus();
  });

  it('Mégse: a kérés megszakad, az űrlap az adataival visszatér, a fókusz a küldő gombra kerül, az élő régió bemondja', async () => {
    const { user } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());

    await user.click(screen.getByRole('button', { name: 'Mégse' }));

    expect(lastXhr().aborted).toBe(true);
    expect(submitButton()).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Cím' })).toHaveValue('Tócsa tükröződéssel');
    expect(screen.getByText('oszi-erdo-kodben.jpg')).toBeInTheDocument();
    expect(status()).toHaveTextContent('A feltöltést megszakítottad; az űrlap adatai megmaradtak.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ha a Mégse a törzs elküldésekor tűnik el a fókusszal: a fókusz az állapotsorra kerül, a 409 után a küldő gombra', async () => {
    const { user } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());
    act(() => screen.getByRole('button', { name: 'Mégse' }).focus());

    act(() => lastXhr().sent());
    const processing = screen.getByText(/A fájl elküldve, a szerver feldolgozza a képet/, {
      selector: 'p',
    });
    await waitFor(() => expect(processing).toHaveFocus());

    act(() =>
      lastXhr().respond(409, {
        error: {
          code: 'DUPLICATE_EXACT',
          message: 'Ezt a képet már feltöltötték',
          details: { distance: 0 },
        },
      }),
    );
    await screen.findByRole('alert');
    await waitFor(() => expect(submitButton()).toHaveFocus());
  });

  it('kijelentkezés feltöltés közben (a törzs még megy): a feltöltés megszakad, a kijelentkezés a kezdőlapra visz', async () => {
    const { user, router } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());
    const xhr = lastXhr();
    stubFetch(
      forPath('/api/auth/logout', new Response(null, { status: 204 })),
      forPath('/api/photos', galleryResponse()),
    );

    await user.click(screen.getByRole('button', { name: 'KA – fiókmenü' }));
    await user.click(screen.getByRole('button', { name: 'Kijelentkezés' }));

    await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    expect(router.state.location.pathname).toBe('/');
    expect(xhr.aborted).toBe(true);
    expect(screen.queryByText(/A feltöltés még tart/)).toBeNull();
  });

  it('a fejléc Feltöltés gombja a feltöltés alatt nem kér megerősítést (ugyanaz az oldal), és nem indít navigációt', async () => {
    const { user, router } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());

    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Feltöltés' }));

    expect(screen.queryByText(/A feltöltés még tart/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Feltöltés…' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/upload');
  });

  it('ha a feltöltés a nyitott megerősítés alatt ér véget: a panel eltűnik, a fókusz az állapotkártya címére kerül', async () => {
    const { user } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());
    await user.click(screen.getByRole('link', { name: 'Galéria' }));
    await screen.findByRole('button', { name: 'Maradok' });

    act(() => lastXhr().respond(201, uploadResponse()));

    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Regisztrálás folyamatban',
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Maradok' })).toBeNull());
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('elnavigálás feltöltés közben: megerősítés (Maradok / Mégis elhagyom, Escape); az oldal bezárása előtt a böngésző kérdez; a kései válasz nem okoz hibát', async () => {
    const { user, router } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());
    const xhr = lastXhr();

    await user.click(screen.getByRole('link', { name: 'Galéria' }));

    // A panelnek neve és leírása van (a fókusz a Maradok gombra kerül, a képernyőolvasó a kérdést is hallja)
    const panel = await screen.findByRole('group', { name: 'A feltöltés még tart.' });
    expect(panel).toHaveAccessibleDescription(/Ha most elhagyod az oldalt/);
    const stay = screen.getByRole('button', { name: 'Maradok' });
    expect(stay).toHaveFocus();
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    act(() => {
      window.dispatchEvent(beforeUnload);
    });
    expect(beforeUnload.defaultPrevented).toBe(true);
    // Escape = Maradok: a panel bezárul, a fókusz visszatér a hivatkozásra, ahonnan a navigáció indult
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'A feltöltés még tart.' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Galéria' })).toHaveFocus();
    expect(router.state.location.pathname).toBe('/upload');
    expect(screen.getByRole('button', { name: 'Feltöltés…' })).toBeInTheDocument();

    // A galéria képeit kéri le (a kategóriák a gyorsítótárból jönnek)
    stubFetch(forPath('/api/photos', galleryResponse()));
    await user.click(screen.getByRole('link', { name: 'Galéria' }));
    await user.click(await screen.findByRole('button', { name: 'Mégis elhagyom' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await screen.findByRole('heading', { level: 1, name: 'Galéria' });
    act(() => xhr.respond(201, uploadResponse()));
    expect(screen.getByRole('heading', { level: 1, name: 'Galéria' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Regisztrálás folyamatban' })).toBeNull();
  });

  it('a Vissza gomb egy korábbi kijelentkezés bejegyzésére is megerősítést kér (csak maga a kijelentkezés nem)', async () => {
    stubXhr();
    stubFetch(forPath('/api/categories', categoriesResponse()));
    const { user, router } = renderRoute(PATH, undefined, {
      session: owner,
      history: [{ pathname: '/', state: { loggingOut: true } }],
    });
    await fillForm(user);
    await user.click(submitButton());

    act(() => {
      void router.navigate(-1);
    });

    expect(await screen.findByRole('group', { name: 'A feltöltés még tart.' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/upload');
    expect(screen.getByRole('button', { name: 'Feltöltés…' })).toBeInTheDocument();
  });

  it('az elhagyott oldal kései válasza után a vezérlőpult saját képei is frissülnek; a kései „elküldve” másik oldalon már nem hangzik el', async () => {
    const { user, queryClient } = renderUpload();
    queryClient.setQueryData(photoKeys.ownPage(1), {
      photos: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    await fillForm(user);
    await user.click(submitButton());
    const xhr = lastXhr();
    stubFetch(forPath('/api/photos', galleryResponse()));
    await user.click(screen.getByRole('link', { name: 'Galéria' }));
    await user.click(await screen.findByRole('button', { name: 'Mégis elhagyom' }));
    await screen.findByRole('heading', { level: 1, name: 'Galéria' });

    act(() => xhr.sent());
    expect(screen.queryByText(/A fájl elküldve/)).toBeNull();
    act(() => xhr.respond(201, uploadResponse()));

    // A vezérlőpult lekérdezése a feltöltés vége előtt futhatott: a kép csak a frissítés után látszik
    await waitFor(() =>
      expect(queryClient.getQueryState(photoKeys.ownPage(1))?.isInvalidated).toBe(true),
    );
  });
});

describe('UploadPage – hibák', () => {
  it('409 – nagyon hasonló kép, a meglévő kép adataival: a kártya a távolsággal és a képpel; a fókusz a Mégse gombról a küldő gombra; Másik kép választása', async () => {
    const { user } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());
    act(() => screen.getByRole('button', { name: 'Mégse' }).focus());

    // A böngészőben a 409 csak a teljes törzs után jöhet: előbb a feltöltés „load” eseménye
    act(() => lastXhr().sent());
    act(() =>
      lastXhr().respond(409, {
        error: {
          code: 'DUPLICATE_SIMILAR',
          message: 'Ehhez nagyon hasonló képet már feltöltöttek',
          details: {
            photoId: PHOTO_ID,
            title: 'Őszi erdő ködben',
            ownerDisplayName: 'Fotós Fanni',
            uploadedAt: '2026-10-04T12:30:00.000Z',
            distance: 3,
          },
        },
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ehhez nagyon hasonló képet már feltöltöttek.');
    expect(alert).toHaveTextContent(
      'Ugyanaz a kép – vagy egy módosított változata – nem tölthető fel újra. A két kép szinte teljesen egyezik: a 64 bites vizuális ujjlenyomatból 3 bit tér el.',
    );
    expect(screen.getByText('Meglévő kép:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Őszi erdő ködben' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(screen.getByText('Fotós Fanni · 2026. október 4.')).toBeInTheDocument();
    // A Mégse gomb eltűnt a fókusszal együtt: a küldő gombra kerül
    await waitFor(() => expect(submitButton()).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Másik kép választása' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('oszi-erdo-kodben.jpg')).toBeNull();
    expect(fileInput()).toHaveFocus();
    // Az űrlap adatai megmaradnak
    expect(screen.getByRole('textbox', { name: 'Cím' })).toHaveValue('Tócsa tükröződéssel');
  });

  it('409 – azonos kép, részletek nélkül (nem nyilvános, nem a sajátja): csak az üzenet és a magyarázat', async () => {
    const { user } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());

    act(() =>
      lastXhr().respond(409, {
        error: {
          code: 'DUPLICATE_EXACT',
          message: 'Ezt a képet már feltöltötték',
          details: { distance: 0 },
        },
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ezt a képet már feltöltötték.');
    expect(alert).toHaveTextContent('A fájl bitre azonos egy már feltöltött képpel.');
    expect(screen.queryByRole('link', { name: /ködben|erdő/ })).toBeNull();
    expect(screen.queryByText('Meglévő kép:')).toBeNull();
  });

  it('a szerver mezőhibája (400) a mezőhöz kerül, a fókusz oda', async () => {
    const { user } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());

    act(() => lastXhr().sent());
    act(() =>
      lastXhr().respond(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Érvénytelen bemenet',
          details: [{ path: 'title', message: 'legfeljebb 120 karakter lehet' }],
        },
      }),
    );

    const title = screen.getByRole('textbox', { name: 'Cím' });
    await waitFor(() =>
      expect(title).toHaveAccessibleDescription('Legfeljebb 120 karakter lehet.'),
    );
    expect(title).toHaveFocus();
  });

  it('a szerver képhibája (415) a fogadóterülethez kerül, és az előnézet újratöltése sem törli; újraküldeni szabad', async () => {
    const { user } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());

    act(() => lastXhr().sent());
    act(() =>
      lastXhr().respond(415, {
        error: { code: 'UNSUPPORTED_IMAGE', message: 'A fájl nem támogatott vagy sérült kép' },
      }),
    );

    await waitFor(() =>
      expect(fileInput()).toHaveAccessibleDescription(/A fájl nem támogatott vagy sérült kép\./),
    );
    expect(fileInput()).toHaveFocus();
    // Az űrlap visszatért, az előnézet újra betöltődik – a szerver ítélete nem tűnhet el
    loadPreview(6000, 4000);
    expect(fileInput()).toHaveAccessibleDescription(/A fájl nem támogatott vagy sérült kép\./);

    await user.click(submitButton());
    expect(FakeXhr.instances).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Feltöltés' })).toBeInTheDocument();
  });

  it('más hiba riasztás: a várakozással (429), érthetően a hibás kérésnél (INVALID_UPLOAD), a hálózati hibánál; az űrlap megmarad', async () => {
    const { user } = renderUpload();
    await fillForm(user);

    await user.click(submitButton());
    act(() =>
      lastXhr().respond(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Túl sok kísérlet' } },
        { 'Retry-After': '60' },
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A feltöltés nem sikerült. Túl sok kísérlet. Kb. 1 perc múlva próbálhatod újra.',
    );
    // A küldő gomb leírása a riasztás: a fókusz áthelyezése után is elhangzik
    expect(submitButton()).toHaveAccessibleDescription(/Túl sok kísérlet/);

    await user.click(submitButton());
    act(() =>
      lastXhr().respond(400, {
        error: { code: 'INVALID_UPLOAD', message: 'A képet „image” néven kell küldeni' },
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A feltöltés nem sikerült. A kérés nem érkezett meg hiánytalanul – próbáld újra.',
    );

    await user.click(submitButton());
    act(() => lastXhr().fail());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A feltöltés nem sikerült. A szerver nem érhető el.',
    );
    expect(screen.getByRole('textbox', { name: 'Cím' })).toHaveValue('Tócsa tükröződéssel');
    expect(screen.getByText('oszi-erdo-kodben.jpg')).toBeInTheDocument();
  });

  it('lejárt munkamenet (401) feltöltés közben: a felület kijelentkezett állapotba kerül, a belépés után ide tér vissza', async () => {
    const { user, router } = renderUpload();
    await fillForm(user);
    await user.click(submitButton());

    act(() =>
      lastXhr().respond(401, {
        error: { code: 'UNAUTHORIZED', message: 'Bejelentkezés szükséges' },
      }),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Belépés' })).toBeInTheDocument();
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/upload' } });
  });

  it('kijelentkezéskor a feltöltött kép adata nem marad a gyorsítótárban (közös gépen a következő felhasználó nem látja)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, queryClient } = renderUpload();
    await uploaded(user);
    expect(queryClient.getQueryData(photoKeys.detail(PHOTO_ID))).toBeDefined();

    act(() => {
      queryClient.setQueryData(authQueryKey, null);
    });

    await screen.findByRole('heading', { level: 1, name: 'Belépés' });
    expect(queryClient.getQueryData(photoKeys.detail(PHOTO_ID))).toBeUndefined();
  });

  it('nincs akadálymentességi hiba: az űrlap kiválasztott fájllal, és az állapotkártya', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, container } = renderUpload();
    await fillForm(user);
    loadPreview(6000, 4000);
    expect(await axeViolations(container, { page: true })).toEqual([]);

    await user.click(submitButton());
    stubFetch(forPath(DETAIL_PATH, detailResponse(pendingPhoto())));
    act(() => lastXhr().respond(201, uploadResponse()));
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Regisztrálás folyamatban',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    act(() => vi.advanceTimersByTime(3000));
    await screen.findByRole('link', { name: /0x7a1c…2d9b/ });

    expect(await axeViolations(container, { page: true })).toEqual([]);
  });
});
