import type { MangaItem } from "./types";

/**
 * Restituisce la catena di URL da provare per mostrare la copertina di un volume,
 * in ordine di preferenza. Nessuna di queste API richiede una key:
 * 1. `image_url` salvato sull'item (es. foto scattata dall'utente via MCP)
 * 2. Copertina Open Library, cercata per ISBN
 * 3. Copertina Google Books, cercata per ISBN
 * Il componente <CoverImage /> prova ogni URL in cascata con onError.
 */
/**
 * Le foto caricate dagli utenti sono gli scatti originali del telefono
 * (tipicamente 1200x1600). Mostrate a piena risoluzione in una griglia da
 * decine di copertine, il browser deve tenerne in memoria ~7 MB ciascuna
 * una volta decodificate: su Android con poca RAM la scheda viene uccisa e
 * compare "This page couldn't load". Qui le facciamo ridimensionare al volo
 * da Supabase, che restituisce ~0,5 MB per immagine.
 */
export function thumbnailUrl(url: string, width = 400): string {
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  const height = Math.round(width * 1.5);
  const thumbnail = new URL(url);
  thumbnail.pathname = thumbnail.pathname.replace(marker, "/storage/v1/render/image/public/");
  thumbnail.searchParams.set("width", String(width));
  thumbnail.searchParams.set("height", String(height));
  thumbnail.searchParams.set("resize", "cover");
  thumbnail.searchParams.set("quality", "72");
  return thumbnail.toString();
}

export function getCoverCandidates(item: Pick<MangaItem, "image_url" | "isbn">): string[] {
  const candidates: string[] = [];

  // Prima la miniatura: se il servizio di trasformazione non risponde,
  // CoverImage ricade da solo sull'originale col suo onError.
  if (item.image_url) {
    const thumb = thumbnailUrl(item.image_url);
    if (thumb !== item.image_url) candidates.push(thumb);
    candidates.push(item.image_url);
  }

  const isbn = item.isbn?.replace(/[^0-9Xx]/g, "");
  if (isbn) {
    candidates.push(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`);
    candidates.push(
      `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=1`
    );
  }

  return candidates;
}
