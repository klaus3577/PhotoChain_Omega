// Az ellenőrzés eredménykártyája (L24; L17 drótváz „Ellenőrzés”, 2–4. jegyzet, a bizalom vizuális
// nyelve): a három eset címe, ikonja és színe – a zöld csak a láncon igazolt hitelességé –, a fókusz a
// megjelenéskor a kártya címén (a képernyőolvasó azonnal bemondja). VERIFIED: a kép és a fotós
// hivatkozása (ha a kép nyilvános), a regisztráció ideje, blokk és tranzakció (ha ismert); SIMILAR: az
// eltérés bitben és az eredeti adatlapja; NOT_FOUND: semleges hangvétel, a kiszámolt hash másolható.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Verification } from '../../api/verify.api';
import { axeViolations } from '../../test/axe';
import { OWNER_ID, PHOTO_ID, TX_HASH } from '../../test/photos';
import {
  notFoundResult,
  registration,
  similarResult,
  UNKNOWN_DHASH,
  UNKNOWN_SHA256,
  verifiedResult,
} from '../../test/verify';
import { LiveRegionProvider } from '../ui/LiveRegion';
import { VerificationResult, type VerificationSource } from './VerificationResult';

const NBSP = String.fromCharCode(0xa0);

function renderResult(result: Record<string, unknown>, source: VerificationSource = 'file') {
  const onReset = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter>
      <LiveRegionProvider>
        <VerificationResult
          result={result as unknown as Verification}
          source={source}
          onReset={onReset}
        />
      </LiveRegionProvider>
    </MemoryRouter>,
  );
  return { ...view, user, onReset };
}

/** Az adatlista egy sorának értéke (a dt-hez tartozó dd). */
const valueOf = (term: string) =>
  screen.getByText(term, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('VerificationResult – a fókusz és a bemondás', () => {
  it('ha a fókusz nem veszett el (máshol van), a cím nem veszi el: az élő régió mondja be az eredményt', () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();

    renderResult(verifiedResult());

    expect(elsewhere).toHaveFocus();
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Hiteles, regisztrált kép');
    elsewhere.remove();
  });

  it('a kártya címének leírása a magyarázat: a fókuszba kerülő címmel együtt hangzik el', () => {
    renderResult(notFoundResult());

    expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleDescription(
      /Ez nem jelenti, hogy a kép hamis/,
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('VerificationResult – VERIFIED', () => {
  it('„Hiteles, regisztrált kép” régió, a címén a fókusz; a magyarázat, a kép és a fotós hivatkozása, a lánc adatai (regisztrálva, blokk, tranzakció az Etherscanen)', () => {
    renderResult(verifiedResult());

    const region = screen.getByRole('region', { name: 'Hiteles, regisztrált kép' });
    const heading = within(region).getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Hiteles, regisztrált kép');
    expect(heading).toHaveFocus();
    expect(region).toHaveTextContent(
      'A fájl bitre megegyezik egy, a blokkláncon regisztrált képpel.',
    );
    expect(within(region).getByRole('link', { name: 'Őszi erdő ködben' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(within(region).getByRole('link', { name: 'Fotós Fanni profilja' })).toHaveAttribute(
      'href',
      `/users/${OWNER_ID}`,
    );
    expect(within(region).getByAltText('')).toHaveAttribute(
      'src',
      `/media/thumbnails/${PHOTO_ID}.webp`,
    );
    expect(valueOf('Regisztrálva')).toHaveTextContent('2026. 10. 04. 14:32');
    expect(valueOf('Blokk').textContent).toBe(`11${NBSP}820${NBSP}993`);
    const tx = within(valueOf('Tranzakció')).getByRole('link');
    expect(tx).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${TX_HASH}`);
    expect(tx).toHaveAccessibleName(
      '0x9c4e…1b7a – a tranzakció megnyitása az Etherscanen (új lapon)',
    );
    expect(within(region).getByRole('link', { name: 'Adatlap megnyitása' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(within(region).getByRole('button', { name: 'Másik kép ellenőrzése' })).toBeVisible();
  });

  it('rejtett (nem nyilvános) kép: a kép adatai nélkül, a tranzakció nem ismert – a regisztráció ideje viszont a láncról igen', () => {
    renderResult(
      verifiedResult({
        photo: null,
        registration: registration({ blockNumber: null, txHash: null, txUrl: null }),
      }),
    );

    const region = screen.getByRole('region', { name: 'Hiteles, regisztrált kép' });
    expect(region).toHaveTextContent('A kép adatai nem nyilvánosak');
    expect(within(region).queryByRole('link')).toBeNull();
    expect(valueOf('Regisztrálva')).toHaveTextContent('2026. 10. 04. 14:32');
    expect(valueOf('Tranzakció')).toHaveTextContent('A tranzakció adatai nem érhetők el');
    expect(screen.queryByText('Blokk', { selector: 'dt' })).toBeNull();
  });

  it('a lokális Hardhat-hálózaton a tranzakció hash-e link nélkül', () => {
    renderResult(verifiedResult({ registration: registration({ txUrl: null }) }));

    expect(within(valueOf('Tranzakció')).queryByRole('link')).toBeNull();
    expect(valueOf('Tranzakció')).toHaveTextContent('0x9c4e…1b7a');
  });

  it('hash alapján: a magyarázat a hash-ről szól, a gomb „Másik hash ellenőrzése”; a gomb az onReset-et hívja', async () => {
    const { user, onReset } = renderResult(verifiedResult({ dHash: null }), 'hash');

    expect(
      screen.getByText('Ezzel a SHA-256 hash-sel a blokkláncon regisztráltak egy képet.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Másik hash ellenőrzése' }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('nincs akadálymentességi hiba', async () => {
    const { container } = renderResult(verifiedResult());

    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('VerificationResult – SIMILAR', () => {
  it('„Hasonló regisztrált kép” régió: a magyarázat nem vádol, az eltérés bitben, az eredeti képe és adatlapja, a regisztráció adatai', async () => {
    const { container } = renderResult(similarResult());

    const region = screen.getByRole('region', { name: 'Hasonló regisztrált kép' });
    expect(within(region).getByRole('heading', { level: 2 })).toHaveFocus();
    expect(region).toHaveTextContent(
      'Nem azonos fájl, de egy regisztrált kép módosított – például átméretezett vagy újratömörített – változata lehet.',
    );
    expect(valueOf('Eltérés a vizuális ujjlenyomatban')).toHaveTextContent('3 / 64 bit');
    // A képernyőolvasónak nem „3 per 64 bit”: a sr-only szöveg mondja el
    expect(valueOf('Eltérés a vizuális ujjlenyomatban')).toHaveTextContent('a 64 bitből 3 tér el');
    expect(within(region).getByRole('link', { name: 'Őszi erdő ködben' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(within(region).getByRole('link', { name: 'Az eredeti adatlapja' })).toHaveAttribute(
      'href',
      `/photos/${PHOTO_ID}`,
    );
    expect(valueOf('Regisztrálva')).toHaveTextContent('2026. 10. 04. 14:32');
    expect(within(valueOf('Tranzakció')).getByRole('link')).toHaveAttribute(
      'href',
      `https://sepolia.etherscan.io/tx/${TX_HASH}`,
    );
    expect(within(region).getByRole('button', { name: 'Másik kép ellenőrzése' })).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('ha az eredeti közben nem nyilvános: a lánc adatai a kép hivatkozása nélkül', () => {
    renderResult(similarResult({ photo: null }));

    const region = screen.getByRole('region', { name: 'Hasonló regisztrált kép' });
    expect(region).toHaveTextContent('A kép adatai nem nyilvánosak');
    expect(within(region).queryByRole('link', { name: 'Az eredeti adatlapja' })).toBeNull();
    expect(valueOf('Eltérés a vizuális ujjlenyomatban')).toHaveTextContent('3 / 64 bit');
  });
});

describe('VerificationResult – NOT_FOUND', () => {
  it('„Nincs a nyilvántartásban” régió: semleges magyarázat, a vizsgált fájl hash-e rövidítve és másolhatóan, a dHash; hivatkozás nincs', async () => {
    const { container } = renderResult(notFoundResult());

    const region = screen.getByRole('region', { name: 'Nincs a nyilvántartásban' });
    expect(within(region).getByRole('heading', { level: 2 })).toHaveFocus();
    expect(region).toHaveTextContent(
      'Sem azonos, sem hasonló regisztrált képet nem találtunk. Ez nem jelenti, hogy a kép hamis – csak azt, hogy nem a PhotoChainen regisztrálták.',
    );
    expect(valueOf('A vizsgált fájl SHA-256 hash-e')).toHaveTextContent('3be1f07c…7d10c58e');
    expect(
      within(valueOf('A vizsgált fájl SHA-256 hash-e')).getByRole('button', {
        name: 'A teljes SHA-256 másolása',
      }),
    ).toBeInTheDocument();
    expect(valueOf('dHash')).toHaveTextContent(UNKNOWN_DHASH);
    expect(within(region).queryByRole('link')).toBeNull();
    expect(within(region).getByRole('button', { name: 'Másik kép ellenőrzése' })).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('a teljes hash a vágólapra másolható', async () => {
    const { user } = renderResult(notFoundResult());

    await user.click(screen.getByRole('button', { name: 'A teljes SHA-256 másolása' }));

    await expect(navigator.clipboard.readText()).resolves.toBe(UNKNOWN_SHA256);
    expect(screen.getByRole('status')).toHaveTextContent('Az SHA-256 a vágólapra másolva.');
  });

  it('hash alapján: elmondja, hogy hasonló képet csak a kép feltöltésével keres; dHash nincs', () => {
    renderResult(notFoundResult({ dHash: null }), 'hash');

    const region = screen.getByRole('region', { name: 'Nincs a nyilvántartásban' });
    expect(region).toHaveTextContent('Hasonló képet csak a kép feltöltésével keresünk');
    expect(valueOf('A megadott SHA-256 hash')).toHaveTextContent('3be1f07c…7d10c58e');
    expect(screen.queryByText('dHash', { selector: 'dt' })).toBeNull();
    expect(within(region).getByRole('button', { name: 'Másik hash ellenőrzése' })).toBeVisible();
  });
});
