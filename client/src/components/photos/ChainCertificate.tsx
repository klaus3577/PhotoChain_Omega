// A blokklánc-tanúsítvány panelje az adatlapon (L17 stílusútmutató – „Blokklánc-tanúsítvány”): a
// hitelesség ellenőrizhető, nem csak állított. A regisztrált képnél: hálózat, a regisztráció ideje, a
// két ujjlenyomat (SHA-256 – rövidítve, teljes értékkel másolható –, dHash), blokk, tranzakció és
// szerződés – az utóbbi kettő az Etherscanen megnyitható (új lapon; a link neve azt is megmondja, mit
// nyit meg). A nem regisztrált kép (csak a tulajdonos és az admin látja) állapota ugyanebben a dobozban
// jelenik meg, a bizalom vizuális nyelvének színeivel – a zöld kizárólag a blokkláncon igazolt
// hitelességé –; a címsora a címsorok között navigálva is megmondja, hogy ez a tanúsítvány doboza. A
// „Mit jelent ez?” hivatkozás az ellenőrző oldal közérthető magyarázatához visz (L24).
import { useId } from 'react';
import { Link } from 'react-router';

import type { PhotoCertificate, PhotoDetail } from '../../api/photos.api';
import { cx } from '../../lib/cx';
import { formatDateTime } from '../../lib/format';
import { HOW_IT_WORKS_PATH } from '../../verify/anchors';
import { DefinitionRow as Row } from '../ui/DefinitionRow';
import { PANEL_STATES } from './certificatePanels';
import { HexValue } from './ExplorerLink';
import { Sha256Row, TransactionRows } from './proofRows';

/** A hálózatok neve (a szerver csak ezt a kettőt engedi – server/src/config/env.ts) */
const NETWORK_NAMES: ReadonlyMap<number, string> = new Map([
  [11_155_111, 'Ethereum Sepolia (teszthálózat)'],
  [31_337, 'Lokális Hardhat-hálózat (fejlesztői)'],
]);

/** A lánc adatai: hálózat és idő (az ujjlenyomatok előtt), blokk, tranzakció és szerződés (utánuk). */
function ChainRows({
  certificate,
  part,
}: {
  certificate: PhotoCertificate;
  part: 'when' | 'where';
}) {
  if (part === 'when') {
    return (
      <>
        <Row term="Hálózat">
          {NETWORK_NAMES.get(certificate.chainId) ?? `Ismeretlen hálózat (${certificate.chainId})`}
        </Row>
        <Row term="Regisztrálva">{formatDateTime(certificate.registeredAt)}</Row>
      </>
    );
  }
  return (
    <>
      <TransactionRows proof={certificate} />
      <Row term="Szerződés">
        <HexValue
          value={certificate.contractAddress}
          url={certificate.contractUrl}
          target="a szerződés"
        />
      </Row>
    </>
  );
}

interface ChainCertificateProps {
  photo: Pick<PhotoDetail, 'status' | 'sha256' | 'dHash' | 'certificate'>;
}

export function ChainCertificate({ photo }: ChainCertificateProps) {
  const headingId = useId();
  const state = PANEL_STATES[photo.status];
  const Icon = state.icon;
  // A tanúsítvány csak a regisztrált képé (a szerver is csak annak adja)
  const certificate = photo.status === 'REGISTERED' ? photo.certificate : null;

  return (
    <section
      aria-labelledby={headingId}
      className={cx('overflow-hidden rounded-lg border bg-canvas', state.border)}
    >
      <header className={cx('flex items-center gap-2 border-b px-4 py-3', state.header)}>
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <h2 id={headingId} className="font-semibold">
          {photo.status !== 'REGISTERED' && (
            <>
              <span className="sr-only">Blokklánc-tanúsítvány:</span>{' '}
            </>
          )}
          {state.title}
        </h2>
      </header>
      <dl className="divide-y divide-line px-4 text-sm">
        {certificate && <ChainRows certificate={certificate} part="when" />}
        <Sha256Row sha256={photo.sha256} />
        <Row term="dHash">
          <span className="font-mono">{photo.dHash}</span>
        </Row>
        {certificate && <ChainRows certificate={certificate} part="where" />}
      </dl>
      <p className="border-t border-line bg-surface px-4 py-3 text-xs leading-5 text-fg-muted">
        {state.note}{' '}
        {/* A működés közérthető magyarázata az ellenőrző oldalon (L24; L17 drótváz, 5. jegyzet). A név
            megmondja, hogy másik oldalra visz; a látható szöveg a név eleje (WCAG 2.5.3) – egyetlen
            szövegcsomópontban, mint az adatlap fotós-hivatkozásánál */}
        <Link
          to={HOW_IT_WORKS_PATH}
          className="whitespace-nowrap text-fg underline underline-offset-2 hover:text-primary"
        >
          <span aria-hidden="true">Mit jelent ez?</span>
          <span className="sr-only">Mit jelent ez? – magyarázat az Ellenőrzés oldalon</span>
        </Link>
      </p>
    </section>
  );
}
