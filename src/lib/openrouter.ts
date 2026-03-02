export interface OpenRouterModel {
  id: string;
  name: string;
  created: number; // Unix timestamp (seconds)
  context_length: number;
  top_provider?: { max_completion_tokens?: number };
  supported_parameters?: string[];
}

export interface TestResult {
  modelId: string;
  latencyMs: number;
  success: boolean;
}

export interface RankedModel {
  modelId: string;
  latencyMs: number;
  paramB: number;
}

export interface RefreshOptions {
  apiUrl: string;
  apiKey: string;
  minParamB: number;
  maxAgeDays: number;
  concurrency: number;
  timeoutMs: number;
  maxCandidates: number;
  smartPicks: number;
  extraRuns: number;
  onProgress?: (msg: string) => void;
  fetchImpl?: typeof fetch;
}

/**
 * Infer parameter count in billions from a model id or name string.
 * Looks for patterns like "70b", "32b", "1.5b" (case-insensitive).
 * Returns the largest match found, or 0 if none.
 */
export function inferParamBFromIdOrName(text: string): number {
  const matches = text.matchAll(/(\d+(?:\.\d+)?)b/gi);
  let max = 0;
  for (const m of matches) {
    const val = parseFloat(m[1]);
    if (!isNaN(val) && val > max) {
      max = val;
    }
  }
  return max;
}

/**
 * Run async tasks over `items` with at most `concurrency` simultaneous promises.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) break;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Fetch all models from OpenRouter API and return only the free ones (id ends with `:free`).
 */
export async function fetchFreeModels(
  apiUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<OpenRouterModel[]> {
  const url = `${apiUrl}/models`;
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter models API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { data: OpenRouterModel[] };
  return data.data.filter((m) => m.id.endsWith(":free"));
}

/**
 * Filter a list of free models by age and minimum parameter count.
 */
export function filterModels(
  models: OpenRouterModel[],
  opts: { minParamB: number; maxAgeDays: number }
): OpenRouterModel[] {
  const nowMs = Date.now();
  const maxAgeMs = opts.maxAgeDays > 0 ? opts.maxAgeDays * 24 * 60 * 60 * 1000 : 0;

  return models.filter((model) => {
    // Age filter
    if (maxAgeMs > 0) {
      const ageMs = nowMs - model.created * 1000;
      if (ageMs > maxAgeMs) return false;
    }

    // Param size filter
    if (opts.minParamB > 0) {
      const paramB = inferParamBFromIdOrName(model.id + " " + model.name);
      if (paramB < opts.minParamB) return false;
    }

    return true;
  });
}

/**
 * Compute the median of an array of numbers. Returns Infinity if the array is empty.
 */
function median(values: number[]): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Test a single model by sending a probe prompt. Returns latency and success status.
 * Handles HTTP 429 with a 60s global cooldown and one retry.
 */
// Global rate-limit cooldown state shared across all testModel calls within a
// process. This is intentional: a 429 from any model backs off all subsequent
// probes. Not safe for concurrent independent callers in the same process.
let rateLimitCooldownUntil = 0;

export async function testModel(
  modelId: string,
  apiUrl: string,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<TestResult> {
  const url = `${apiUrl}/chat/completions`;
  const body = JSON.stringify({
    model: modelId,
    messages: [{ role: "user", content: "Reply with a single word: OK" }],
    max_tokens: 10,
  });

  async function attemptRequest(): Promise<TestResult> {
    // Respect any active rate-limit cooldown
    const now = Date.now();
    if (rateLimitCooldownUntil > now) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitCooldownUntil - now));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/flyingnobita/daily-brief",
          "X-Title": "daily-brief",
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      if (response.status === 429) {
        return { modelId, latencyMs: 0, success: false, isRateLimit: true } as TestResult & {
          isRateLimit: boolean;
        };
      }

      return { modelId, latencyMs, success: response.ok };
    } catch {
      clearTimeout(timer);
      return { modelId, latencyMs: Date.now() - start, success: false };
    }
  }

  const result = (await attemptRequest()) as TestResult & { isRateLimit?: boolean };

  if (result.isRateLimit) {
    // Wait 60s global cooldown then retry once
    rateLimitCooldownUntil = Date.now() + 60_000;
    await new Promise((resolve) => setTimeout(resolve, 60_000));

    const retry = await attemptRequest();
    return { modelId: retry.modelId, latencyMs: retry.latencyMs, success: retry.success };
  }

  return { modelId: result.modelId, latencyMs: result.latencyMs, success: result.success };
}

/**
 * Sort models for "smart-first" selection:
 * descending by createdAtMs, contextLength, maxCompletionTokens; then id ascending.
 */
function smartSort(models: OpenRouterModel[]): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    // created descending
    if (b.created !== a.created) return b.created - a.created;
    // context_length descending
    if (b.context_length !== a.context_length) return b.context_length - a.context_length;
    // max_completion_tokens descending
    const aTokens = a.top_provider?.max_completion_tokens ?? 0;
    const bTokens = b.top_provider?.max_completion_tokens ?? 0;
    if (bTokens !== aTokens) return bTokens - aTokens;
    // id ascending as tiebreaker
    return a.id.localeCompare(b.id);
  });
}

/**
 * Select final candidates from successful test results.
 * - `smartPicks` models from smart-sorted list
 * - Remaining slots filled from fast-sorted (by latency) list
 * - Total capped at maxCandidates
 */
export function buildSelection(
  results: TestResult[],
  opts: {
    maxCandidates: number;
    smartPicks: number;
    smartSorted: OpenRouterModel[];
  }
): string[] {
  const successful = results.filter((r) => r.success);

  const successfulIds = new Set(successful.map((r) => r.modelId));

  // Build latency map
  const latencyMap = new Map<string, number>(
    successful.map((r) => [r.modelId, r.latencyMs])
  );

  // Smart-sorted candidates (only successful ones)
  const smartCandidates = opts.smartSorted
    .filter((m) => successfulIds.has(m.id))
    .map((m) => m.id);

  const numSmart = Math.min(opts.smartPicks, smartCandidates.length, opts.maxCandidates);
  const picked = new Set<string>(smartCandidates.slice(0, numSmart));

  // Fast-sorted: by latency ascending, then id ascending
  const fastSorted = successful
    .slice()
    .sort((a, b) => {
      const latA = latencyMap.get(a.modelId) ?? Infinity;
      const latB = latencyMap.get(b.modelId) ?? Infinity;
      if (latA !== latB) return latA - latB;
      return a.modelId.localeCompare(b.modelId);
    })
    .map((r) => r.modelId);

  for (const id of fastSorted) {
    if (picked.size >= opts.maxCandidates) break;
    picked.add(id);
  }

  // Return in smart order first, then remaining fast picks
  const smartPicked = smartCandidates.slice(0, numSmart);
  const fastPicked = fastSorted.filter((id) => picked.has(id) && !new Set(smartPicked).has(id));

  return [...smartPicked, ...fastPicked];
}

/**
 * Orchestrate the full pipeline: fetch -> filter -> test -> rank -> return.
 */
export async function refreshFreeModels(opts: RefreshOptions): Promise<RankedModel[]> {
  const { onProgress, fetchImpl } = opts;

  onProgress?.("Fetching free models from OpenRouter...");
  const allFree = await fetchFreeModels(opts.apiUrl, opts.apiKey, fetchImpl);
  onProgress?.(`Found ${allFree.length} free models.`);

  const filtered = filterModels(allFree, {
    minParamB: opts.minParamB,
    maxAgeDays: opts.maxAgeDays,
  });
  onProgress?.(`After filtering: ${filtered.length} models.`);

  if (filtered.length === 0) {
    return [];
  }

  // Sort by smart criteria before testing
  const sortedForSmart = smartSort(filtered);

  onProgress?.(`Testing ${filtered.length} models with concurrency ${opts.concurrency}...`);

  // Initial probe pass
  const initialResults = await mapWithConcurrency(
    filtered,
    opts.concurrency,
    (model) => {
      onProgress?.(`  Testing ${model.id}...`);
      return testModel(model.id, opts.apiUrl, opts.apiKey, opts.timeoutMs, fetchImpl);
    }
  );

  const successCount = initialResults.filter((r) => r.success).length;
  onProgress?.(`Initial pass complete: ${successCount}/${filtered.length} succeeded.`);

  // Build initial selection
  const selectedIds = buildSelection(initialResults, {
    maxCandidates: opts.maxCandidates,
    smartPicks: opts.smartPicks,
    smartSorted: sortedForSmart,
  });

  onProgress?.(`Selected ${selectedIds.length} candidates. Running ${opts.extraRuns} extra timing runs...`);

  // Collect all latency measurements per model
  const allLatencies = new Map<string, number[]>();

  // Seed with initial results for selected models
  for (const result of initialResults) {
    if (selectedIds.includes(result.modelId) && result.success) {
      allLatencies.set(result.modelId, [result.latencyMs]);
    }
  }

  // Extra runs for selected candidates
  for (let run = 0; run < opts.extraRuns; run++) {
    onProgress?.(`  Extra run ${run + 1}/${opts.extraRuns}...`);
    const extraResults = await mapWithConcurrency(
      selectedIds,
      opts.concurrency,
      (modelId) => testModel(modelId, opts.apiUrl, opts.apiKey, opts.timeoutMs, fetchImpl)
    );

    for (const result of extraResults) {
      if (result.success) {
        const arr = allLatencies.get(result.modelId) ?? [];
        arr.push(result.latencyMs);
        allLatencies.set(result.modelId, arr);
      }
    }
  }

  // Build final ranked list in selection order
  const ranked: RankedModel[] = selectedIds.map((modelId) => {
    const latencies = allLatencies.get(modelId) ?? [];
    const medianLatency = median(latencies);
    const model = filtered.find((m) => m.id === modelId);
    const paramB = model ? inferParamBFromIdOrName(model.id + " " + model.name) : 0;
    return { modelId, latencyMs: medianLatency, paramB };
  });

  return ranked;
}
