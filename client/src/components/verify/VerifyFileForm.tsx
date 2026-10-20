// Ellenőrzés képpel (L24; L17 drótváz „Ellenőrzés”, 1. és 6. jegyzet): fogadóterület húzással és
// tallózással (FileDropZone – a feltöltésé), a fájl típusa és mérete a küldés előtt, a felbontása az
// előnézet betöltése után ellenőrzött (useImagePicker – a rövidebb oldal már 100 képponttól); a kérés
// XMLHttpRequest-tel megy, haladással és megszakítással – amíg a törzs el nem ment (verify.api.ts). A
// hibák a helyükre kerülnek: a kép hibája (túl kicsi, nem támogatott, egyszínű) a fogadóterülethez – a
// fókusz a fájlválasztóra, ha az űrlapban volt (különben rejtett riasztás) –, minden más riasztásként a
// gomb mellé (a gomb leírásaként is, a várakozás idejével: a korlátozás és a lánc elérhetetlensége
// Retry-After-rel jön). A fókusz nem vész el: az eltűnő Mégse gombról az állapotsorra vagy a küldő
// gombra kerül. Egyszerre egy ellenőrzés futhat (verificationGate.ts). Az eredményt a szülő mutatja:
// a kártya az űrlapok helyére lép.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { ApiError, isAbortError } from '../../api/http';
import { percentOf, type TransferProgress } from '../../api/multipart';
import { type Verification, verifyFile } from '../../api/verify.api';
import type { FormMessage } from '../../hooks/useForm';
import { focusLost, focusPageHeading } from '../../lib/focus';
import { errorText } from '../../lib/text';
import { imageErrorOf, RETRY_CODES, RETRY_TEXT } from '../../upload/imageErrors';
import { useImagePicker } from '../../upload/useImagePicker';
import type { VerificationGate } from '../../verify/verificationGate';
import { VERIFY_HINT, VERIFY_MIN_EDGE_PX } from '../../verify/verifyValidation';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { useAnnounce } from '../ui/useAnnounce';
import { FileDropZone } from '../upload/FileDropZone';
import { SelectedFile } from '../upload/SelectedFile';
import { type ProgressTexts, UploadProgress } from '../upload/UploadProgress';

type Phase =
  { kind: 'idle' } | { kind: 'verifying'; progress: TransferProgress | null; sent: boolean };

/** Hová kerüljön a fókusz egy változás megjelenése után */
type FocusTarget = 'file' | 'submit' | 'status';

/** Hol volt a fókusz, amikor a kérés véget ért (a doboz eltűnése előtt mérve) */
interface FocusOrigin {
  /** A haladás dobozában (Mégse, állapotsor) – vagy már el is veszett */
  inCard: boolean;
  onSubmit: boolean;
}

/** A sáv a küldést méri; az ellenőrzés a szerveren utána jön */
const PROGRESS_TEXTS: ProgressTexts = {
  label: 'A kép küldése',
  sending: 'A kép küldése…',
  sent: 'A fájl elküldve, a szerver ellenőrzi a képet…',
};

interface VerifyFileFormProps {
  onResult: (result: Verification) => void;
  gate: VerificationGate;
  /** Új ellenőrzéskor (a kártya helyére lépve): a fókusz a fájlválasztóra */
  autoFocus?: boolean;
}

export function VerifyFileForm({ onResult, gate, autoFocus = false }: VerifyFileFormProps) {
  const announce = useAnnounce();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /** A nem a képről szóló hiba riasztásként (minden újnál új azonosítóval – újra elhangzik) */
  const [failure, setFailure] = useState<FormMessage | null>(null);
  // Új objektum minden kéréskor: a fókusz a változás megjelenése UTÁN kerül a helyére
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const statusLineRef = useRef<HTMLParagraphElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const headingId = useId();
  const summaryId = useId();
  const failureId = useId();
  const picker = useImagePicker({
    minEdgePx: VERIFY_MIN_EDGE_PX,
    selectedRef,
    focusFile: () => setFocusRequest({ target: 'file' }),
  });
  const { image, imageAlert } = picker;
  const verifying = phase.kind === 'verifying';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Az oldal elhagyásakor a még tartó kérés megszakad (az eredménye ide már nem írna)
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (autoFocus) fileInputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!focusRequest) return;
    const refs = { file: fileInputRef, submit: submitRef, status: statusLineRef };
    const target = refs[focusRequest.target].current;
    if (target) target.focus();
    else focusPageHeading();
  }, [focusRequest]);

  const requestFocus = (target: FocusTarget) => setFocusRequest({ target });
  const selectFile = (file: File) => {
    setFailure(null);
    picker.selectFile(file);
  };

  /** A szerver hibája a helyére: a kép hibája a fogadóterülethez, a többi riasztásként a gomb mellé. */
  const showError = (error: unknown, origin: FocusOrigin) => {
    const imageError = error instanceof ApiError ? imageErrorOf(error) : undefined;
    if (imageError !== undefined) {
      image.setServerError(imageError);
      // A fókusz csak az űrlapból megy a fájlválasztóra; máshonnan (pl. a hash mezőből) nem rántjuk el
      if (origin.inCard || origin.onSubmit) requestFocus('file');
      else picker.showImageAlert(imageError);
      return;
    }
    const text =
      error instanceof ApiError && RETRY_CODES.has(error.code) ? RETRY_TEXT : errorText(error);
    setFailure(picker.message(text));
    // Az eltűnt doboz tartalmazta a fókuszt: a küldő gombra (a leírása a riasztás)
    if (origin.inCard) requestFocus('submit');
  };

  const startVerification = async (file: File) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    gate.onStart();
    setPhase({ kind: 'verifying', progress: null, sent: false });
    announce('Az ellenőrzés elindult.');
    try {
      const result = await verifyFile(file, {
        signal: controller.signal,
        // Csak egész százaléknyi változásnál renderelünk újra (a böngésző másodpercenként sokszor jelez)
        onProgress: (progress) =>
          setPhase((current) =>
            current.kind !== 'verifying' || percentOf(current.progress) === percentOf(progress)
              ? current
              : { ...current, progress },
          ),
        // A törzs elment: a Mégse eltűnik – ha rajta volt a fókusz, az állapotsorra kerül (a sor maga
        // olvasódik fel), különben bemondás
        onSent: () => {
          const cardHadFocus = progressRef.current?.contains(document.activeElement) ?? false;
          setPhase((current) =>
            current.kind === 'verifying' ? { ...current, sent: true } : current,
          );
          if (cardHadFocus) requestFocus('status');
          else announce('A fájl elküldve, a szerver ellenőrzi a képet.');
        },
      });
      gate.onSettle();
      if (!mounted.current) return;
      setPhase({ kind: 'idle' });
      onResult(result);
    } catch (error) {
      gate.onSettle(error);
      if (!mounted.current) return;
      // Hol volt a fókusz – az eltűnő doboz előtt mérve (a Mégse az elküldéskor már eltűnhetett)
      const origin: FocusOrigin = {
        inCard: (progressRef.current?.contains(document.activeElement) ?? false) || focusLost(),
        onSubmit: document.activeElement === submitRef.current,
      };
      setPhase({ kind: 'idle' });
      if (isAbortError(error)) {
        announce('Az ellenőrzést megszakítottad.');
        requestFocus('submit');
        return;
      }
      showError(error, origin);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  /**
   * Beküldés: a kép kliensoldali hibája (vagy hiánya) megállítja – a fókusz a fájlválasztóra kerül –,
   * a kapu (másik ellenőrzés fut, a szerver várakozást kért) riasztással.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verifying) return;
    setFailure(null);
    picker.clearImageAlert();
    image.setServerError(undefined);
    if (image.selection === null) image.requireFile();
    if (image.selection === null || image.blockingError !== undefined) {
      requestFocus('file');
      return;
    }
    const blocked = gate.reasonNotToStart();
    if (blocked !== null) {
      setFailure(picker.message(blocked));
      return;
    }
    void startVerification(image.selection.file);
  };

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="space-y-4">
      <h2 id={headingId} className="text-lg font-semibold tracking-tight">
        Ellenőrzés képpel
      </h2>
      {imageAlert && (
        <p key={imageAlert.id} role="alert" className="sr-only">
          {imageAlert.text}
        </p>
      )}
      {phase.kind === 'verifying' ? (
        <UploadProgress
          ref={progressRef}
          statusRef={statusLineRef}
          fileName={image.selection?.file.name ?? ''}
          progress={phase.progress}
          sent={phase.sent}
          onCancel={() => controllerRef.current?.abort()}
          texts={PROGRESS_TEXTS}
        />
      ) : (
        <div className="space-y-3">
          <FileDropZone
            hint={VERIFY_HINT}
            error={image.error}
            selectionId={image.selection ? summaryId : undefined}
            file={image.selection?.file ?? null}
            onSelect={selectFile}
            inputRef={fileInputRef}
          />
          {image.selection && (
            <SelectedFile
              ref={selectedRef}
              selection={image.selection}
              summaryId={summaryId}
              onDimensions={picker.onDimensions}
              onReplace={() => fileInputRef.current?.click()}
            />
          )}
        </div>
      )}
      {failure && (
        <div id={failureId}>
          <Alert key={failure.id} tone="danger" title="Az ellenőrzés nem sikerült.">
            {failure.text}
          </Alert>
        </div>
      )}
      <Button
        ref={submitRef}
        type="submit"
        variant="primary"
        busy={verifying}
        aria-describedby={failure ? failureId : undefined}
      >
        {verifying ? 'Ellenőrzés…' : 'Kép ellenőrzése'}
      </Button>
    </form>
  );
}
