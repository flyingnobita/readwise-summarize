/**
 * Integration tests — require live credentials.
 * Run with: pnpm test:integration
 *
 * API call budget per run: ~8 calls
 *   1 × Readwise (basic fetch)
 *   1 × Readwise (category=rss + withHtmlContent)
 *   1 × OpenRouter (fetchFreeModels)
 *   1 × OpenRouter (testModel)
 *   1 × Readwise (fetch doc for verified-model summarize)
 *   1 × OpenRouter (verified-model summarize LLM call)
 *   1 × Readwise (fetch doc for config-model summarize)
 *   1 × OpenRouter (config-model summarize LLM call)
 */

import { describe, it, expect, beforeAll } from "vitest";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fetchPage, fetchAllDocuments } from "./lib/api.js";
import { fetchFreeModels, testModel } from "./lib/openrouter.js";
import type { OpenRouterModel } from "./lib/openrouter.js";
import { summarizeDocument } from "./lib/summarize.js";
import { config } from "./lib/config.js";

const instructions = readFileSync(
  new URL("../config_prompt.md", import.meta.url),
  "utf-8"
).trim();

dotenv.config();

const READWISE_TOKEN = process.env.READWISE_TOKEN ?? "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

if (!READWISE_TOKEN) throw new Error("READWISE_TOKEN is not set in .env");
if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set in .env");

// Populated by the OpenRouter beforeAll; reused by the Summarize test.
let verifiedModelId = "";

// ---------------------------------------------------------------------------
// Readwise API
// ---------------------------------------------------------------------------

describe("Readwise API", () => {
  it("fetches a single page and returns valid document shape", async () => {
    const page = await fetchPage(READWISE_TOKEN, { limit: "1" });

    expect(Array.isArray(page.results)).toBe(true);
    if (page.results.length > 0) {
      const doc = page.results[0];
      expect(doc.id).toBeTruthy();
      expect(doc.url).toBeTruthy();
      expect(typeof doc.title).toBe("string");
    }
  }, 15_000);

  it("returns html_content field when withHtmlContent=true and category=rss", async () => {
    const docs = await fetchAllDocuments(
      READWISE_TOKEN,
      { limit: "1", category: "rss", withHtmlContent: "true" },
      { paginate: false }
    );

    if (docs.length > 0) {
      // The field must be present on the object (value may be null/empty for some articles)
      expect(Object.prototype.hasOwnProperty.call(docs[0], "html_content")).toBe(true);
    }
  }, 15_000);
});

// ---------------------------------------------------------------------------
// OpenRouter API
// ---------------------------------------------------------------------------

describe("OpenRouter API", () => {
  let freeModels: OpenRouterModel[] = [];

  beforeAll(async () => {
    freeModels = await fetchFreeModels(config.openrouter.api_url, OPENROUTER_API_KEY);
    // Probe the first model and store it for reuse by the Summarize tests below.
    if (freeModels.length > 0) {
      const result = await testModel(
        freeModels[0].id,
        config.openrouter.api_url,
        OPENROUTER_API_KEY,
        30_000
      );
      if (result.success) verifiedModelId = result.modelId;
    }
  }, 60_000);

  it("fetchFreeModels returns a non-empty list of :free-suffixed models", () => {
    expect(freeModels.length).toBeGreaterThan(0);
    expect(freeModels.every((m) => m.id.endsWith(":free"))).toBe(true);
  });

  it("testModel returns success and a positive latency for a live free model", () => {
    expect(verifiedModelId).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// Summarize — end-to-end: Readwise content → OpenRouter LLM
// ---------------------------------------------------------------------------

describe("summarizeDocument", () => {
  it("returns a non-empty AI summary and original_summary when withOriginal=true", async () => {
    // Fetch up to 3 RSS docs to find one with actual html_content
    const docs = await fetchAllDocuments(
      READWISE_TOKEN,
      { limit: "3", category: "rss", withHtmlContent: "true" },
      { paginate: false }
    );

    const doc = docs.find((d) => d.html_content);
    if (!doc) {
      process.stderr.write("⚠  No RSS doc with html_content found; summary assertions skipped\n");
      return;
    }

    if (!verifiedModelId) {
      process.stderr.write("⚠  No verified free model available; summary test skipped\n");
      return;
    }

    const result = await summarizeDocument(
      {
        id: doc.id,
        title: doc.title,
        author: doc.author,
        url: doc.url,
        source_url: doc.source_url,
        html_content: doc.html_content,
        summary: doc.summary,
      },
      {
        apiUrl: config.openrouter.api_url,
        apiKey: OPENROUTER_API_KEY,
        modelId: verifiedModelId,
        maxTokens: config.summarize.max_tokens,
        lengthInstruction: config.summarize.length_instruction,
        temperature: config.summarize.temperature,
        systemPrompt: config.summarize.system_prompt,
        userPromptTemplate: config.summarize.user_prompt_template,
        instructions,
        timeoutMs: config.summarize.timeout_ms,
        concurrency: 1,
        withOriginal: true,
      }
    );

    expect(result.ai_summary).not.toBe("[no content available]");
    expect(result.ai_summary).not.toMatch(/^\[summarization failed/);
    expect(result.ai_summary.length).toBeGreaterThan(20);
    expect(result.link).toBeTruthy();
    expect(result.original_summary).toBe(doc.summary);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Summarize — config model: exercises the exact model, token settings, and
// length_instruction from config.toml + config_prompt.md.
// Catches regressions like "model returned empty content" or "hit token limit"
// that only appear with the specific configured model and its token behavior.
// ---------------------------------------------------------------------------

describe("summarizeDocument with config.summarize.model", () => {
  it("produces a non-empty summary using the configured model and all config settings", async () => {
    const docs = await fetchAllDocuments(
      READWISE_TOKEN,
      { limit: "3", category: "rss", withHtmlContent: "true" },
      { paginate: false }
    );

    const doc = docs.find((d) => d.html_content);
    if (!doc) {
      process.stderr.write("⚠  No RSS doc with html_content found; config model summary test skipped\n");
      return;
    }

    const result = await summarizeDocument(
      {
        id: doc.id,
        title: doc.title,
        author: doc.author,
        url: doc.url,
        source_url: doc.source_url,
        html_content: doc.html_content,
        summary: doc.summary,
      },
      {
        apiUrl: config.openrouter.api_url,
        apiKey: OPENROUTER_API_KEY,
        modelId: config.summarize.model,
        maxTokens: config.summarize.max_tokens,
        lengthInstruction: config.summarize.length_instruction,
        temperature: config.summarize.temperature,
        systemPrompt: config.summarize.system_prompt,
        userPromptTemplate: config.summarize.user_prompt_template,
        instructions,
        timeoutMs: config.summarize.timeout_ms,
        concurrency: 1,
        withOriginal: false,
      }
    );

    expect(result.ai_summary).not.toBe("[no content available]");
    expect(result.ai_summary).not.toMatch(/^\[summarization failed/);
    expect(result.ai_summary.length).toBeGreaterThan(50);
    expect(result.link).toBeTruthy();
  }, 90_000);
});
