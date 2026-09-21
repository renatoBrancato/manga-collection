import type { MangaItem } from "./types";

/**
 * Restituisce la catena di URL da provare per mostrare la copertina di un volume,
 * in ordine di preferenza. Nessuna di queste API richiede una key:
 * 1. `image_url` salvato sull'item (es. foto scattata dall'utente via MCP)
 * 2. Copertina Open Library, cercata per ISBN
 * 3. Copertina Google Books, cercata per ISBN
 * Il componente <CoverImage /> prova ogni URL in cascata con onError.
 */
export function getCoverCandidates(item: Pick<MangaItem, "image_url" | "isbn">): string[] {
  const candidates: string[] = [];

  if (item.image_url) candidates.push(item.image_url);

  const isbn = item.isbn?.replace(/[^0-9Xx]/g, "");
  if (isbn) {
    candidates.push(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`);
    candidates.push(
      `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=1`
    );
  }

  return candidates;
}
