// A blokklánc-tanúsítvány panelje az adatlapon (L17 stílusútmutató – „Blokklánc-tanúsítvány”): a
// hitelesség ellenőrizhető, nem csak állított – hálózat, a regisztráció ideje, az ujjlenyomatok
// (SHA-256 – rövidítve, teljes értékkel másolható –, dHash), blokk, tranzakció és szerződés (az
// Etherscanen megnyitható). A nem regisztrált kép (csak a tulajdonos és az admin látja) állapota
// ugyanebben a dobozban, a bizalom vizuális nyelvének színeivel jelenik meg.
import { act, render, screen, within } from '@testing-library/react';
import userEvent, { type Options } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PhotoDetail } from '../../api/photos.api';
import { axeViolations } from '../../test/axe';
import { CONTRACT, certificate, photoDetail, SHA256, TX_HASH } from '../../test/photos';
import { LiveRegionProvider } from '../ui/LiveRegion';
import { ChainCertificate } from './ChainCertificate';

const NBSP = String.fromCharCode(0xa0);

afterEach(() => {
  vi.useRealTimers();
});

function renderCertificate(overrides: Record<string, unknown> = {}, options: Options = {}) {
  const photo = photoDetail(overrides) as PhotoDetail;
  const user = userEvent.setup(options);
  const view = render(
    <MemoryRouter>
      <LiveRegionProvider>
        <ChainCertificate photo={photo} />
      </LiveRegionProvider>
    </MemoryRouter>,
  );
  return { ...view, user };
}

/** Az adatlista egy sorának értéke (a dt-hez tartozó dd). */
const valueOf = (term: string) => screen.getByText(term, { selector: 'dt' }).nextElementSibling!;

describe('ChainCertificate – regisztrált kép', () => {
  it('„Hitelesítve a blokkláncon” régió: hálózat, a regisztráció ideje, blokk', () => {
    renderCertificate();

    const region = screen.getByRole('region', { name: 'Hitelesítve a blokkláncon' });
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Hitelesítve a blokkláncon',
    );
    expect(valueOf('Hálózat')).toHaveTextContent('Ethereum Sepolia (teszthálózat)');
    expect(valueOf('Regisztrálva')).toHaveTextContent('2026. 10. 04. 14:32');
    expect(valueOf('Blokk').textContent).toBe(`11${NBSP}820${NBSP}993`);
    expect(region).toHaveTextContent('A láncra csak az ujjlenyomat kerül, maga a kép nem.');
  });

  it('az ujjlenyomatok: a SHA-256 rövidítve, a dHash teljesen', () => {
    renderCertificate();

    expect(valueOf('SHA-256')).toHaveTextContent('5a1f9c3e…8b20d47e');
    expect(valueOf('dHash')).toHaveTextContent('f0e4c8d0b0a09080');
  });

  it('a tranzakció és a szerződés az Etherscanen nyílik meg, új lapon (ezt a név is jelzi)', () => {
    renderCertificate();

    const tx = within(valueOf('Tranzakció') as HTMLElement).getByRole('link');
    expect(tx).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${TX_HASH}`);
    expect(tx).toHaveAttribute('target', '_blank');
    expect(tx).toHaveAttribute('rel', 'noopener noreferrer');
    // A név a látható szöveggel kezdődik, és megmondja, mit nyit meg (a hivatkozáslistában is érthető)
    expect(tx).toHaveAccessibleName(
      '0x9c4e…1b7a – a tranzakció megnyitása az Etherscanen (új lapon)',
    );
    const contract = within(valueOf('Szerződés') as HTMLElement).getByRole('link');
    expect(contract).toHaveAttribute('href', `https://sepolia.etherscan.io/address/${CONTRACT}`);
    expect(contract).toHaveAttribute('rel', 'noopener noreferrer');
    expect(contract).toHaveAccessibleName(
      '0x6eF6…97C7 – a szerződés megnyitása az Etherscanen (új lapon)',
    );
  });

  it('a teljes SHA-256 a vágólapra másolható; a sikert az élő régió jelenti be, és a gomb mellett is látszik', async () => {
    const { user } = renderCertificate();
    const button = screen.getByRole('button', { name: 'A teljes SHA-256 másolása' });

    await user.click(button);

    await expect(navigator.clipboard.readText()).resolves.toBe(SHA256);
    expect(screen.getByRole('status')).toHaveTextContent('Az SHA-256 a vágólapra másolva.');
    // A látó felhasználónak is van visszajelzés; a képernyőolvasónak az élő régió szól, ez rejtett
    const copied = screen.getByText('Másolva');
    expect(copied).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveAccessibleName('A teljes SHA-256 másolása');
  });

  it('a „Másolva” legalább 5 másodpercig látszik, rámutatáskor és fókusznál tovább (L17: 2.2.1)', async () => {
    // A hamis óra a valós idővel is halad (a Testing Library várakozásaihoz kell): az ellenőrzések
    // időtartalékkal (4 s / 5,2 s) készülnek, így a terhelt futás sem billenti át őket
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderCertificate({}, { advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const button = screen.getByRole('button', { name: 'A teljes SHA-256 másolása' });

    await user.click(button);
    await user.unhover(button);
    await user.tab();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByText('Másolva')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.queryByText('Másolva')).toBeNull();

    // Amíg a gombon a mutató vagy a fókusz van, a visszajelzés nem tűnik el
    await user.click(button);
    await screen.findByText('Másolva');
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByText('Másolva')).toBeInTheDocument();
    await user.unhover(button);
    expect(screen.getByText('Másolva')).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByText('Másolva')).toBeNull();
  });

  it('ha a másolás nem sikerül (pl. http-n nincs vágólap), bejelenti, és a teljes érték egy mezőből kimásolható', async () => {
    const { user } = renderCertificate();
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => Promise.reject(new Error('NotAllowedError')),
    });

    await user.click(screen.getByRole('button', { name: 'A teljes SHA-256 másolása' }));

    expect(
      await screen.findByText(
        'A másolás nem sikerült – a teljes érték a gomb utáni mezőből kimásolható.',
      ),
    ).toBeInTheDocument();
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'A teljes SHA-256' });
    expect(field).toHaveValue(SHA256);
    expect(field).toHaveAttribute('readonly');
    // A mező a gomb után következik: Tab, és a teljes érték kijelölve
    await user.tab();
    expect(field).toHaveFocus();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, SHA256.length]);
  });

  it('a lokális Hardhat-hálózaton nincs nyilvános böngésző: a hash-ek link nélkül', () => {
    renderCertificate({
      certificate: certificate({ chainId: 31_337, txUrl: null, contractUrl: null }),
    });

    expect(valueOf('Hálózat')).toHaveTextContent('Lokális Hardhat-hálózat (fejlesztői)');
    expect(within(valueOf('Tranzakció') as HTMLElement).queryByRole('link')).toBeNull();
    expect(valueOf('Tranzakció')).toHaveTextContent('0x9c4e…1b7a');
    expect(within(valueOf('Szerződés') as HTMLElement).queryByRole('link')).toBeNull();
  });

  it('ismeretlen hálózatnál az azonosítóját írja ki', () => {
    renderCertificate({
      certificate: certificate({ chainId: 1, txUrl: null, contractUrl: null }),
    });

    expect(valueOf('Hálózat')).toHaveTextContent('Ismeretlen hálózat (1)');
  });

  it('ha a tranzakció adatai nem ismertek (elveszett nyugta), ezt írja ki; blokkszám nincs', () => {
    renderCertificate({
      certificate: certificate({ blockNumber: null, txHash: null, txUrl: null }),
    });

    expect(valueOf('Tranzakció')).toHaveTextContent('A tranzakció adatai nem érhetők el');
    expect(screen.queryByText('Blokk', { selector: 'dt' })).toBeNull();
  });

  it('a „Mit jelent ez?” hivatkozás az ellenőrző oldal magyarázatához visz (L24); a neve megmondja, hogy másik oldalra', () => {
    renderCertificate();

    const link = screen.getByRole('link', {
      name: 'Mit jelent ez? – magyarázat az Ellenőrzés oldalon',
    });
    expect(link).toHaveAttribute('href', '/verify#hogyan-mukodik');
    // A látható szöveg a név eleje (WCAG 2.5.3)
    expect(link).toHaveTextContent(/^Mit jelent ez\?/);
  });

  it('nincs akadálymentességi hiba', async () => {
    const { container } = renderCertificate();

    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('ChainCertificate – nem regisztrált kép (a tulajdonosnak és az adminnak)', () => {
  it.each([
    ['PENDING_CHAIN', 'Regisztrálás folyamatban'],
    ['CHAIN_FAILED', 'Sikertelen regisztráció'],
    ['HIDDEN', 'Elrejtve'],
  ])('%s állapotban a doboz címe: „%s”; tanúsítványadat nincs', async (status, title) => {
    const { container } = renderCertificate({ status, certificate: null });

    // A címsor a címsorok között navigálva is megmondja, mihez tartozik az állapot
    const region = screen.getByRole('region', { name: `Blokklánc-tanúsítvány: ${title}` });
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent(title);
    expect(screen.queryByText('Tranzakció', { selector: 'dt' })).toBeNull();
    // Az ujjlenyomatok a feltöltéskor kiszámolódtak – a lánctól függetlenül ismertek
    expect(valueOf('SHA-256')).toHaveTextContent('5a1f9c3e…8b20d47e');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('a nem regisztrált képnél akkor sem mutat tanúsítványadatot, ha a válaszban mégis van', () => {
    renderCertificate({ status: 'PENDING_CHAIN', certificate: certificate() });

    expect(screen.queryByText('Hálózat', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText('Tranzakció', { selector: 'dt' })).toBeNull();
    // Etherscan-hivatkozás nincs; a magyarázat hivatkozása minden állapotban megvan
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /^Mit jelent ez\?/ })).toBeInTheDocument();
  });
});
