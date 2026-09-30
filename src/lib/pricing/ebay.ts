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
const VOLUME_CATEGORIES = ["259109", "267"];

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

async function search(
  query: string,
  marketplace = process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
  categoryId?: string,
  locationCountry?: string
): Promise<EbayItem[]> {
  const cacheKey = `${marketplace}|${categoryId ?? ""}|${locationCountry ?? ""}|${query}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  const filter = ["buyingOptions:{FIXED_PRICE|AUCTION}", locationCountry ? `itemLocationCountry:${locationCountry}` : null]
    .filter(Boolean)
    .join(",");
  const params = new URLSearchParams({ q: query, limit: "200", filter });
  if (categoryId) params.set("category_ids", categoryId);
  const response = await fetch(`${SEARCH_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplace,
    },
  });
  if (!response.ok) throw new Error(`ricerca eBay fallita (${response.status})`);
  const body = (await response.json()) as { itemSummaries?: EbayItem[] };
  const items = body.itemSummaries ?? [];
  searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_TTL_MS, items });
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

// ---------------------------------------------------------------------------
// Tankōbon: fallback generale quando West Blue non ha vendite compatibili
// (volumi non tracciati) o non può averle (edizioni non giapponesi: il
// tracker segue solo il mercato giapponese, un volume Star Comics non ha
// niente a che fare con il prezzo dell'edizione Shueisha).

type LanguageProfile = {
  code: string;
  marketplace: string;
  domain: string;
  queryExtra: string;
  /** Solo venditori di quel paese: su eBay.it vendono anche negozi esteri con edizioni straniere. */
  locationCountry?: string;
  /** Il titolo deve contenere un indizio della lingua (solo dove eBay è internazionale). */
  require?: RegExp;
  /** Titoli di altre edizioni da scartare. */
  exclude: RegExp;
};

// Parole che identificano un'edizione (lingua, editori, termini tipici dei
// venditori di quel paese). Un titolo con parole di un'altra edizione è
// scartato: su eBay.it si trovano anche volumi francesi, tedeschi, inglesi.
const EDITION_MARKERS: Record<string, string> = {
  ja: "japanese|japan|jpn|jp|giapponese|japonais|japanisch|japon[eé]s|jump comics|shueisha",
  it: "italian[oa]?|ita|italien|italienisch|star comics|planet manga|panini|j-?pop|edizione|ristampa",
  en: "english|inglese|anglais|englisch|ingl[eé]s|viz|paperback|hardcover|by",
  fr: "french|francese|fran[cç]ais|franz[oö]sisch|franc[eé]s|tome|gl[eé]nat|pika|neuf|[eé]dition",
  de: "german|deutsch|tedesc[oa]|allemand|alem[aá]n|band|taschenbuch|carlsen|egmont|auflage|zustand|buch",
  es: "spanish|spagnol[oa]|espagnol|spanisch|espa[nñ]ol|planeta|tomo|ivrea|norma editorial",
};

function otherEditions(code: string): RegExp {
  const others = Object.entries(EDITION_MARKERS)
    .filter(([key]) => key !== code)
    .map(([, words]) => words)
    .join("|");
  // Edizioni asiatiche non giapponesi: sempre escluse.
  const asian = "thai|thailandese|chinese|chinois|cinese|korean|coreen|coreano|taiwan|indonesian|vietnamese";
  return new RegExp(`\\b(${others}|${asian})\\b${code === "ja" ? "" : "|[\\u3040-\\u30ff]"}`, "i");
}

const OTHER_EDITIONS = {
  ja: otherEditions("ja"),
  it: otherEditions("it"),
  en: otherEditions("en"),
  fr: otherEditions("fr"),
  de: otherEditions("de"),
  es: otherEditions("es"),
};

// Prefissi ISBN-13 dell'area linguistica: se il titolo riporta un ISBN deve
// essere dell'edizione giusta (97888 italiano, 9783 tedesco...).
const ISBN_PREFIX: Record<string, RegExp> = {
  ja: /^9784/,
  it: /^97888/,
  en: /^978[01]/,
  fr: /^9782/,
  de: /^9783/,
  es: /^97884/,
};

export function isbnMatchesEdition(title: string, code: string): boolean {
  const isbns = [...title.replace(/-/g, "").matchAll(/(?<!\d)97[89]\d{10}(?!\d)/g)].map((m) => m[0]);
  return isbns.every((isbn) => ISBN_PREFIX[code]?.test(isbn) ?? true);
}

export function languageProfile(language: string | null | undefined): LanguageProfile {
  const value = (language ?? "").trim().toLowerCase();
  if (/^(it|ita|italian|italiano)/.test(value))
    return { code: "it", marketplace: "EBAY_IT", domain: "www.ebay.it", queryExtra: "", locationCountry: "IT", exclude: OTHER_EDITIONS.it };
  if (/^(en|eng|english|inglese)/.test(value))
    return { code: "en", marketplace: "EBAY_US", domain: "www.ebay.com", queryExtra: "english", exclude: OTHER_EDITIONS.en };
  if (/^(fr|french|fran[cç]ais|francese)/.test(value))
    return { code: "fr", marketplace: "EBAY_FR", domain: "www.ebay.fr", queryExtra: "", locationCountry: "FR", exclude: OTHER_EDITIONS.fr };
  if (/^(de|german|deutsch|tedesco)/.test(value))
    return { code: "de", marketplace: "EBAY_DE", domain: "www.ebay.de", queryExtra: "", locationCountry: "DE", exclude: OTHER_EDITIONS.de };
  if (/^(es|spanish|espa[nñ]ol|spagnolo)/.test(value))
    return { code: "es", marketplace: "EBAY_ES", domain: "www.ebay.es", queryExtra: "", locationCountry: "ES", exclude: OTHER_EDITIONS.es };
  return {
    code: "ja",
    marketplace: "EBAY_US",
    domain: "www.ebay.com",
    queryExtra: "japanese",
    require: /japan|japanese|\bjp\b|\bjpn\b|[\u3040-\u30ff\u4e00-\u9fff]/i,
    exclude: OTHER_EDITIONS.ja,
  };
}

export function isJapaneseEdition(language: string | null | undefined): boolean {
  return languageProfile(language).code === "ja";
}

// Edizioni speciali: prezzo diverso dal volume normale, contano solo se il
// pezzo stesso è un'edizione speciale.
const SPECIAL_EDITION =
  /\b(variant|celebration|collector'?s?|box|limited|limitata|gold|deluxe|cofanetto|coffret|sonderausgabe|special edition|edizione speciale)\b/i;
const FIRST_PRINT =
  /\b(1st print(ing)?|first print(ing)?|first edition|1st edition|1st ed|prima edizione|prima stampa|1\.\s*auflage|erstauflage|premi[eè]re [eé]dition|primera edici[oó]n)\b|初版/i;
// Codici di carte collezionabili (es. OP05-100).
const CARD_CODE = /\b[a-z]{1,3}\d{2}-\d{3}\b/i;

const NOT_A_SINGLE_VOLUME =
  /\b(lot|lots|lotto|stock|bundle|set|box ?set|cofanetto|coffret|serie completa|complete series|collezione completa|sequenza|raccolta|dvd|blu-?ray|figure|figura|action figure|poster|card|carte|artbook|art book|guide ?book|novel|romanzo|light novel|anime comics|keychain|portachiavi|reprint only|funko|lego|plush|peluche|puzzle|t-?shirt|shirt|tee|jersey|cosplay|press kit|promo kit|banpresto|wcf|statue|statua|figuarts|ichiban ?kuji|kuji|shikishi|playstation|ps[1-5]|gradato|egc)\b|まとめ|セット|全巻/i;

function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff#°.]+/g, " ")
    .trim();
}

/**
 * Il titolo è un singolo volume della serie richiesta? La serie deve esserci
 * (tutte le parole significative), e tra i numeri rimasti dopo averla tolta
 * deve comparire solo il volume richiesto: "One Piece 12" sì, "One Piece
 * 1-12" o "One Piece 12 13 14" no. Anni e numeri dentro parole ("1a
 * edizione", "2nd print") non contano.
 */
// Serie derivate o edizioni diverse con la stessa numerazione ("Dragon Ball
// Super 1", "One Piece Color Walk 1", "Saga di Freezer 1").
const SPIN_OFF =
  /\b(super|sd|z|gt|kai|daima|heroes|full ?colou?r|colou?r(?: walk)?|kanzenban|ultimate|perfect edition|gaiden|spin-?off|databook|data book|guide|fanbook|novel|romanzo|roman|film|movie|anime|party|saga|cycle|ciclo|academy|illustrations|culture|io sono|encyclopedia|enciclopedia|quiz|cookbook|ricettario)\b/;

export function titleMatchesVolume(title: string, series: string, volume: number): boolean {
  let rest = ` ${foldText(title)} `;
  const seriesWords = foldText(series)
    .replace(/\bno\.?\s*(?=\d)/g, "")
    .split(/\s+/)
    .map((word) => word.replace(/[#.°]/g, ""))
    .filter((word) => word.length >= 2 || /\d/.test(word));
  if (seriesWords.length === 0) return false;
  for (const word of seriesWords) {
    const pattern = new RegExp(`(^|[^a-z0-9])(?:no\\.?\\s*|#)?${word}(?=$|[^a-z0-9])`);
    if (!pattern.test(rest)) return false;
    rest = rest.replace(pattern, "$1 ");
  }
  // "vol.8", "n°12", "#3", "nº25" → numero isolato, così viene contato.
  rest = rest.replace(/(?<![a-z])(volume|vol|numero|num|nr|no|n|tome|tomo|band)\s*[.°#]?\s*(?=\d)/g, " ").replace(/[#°]/g, " ");
  if (/(?<![\d.])\d{1,3}\s*(?:-|~|\/|\ba\b|\bal\b|\bto\b|\bbis\b|\bà\b)\s*\d{1,3}(?![\d.])/.test(rest)) return false;
  if (SPIN_OFF.test(rest)) return false;
  // "1. Auflage", "2nd print": numeri che indicano la stampa, non il volume.
  rest = rest.replace(/\b\d{1,2}\s*\.?\s*(auflage|aufl|edizione|ed|ristampa|print(ing)?|stampa)\b/g, " ");
  const numbers = [...rest.matchAll(/(?<![\w.])(\d{1,3})(?![\w%]|\.\d)/g)].map((match) => Number(match[1]));
  return numbers.length > 0 && numbers.every((value) => value === volume);
}

export async function lookupEbayVolume(input: {
  series: string;
  volume: number;
  language: string | null | undefined;
  usdToEur: number;
  isFirstPrint?: boolean | null;
  isSpecialEdition?: boolean;
}): Promise<EbayZasshiResult> {
  const profile = languageProfile(input.language);
  const query = [input.series, input.volume, profile.queryExtra].filter(Boolean).join(" ");
  const search_url = `https://${profile.domain}/sch/i.html?${new URLSearchParams({ _nkw: query })}`;
  const empty = { listings: [], value_eur: null, search_url };
  if (!ebayConfigured()) return { ...empty, configured: false, note: "eBay non configurato." };

  try {
    // 259109 = "Volumi singoli" manga (su eBay.it sta sotto Fumetti, non
    // Libri), 267 = Libri: insieme escludono carte, gadget e merch.
    const batches = await Promise.all(
      VOLUME_CATEGORIES.map((category) => search(query, profile.marketplace, category, profile.locationCountry))
    );
    const seen = new Set<string>();
    const items = batches.flat().filter((item) => {
      const key = item.itemWebUrl ?? item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    let listings: EbayListing[] = [];
    for (const item of items) {
      // Titolo originale + versione senza accenti: \b non riconosce "é" come lettera.
      const text = `${item.title} ${foldText(item.title)}`;
      if (!item.price || GRADED.test(text) || NOT_A_SINGLE_VOLUME.test(text)) continue;
      if (CARD_CODE.test(item.title)) continue;
      if (!input.isSpecialEdition && SPECIAL_EDITION.test(text)) continue;
      if (input.isFirstPrint === false && FIRST_PRINT.test(text)) continue;
      if (profile.exclude.test(text) || !isbnMatchesEdition(item.title, profile.code)) continue;
      if (profile.require && !profile.require.test(text)) continue;
      if (!titleMatchesVolume(item.title, input.series, input.volume)) continue;
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
    let printLabel = "";
    if (input.isFirstPrint === true) {
      const firstPrints = listings.filter((listing) => FIRST_PRINT.test(listing.title));
      if (firstPrints.length >= MIN_LISTINGS) {
        listings = firstPrints;
        printLabel = ", prima stampa";
      }
    }
    return summarize(
      listings,
      empty,
      `${input.series} vol. ${input.volume} (edizione ${profile.code}${printLabel}, ${profile.domain})`
    );
  } catch (cause) {
    return { ...empty, configured: true, note: cause instanceof Error ? cause.message : "errore eBay." };
  }
}

function summarize(
  listings: EbayListing[],
  empty: { listings: EbayListing[]; value_eur: null; search_url: string },
  label: string
): EbayZasshiResult {
  const first = listings.length > 0 ? median(listings.map((l) => l.price_eur)) : 0;
  const kept = listings
    .filter((l) => l.price_eur >= first / 3 && l.price_eur <= first * 3)
    .sort((a, b) => a.price_eur - b.price_eur);
  if (kept.length < MIN_LISTINGS) {
    return {
      ...empty,
      configured: true,
      listings: kept,
      note:
        kept.length === 0
          ? `nessun annuncio compatibile per ${label}.`
          : `solo ${kept.length} annunci per ${label} (${kept.map((l) => `${round2(l.price_eur)} €`).join(", ")}): troppo pochi per una stima.`,
    };
  }
  return {
    configured: true,
    value_eur: round2(median(kept.map((l) => l.price_eur))),
    listings: kept,
    search_url: empty.search_url,
    note: `eBay: mediana di ${kept.length} annunci attivi per ${label}, prezzi richiesti e non vendite concluse.`,
  };
}
