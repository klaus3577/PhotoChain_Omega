// Átirányítás külső címre – a Stripe fizetési oldalára (L22). Külön modul, hogy a tesztek
// lecserélhessék (a jsdom a navigációt nem valósítja meg). A cím ellenőrzése a hívó dolga: a felület
// csak a Stripe fizetési oldalára irányít (api/orders.api.ts – isStripeCheckoutUrl).
export function redirectTo(url: string): void {
  window.location.assign(url);
}
