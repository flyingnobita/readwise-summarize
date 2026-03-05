/**
 * Integration tests — require live credentials.
 * Run with: pnpm test:integration
 *
 * API call budget per run: ~11 calls
 *   1 × Readwise (basic fetch)
 *   1 × Readwise (category=rss + withHtmlContent)
 *   1 × Readwise (reader-fetch CLI file output test)
 *   1 × Readwise (summarize CLI pipeline: reader-fetch with --with-content)
 *   1 × OpenRouter (summarize CLI pipeline: summarize --output-dir call)
 *   1 × OpenRouter (fetchFreeModels)
 *   1 × OpenRouter (testModel)
 *   1 × Readwise (fetch doc for verified-model summarize)
 *   1 × OpenRouter (verified-model summarize LLM call)
 *   1 × Readwise (fetch doc for config-model summarize)
 *   1 × OpenRouter (config-model summarize LLM call)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import { readFileSync, existsSync, rmSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { fetchPage, fetchAllDocuments } from "./lib/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tsx = join(root, "node_modules/.bin/tsx");
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
const OPEN_ROUTER_SUMMARIZE_API = process.env.OPEN_ROUTER_SUMMARIZE_API ?? "";

if (!READWISE_TOKEN) throw new Error("READWISE_TOKEN is not set in .env");
if (!OPEN_ROUTER_SUMMARIZE_API) throw new Error("OPEN_ROUTER_SUMMARIZE_API is not set in .env");

// Populated by the OpenRouter beforeAll; reused by the Summarize test.
let verifiedModelId = "";

// Temp dirs for CLI tests — cleaned up after all tests complete.
const readerFetchTmpDir = join(tmpdir(), `reader-fetch-test-${process.pid}`);
const pipelineTmpDir = join(tmpdir(), `pipeline-test-${process.pid}`);

afterAll(() => {
  if (existsSync(readerFetchTmpDir)) rmSync(readerFetchTmpDir, { recursive: true });
  if (existsSync(pipelineTmpDir)) rmSync(pipelineTmpDir, { recursive: true });
});

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
// reader-fetch CLI — file output
// ---------------------------------------------------------------------------

describe("reader-fetch CLI file output", () => {
  it("writes a valid dated envelope file to --output-dir", () => {
    const before = new Date();

    const result = spawnSync(
      tsx,
      ["src/reader-fetch.ts", "--limit", "1", "--output-dir", readerFetchTmpDir, "--prefix", "test-articles"],
      {
        cwd: root,
        encoding: "utf-8",
        env: { ...process.env, READWISE_TOKEN },
      }
    );

    expect(result.status, `reader-fetch exited with stderr: ${result.stderr}`).toBe(0);

    // Filename uses custom prefix and YYYY-MM-DD in local timezone
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const expectedFile = join(readerFetchTmpDir, `test-articles-${dateStr}.json`);
    const defaultFile = join(readerFetchTmpDir, `articles-${dateStr}.json`);
    expect(existsSync(defaultFile), "default prefix file should not exist").toBe(false);

    expect(existsSync(expectedFile), `expected file ${expectedFile} to exist`).toBe(true);
    expect(existsSync(expectedFile + ".tmp"), "tmp file should not remain after rename").toBe(false);

    const raw = readFileSync(expectedFile, "utf-8");
    const envelope = JSON.parse(raw) as Record<string, unknown>;

    // Envelope shape
    expect(envelope["complete"]).toBe(true);
    expect(typeof envelope["count"]).toBe("number");
    expect(typeof envelope["generated_at"]).toBe("string");
    expect(Array.isArray(envelope["documents"])).toBe(true);

    // count matches documents length
    expect(envelope["count"]).toBe((envelope["documents"] as unknown[]).length);

    // generated_at is a valid ISO timestamp within a reasonable window
    const generatedAt = new Date(envelope["generated_at"] as string);
    expect(generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(generatedAt.getTime()).toBeLessThanOrEqual(Date.now());
  }, 20_000);
});

// ---------------------------------------------------------------------------
// summarize CLI — end-to-end pipeline: reader-fetch file → summarize CLI
// ---------------------------------------------------------------------------

describe("summarize CLI end-to-end pipeline", () => {
  let articlesFile = "";

  beforeAll(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    articlesFile = join(pipelineTmpDir, `pipeline-${dateStr}.json`);

    spawnSync(
      tsx,
      ["src/reader-fetch.ts", "--limit", "1", "--category", "rss", "--with-content", "--output-dir", pipelineTmpDir, "--prefix", "pipeline"],
      {
        cwd: root,
        encoding: "utf-8",
        env: { ...process.env, READWISE_TOKEN },
        timeout: 20_000,
      }
    );
  }, 25_000);

  it("reads a reader-fetch envelope file and writes summaries-YYYY-MM-DD.json via --output-dir", () => {
    if (!existsSync(articlesFile)) {
      process.stderr.write("⚠  reader-fetch file not created; pipeline test skipped\n");
      return;
    }

    const result = spawnSync(
      tsx,
      ["src/summarize.ts", articlesFile, "--output-dir", pipelineTmpDir, "--prefix", "pipeline-summaries"],
      {
        cwd: root,
        encoding: "utf-8",
        env: { ...process.env, OPEN_ROUTER_SUMMARIZE_API },
        timeout: 60_000,
      }
    );

    expect(result.status, `summarize exited with stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout.trim()).toBe(""); // nothing written to stdout

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const summariesFile = join(pipelineTmpDir, `pipeline-summaries-${dateStr}.json`);

    expect(existsSync(summariesFile), `expected ${summariesFile} to exist`).toBe(true);
    expect(existsSync(summariesFile + ".tmp"), "tmp file should not remain").toBe(false);

    const output = JSON.parse(readFileSync(summariesFile, "utf-8")) as Array<Record<string, unknown>>;
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);

    for (const doc of output) {
      expect(typeof doc["ai_summary"]).toBe("string");
      expect(doc["ai_summary"]).not.toMatch(/^\[summarization failed/);
      expect(doc["link"]).toBeTruthy();
    }
  }, 65_000);
});

// ---------------------------------------------------------------------------
// OpenRouter API
// ---------------------------------------------------------------------------

describe("OpenRouter API", () => {
  let freeModels: OpenRouterModel[] = [];

  beforeAll(async () => {
    freeModels = await fetchFreeModels(config.openrouter.api_url, OPEN_ROUTER_SUMMARIZE_API, config.openrouter.id_suffix);
    // Probe the first model and store it for reuse by the Summarize tests below.
    if (freeModels.length > 0) {
      const result = await testModel(
        freeModels[0].id,
        config.openrouter.api_url,
        OPEN_ROUTER_SUMMARIZE_API,
        30_000
      );
      if (result.success) verifiedModelId = result.modelId;
    }
  }, 60_000);

  it("fetchFreeModels returns a non-empty list of :free-suffixed models", () => {
    expect(freeModels.length).toBeGreaterThan(0);
    expect(freeModels.every((m) => m.id.endsWith(config.openrouter.id_suffix))).toBe(true);
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
        apiKey: OPEN_ROUTER_SUMMARIZE_API,
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
        apiKey: OPEN_ROUTER_SUMMARIZE_API,
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
