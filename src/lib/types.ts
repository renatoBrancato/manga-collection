export type ItemFormat = "tankobon" | "zashi";
export type GradingAuthority = "CGC" | "CBCS" | "BGS" | "altro";

export interface MangaItem {
  id: string;
  user_id: string;
  title: string;
  series: string | null;
  format: ItemFormat;
  volume_number: number | null;
  issue_number: string | null;
  release_year: number | null;
  publisher: string | null;
  isbn: string | null;
  is_first_print: boolean | null;
  has_obi: boolean | null;
  /** Ancora sigillato nel cellophane originale. */
  is_sealed: boolean;
  printing_notes: string | null;
  grading_authority: GradingAuthority | null;
  grading_value: number | null;
  condition_estimate: string | null;
  language: string | null;
  estimated_value: number | null;
  currency: string;
  image_url: string | null;
  notes: string | null;
  source: "manual" | "mcp" | "chat";
  /** Ultima rivalutazione riuscita (cron giornaliero o richiesta esplicita). */
  valued_at: string | null;
  /** Criterio usato per l'ultimo valore: mediana RAW o riga esatta graded. */
  valuation_basis: string | null;
  valuation_source: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload shape accepted from the manual form, the REST endpoint, and the MCP tool. */
export interface IncomingItemPayload {
  /** Nome della serie/opera (es. "One Piece") o della rivista - campo principale, sostituisce il vecchio "titolo". */
  series?: string | null;
  /** Deprecato: usato solo come fallback se 'series' non è fornito (retrocompatibilità MCP). */
  title?: string | null;
  format?: ItemFormat | null;
  volume_number?: number | null;
  issue_number?: string | null;
  release_year?: number | null;
  publisher?: string | null;
  isbn?: string | null;
  is_first_print?: boolean | null;
  has_obi?: boolean | null;
  is_sealed?: boolean | null;
  printing_notes?: string | null;
  grading_authority?: GradingAuthority | null;
  grading_value?: number | null;
  condition_estimate?: string | null;
  language?: string | null;
  estimated_value?: number | null;
  currency?: string | null;
  image_url?: string | null;
  /** Foto in base64 (o data URI), usata quando non c'è un URL pubblico; viene caricata su Storage e convertita in image_url. */
  image_base64?: string | null;
  notes?: string | null;
}
