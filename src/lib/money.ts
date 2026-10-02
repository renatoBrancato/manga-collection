/**
 * Formattazione dei prezzi a prova di dato sporco.
 *
 * `Intl.NumberFormat` lancia un RangeError se il codice valuta non è di tre
 * lettere. Chiamato durante il render di un componente React, quell'errore
 * fa smontare l'intera pagina: all'utente resta una schermata bianca, senza
 * alcun indizio su cosa sia successo. È capitato davvero, con un pezzo
 * salvato con valuta "EUR 30".
 *
 * I dati arrivano anche da un modello linguistico, quindi non possiamo
 * dare per scontato che siano puliti: qui una valuta non valida diventa
 * semplicemente EUR invece di rompere tutto.
 */

function safeCurrency(currency?: string | null): string {
  const code = currency?.trim().toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

export function formatMoney(value: number, currency?: string | null): string {
  return value.toLocaleString("it-IT", { style: "currency", currency: safeCurrency(currency) });
}

/** Come formatMoney ma con il segno davanti, per le variazioni di prezzo. */
export function formatMoneyDelta(value: number, currency?: string | null): string {
  const text = formatMoney(Math.abs(value), currency);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}`;
}
