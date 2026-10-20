// A letöltött fájl neve és a Content-Disposition fejléc (RFC 6266): a kép címéből készül, az
// operációs rendszerek által tiltott és a láthatatlan karakterek nélkül, ékezetes alakban
// (filename*) és ékezet nélküli tartalékkal (filename) a régi kliensekhez. A fájl folyamként megy
// a kliensnek; ha a kliens közben bontja a kapcsolatot, az nem szerverhiba.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { finished, Readable, Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { attachmentDisposition, downloadFileName, sendStream } from './download.js';

const FALLBACK = 'photochain-9a1b2c3d';
const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);

describe('downloadFileName', () => {
  it('a kép címe és a kiterjesztés – az ékezetek megmaradnak', () => {
    expect(downloadFileName('Naplemente a Balatonnál', FALLBACK, 'jpg')).toBe(
      'Naplemente a Balatonnál.jpg',
    );
  });

  it('a fájlnévben tiltott karakterek (/ \\ : * ? " < > |) helyén aláhúzás áll', () => {
    expect(downloadFileName('Út/ház\\kert: "2026" <*?> |vége|', FALLBACK, 'png')).toBe(
      'Út_ház_kert_ _2026_ ____ _vége_.png',
    );
  });

  it('a vezérlő- és a láthatatlan formázó karakterek kimaradnak, a szóközök összevonódnak', () => {
    // nulla szélességű szóköz, balról jobbra jel, jobbról balra felülírás, tabulátor
    const title = `Haj${cp(0x200b)}nal${cp(0x200e)}  fény${cp(0x202e)}gpj.exe${cp(0x09)}x`;

    expect(downloadFileName(title, FALLBACK, 'jpg')).toBe('Hajnal fénygpj.exe x.jpg');
  });

  it('a kezdő és záró pont, illetve szóköz kimarad (a Windows nem kezeli jól)', () => {
    expect(downloadFileName('  ..Hajnal fény..  ', FALLBACK, 'jpg')).toBe('Hajnal fény.jpg');
  });

  it('az összetett (NFD) ékezetes betűket egyetlen karakterré vonja össze (NFC)', () => {
    expect(downloadFileName(`Balatonna${cp(0x301)}l`, FALLBACK, 'jpg')).toBe('Balatonnál.jpg');
  });

  it('legfeljebb 100 karakter (kódpont) a kiterjesztés előtt – az emoji sem törik ketté', () => {
    expect(downloadFileName('á'.repeat(150), FALLBACK, 'jpg')).toBe(`${'á'.repeat(100)}.jpg`);
    const emoji = cp(0x1f305);
    expect(downloadFileName(`${'a'.repeat(99)}${emoji}b`, FALLBACK, 'jpg')).toBe(
      `${'a'.repeat(99)}${emoji}.jpg`,
    );
  });

  it('ha a címből semmi nem marad, a tartalék név', () => {
    for (const title of ['', '   ', '...', cp(0x200b, 0x200b)]) {
      expect(downloadFileName(title, FALLBACK, 'webp')).toBe(`${FALLBACK}.webp`);
    }
  });

  it('a Windows foglalt eszköznevei (CON, NUL, COM1…) elé aláhúzás kerül', () => {
    for (const name of ['CON', 'nul', 'Aux', 'PRN', 'COM1', 'lpt9']) {
      expect(downloadFileName(name, FALLBACK, 'jpg')).toBe(`_${name}.jpg`);
    }
    // A hosszabb, csak így kezdődő név nem foglalt
    expect(downloadFileName('Console', FALLBACK, 'jpg')).toBe('Console.jpg');
  });

  it('az eszköznév után álló pont, szóköz vagy felső indexes számjegy sem segít (NUL.tar, AUX .x, COM¹)', () => {
    expect(downloadFileName('NUL.tar', FALLBACK, 'jpg')).toBe('_NUL.tar.jpg');
    expect(downloadFileName('AUX .x', FALLBACK, 'jpg')).toBe('_AUX .x.jpg');
    expect(downloadFileName(`COM${cp(0xb9)}`, FALLBACK, 'jpg')).toBe(`_COM${cp(0xb9)}.jpg`);
    expect(downloadFileName('CONTENT.final', FALLBACK, 'jpg')).toBe('CONTENT.final.jpg');
  });

  it('a párosítatlan UTF-16 helyettesítő karakter helyén cserekarakter áll (a fejléc így sem hibás)', () => {
    const name = downloadFileName(`Haj${String.fromCharCode(0xd800)}nal`, FALLBACK, 'jpg');

    expect(name).toBe(`Haj${cp(0xfffd)}nal.jpg`);
    expect(() => attachmentDisposition(name)).not.toThrow();
  });
});

describe('attachmentDisposition', () => {
  it('ékezetes név: ékezet nélküli filename és UTF-8 kódolású filename* (RFC 6266, RFC 8187)', () => {
    expect(attachmentDisposition('Naplemente a Balatonnál.jpg')).toBe(
      `attachment; filename="Naplemente a Balatonnal.jpg"; filename*=UTF-8''Naplemente%20a%20Balatonn%C3%A1l.jpg`,
    );
    // A hosszú ő és ű is ékezet nélküli betűvé válik (nem kérdőjellé)
    expect(attachmentDisposition('Őszi erdő, tűz.png')).toBe(
      `attachment; filename="Oszi erdo, tuz.png"; filename*=UTF-8''%C5%90szi%20erd%C5%91%2C%20t%C5%B1z.png`,
    );
  });

  it('a nem latin betűs és emoji karakterek helyén a tartalékban aláhúzás áll', () => {
    expect(attachmentDisposition(`${cp(0x1f305)} Hajnal.jpg`)).toMatch(
      /^attachment; filename="_ Hajnal\.jpg"; filename\*=UTF-8''/,
    );
  });

  // Az RFC 6266 szerint a szóköz és különleges karakter nélküli név idézőjel nélkül (tokenként) is jó
  it('csupa ASCII névnél elég a filename', () => {
    expect(attachmentDisposition('Hajnal.jpg')).toBe('attachment; filename=Hajnal.jpg');
  });

  it('az ékezet nélküli tartalék sem lehet Windows-eszköznév (Cón → Con)', () => {
    expect(attachmentDisposition('Cón.jpg')).toBe(
      `attachment; filename=_Con.jpg; filename*=UTF-8''C%C3%B3n.jpg`,
    );
  });

  // Egy hibásan működő kliens a %-kódolást visszafejtve „../x.jpg”-t menthetne
  it('a tartalék névben nincs %-jel: a %XX alakú cím csak a kódolt filename*-ban marad meg', () => {
    expect(attachmentDisposition('%2e%2e%2fx.jpg')).toBe(
      `attachment; filename=_2e_2e_2fx.jpg; filename*=UTF-8''%252e%252e%252fx.jpg`,
    );
  });
});

describe('sendStream', () => {
  /** Írható cél, amely a kapott bájtokat gyűjti; az első darab után „bonthatja a kapcsolatot”. */
  function collector({ closeAfterFirstChunk = false } = {}) {
    const chunks: Buffer[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk);
        if (closeAfterFirstChunk) destination.destroy();
        done();
      },
    });
    return { destination, received: () => Buffer.concat(chunks) };
  }

  it('a folyam teljes tartalmát a célba írja', async () => {
    const { destination, received } = collector();

    await sendStream(Readable.from([Buffer.from('kép'), Buffer.from('adat')]), destination);

    expect(received().toString()).toBe('képadat');
  });

  it('ha a kliens közben bontja a kapcsolatot, az nem hiba (nincs mit válaszolni) – a fájl lezárul', async () => {
    const { destination } = collector({ closeAfterFirstChunk: true });
    const source = Readable.from(Array.from({ length: 100 }, () => Buffer.alloc(1024)));

    await expect(sendStream(source, destination)).resolves.toBeUndefined();
    expect(source.destroyed).toBe(true);
  });

  it('ha a kliens már a küldés előtt bontotta a kapcsolatot: nem hiba, és a fájl lezárul', async () => {
    const { destination } = collector();
    destination.destroy();
    const source = Readable.from([Buffer.from('képadat')]);

    await expect(sendStream(source, destination)).resolves.toBeUndefined();
    expect(source.destroyed).toBe(true);
  });

  it('az olvasási hiba továbbmegy (a hibakezelő naplózza)', async () => {
    const failure = new Error('olvasási hiba');
    const source = new Readable({
      read() {
        this.destroy(failure);
      },
    });

    await expect(sendStream(source, collector().destination)).rejects.toBe(failure);
  });

  it('ha a kliens a fájl végigolvasása után, de a válasz lezárása előtt bont: az sem hiba', async () => {
    // A cél az adatot átveszi, de a lezárás előtt „bontja a kapcsolatot” (a forrás már véget ért)
    const destination = new Writable({
      write(_chunk, _encoding, done) {
        setImmediate(() => destination.destroy());
        void done;
      },
    });
    const source = Readable.from([Buffer.from('kép')]);

    await expect(sendStream(source, destination)).resolves.toBeUndefined();
    expect(source.readableEnded).toBe(true);
  });

  it('a valódi HTTP-válaszon sem jelez hamis memóriaszivárgást: a pipeline saját figyelői mellett a kérésnaplóé és a letöltési korláté is ott van', async () => {
    const warnings: Error[] = [];
    const onWarning = (warning: Error) => {
      if (warning.name === 'MaxListenersExceededWarning') warnings.push(warning);
    };
    const server = createServer((_req, res) => {
      // Mint az alkalmazásban: a kérésnapló (pino-http) és a letöltési korlát (finished) figyelői
      res.on('close', () => undefined);
      finished(res, () => undefined);
      void sendStream(Readable.from([Buffer.from('kép'), Buffer.from('adat')]), res);
    });
    process.on('warning', onWarning);
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/`);

      expect(await response.text()).toBe('képadat');
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('warning', onWarning);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    expect(warnings).toEqual([]);
  });

  it('a korlátlanra (0) állított figyelőhatárt nem szűkíti', async () => {
    const { destination } = collector();
    destination.setMaxListeners(0);

    await sendStream(Readable.from([Buffer.from('kép')]), destination);

    expect(destination.getMaxListeners()).toBe(0);
  });

  it('a forrás idő előtti, hiba nélküli lezárása (pl. kívülről bezárt fájl) hiba – a csonka letöltés nem marad észrevétlen', async () => {
    let sent = false;
    const source = new Readable({
      read() {
        if (sent) {
          this.destroy();
          return;
        }
        sent = true;
        this.push(Buffer.from('fél kép'));
      },
    });

    await expect(sendStream(source, collector().destination)).rejects.toMatchObject({
      code: 'ERR_STREAM_PREMATURE_CLOSE',
    });
  });
});
