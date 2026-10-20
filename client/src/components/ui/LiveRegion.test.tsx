// Az egyetlen, állandó élő régió (WCAG 4.1.3): a bejelentés ide kerül, és az azonos szöveg
// ismételt bejelentése is új bejelentés (új szövegcsomópont).
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './Dialog';
import { LiveRegionProvider } from './LiveRegion';
import { LIVE_MESSAGE_TTL_MS, type AnnounceTone } from './liveRegionContext';
import { useAnnounce, useFlushPendingAnnouncement } from './useAnnounce';

function Announcer({ message }: { message: string }) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce(message)}>
      Bejelentés
    </button>
  );
}

describe('LiveRegionProvider / useAnnounce', () => {
  it('a bejelentés az élő régióba (role="status") kerül; kezdetben üres', async () => {
    render(
      <LiveRegionProvider>
        <Announcer message="Mentve." />
      </LiveRegionProvider>,
    );
    const region = screen.getByRole('status');

    expect(region).toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole('button', { name: 'Bejelentés' }));
    expect(region).toHaveTextContent('Mentve.');
  });

  it('ugyanaz az üzenet újra bejelentve új szövegcsomópont (a képernyőolvasó újra felolvassa)', async () => {
    render(
      <LiveRegionProvider>
        <Announcer message="Az API elérhető." />
      </LiveRegionProvider>,
    );
    const button = screen.getByRole('button', { name: 'Bejelentés' });

    await userEvent.click(button);
    const first = screen.getByRole('status').firstElementChild;
    await userEvent.click(button);
    const second = screen.getByRole('status').firstElementChild;

    expect(second).toHaveTextContent('Az API elérhető.');
    expect(second).not.toBe(first);
  });

  it('a bejelentés néhány másodperc múlva kiürül – nem marad elavult üzenet a régióban', () => {
    vi.useFakeTimers();
    try {
      render(
        <LiveRegionProvider>
          <Announcer message="Mentve." />
        </LiveRegionProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Bejelentés' }));
      expect(screen.getByRole('status')).toHaveTextContent('Mentve.');

      act(() => vi.advanceTimersByTime(LIVE_MESSAGE_TTL_MS - 1));
      expect(screen.getByRole('status')).toHaveTextContent('Mentve.');
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it('az oldalváltás utánra kért bejelentés csak akkor hangzik el, amikor a layout kiküldi (a fókusz áthelyezése után), és csak egyszer', async () => {
    render(
      <LiveRegionProvider>
        <AfterNavigationAnnouncer />
      </LiveRegionProvider>,
    );
    const region = screen.getByRole('status');

    await userEvent.click(screen.getByRole('button', { name: 'Bejelentés később' }));
    expect(region).toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole('button', { name: 'Oldalváltás' }));
    const announced = region.firstElementChild;
    expect(region).toHaveTextContent('Bejelentkeztél.');
    await userEvent.click(screen.getByRole('button', { name: 'Oldalváltás' }));

    expect(region.firstElementChild).toBe(announced);
  });

  it('a látható értesítés (visible) ugyanabban az élő régióban jelenik meg feketén; rámutatáskor nem tűnik el, nincs benne kezelőelem; az egyszerű bejelentés rejtett marad', () => {
    vi.useFakeTimers();
    try {
      render(
        <LiveRegionProvider>
          <Announcer message="Kategóriák betöltése…" />
          <VisibleAnnouncer message="A kép adatai frissültek." />
        </LiveRegionProvider>,
      );
      const region = screen.getByRole('status');
      fireEvent.click(screen.getByRole('button', { name: 'Bejelentés' }));
      expect(region).toHaveTextContent('Kategóriák betöltése…');
      expect(region).toHaveClass('sr-only');

      fireEvent.click(screen.getByRole('button', { name: 'Értesítés' }));

      expect(region).toHaveTextContent('A kép adatai frissültek.');
      expect(region).not.toHaveClass('sr-only');
      expect(region.querySelector('button, a, input')).toBeNull();
      expect(LIVE_MESSAGE_TTL_MS).toBeGreaterThanOrEqual(5000);
      // Rámutatáskor az idő megáll, elvételkor újra a teljes idő jár
      fireEvent.mouseEnter(region);
      act(() => vi.advanceTimersByTime(LIVE_MESSAGE_TTL_MS + 1000));
      expect(region).toHaveTextContent('A kép adatai frissültek.');
      fireEvent.mouseLeave(region);
      act(() => vi.advanceTimersByTime(LIVE_MESSAGE_TTL_MS - 1));
      expect(region).toHaveTextContent('A kép adatai frissültek.');
      act(() => vi.advanceTimersByTime(1));
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveClass('sr-only');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a látható értesítés az oldalváltás utánra is kérhető', async () => {
    render(
      <LiveRegionProvider>
        <AfterNavigationAnnouncer visible />
      </LiveRegionProvider>,
    );
    const region = screen.getByRole('status');

    await userEvent.click(screen.getByRole('button', { name: 'Bejelentés később' }));
    expect(region).toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole('button', { name: 'Oldalváltás' }));

    expect(region).toHaveTextContent('Bejelentkeztél.');
    expect(region).not.toHaveClass('sr-only');
  });

  it('a látható értesítés tónusa (data-tone): alapból siker; figyelmeztetés és tájékoztatás is kérhető; a rejtett bejelentésnek nincs tónusa', () => {
    render(
      <LiveRegionProvider>
        <Announcer message="Kategóriák betöltése…" />
        <VisibleAnnouncer message="Mentve." />
        <VisibleAnnouncer message="Nem sikerült." tone="warning" label="Figyelmeztetés" />
        <VisibleAnnouncer message="Kikerült a listából." tone="info" label="Tájékoztatás" />
      </LiveRegionProvider>,
    );
    const region = screen.getByRole('status');

    fireEvent.click(screen.getByRole('button', { name: 'Értesítés' }));
    expect(region).toHaveAttribute('data-tone', 'success');
    fireEvent.click(screen.getByRole('button', { name: 'Figyelmeztetés' }));
    expect(region).toHaveTextContent('Nem sikerült.');
    expect(region).toHaveAttribute('data-tone', 'warning');
    fireEvent.click(screen.getByRole('button', { name: 'Tájékoztatás' }));
    expect(region).toHaveAttribute('data-tone', 'info');
    fireEvent.click(screen.getByRole('button', { name: 'Bejelentés' }));
    expect(region).not.toHaveAttribute('data-tone');
    expect(region).toHaveClass('sr-only');
  });

  it('az Escape eltünteti a látható értesítést (ha eltakarna valamit – WCAG 2.4.11); a rejtett bejelentést nem érinti', () => {
    render(
      <LiveRegionProvider>
        <Announcer message="Kategóriák betöltése…" />
        <VisibleAnnouncer message="Mentve." />
      </LiveRegionProvider>,
    );
    const region = screen.getByRole('status');

    fireEvent.click(screen.getByRole('button', { name: 'Értesítés' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveClass('sr-only');

    fireEvent.click(screen.getByRole('button', { name: 'Bejelentés' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(region).toHaveTextContent('Kategóriák betöltése…');
  });

  it('a látható értesítés után érkező rejtett bejelentés átveszi az egyetlen üzenethelyet; a rámutatás szünete nem ragad rá: a rejtett üzenet is kiürül', () => {
    vi.useFakeTimers();
    try {
      render(
        <LiveRegionProvider>
          <Announcer message="Kategóriák betöltése…" />
          <VisibleAnnouncer message="Mentve." />
        </LiveRegionProvider>,
      );
      const region = screen.getByRole('status');
      fireEvent.click(screen.getByRole('button', { name: 'Értesítés' }));
      fireEvent.mouseEnter(region);

      fireEvent.click(screen.getByRole('button', { name: 'Bejelentés' }));

      expect(region).toHaveTextContent('Kategóriák betöltése…');
      expect(region).toHaveClass('sr-only');
      act(() => vi.advanceTimersByTime(LIVE_MESSAGE_TTL_MS));
      expect(region).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it('amíg modális párbeszédablak van nyitva, a bejelentés vár (a háttér nem elérhető: nem hangzana el, nem látszana); az ablak bezárása után hangzik el – a várakozó üzenetek egybefűzve, a legerősebb tónussal', () => {
    render(
      <LiveRegionProvider>
        <VisibleAnnouncer message="Mentve." />
        <VisibleAnnouncer message="Nem sikerült." tone="warning" label="Figyelmeztetés" />
        <DialogHost />
      </LiveRegionProvider>,
    );
    const region = screen.getByRole('status');
    expect(screen.getByRole('dialog')).toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: 'Értesítés' }));
    fireEvent.click(screen.getByRole('button', { name: 'Figyelmeztetés' }));
    expect(region).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'Mégse' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(region).toHaveTextContent('Mentve. Nem sikerült.');
    expect(region).toHaveAttribute('data-tone', 'warning');
    expect(region).not.toHaveClass('sr-only');
  });

  it('provider nélkül a hook hibát dob – a programhiba nem marad rejtve', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Announcer message="x" />)).toThrow(/LiveRegionProvider/);
    expect(() => render(<AfterNavigationAnnouncer />)).toThrow(/LiveRegionProvider/);
  });
});

function VisibleAnnouncer({
  message,
  tone,
  label = 'Értesítés',
}: {
  message: string;
  tone?: AnnounceTone;
  label?: string;
}) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce(message, { visible: true, tone })}>
      {label}
    </button>
  );
}

/** Nyitott modális ablak, amelyet a szülő tüntet el (mint a vezérlőpult párbeszédablakait) */
function DialogHost() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Dialog labelledBy="ablak-cim" onClose={() => setOpen(false)}>
      <h2 id="ablak-cim">Ablak</h2>
      <button type="button" onClick={() => setOpen(false)}>
        Mégse
      </button>
    </Dialog>
  );
}

function AfterNavigationAnnouncer({ visible = false }: { visible?: boolean }) {
  const announce = useAnnounce();
  const flushPendingAnnouncement = useFlushPendingAnnouncement();
  return (
    <>
      <button
        type="button"
        onClick={() => announce('Bejelentkeztél.', { afterNavigation: true, visible })}
      >
        Bejelentés később
      </button>
      <button type="button" onClick={flushPendingAnnouncement}>
        Oldalváltás
      </button>
    </>
  );
}
