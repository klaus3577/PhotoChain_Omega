// A feltöltés oldala (L21; L17 drótváz „Feltöltés”): védett oldal. Fogadóterület húzással és
// tallózással; a fájl típusát és méretét még a küldés előtt ellenőrizzük, az előnézet betöltése után a
// felbontást is (useImageSelection); űrlap (cím, leírás, kategória, ár) a szerver szabályaival. A
// feltöltés XMLHttpRequest-tel megy, haladással és megszakítással – amíg a törzs el nem ment; utána a
// szerver dolgozik, és a megszakítás a kép elkészültét már nem állítaná meg (upload.api.ts). A hibák a
// helyükre kerülnek: a kép hibája (túl kicsi, nem támogatott, túl nagy) a fogadóterülethez, a mezőhiba a
// mezőhöz – a fókusz az első hibás vezérlőre, a fájlválasztó az első –, az ismert kép (409) saját kártyát
// kap a meglévő kép adataival, minden más riasztást a küldő gomb mellett (a gomb leírásaként is). A
// fókusz sehol nem vész el: amikor az eltűnő doboz (haladás, kiválasztott fájl, megerősítő panel)
// tartalmazta, a küldő gombra, a fájlválasztóra, az állapotsorra vagy a kártya címére kerül. A 201 után
// az állapotkártya követi a regisztrációt (RegistrationStatus); a kártya adatát a gyorsítótárba a 201
// válasza adja (régi keltezéssel – más oldal frissnek nem tekinti), és a kijelentkezés kiüríti.
// Feltöltés közben a másik oldalra navigálás megerősítést kér (ugyanerre az oldalra és a kijelentkezés
// nem), az oldal bezárása előtt a böngésző kérdez; a megerősítve elhagyott oldal futó feltöltése a
// szerveren befejeződik, az eredménye ide már nem ír – a megerősítés nélkül elhagyott (pl.
// kijelentkezéssel) a törzs elküldése előtt megszakad. A lejárt munkamenet (401) kijelentkezett
// állapotba visz (mint a többi kérésnél).
// Forrás: React Router – useBlocker, https://reactrouter.com/api/hooks/useBlocker; useBeforeUnload,
// https://reactrouter.com/api/hooks/useBeforeUnload (adaptálva)
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { type BlockerFunction, NavigationType, useBeforeUnload, useBlocker } from 'react-router';

import { isSessionEndError } from '../api/auth.api';
import { categoriesQuery } from '../api/categories.api';
import { isRecord } from '../api/guards';
import { ApiError, isAbortError } from '../api/http';
import { percentOf, type TransferProgress } from '../api/multipart';
import { detailOfUploaded, photoKeys, type UploadedPhoto } from '../api/photos.api';
import { uploadPhoto } from '../api/upload.api';
import { setSessionUser } from '../auth/sessionCache';
import { PhotoFormFields } from '../components/photos/PhotoFormFields';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeading } from '../components/ui/PageHeading';
import { useAnnounce } from '../components/ui/useAnnounce';
import { DuplicateNotice } from '../components/upload/DuplicateNotice';
import { FileDropZone } from '../components/upload/FileDropZone';
import { RegistrationStatus } from '../components/upload/RegistrationStatus';
import { SelectedFile } from '../components/upload/SelectedFile';
import { UploadProgress } from '../components/upload/UploadProgress';
import { useFileDropGuard } from '../hooks/useFileDropGuard';
import { useForm } from '../hooks/useForm';
import { usePageTitle } from '../hooks/usePageTitle';
import { focusLost, focusPageHeading } from '../lib/focus';
import { errorText } from '../lib/text';
import { imageErrorOf, RETRY_CODES, RETRY_TEXT } from '../upload/imageErrors';
import {
  normalizeDescription,
  priceDigits,
  UPLOAD_FIELDS,
  UPLOAD_HINT,
  type UploadValues,
  validateUploadFields,
} from '../upload/uploadValidation';
import { useImagePicker } from '../upload/useImagePicker';

type Phase =
  | { kind: 'form' }
  | { kind: 'uploading'; progress: TransferProgress | null; sent: boolean }
  | { kind: 'uploaded'; photo: UploadedPhoto };

/** Hová kerüljön a fókusz egy változás megjelenése után */
type FocusTarget = 'file' | 'submit' | 'status' | 'card';
type ErrorPlacement = 'duplicate' | 'image' | 'field' | 'failure' | 'session';

/** A szerver szerint a kép (vagy egy módosított változata) már regisztrált (409) */
const DUPLICATE_CODES: ReadonlySet<string> = new Set(['DUPLICATE_EXACT', 'DUPLICATE_SIMILAR']);

/** A kérés mezői a szerver formájában: a cím levágva, a leírás normalizálva, az ár csak számjegyek. */
function uploadInputOf(file: File, values: UploadValues) {
  return {
    file,
    title: values.title.trim(),
    description: normalizeDescription(values.description),
    priceHuf: priceDigits(values.priceHuf) ?? values.priceHuf,
    categoryId: values.categoryId,
  };
}

/**
 * A kijelentkezés navigációja (useAuthActions): azt nem állítjuk meg, a feltöltés inkább megszakad.
 * Csak maga a kijelentkezés (helyettesítő navigáció) – a jelző a bejegyzésben marad, így a Vissza
 * gomb egy korábbi kijelentkezés bejegyzésére lépve sem kerülheti meg a megerősítést.
 */
const isLogoutNavigation = (state: unknown, action: NavigationType): boolean =>
  action === NavigationType.Replace && isRecord(state) && state.loggingOut === true;

export function UploadPage() {
  usePageTitle('Kép feltöltése');
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const form = useForm(UPLOAD_FIELDS, validateUploadFields);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [duplicate, setDuplicate] = useState<ApiError | null>(null);
  // Új objektum minden kéréskor: a fókusz a változás megjelenése UTÁN kerül a helyére (lásd useForm)
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const statusLineRef = useRef<HTMLParagraphElement>(null);
  const cardHeadingRef = useRef<HTMLHeadingElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const duplicateRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  /** A törzs már elment: a megszakítás a szerveren semmit nem állítana meg */
  const sentRef = useRef(false);
  /** A felhasználó megerősítve hagyja el az oldalt: a feltöltés a háttérben befejeződhet */
  const leaveConfirmedRef = useRef(false);
  /** Honnan indult a megállított navigáció (oda tér vissza a fókusz, ha marad) */
  const blockerOriginRef = useRef<Element | null>(null);
  const mounted = useRef(false);
  const summaryId = useId();
  const failureId = useId();
  const panelTitleId = useId();
  const panelTextId = useId();
  const categories = useQuery(categoriesQuery());
  // A kép kiválasztása, hibái és bemondása az ellenőrzés oldalával közös (useImagePicker)
  const picker = useImagePicker({
    selectedRef,
    focusFile: () => setFocusRequest({ target: 'file' }),
  });
  const { image, imageAlert } = picker;
  const uploading = phase.kind === 'uploading';
  useFileDropGuard();

  // Másik oldalra navigálás feltöltés közben: megerősítés (ugyanerre az oldalra és a kijelentkezéskor
  // nem); az oldal bezárása, újratöltése előtt a böngésző kérdez
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation, historyAction }) =>
      uploading &&
      currentLocation.pathname !== nextLocation.pathname &&
      !isLogoutNavigation(nextLocation.state, historyAction),
    [uploading],
  );
  const blocker = useBlocker(shouldBlock);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (uploading) event.preventDefault();
      },
      [uploading],
    ),
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Megerősítés nélkül elhagyott oldal (pl. kijelentkezés): a még tartó feltöltés megszakad
      if (!sentRef.current && !leaveConfirmedRef.current) controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!focusRequest) return;
    const refs = {
      file: fileInputRef,
      submit: submitRef,
      status: statusLineRef,
      card: cardHeadingRef,
    };
    const target = refs[focusRequest.target].current;
    if (target) target.focus();
    else focusPageHeading();
  }, [focusRequest]);

  // A megerősítés megjelenésekor a fókusz a „Maradok” gombra kerül; megjegyezzük, honnan indult a navigáció
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    blockerOriginRef.current = document.activeElement;
    stayRef.current?.focus();
  }, [blocker.state]);

  // Ha a feltöltés a nyitott megerősítés alatt ér véget, a kérdés már nem áll: a panel bezárul, a benne
  // álló fókusz az eredmény helyére kerül (az állapotkártya címére vagy a küldő gombra)
  useEffect(() => {
    if (uploading || blocker.state !== 'blocked') return;
    const panelHadFocus = panelRef.current?.contains(document.activeElement) ?? false;
    blocker.reset();
    if (panelHadFocus) (phase.kind === 'uploaded' ? cardHeadingRef : submitRef).current?.focus();
  }, [uploading, blocker, phase.kind]);

  // A 409 kártya a küldő gomb fölött jelenik meg: a látótérbe görgetjük (a jsdom nem görget)
  useEffect(() => {
    if (duplicate) duplicateRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [duplicate]);

  const requestFocus = (target: FocusTarget) => setFocusRequest({ target });

  /** A kiválasztott (vagy dobott) fájl: az ismert kép kártyája eltűnik; a többi a közös folyamat. */
  const selectFile = (file: File) => {
    setDuplicate(null);
    picker.selectFile(file);
  };

  /** A fájl eldobása (másik kép választása, új űrlap): a fókusz a fájlválasztóra kerül. */
  const clearFile = () => {
    setDuplicate(null);
    picker.clearFile();
  };

  /** A szerver hibája a helyére; megmondja, hová került (a fókusz ehhez igazodik). */
  const showUploadError = (error: unknown): ErrorPlacement => {
    if (error instanceof ApiError) {
      if (isSessionEndError(error)) {
        setSessionUser(queryClient, null);
        return 'session';
      }
      if (DUPLICATE_CODES.has(error.code)) {
        setDuplicate(error);
        return 'duplicate';
      }
      const imageError = imageErrorOf(error);
      if (imageError) {
        image.setServerError(imageError);
        requestFocus('file');
        return 'image';
      }
      if (form.showServerFieldErrors(error)) return 'field';
      if (RETRY_CODES.has(error.code)) {
        form.showFailure(RETRY_TEXT);
        return 'failure';
      }
    }
    form.showFailure(errorText(error));
    return 'failure';
  };

  const startUpload = async (file: File, values: UploadValues) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    sentRef.current = false;
    setPhase({ kind: 'uploading', progress: null, sent: false });
    announce('A feltöltés elindult.');
    try {
      const photo = await uploadPhoto(uploadInputOf(file, values), {
        signal: controller.signal,
        // Csak egész százaléknyi változásnál renderelünk újra (a böngésző másodpercenként sokszor jelez)
        onProgress: (progress) =>
          setPhase((current) =>
            current.kind !== 'uploading' || percentOf(current.progress) === percentOf(progress)
              ? current
              : { ...current, progress },
          ),
        // A törzs elment: a Mégse eltűnik – ha rajta volt a fókusz, az állapotsorra kerül; bemondás
        onSent: () => {
          sentRef.current = true;
          // Az elhagyott oldalról a bemondás már egy másik oldalon hangzana el
          if (!mounted.current) return;
          const cardHadFocus = progressRef.current?.contains(document.activeElement) ?? false;
          setPhase((current) =>
            current.kind === 'uploading' ? { ...current, sent: true } : current,
          );
          announce('A fájl elküldve, a szerver feldolgozza a képet.');
          if (cardHadFocus) requestFocus('status');
        },
      });
      // A vezérlőpult saját képei között az új kép is ott lesz (L22) – akkor is, ha közben elhagyta az
      // oldalt: a vezérlőpult a feltöltés vége előtt kérhette le a listát
      void queryClient.invalidateQueries({ queryKey: photoKeys.own() });
      if (!mounted.current) return;
      // A kártya kiinduló adata; régi keltezéssel, hogy az adatlap ne tekintse frissnek
      queryClient.setQueryData(photoKeys.detail(photo.id), detailOfUploaded(photo), {
        updatedAt: 0,
      });
      setPhase({ kind: 'uploaded', photo });
    } catch (error) {
      if (!mounted.current) return;
      // Az eltűnő doboz tartalmazta a fókuszt – vagy már el is veszett (a Mégse az elküldéskor tűnt el)
      const cardHadFocus =
        (progressRef.current?.contains(document.activeElement) ?? false) || focusLost();
      setPhase({ kind: 'form' });
      if (isAbortError(error)) {
        announce('A feltöltést megszakítottad; az űrlap adatai megmaradtak.');
        requestFocus('submit');
        return;
      }
      const placement = showUploadError(error);
      // A kép és a mező hibája maga viszi a fókuszt; a többinél a küldő gomb (a leírása a riasztás)
      if (cardHadFocus && (placement === 'duplicate' || placement === 'failure')) {
        requestFocus('submit');
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  /** Beküldés: előbb a kép, aztán a mezők – minden hiba egyszerre látszik, a fókusz az elsőre kerül. */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploading) return;
    form.clearMessages();
    picker.clearImageAlert();
    setDuplicate(null);
    image.setServerError(undefined);
    const imageError = image.blockingError;
    if (image.selection === null) image.requireFile();
    const fieldsInvalid = form.showErrors(validateUploadFields(form.values), {
      focus: imageError === undefined,
    });
    if (imageError !== undefined) {
      requestFocus('file');
      return;
    }
    if (fieldsInvalid || image.selection === null) return;
    void startUpload(image.selection.file, form.values);
  };

  const cancelUpload = () => controllerRef.current?.abort();

  /** Újabb kép: üres űrlap, a fókusz a fájlválasztón. */
  const resetAll = () => {
    setPhase({ kind: 'form' });
    form.reset();
    clearFile();
  };

  /** A kategóriák újratöltése: siker után a fókusz a választóra (a gomb eltűnik), az eredményt bemondjuk. */
  const reloadCategories = async () => {
    const result = await categories.refetch();
    if (!mounted.current) return;
    if (result.isSuccess) {
      form.focusField('categoryId');
      announce('A kategóriák betöltődtek.');
    } else {
      announce('A kategóriák betöltése most sem sikerült.');
    }
  };

  /** Maradok (vagy Escape): a navigáció elmarad, a fókusz oda tér vissza, ahonnan indult. */
  const stay = () => {
    if (blocker.state === 'blocked') blocker.reset();
    const origin = blockerOriginRef.current;
    if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    else requestFocus(phase.kind === 'uploaded' ? 'card' : 'submit');
  };
  const leave = () => {
    leaveConfirmedRef.current = true;
    if (blocker.state === 'blocked') blocker.proceed();
  };
  // Escape a panelen (a fókusz a gombjain van): a navigáció elmarad. Natív figyelő a panel elemén –
  // a csoport maga nem kezelőelem, JSX-kezelőt nem kap (jsx-a11y); az effektus a panel
  // megjelenésekor iratkozik fel, a mindenkori stay-t az effektus-esemény látja
  const onPanelEscape = useEffectEvent(() => stay());
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onPanelEscape();
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [blocker.state]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3">
        <PageHeading>Kép feltöltése</PageHeading>
        <p className="leading-7 text-fg-muted">
          A kép ujjlenyomata a blokkláncon rögzül, így később igazolható, hogy te töltötted fel
          először. Maga a kép nem kerül a láncra, és ugyanaz a kép – vagy egy módosított változata –
          nem tölthető fel még egyszer.
        </p>
      </div>

      {blocker.state === 'blocked' && (
        <div
          ref={panelRef}
          role="group"
          aria-labelledby={panelTitleId}
          aria-describedby={panelTextId}
          className="rounded-lg border border-line-strong bg-surface p-4"
        >
          <p id={panelTitleId} className="font-medium">
            A feltöltés még tart.
          </p>
          <p id={panelTextId} className="mt-1 text-sm leading-6 text-fg-muted">
            Ha most elhagyod az oldalt, a feltöltés a háttérben befejeződik, de az eredményét – a
            regisztrációt vagy egy hibát – itt már nem látod.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button ref={stayRef} onClick={stay}>
              Maradok
            </Button>
            <Button variant="danger" onClick={leave}>
              Mégis elhagyom
            </Button>
          </div>
        </div>
      )}

      {phase.kind === 'uploaded' ? (
        <RegistrationStatus uploaded={phase.photo} onReset={resetAll} headingRef={cardHeadingRef} />
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-6">
          {form.fieldAlert && (
            <p key={form.fieldAlert.id} role="alert" className="sr-only">
              {form.fieldAlert.text}
            </p>
          )}
          {imageAlert && (
            <p key={imageAlert.id} role="alert" className="sr-only">
              {imageAlert.text}
            </p>
          )}

          <div className="space-y-3">
            {phase.kind === 'uploading' ? (
              <UploadProgress
                ref={progressRef}
                statusRef={statusLineRef}
                fileName={image.selection?.file.name ?? ''}
                progress={phase.progress}
                sent={phase.sent}
                onCancel={cancelUpload}
              />
            ) : (
              <>
                <FileDropZone
                  hint={UPLOAD_HINT}
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
                {duplicate && (
                  <DuplicateNotice ref={duplicateRef} error={duplicate} onReplace={clearFile} />
                )}
              </>
            )}
          </div>

          <PhotoFormFields
            form={form}
            categories={categories}
            onReloadCategories={() => void reloadCategories()}
          />

          <div className="space-y-3">
            {form.failure && (
              <div id={failureId}>
                <Alert key={form.failure.id} tone="danger" title="A feltöltés nem sikerült.">
                  {form.failure.text}
                </Alert>
              </div>
            )}
            <Button
              ref={submitRef}
              type="submit"
              variant="primary"
              busy={uploading}
              aria-describedby={form.failure ? failureId : undefined}
              className="w-full sm:w-auto"
            >
              {uploading ? 'Feltöltés…' : 'Feltöltés és regisztráció'}
            </Button>
            <p className="text-sm text-fg-muted">
              A blokklánc-regisztráció díját a PhotoChain fizeti.
            </p>
            {/* L30: az eredeti fájl változatlanul jut a vevőhöz (a hash is a változatlan fájlé) –
                a benne tárolt metaadatok (EXIF, GPS) is */}
            <p className="text-sm leading-6 text-fg-muted">
              A vevő az eredeti fájlt kapja meg, a benne tárolt adatokkal együtt (pl. a
              fényképezőgép típusa, a készítés helye GPS-koordinátával). Ha ezt nem szeretnéd,
              feltöltés előtt töröld őket a fájlból.
            </p>
          </div>
        </form>
      )}

      <Card title="Mi történik a feltöltés után?">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-fg-muted">
          <li>
            A szerver elkészíti a kép két ujjlenyomatát (SHA-256 és dHash), és összeveti a már
            feltöltött képekével. Egyezésnél a feltöltés megáll, és – ha lehet – megmutatjuk, melyik
            képpel egyezik.
          </li>
          <li>
            Az ujjlenyomatot egy tranzakció rögzíti az Ethereum Sepolia teszthálózaton. Ez általában
            fél–egy percet vesz igénybe; az oldal mutatja a folyamatot.
          </li>
          <li>
            A megerősítés után a kép nyilvános lesz a galériában, az adatlapján pedig megjelenik a
            blokklánc-tanúsítvány. Addig csak te látod.
          </li>
        </ol>
      </Card>
    </div>
  );
}
