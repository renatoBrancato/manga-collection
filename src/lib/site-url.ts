/**
 * URL pubblico dell'app, senza slash finale: concatenare "/api/..." a una
 * NEXT_PUBLIC_SITE_URL che finisce con "/" produrrebbe un doppio slash.
 */
export function siteUrl(fallback = "https://tuo-dominio.vercel.app"): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured || fallback).replace(/\/+$/, "");
}

/**
 * Origine da usare per il redirect OAuth lato browser. In sviluppo vince
 * sempre l'origine corrente: con NEXT_PUBLIC_SITE_URL puntata alla
 * produzione, il login da localhost finirebbe sul sito pubblico.
 */
export function authRedirectOrigin(): string {
  const origin = window.location.origin;
  if (/^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname)) {
    return origin;
  }
  return siteUrl(origin);
}
