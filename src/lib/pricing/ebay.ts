/**
 * Prezzi degli zashi dagli annunci attivi eBay (Browse API ufficiale).
 *
 * West Blue registra le vendite RAW solo dei numeri "chiave": per le riviste
 * recenti non c'è nulla. eBay è il mercato internazionale più grande per gli
 * zashi, ma la Browse API espone solo gli annunci in corso (le vendite
 * concluse sono riservate alla Marketplace Insights API, non accessibile
 * liberamente): il valore è quindi una mediana di prezzi richiesti, non di
 * vendite, e viene etichettato come tale.
 *
 * Credenziali: EBAY_CLIENT_ID e EBAY_CLIENT_SECRET (keyset "Production" da
 * developer.ebay.com). Senza, il fallback è semplicemente disattivato.
 */

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
const SEARCH_TTL_MS = 60 * 60 * 1000;
const MIN_LISTINGS = 3;

type Token = { value: string; expiresAt: number };
let tokenCache: Token | null = null;
const searchCache = new Map<string, { expiresAt: number; items: EbayItem[] }>();

type EbayItem = {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  itemWebUrl?: string;
};

export type EbayListing = { title: string; price_usd: number | null; price_eur: number; url?: string };

export type EbayZasshiResult = {
  configured: boolean;
  value_eur: number | null;
  listings: EbayListing[];
  search_url: string;
  note: string;
};

// Termini con cui la rivista compare nei titoli eBay (romaji o giapponese).
const MAGAZINE_TERMS: Array<{ test: RegExp; query: string; title: RegExp }> = [
  { test: /monthly shonen jump|月刊少年ジャンプ/i, query: "monthly shonen jump", title: /monthly|月刊/i },
  { test: /jump square|ジャンプsq|ジャンプスクエア/i, query: "jump square", title: /jump\s*sq|square|ジャンプsq|スクエア/i },
  { test: /young jump|ヤングジャンプ/i, query: "young jump", title: /young\s*jump|ヤングジャンプ/i },
  { test: /jump|ジャンプ/i, query: "shonen jump", title: /jump|ジャンプ/i },
  { test: /magazine|マガジン/i, query: "shonen magazine", title: /magazine|マガジン/i },
  { test: /sunday|サンデー/i, query: "shonen sunday", title: /sunday|サンデー/i },
];

const GRADED = /\b(psa|bgs|cgc|graded|slab(bed)?)\b/i;
const NOT_A_SINGLE_ISSUE =
  /\b(lot|lots|set of|bundle|complete set|reprint|replica|facsimile|poster only|card only|only card|no magazine|cover only|clipping|cut ?out|comics|tankobon|\d\s*sets?)\b|\d\s*set\b|まとめ|セット|冊/i;

export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const credentials = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
  });
  if (!response.ok) throw new Error(`token eBay rifiutato (${response.status})`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 120) * 1000 };
  return body.access_token;
}

async function search(query: string): Promise<EbayItem[]> {
  const cached = searchCache.get(query);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  const params = new URLSearchParams({ q: query, limit: "200", filter: "buyingOptions:{FIXED_PRICE|AUCTION}" });
  const response = await fetch(`${SEARCH_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
    },
  });
  if (!response.ok) throw new Error(`ricerca eBay fallita (${response.status})`);
  const body = (await response.json()) as { itemSummaries?: EbayItem[] };
  const items = body.itemSummaries ?? [];
  searchCache.set(query, { expiresAt: Date.now() + SEARCH_TTL_MS, items });
  return items;
}

function standalone(value: number): string {
  return `(?<!\\d)0?${value}(?!\\d)`;
}

/**
 * Il titolo corrisponde allo stesso fascicolo? Richiede rivista, anno e
 * numero: per un doppio numero i due valori devono comparire uniti
 * ("36-37", "36/37", "No.36・37"), altrimenti basterebbe un 36 qualunque.
 */
export function titleMatchesIssue(title: string, magazine: RegExp, numbers: number[], year: number): boolean {
  if (!magazine.test(title)) return false;
  if (!new RegExp(`(?<!\\d)${year}(?!\\d)`).test(title)) return false;
  const withoutYear = title.replace(new RegExp(`(?<!\\d)${year}(?!\\d)`, "g"), " ");
  // Pacchetti con altri numeri ("#36-37 & #38", "No.36-37.No.38"): prezzo di più riviste.
  for (const match of withoutYear.matchAll(/(?:no\.?|#|&|\band\b)\s*0?(\d{1,2})(?!\d)/gi)) {
    if (!numbers.includes(Number(match[1]))) return false;
  }
  if (numbers.length > 1) {
    const joined = numbers.map(standalone).join("\\s*(?:[-/・&,~–—+]|and)\\s*(?:no\\.?\\s*|#)?");
    return new RegExp(joined, "i").test(withoutYear);
  }
  const [only] = numbers;
  return new RegExp(`(?:no\\.?|#|issue|vol\\.?|number)\\s*${standalone(only)}|${standalone(only)}\\s*号`, "i").test(
    withoutYear
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function lookupEbayZasshi(input: {
  magazine: string;
  issueNumbers: number[];
  year: number;
  usdToEur: number;
}): Promise<EbayZasshiResult> {
  const terms = MAGAZINE_TERMS.find((entry) => entry.test.test(input.magazine));
  const baseQuery = terms?.query ?? input.magazine;
  const issueLabel = input.issueNumbers.join("-");
  const search_url = `https://www.ebay.com/sch/i.html?${new URLSearchParams({
    _nkw: `${baseQuery} ${input.year} ${issueLabel}`,
  })}`;
  const empty = { listings: [], value_eur: null, search_url };

  if (!ebayConfigured()) return { ...empty, configured: false, note: "eBay non configurato." };

  try {
    // Una ricerca mirata e una larga: i venditori scrivono il numero in modi
    // diversi ("No.36-37", "#36/37", "36・37号") e il filtro vero è locale.
    const queries = [`${baseQuery} ${input.year} ${input.issueNumbers[0]}`, `${baseQuery} ${input.year}`];
    const seen = new Map<string, EbayItem>();
    for (const query of queries) for (const item of await search(query)) seen.set(item.itemId, item);

    const titleTerm = terms?.title ?? new RegExp(baseQuery.split(/\s+/).at(-1) ?? baseQuery, "i");
    const listings: EbayListing[] = [];
    for (const item of seen.values()) {
      if (!item.price || GRADED.test(item.title) || NOT_A_SINGLE_ISSUE.test(item.title)) continue;
      if (!titleMatchesIssue(item.title, titleTerm, input.issueNumbers, input.year)) continue;
      const amount = Number(item.price.value);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const currency = item.price.currency;
      if (currency !== "USD" && currency !== "EUR") continue;
      listings.push({
        title: item.title,
        price_usd: currency === "USD" ? amount : null,
        price_eur: currency === "USD" ? amount * input.usdToEur : amount,
        url: item.itemWebUrl,
      });
    }

    // Scarta i prezzi fuori scala (annunci civetta o bundle non riconosciuti).
    const first = listings.length > 0 ? median(listings.map((l) => l.price_eur)) : 0;
    const kept = listings.filter((l) => l.price_eur >= first / 3 && l.price_eur <= first * 3);
    kept.sort((a, b) => a.price_eur - b.price_eur);

    if (kept.length < MIN_LISTINGS) {
      return {
        ...empty,
        configured: true,
        listings: kept,
        note:
          kept.length === 0
            ? `nessun annuncio RAW per #${issueLabel} (${input.year}).`
            : `solo ${kept.length} annunci RAW (${kept
                .map((l) => `${round2(l.price_eur)} €`)
                .join(", ")}): troppo pochi per una stima, valore lasciato vuoto.`,
      };
    }

    const value = round2(median(kept.map((l) => l.price_eur)));
    return {
      configured: true,
      value_eur: value,
      listings: kept,
      search_url,
      note: `eBay: mediana di ${kept.length} annunci attivi RAW per #${issueLabel} (${input.year}), prezzi richiesti e non vendite concluse.`,
    };
  } catch (cause) {
    return { ...empty, configured: true, note: cause instanceof Error ? cause.message : "errore eBay." };
  }
}
