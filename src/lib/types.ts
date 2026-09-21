export type ItemStatus = "owned" | "wanted" | "reading" | "completed";

export interface MangaItem {
  id: string;
  user_id: string;
  title: string;
  series: string | null;
  volume_number: number | null;
  publisher: string | null;
  isbn: string | null;
  condition: string | null;
  status: ItemStatus;
  language: string | null;
  estimated_value: number | null;
  currency: string;
  image_url: string | null;
  notes: string | null;
  source: "manual" | "chatgpt";
  created_at: string;
  updated_at: string;
}

/** Payload shape the ChatGPT Action is instructed to send. */
export interface IncomingItemPayload {
  title: string;
  series?: string;
  volume_number?: number;
  publisher?: string;
  isbn?: string;
  condition?: string;
  status?: ItemStatus;
  language?: string;
  estimated_value?: number;
  currency?: string;
  image_url?: string;
  notes?: string;
}
