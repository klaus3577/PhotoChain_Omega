// Az adatlap ár- és vásárlási doboza (L17 drótváz „Adatlap”, 2. jegyzet): egyetlen elsődleges
// művelet, a néző helyzetéhez igazítva – a rendszer állapota így mindig egyértelmű. Saját régió
// („Vásárlás” – a címe csak a képernyőolvasónak szól), így címsorok között navigálva is elérhető.
// - tulajdonos: „Ez a saját képed.” (a saját képét nem veheti meg);
// - nem nyilvános kép (csak a tulajdonos és az admin látja): nem vásárolható;
// - vásárló (kifizetett rendelés): „Már megvetted.” és az eredeti letöltése (a szerver védett
//   letöltése – a munkamenet alapján dönt, L14);
// - vendég: „Megveszem” → belépés, utána ide tér vissza (a hivatkozás leírása megmondja, miért);
// - bejelentkezett néző: „Megveszem” → fizetés indítása (POST /api/orders/checkout), majd
//   átirányítás a Stripe fizetési oldalára (L22, terv 3.3) – és csak oda: a válasz címét a kliens
//   ellenőrzi (orders.api.ts, és indulás előtt itt még egyszer). A gomb az átirányításig foglalt (a
//   dupla kattintás nem indít második fizetést), az indulást az élő régió mondja be (a foglalt gomb
//   felirata önmagában néma); a hiba riasztás a gomb leírásaként. Az átirányítás csak akkor indul, ha
//   az oldal még nyitva van (a mutate hívásának visszahívása). Ha a Stripe oldaláról visszalépve a
//   böngésző a vissza-gyorsítótárból állítja helyre az oldalt, a gomb újra használható (pageshow).
//   Ha a szerver szerint már megvette (pl. egy másik lapon), vagy a kép közben eltűnt előle, az
//   adatlap újratöltődik – addig a gomb foglalt marad –, és az mondja el a helyzetet: a vásárlót a
//   letöltés hivatkozására tett fókusz és bemondás igazítja el (a gomb eltűnt).
// Forrás: MDN – Window: pageshow event (persisted – a vissza-gyorsítótárból visszaállított oldal),
// https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event (adaptálva)
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, ShoppingCart } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { ApiError } from '../../api/http';
import { isStripeCheckoutUrl, startCheckout } from '../../api/orders.api';
import { type PhotoDetail, photoDownloadUrl, photoKeys } from '../../api/photos.api';
import { returnTo } from '../../auth/session';
import { useAuth } from '../../auth/useAuth';
import { focusLost } from '../../lib/focus';
import { formatPrice } from '../../lib/format';
import { redirectTo } from '../../lib/redirect';
import { errorText } from '../../lib/text';
import { Alert } from '../ui/Alert';
import { Button, ButtonLink } from '../ui/Button';
import { useAnnounce } from '../ui/useAnnounce';

const ACTION =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium';

const CHECKOUT_HINT =
  'A fizetés a Stripe biztonságos oldalán történik; utána az eredeti, vízjel nélküli fájl letölthető.';

/** Az adatlap újratöltése mondja el a helyzetet (már megvette; a kép eltűnt előle) – riasztás nem kell. */
const explainedByReload = (error: unknown): boolean =>
  error instanceof ApiError && (error.code === 'ALREADY_PURCHASED' || error.status === 404);

/** A bejelentkezett, nem vásárló néző gombja: fizetés indítása és átirányítás a Stripe-ra. */
function CheckoutButton({ photo }: { photo: PhotoDetail }) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const hintId = useId();
  const errorId = useId();
  /** Az újratöltés nem igazolta a „már megvette” választ (a néző még mindig nem vásárló): riasztás */
  const [unexplained, setUnexplained] = useState(false);
  const checkout = useMutation({
    mutationFn: () => startCheckout(photo.id),
    // Az adatlap újratöltéséig a művelet (és a gomb) foglalt marad: a visszatérő ígéretet megvárja
    onError: async (error) => {
      if (!explainedByReload(error)) return;
      await queryClient.invalidateQueries({ queryKey: photoKeys.detail(photo.id) });
      const current = queryClient.getQueryData<PhotoDetail>(photoKeys.detail(photo.id));
      if (current && !current.viewer?.purchased) setUnexplained(true);
    },
  });
  const { reset } = checkout;

  // A Stripe oldaláról visszalépve a böngésző a vissza-gyorsítótárból állíthatja helyre az oldalt
  // (a JavaScript állapotával együtt): a gomb ne maradjon örökre foglalt
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [reset]);

  const buy = () => {
    setUnexplained(false);
    announce('Átirányítás a Stripe fizetési oldalára…');
    checkout.mutate(undefined, {
      // Csak amíg az oldal nyitva van (a hook szintű visszahívás az elhagyott oldalról is átirányítana)
      onSuccess: ({ checkoutUrl }) => {
        if (isStripeCheckoutUrl(checkoutUrl)) redirectTo(checkoutUrl);
      },
    });
  };

  // Siker után is foglalt: az átirányítás folyamatban, az oldal elhagyása következik
  const busy = checkout.isPending || checkout.isSuccess;
  const failure = checkout.isError && (!explainedByReload(checkout.error) || unexplained);

  return (
    <>
      <Button
        variant="primary"
        icon={ShoppingCart}
        busy={busy}
        aria-describedby={failure ? `${hintId} ${errorId}` : hintId}
        onClick={buy}
        className="min-h-11 w-full"
      >
        {busy ? 'Átirányítás a fizetéshez…' : 'Megveszem'}
      </Button>
      <p id={hintId} className="text-sm leading-6 text-fg-muted">
        {CHECKOUT_HINT}
      </p>
      {failure && (
        <div id={errorId}>
          <Alert key={checkout.submittedAt} tone="danger" title="A fizetés indítása nem sikerült.">
            {errorText(checkout.error)}
          </Alert>
        </div>
      )}
    </>
  );
}

/**
 * Amikor a néző vásárlóvá válik (az adatlap újratöltése után – pl. a már megvett kép fizetésének
 * indításakor): az eltűnt gomb helyett a letöltés hivatkozására kerül a fókusz, és bemondás.
 */
function usePurchasedNotice(
  purchased: boolean,
  downloadRef: React.RefObject<HTMLAnchorElement | null>,
) {
  const announce = useAnnounce();
  const wasPurchased = useRef(purchased);

  useEffect(() => {
    const before = wasPurchased.current;
    wasPurchased.current = purchased;
    if (before || !purchased) return;
    if (focusLost()) downloadRef.current?.focus();
    announce('Ezt a képet már megvetted – az eredeti letölthető.');
  }, [purchased, downloadRef, announce]);
}

function PurchaseAction({ photo }: { photo: PhotoDetail }) {
  const auth = useAuth();
  const location = useLocation();
  const hintId = useId();
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const isOwner = auth.status === 'authenticated' && auth.user.id === photo.owner.id;
  const purchased = photo.viewer?.purchased ?? false;
  usePurchasedNotice(purchased, downloadRef);

  if (isOwner) return <p className="text-sm">Ez a saját képed.</p>;
  if (photo.status !== 'REGISTERED') {
    return <p className="text-sm">Ez a kép jelenleg nem vásárolható meg.</p>;
  }
  if (purchased) {
    return (
      <>
        <p className="text-sm">Már megvetted.</p>
        <a
          ref={downloadRef}
          href={photoDownloadUrl(photo.id)}
          className={`${ACTION} bg-black text-white hover:bg-neutral-800`}
        >
          <Download aria-hidden="true" className="size-4" />
          Eredeti letöltése
        </a>
      </>
    );
  }
  // A szerver szerint nincs munkamenet (vendég, vagy közben lejárt): előbb be kell lépni
  if (photo.viewer === null) {
    return (
      <>
        <ButtonLink
          to="/login"
          state={returnTo(location)}
          variant="primary"
          icon={ShoppingCart}
          aria-describedby={hintId}
          className="min-h-11 w-full"
        >
          Megveszem
        </ButtonLink>
        <p id={hintId} className="text-sm leading-6 text-fg-muted">
          A vásárláshoz jelentkezz be. {CHECKOUT_HINT}
        </p>
      </>
    );
  }
  return <CheckoutButton photo={photo} />;
}

export function PurchaseBox({ photo }: { photo: PhotoDetail }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border border-line bg-canvas p-4"
    >
      <h2 id={headingId} className="sr-only">
        Vásárlás
      </h2>
      <p className="text-2xl font-semibold tabular-nums">{formatPrice(photo.priceHuf)}</p>
      <PurchaseAction photo={photo} />
    </section>
  );
}
