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
  release_date: string | null;
  publisher: string | null;
  isbn: string | null;
  is_first_print: boolean | null;
  printing_notes: string | null;
  grading_authority: GradingAuthority | null;
  grading_value: number | null;
  condition_estimate: string | null;
  language: string | null;
  estimated_value: number | null;
  currency: string;
  image_url: string | null;
  notes: string | null;
  source: "manual" | "mcp";
  created_at: string;
  updated_at: string;
}

/** Payload shape accepted from the manual form, the REST endpoint, and the MCP tool. */
export interface IncomingItemPayload {
  title: string;
  series?: string;
  format?: ItemFormat;
  volume_number?: number;
  issue_number?: string;
  release_date?: string;
  publisher?: string;
  isbn?: string;
  is_first_print?: boolean;
  printing_notes?: string;
  grading_authority?: GradingAuthority;
  grading_value?: number;
  condition_estimate?: string;
  language?: string;
  estimated_value?: number;
  currency?: string;
  image_url?: string;
  notes?: string;
}
