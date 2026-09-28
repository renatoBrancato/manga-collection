/**
 * Accesso diretto ai dati del Manga Price Tracker di West Blue.
 *
 * La pagina pubblica carica i prezzi via JavaScript da un indice JSON su CDN,
 * quindi una ricerca web non riesce a leggere le righe di vendita: vede solo
 * il testo statico della pagina. Interrogando direttamente il dataset
 * otteniamo invece la riga esatta (serie, volume, voto, OBI) richiesta dalle
 * regole di valutazione, in modo deterministico e senza costi di token.
 */

const CDN = "https://cdn.shopify.com/s/files/1/0722/8532/3421/files/";
const INDEX_FILE = "manga_tracker_index.json";
export const PRICE_TRACKER_URL = "https://westblue.shop/pages/manga-price-tracker";

const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const CHUNK_TTL_MS = 6 * 60 * 60 * 1000;
const RATE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_USD_EUR = 0.92;

type TrackerIndex = {
  updated_at?: string;
  datasets: Record<string, Record<string, string>>;
};

export type TrackerRow = {
  series?: string;
  title?: string;
  volume?: number | null;
  grade?: number | null;
  obi?: string | null;
  language?: string | null;
  price_usd?: number | null;
  sold_date?: string | null;
  condition?: string | null;
  type?: string | null;
  url?: string | null;
  magazine?: string | null;
  issue_year?: number | null;
  issue_number?: string | null;
  suspect_price?: boolean;
  restored?: boolean;
};

type Cached<T> = { value: T; expires: number };

let indexCache: Cached<TrackerIndex> | null = null;
const chunkCache = new Map<string, Cached<TrackerRow[]>>();
let rateCache: Cached<number> | null = null;

async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Richiesta fallita (${response.status}) su ${url}`);
  return (await response.json()) as T;
}

async function getIndex(): Promise<TrackerIndex> {
  const now = Date.now();
  if (indexCache && indexCache.expires > now) return indexCache.value;

  const value = await fetchJson<TrackerIndex>(`${CDN}${INDEX_FILE}?v=${Math.floor(now / INDEX_TTL_MS)}`);
  indexCache = { value, expires: now + INDEX_TTL_MS };
  return value;
}

async function getChunk(file: string): Promise<TrackerRow[]> {
  const now = Date.now();
  const cached = chunkCache.get(file);
  if (cached && cached.expires > now) return cached.value;

  const payload = await fetchJson<{ records?: TrackerRow[] }>(`${CDN}${file}`);
  const value = payload.records ?? [];
  chunkCache.set(file, { value, expires: now + CHUNK_TTL_MS });
  return value;
}

/** Tutte le righe di un dataset (usato per gli zasshi, indicizzati per contenuto e non per rivista). */
async function getAllRows(dataset: string): Promise<Array<TrackerRow & { _series: string }>> {
  const index = await getIndex();
  const entries = Object.entries(index.datasets?.[dataset] ?? {});
  const out: Array<TrackerRow & { _series: string }> = [];
  for (let i = 0; i < entries.length; i += 10) {
    const batch = await Promise.all(
      entries.slice(i, i + 10).map(async ([series, file]) =>
        (await getChunk(file)).map((row) => ({ ...row, _series: series }))
      )
    );
    batch.forEach((rows) => out.push(...rows));
  }
  return out;
}

export async function getUsdToEurRate(): Promise<number> {
  const now = Date.now();
  if (rateCache && rateCache.expires > now) return rateCache.value;

  try {
    const payload = await fetchJson<{ rates?: Record<string, number> }>(
      "https://open.er-api.com/v6/latest/USD",
      8_000
    );
    const rate = payload.rates?.EUR;
    if (typeof rate === "number" && rate > 0) {
      rateCache = { value: rate, expires: now + RATE_TTL_MS };
      return rate;
    }
  } catch {
    // Il cambio non è critico: si prosegue con un valore di riserva.
  }

  return FALLBACK_USD_EUR;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bno\.?\s*(?=\d)/g, "#")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Nomi giapponesi delle riviste più comuni, che normalize() ridurrebbe a "".
const MAGAZINE_ALIASES: Array<[RegExp, string]> = [
  [/週刊少年ジャンプ|少年ジャンプ|ジャンプ/, "weekly shonen jump"],
  [/週刊少年マガジン|少年マガジン/, "weekly shonen magazine"],
  [/週刊少年サンデー|少年サンデー/, "weekly shonen sunday"],
  [/月刊少年ジャンプ/, "monthly shonen jump"],
  [/ジャンプスクエア|ジャンプSQ/i, "jump square"],
  [/赤マルジャンプ/, "akamaru jump"],
  [/ヤングジャンプ/, "weekly young jump"],
  [/コロコロ/, "corocoro comic"],
];

function magazineKey(value: string): string {
  const alias = MAGAZINE_ALIASES.find(([pattern]) => pattern.test(value));
  if (alias) return alias[1];
  return normalize(value).replace(/^shonen jump$/, "weekly shonen jump");
}

/**
 * Scompone un numero di rivista in anno e numeri: "36-37" → [36, 37],
 * "1997-34" → anno 1997 e [34], "Issue #36–37 (Aug 2001)" → [36, 37],
 * "Vol.34 / Issue #34" → [34].
 */
export function parseIssue(value: string | null | undefined): { year: number | null; numbers: number[] } {
  if (!value) return { year: null, numbers: [] };
  const text = value.replace(/\([^)]*\)/g, " ");
  const years = [...text.matchAll(/\b(19[5-9]\d|20\d\d)\b/g)].map((m) => Number(m[1]));
  // Set: "Vol.34 / Issue #34" indica un solo numero, non 34 e 34.
  const numbers = [
    ...new Set([...text.replace(/\b(19[5-9]\d|20\d\d)\b/g, " ").matchAll(/\d{1,3}/g)].map((m) => Number(m[0]))),
  ].sort((a, b) => a - b);
  return { year: years[0] ?? null, numbers };
}

/** Trova la serie del tracker più vicina al nome fornito dall'utente. */
export function matchSeriesName(query: string, available: string[]): string | null {
  const target = normalize(query);
  if (!target) return null;

  const exact = available.find((name) => normalize(name) === target);
  if (exact) return exact;

  const scored = available
    .map((name) => {
      const candidate = normalize(name);
      if (candidate.startsWith(target) || target.startsWith(candidate)) {
        return { name, score: 500 - Math.abs(candidate.length - target.length) };
      }
      if (candidate.includes(target) || target.includes(candidate)) {
        return { name, score: 250 - Math.abs(candidate.length - target.length) };
      }
      return { name, score: 0 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.name ?? null;
}

/**
 * Nome della serie come indicizzato dal tracker e link alla pagina West Blue.
 * La pagina accetta solo `#t=<serie>` e si apre sempre sulla vista Graded:
 * volume, OBI e tipo vanno impostati a mano, quindi si restituisce anche se
 * la serie esiste nel dataset graded (altrimenti il link non la preseleziona).
 */
export async function resolveTrackerLink(input: {
  series: string;
  format?: "tankobon" | "zashi" | null;
  graded: boolean;
}): Promise<{ series: string | null; url: string; preselected: boolean }> {
  const index = await getIndex();
  const dataset = input.format === "zashi" ? "sold_zasshi" : input.graded ? "sold_graded" : "sold_raw";
  const matched = matchSeriesName(input.series, Object.keys(index.datasets?.[dataset] ?? {}));
  if (!matched) return { series: null, url: PRICE_TRACKER_URL, preselected: false };
  const inGraded = Boolean(index.datasets?.sold_graded?.[matched]);
  return {
    series: matched,
    url: `${PRICE_TRACKER_URL}#t=${encodeURIComponent(matched)}`,
    preselected: input.format !== "zashi" && inGraded,
  };
}

function parseSoldDate(row: TrackerRow): number {
  const parsed = row.sold_date ? Date.parse(row.sold_date) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type PriceLookupInput = {
  series: string;
  volume?: number | null;
  format?: "tankobon" | "zashi" | null;
  graded: boolean;
  grade?: number | null;
  hasObi?: boolean | null;
  /** Solo zasshi: numero come stampato (es. "36-37"). */
  issue?: string | null;
  /** Solo zasshi: anno di uscita del numero. */
  year?: number | null;
};

export type PriceLookupResult = {
  source: string;
  tracker_updated_at?: string;
  series_query: string;
  series_matched: string | null;
  dataset: string;
  market_state: "graded" | "raw";
  requested: {
    volume: number | null;
    grade: number | null;
    obi: "Yes" | "No" | "unknown";
    issue?: string | null;
    year?: number | null;
  };
  matched_rows: Array<{
    title?: string;
    volume?: number | null;
    grade?: number | null;
    obi?: string | null;
    price_usd?: number | null;
    sold_date?: string | null;
  }>;
  match_count: number;
  usd_eur_rate: number;
  suggested_value_eur: number | null;
  suggested_basis: string;
  note: string;
};

/**
 * Cerca sul tracker le vendite compatibili con il pezzo.
 *
 * Per i graded restituisce la riga esatta con stesso volume/voto (la più
 * recente), come richiesto dalle regole di valutazione. Per i RAW usa invece
 * la media delle vendite compatibili.
 */
export async function lookupMarketPrice(input: PriceLookupInput): Promise<PriceLookupResult> {
  if (input.format === "zashi") return lookupZasshiPrice(input);
  const dataset = input.graded ? "sold_graded" : "sold_raw";
  const rate = await getUsdToEurRate();
  const index = await getIndex();
  const available = Object.keys(index.datasets?.[dataset] ?? {});
  const matchedSeries = matchSeriesName(input.series, available);

  const base: PriceLookupResult = {
    source: PRICE_TRACKER_URL,
    tracker_updated_at: index.updated_at,
    series_query: input.series,
    series_matched: matchedSeries,
    dataset,
    market_state: input.graded ? "graded" : "raw",
    requested: {
      volume: input.volume ?? null,
      grade: input.grade ?? null,
      obi: input.hasObi === true ? "Yes" : input.hasObi === false ? "No" : "unknown",
    },
    matched_rows: [],
    match_count: 0,
    usd_eur_rate: round2(rate),
    suggested_value_eur: null,
    suggested_basis: "none",
    note: "",
  };

  if (!matchedSeries) {
    return {
      ...base,
      note: `La serie "${input.series}" non è presente nel dataset ${dataset} del tracker. Non inventare un valore.`,
    };
  }

  const file = index.datasets[dataset][matchedSeries];
  const rows = (await getChunk(file)).filter(
    (row) => typeof row.price_usd === "number" && row.price_usd > 0 && !row.suspect_price
  );

  let candidates = rows;
  if (input.volume != null) {
    candidates = candidates.filter((row) => row.volume === input.volume);
  }
  if (input.hasObi != null) {
    const wanted = input.hasObi ? "Yes" : "No";
    const byObi = candidates.filter((row) => row.obi === wanted);
    if (byObi.length > 0) candidates = byObi;
  }
  if (input.graded && input.grade != null) {
    candidates = candidates.filter((row) => row.grade === input.grade);
  }

  candidates = [...candidates].sort((a, b) => parseSoldDate(b) - parseSoldDate(a));

  const matched_rows = candidates.slice(0, 10).map((row) => ({
    title: row.title,
    volume: row.volume,
    grade: row.grade,
    obi: row.obi,
    price_usd: row.price_usd,
    sold_date: row.sold_date,
  }));

  if (candidates.length === 0) {
    return {
      ...base,
      note: input.graded
        ? `Nessuna vendita graded compatibile (volume ${input.volume ?? "?"}, voto ${input.grade ?? "?"}) per ${matchedSeries}. Lascia il valore vuoto e spiegalo.`
        : `Nessuna vendita RAW compatibile per ${matchedSeries} volume ${input.volume ?? "?"}. Lascia il valore vuoto e spiegalo.`,
    };
  }

  if (input.graded) {
    const mostRecent = candidates[0];
    return {
      ...base,
      matched_rows,
      match_count: candidates.length,
      suggested_value_eur: round2((mostRecent.price_usd ?? 0) * rate),
      suggested_basis: "riga_esatta_piu_recente",
      note: `Graded: prezzo della riga esatta più recente (${mostRecent.title ?? "vendita"}, ${mostRecent.sold_date ?? "data n/d"}, $${mostRecent.price_usd}) convertito in EUR. Non è una media.`,
    };
  }

  const prices = candidates.map((row) => row.price_usd as number);
  return {
    ...base,
    matched_rows,
    match_count: candidates.length,
    suggested_value_eur: round2(median(prices) * rate),
    suggested_basis: "media_vendite_compatibili",
    note: `RAW: media (mediana, robusta agli outlier) di ${prices.length} vendite compatibili convertita in EUR.`,
  };
}

/**
 * Zasshi: il dataset è indicizzato per contenuto (Dragon Ball, One Piece,
 * "Weekly Shonen Jump"...) e ogni riga ha rivista, anno e numero, oltre al
 * tipo raw/graded. Un numero specifico si trova solo filtrando su tutte le
 * righe per rivista + numero (+ anno): cercarlo per nome della rivista
 * restituiva la media di numeri diversi, oppure nulla.
 */
async function lookupZasshiPrice(input: PriceLookupInput): Promise<PriceLookupResult> {
  const dataset = "sold_zasshi";
  const [rate, index, rows] = await Promise.all([getUsdToEurRate(), getIndex(), getAllRows(dataset)]);
  const requestedIssue = parseIssue(input.issue);
  const year = input.year ?? requestedIssue.year;
  const wantedMagazine = magazineKey(input.series);
  const seriesKey = matchSeriesName(input.series, Object.keys(index.datasets?.[dataset] ?? {}));

  const base: PriceLookupResult = {
    source: PRICE_TRACKER_URL,
    tracker_updated_at: index.updated_at,
    series_query: input.series,
    series_matched: null,
    dataset,
    market_state: input.graded ? "graded" : "raw",
    requested: {
      volume: null,
      grade: input.grade ?? null,
      obi: "unknown",
      issue: input.issue ?? null,
      year,
    },
    matched_rows: [],
    match_count: 0,
    usd_eur_rate: round2(rate),
    suggested_value_eur: null,
    suggested_basis: "none",
    note: "",
  };

  const valid = rows.filter((row) => typeof row.price_usd === "number" && row.price_usd > 0 && !row.suspect_price);
  const sameIssue = (row: TrackerRow) => {
    const parsed = parseIssue(row.issue_number);
    const rowYear = row.issue_year ?? parsed.year;
    return (
      parsed.numbers.join("-") === requestedIssue.numbers.join("-") && (year == null || rowYear == null || rowYear === year)
    );
  };
  const magazineMatches = (row: TrackerRow) => {
    const key = row.magazine ? magazineKey(row.magazine) : "";
    return Boolean(wantedMagazine && key && (key === wantedMagazine || key.includes(wantedMagazine) || wantedMagazine.includes(key)));
  };

  let pool: Array<TrackerRow & { _series: string }>;
  if (requestedIssue.numbers.length > 0) {
    pool = valid.filter((row) => (magazineMatches(row) || row._series === seriesKey) && sameIssue(row));
  } else {
    // Senza numero si può solo usare la voce del contenuto (es. "One Piece (Zoro debut)").
    pool = seriesKey ? valid.filter((row) => row._series === seriesKey) : [];
  }

  const poolYears = [...new Set(pool.map((row) => row.issue_year ?? parseIssue(row.issue_number).year).filter(Boolean))];
  if (year == null && requestedIssue.numbers.length > 0 && poolYears.length > 1) {
    // Lo stesso numero esce ogni anno: senza anno la mediana mescolerebbe annate diverse.
    return {
      ...base,
      series_matched: pool[0]?.magazine ?? seriesKey,
      note: `Il numero ${input.issue} di ${input.series} esiste in più annate nel tracker (${poolYears
        .sort()
        .join(", ")}). Serve l'anno: chiedilo all'utente, non indovinarlo, e ripeti la ricerca con year.`,
    };
  }

  const isGraded = (row: TrackerRow) => row.type === "graded" || (row.type !== "raw" && row.grade != null);
  let candidates = pool.filter((row) => (input.graded ? isGraded(row) : !isGraded(row)));
  if (input.graded && input.grade != null) candidates = candidates.filter((row) => row.grade === input.grade);
  candidates = [...candidates].sort((a, b) => parseSoldDate(b) - parseSoldDate(a));

  const toMatched = (row: TrackerRow) => ({
    title: row.title,
    volume: null,
    grade: row.grade,
    obi: row.obi,
    price_usd: row.price_usd,
    sold_date: row.sold_date,
  });
  const label = `${input.series}${input.issue ? ` #${input.issue}` : ""}${year ? ` (${year})` : ""}`;
  const matchedSeries = pool[0]?.magazine ?? seriesKey;

  if (candidates.length === 0) {
    const others = pool.filter((row) => (input.graded ? true : isGraded(row))).slice(0, 5);
    const reference =
      !input.graded && others.length > 0
        ? ` Esistono solo vendite GRADED di questo numero (${others
            .map((row) => `${row.grade ?? "?"}: $${row.price_usd}`)
            .join(", ")}): non usarle come valore di un pezzo RAW, citale solo come riferimento.`
        : "";
    return {
      ...base,
      series_matched: matchedSeries,
      matched_rows: others.map(toMatched),
      note:
        requestedIssue.numbers.length === 0
          ? `Numero della rivista mancante: senza numero (e anno) non si può trovare la vendita esatta di ${input.series}.`
          : `Nessuna vendita ${input.graded ? "graded compatibile" : "RAW"} per ${label}.${reference} Lascia il valore vuoto e spiegalo.`,
    };
  }

  const matched_rows = candidates.slice(0, 10).map(toMatched);
  if (input.graded) {
    const mostRecent = candidates[0];
    return {
      ...base,
      series_matched: matchedSeries,
      matched_rows,
      match_count: candidates.length,
      suggested_value_eur: round2((mostRecent.price_usd ?? 0) * rate),
      suggested_basis: "riga_esatta_piu_recente",
      note: `Graded: prezzo della riga esatta più recente per ${label} (${mostRecent.sold_date ?? "data n/d"}, $${mostRecent.price_usd}) convertito in EUR.`,
    };
  }
  const prices = candidates.map((row) => row.price_usd as number);
  return {
    ...base,
    series_matched: matchedSeries,
    matched_rows,
    match_count: candidates.length,
    suggested_value_eur: round2(median(prices) * rate),
    suggested_basis: "media_vendite_compatibili",
    note: `RAW: mediana di ${prices.length} vendite di ${label} convertita in EUR.`,
  };
}
