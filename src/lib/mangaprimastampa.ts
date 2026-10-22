import type { MangaItem } from "@/lib/types";

/**
 * Eccezioni allo slugify automatico: il nostro titolo serie non coincide con lo slug
 * usato da mangaprimastampa.it. Chiave normalizzata via slugify(), valore = slug reale
 * del portale (senza "-volume-1"). Aggiungere qui man mano che si trovano altri casi.
 */
const SLUG_OVERRIDES: Record<string, string> = {
  "frieren-beyond-journey-s-end": "frieren",
};

/**
 * Converte un titolo serie in uno slug compatibile con mangaprimastampa.it:
 * minuscolo, senza accenti/diacritici, spazi e simboli sostituiti da trattini singoli.
 */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // rimuove i diacritici (es. é -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Restituisce l'URL della scheda del volume su mangaprimastampa.it, se disponibile.
 * Il portale ha al momento solo le schede del primo volume di ogni serie tankobon.
 */
export function buildMangaPrimaStampaUrl(item: Pick<MangaItem, "series" | "title" | "format" | "volume_number">): string | null {
  if (item.format !== "tankobon" || item.volume_number !== 1) return null;

  const name = item.series ?? item.title;
  if (!name) return null;

  const rawSlug = slugify(name);
  if (!rawSlug) return null;

  const slug = SLUG_OVERRIDES[rawSlug] ?? rawSlug;

  return `https://mangaprimastampa.it/archivio/${slug}-volume-1/`;
}
