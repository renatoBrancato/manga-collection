/**
 * Tariffe OpenAI (USD per 1M token, Responses API, prezzi standard — non
 * batch) usate per stimare il costo reale di ogni turno di chat. Il modello
 * in uso è configurabile via OPENAI_CHAT_MODEL: se non è in tabella si
 * applicano le tariffe di DEFAULT_MODEL come stima prudente.
 */

type ModelRates = {
  /** $ per 1M token di input non in cache. */
  input: number;
  /** $ per 1M token di input riletti dalla cache del modello. */
  cachedInput: number;
  /** $ per 1M token di output (incluso il "reasoning"). */
  output: number;
};

const DEFAULT_MODEL = "gpt-5-mini";

const MODEL_RATES: Record<string, ModelRates> = {
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10.0 },
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export function emptyTokenUsage(): TokenUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
}

function ratesFor(model: string): ModelRates {
  return MODEL_RATES[model] ?? MODEL_RATES[DEFAULT_MODEL];
}

/** Stima in USD del costo di un turno a partire dai token consumati. */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const rates = ratesFor(model);
  const billableInput = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  return (
    (billableInput / 1_000_000) * rates.input +
    (usage.cachedInputTokens / 1_000_000) * rates.cachedInput +
    (usage.outputTokens / 1_000_000) * rates.output
  );
}
