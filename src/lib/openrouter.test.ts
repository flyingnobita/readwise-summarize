import { describe, it, expect, vi, afterEach } from "vitest";
import {
  inferParamBFromIdOrName,
  mapWithConcurrency,
  filterModels,
  buildSelection,
} from "./openrouter.js";
import type { OpenRouterModel, TestResult } from "./openrouter.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(overrides: Partial<OpenRouterModel> = {}): OpenRouterModel {
  return {
    id: "some-org/some-model-70b:free",
    name: "Some Model 70B",
    created: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 10, // 10 days ago
    context_length: 32000,
    top_provider: { max_completion_tokens: 4096 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// inferParamBFromIdOrName
// ---------------------------------------------------------------------------

describe("inferParamBFromIdOrName", () => {
  it("extracts integer param count from a plain string like '70b'", () => {
    expect(inferParamBFromIdOrName("70b")).toBe(70);
  });

  it("extracts param count from a full model id", () => {
    expect(inferParamBFromIdOrName("meta-llama/llama-3.3-70b-instruct:free")).toBe(70);
  });

  it("extracts fractional param count like '1.5b'", () => {
    expect(inferParamBFromIdOrName("gemma-1.5b-it:free")).toBe(1.5);
  });

  it("returns 0 when no param count pattern is found", () => {
    expect(inferParamBFromIdOrName("openai/gpt-4o:free")).toBe(0);
  });

  it("returns the largest value when multiple patterns are present", () => {
    // e.g. a hypothetical id with both 7b and 70b
    expect(inferParamBFromIdOrName("model-7b-finetune-70b:free")).toBe(70);
  });

  it("is case-insensitive", () => {
    expect(inferParamBFromIdOrName("Model-32B")).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// mapWithConcurrency
// ---------------------------------------------------------------------------

describe("mapWithConcurrency", () => {
  it("processes all items and returns correct results", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (x) => x * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("handles an empty array", async () => {
    const results = await mapWithConcurrency([], 4, async (x: number) => x);
    expect(results).toEqual([]);
  });

  it("respects concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (x) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        // Yield to allow other tasks to start
        await new Promise((resolve) => setTimeout(resolve, 5));
        concurrent--;
        return x;
      }
    );

    expect(results).toEqual([1, 2, 3, 4, 5, 6]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("works when concurrency exceeds item count", async () => {
    const results = await mapWithConcurrency([10, 20], 100, async (x) => x + 1);
    expect(results).toEqual([11, 21]);
  });
});

// ---------------------------------------------------------------------------
// filterModels
// ---------------------------------------------------------------------------

describe("filterModels", () => {
  const nowSec = Math.floor(Date.now() / 1000);

  it("includes a model within the age and param limits", () => {
    const model = makeModel({
      id: "org/model-70b:free",
      created: nowSec - 60 * 24 * 3600, // 60 days ago
    });
    const result = filterModels([model], { minParamB: 27, maxAgeDays: 180 });
    expect(result).toHaveLength(1);
  });

  it("excludes a model older than maxAgeDays", () => {
    const model = makeModel({
      id: "org/model-70b:free",
      created: nowSec - 200 * 24 * 3600, // 200 days ago
    });
    const result = filterModels([model], { minParamB: 0, maxAgeDays: 180 });
    expect(result).toHaveLength(0);
  });

  it("skips age filter when maxAgeDays is 0", () => {
    const model = makeModel({
      id: "org/model-70b:free",
      created: nowSec - 1000 * 24 * 3600, // very old
    });
    const result = filterModels([model], { minParamB: 0, maxAgeDays: 0 });
    expect(result).toHaveLength(1);
  });

  it("excludes a model whose inferred param count is below minParamB", () => {
    const model = makeModel({
      id: "org/model-7b:free",
      name: "Small Model 7B",
      created: nowSec - 10 * 24 * 3600,
    });
    const result = filterModels([model], { minParamB: 27, maxAgeDays: 180 });
    expect(result).toHaveLength(0);
  });

  it("skips param filter when minParamB is 0", () => {
    const model = makeModel({
      id: "org/tiny-model:free",
      name: "Tiny Model",
      created: nowSec - 10 * 24 * 3600,
    });
    const result = filterModels([model], { minParamB: 0, maxAgeDays: 180 });
    expect(result).toHaveLength(1);
  });

  it("includes a model whose param count exactly meets minParamB", () => {
    const model = makeModel({
      id: "org/model-27b:free",
      name: "Model 27B",
      created: nowSec - 10 * 24 * 3600,
    });
    const result = filterModels([model], { minParamB: 27, maxAgeDays: 180 });
    expect(result).toHaveLength(1);
  });

  it("applies both filters simultaneously", () => {
    const nowSec2 = Math.floor(Date.now() / 1000);
    const oldSmall = makeModel({
      id: "org/model-7b:free",
      name: "Old Small 7B",
      created: nowSec2 - 200 * 24 * 3600,
    });
    const recentLarge = makeModel({
      id: "org/model-70b:free",
      name: "Recent Large 70B",
      created: nowSec2 - 30 * 24 * 3600,
    });
    const result = filterModels([oldSmall, recentLarge], { minParamB: 27, maxAgeDays: 180 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("org/model-70b:free");
  });
});

// ---------------------------------------------------------------------------
// buildSelection
// ---------------------------------------------------------------------------

describe("buildSelection", () => {
  function makeResult(modelId: string, latencyMs: number, success = true): TestResult {
    return { modelId, latencyMs, success };
  }

  function makeSmartModel(id: string, created: number, contextLength = 32000): OpenRouterModel {
    return makeModel({ id, created, context_length: contextLength });
  }

  const nowSec = Math.floor(Date.now() / 1000);

  const smartSorted = [
    makeSmartModel("org/model-a-70b:free", nowSec - 5 * 24 * 3600, 128000), // newest, longest ctx
    makeSmartModel("org/model-b-70b:free", nowSec - 10 * 24 * 3600, 64000),
    makeSmartModel("org/model-c-70b:free", nowSec - 20 * 24 * 3600, 32000),
    makeSmartModel("org/model-d-70b:free", nowSec - 30 * 24 * 3600, 32000),
    makeSmartModel("org/model-e-70b:free", nowSec - 40 * 24 * 3600, 32000),
  ];

  it("picks smartPicks from smart-sorted list first", () => {
    const results = [
      makeResult("org/model-a-70b:free", 500),
      makeResult("org/model-b-70b:free", 200),
      makeResult("org/model-c-70b:free", 100),
      makeResult("org/model-d-70b:free", 150),
      makeResult("org/model-e-70b:free", 300),
    ];

    const selected = buildSelection(results, {
      maxCandidates: 5,
      smartPicks: 2,
      smartSorted,
    });

    // First 2 should be smart picks (model-a and model-b)
    expect(selected[0]).toBe("org/model-a-70b:free");
    expect(selected[1]).toBe("org/model-b-70b:free");
    expect(selected).toHaveLength(5);
  });

  it("does not exceed maxCandidates", () => {
    const results = [
      makeResult("org/model-a-70b:free", 500),
      makeResult("org/model-b-70b:free", 200),
      makeResult("org/model-c-70b:free", 100),
      makeResult("org/model-d-70b:free", 150),
      makeResult("org/model-e-70b:free", 300),
    ];

    const selected = buildSelection(results, {
      maxCandidates: 3,
      smartPicks: 2,
      smartSorted,
    });

    expect(selected).toHaveLength(3);
  });

  it("does not include failed models", () => {
    const results = [
      makeResult("org/model-a-70b:free", 500, false), // failed
      makeResult("org/model-b-70b:free", 200),
      makeResult("org/model-c-70b:free", 100),
    ];

    const selected = buildSelection(results, {
      maxCandidates: 5,
      smartPicks: 2,
      smartSorted,
    });

    expect(selected).not.toContain("org/model-a-70b:free");
  });

  it("deduplicates: smart picks do not appear again in fast fills", () => {
    const results = [
      makeResult("org/model-a-70b:free", 100), // fastest AND smart pick
      makeResult("org/model-b-70b:free", 200),
      makeResult("org/model-c-70b:free", 300),
    ];

    const selected = buildSelection(results, {
      maxCandidates: 5,
      smartPicks: 1,
      smartSorted,
    });

    const uniqueIds = new Set(selected);
    expect(uniqueIds.size).toBe(selected.length);
  });

  it("handles fewer successful models than maxCandidates", () => {
    const results = [
      makeResult("org/model-a-70b:free", 500),
      makeResult("org/model-b-70b:free", 200),
    ];

    const selected = buildSelection(results, {
      maxCandidates: 10,
      smartPicks: 3,
      smartSorted,
    });

    expect(selected).toHaveLength(2);
  });

  it("fast fills are ordered by latency ascending", () => {
    const results = [
      makeResult("org/model-c-70b:free", 300),
      makeResult("org/model-d-70b:free", 150),
      makeResult("org/model-e-70b:free", 50),
    ];

    // smartSorted only has these three; pick 0 smart, fill all with fast
    const localSmart = [
      makeSmartModel("org/model-c-70b:free", nowSec - 20 * 24 * 3600),
      makeSmartModel("org/model-d-70b:free", nowSec - 30 * 24 * 3600),
      makeSmartModel("org/model-e-70b:free", nowSec - 40 * 24 * 3600),
    ];

    const selected = buildSelection(results, {
      maxCandidates: 3,
      smartPicks: 0,
      smartSorted: localSmart,
    });

    expect(selected[0]).toBe("org/model-e-70b:free"); // 50ms
    expect(selected[1]).toBe("org/model-d-70b:free"); // 150ms
    expect(selected[2]).toBe("org/model-c-70b:free"); // 300ms
  });

  it("returns empty array when no models succeeded", () => {
    const results = [makeResult("org/model-a-70b:free", 0, false)];

    const selected = buildSelection(results, {
      maxCandidates: 5,
      smartPicks: 2,
      smartSorted,
    });

    expect(selected).toHaveLength(0);
  });
});
