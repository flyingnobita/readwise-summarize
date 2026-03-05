#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { parse, stringify } from "smol-toml";
import { config } from "./lib/config.js";
import { refreshFreeModels } from "./lib/openrouter.js";
import { summarizeDocuments } from "./lib/summarize.js";
import type { OutputDocument } from "./lib/types.js";

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "../config.toml");
const instructions = readFileSync(join(__dirname, "../config_prompt.md"), "utf-8").trim();

function parsePositiveInt(value: string, flag: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) {
    process.stderr.write(`Error: ${flag} must be a positive integer, got "${value}".\n`);
    process.exit(1);
  }
  return n;
}

function parseNonNegativeInt(value: string, flag: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 0) {
    process.stderr.write(`Error: ${flag} must be a non-negative integer, got "${value}".\n`);
    process.exit(1);
  }
  return n;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("summarize")
    .description("Summarize articles from a reader-fetch output file, or from stdin if no file given")
    .argument("[file]", "Path to articles-YYYY-MM-DD.json produced by reader-fetch")
    .option(
      "--model <id>",
      "Model ID e.g. google/gemma-3-27b-it:free (default: config.summarize.model)"
    )
    .option("--scan-free", "Scan OpenRouter for free models, save top result to config, use it")
    .option("--with-original", "Include original Readwise summary field in output")
    .option(
      "--concurrency <n>",
      "Parallel workers (default: config.summarize.concurrency)",
      String(config.summarize.concurrency)
    )
    .option(
      "--max-tokens <n>",
      "Max tokens per summary (default: config.summarize.max_tokens)",
      String(config.summarize.max_tokens)
    )
    .option(
      "--timeout <ms>",
      "Per-request timeout ms (default: config.summarize.timeout_ms)",
      String(config.summarize.timeout_ms)
    )
    .option("--verbose", "Print progress to stderr")
    .option("--output-dir <dir>", "Directory to write <prefix>-YYYY-MM-DD.json (default: stdout)")
    .option("--prefix <name>", "Filename prefix for output file (default: summaries)")
    .parse();

  const opts = program.opts<{
    model?: string;
    scanFree?: boolean;
    withOriginal?: boolean;
    concurrency: string;
    maxTokens: string;
    timeout: string;
    verbose?: boolean;
    outputDir?: string;
    prefix?: string;
  }>();

  const apiKey = process.env.OPEN_ROUTER_SUMMARIZE_API;
  if (!apiKey) {
    process.stderr.write("Error: OPEN_ROUTER_SUMMARIZE_API environment variable is not set.\n");
    process.exit(1);
  }

  const verbose = opts.verbose ?? false;
  const log = (msg: string) => {
    if (verbose) process.stderr.write(msg + "\n");
  };

  // Resolve model ID
  let modelId: string | undefined = opts.model;

  if (opts.scanFree) {
    log("Scanning OpenRouter for free models...");
    const ranked = await refreshFreeModels({
      apiUrl: config.openrouter.api_url,
      apiKey,
      idSuffix: config.openrouter.id_suffix,
      minParamB: config.openrouter.min_param_b,
      maxAgeDays: config.openrouter.max_age_days,
      concurrency: config.openrouter.concurrency,
      timeoutMs: config.openrouter.timeout_ms,
      maxCandidates: config.openrouter.max_candidates,
      smartPicks: config.openrouter.smart_picks,
      extraRuns: config.openrouter.extra_runs,
      onProgress: verbose ? (msg) => process.stderr.write(msg + "\n") : undefined,
    });

    if (ranked.length === 0) {
      process.stderr.write("Error: --scan-free found no suitable models.\n");
      process.exit(1);
    }

    const topModel = ranked[0].modelId;
    log(`Top free model: ${topModel}`);

    // Update config.toml atomically
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw) as Record<string, unknown>;
    const summarizeSection = (parsed["summarize"] ?? {}) as Record<string, unknown>;
    summarizeSection["model"] = topModel;
    parsed["summarize"] = summarizeSection;
    const updated = stringify(parsed);
    const tmpPath = configPath + ".tmp";
    writeFileSync(tmpPath, updated, "utf-8");
    renameSync(tmpPath, configPath);
    log(`Updated config.toml: summarize.model = "${topModel}"`);

    modelId = topModel;
  }

  if (!modelId) {
    modelId = config.summarize.model;
  }

  if (!modelId) {
    process.stderr.write(
      'Error: No model specified. Use --model, --scan-free, or set summarize.model in config.toml\n'
    );
    process.exit(1);
  }

  // Read input: file argument or stdin
  const inputFile = program.args[0] as string | undefined;
  let input: string;

  if (inputFile) {
    if (!existsSync(inputFile)) {
      process.stderr.write(`Error: File not found: ${inputFile}\n`);
      process.exit(1);
    }
    input = readFileSync(inputFile, "utf-8").trim();
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    input = Buffer.concat(chunks).toString("utf-8").trim();
    if (!input) {
      process.stderr.write("Error: No input received from stdin.\n");
      process.exit(1);
    }
  }

  let docs: OutputDocument[];
  try {
    const parsed = JSON.parse(input) as unknown;
    // Envelope format from reader-fetch
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const envelope = parsed as Record<string, unknown>;
      if (envelope["complete"] !== true) {
        process.stderr.write("Error: Input file is incomplete or was not fully written.\n");
        process.exit(1);
      }
      docs = envelope["documents"] as OutputDocument[];
    } else if (Array.isArray(parsed)) {
      // Legacy: bare array from stdin
      docs = parsed as OutputDocument[];
    } else {
      process.stderr.write("Error: Input must be a JSON object (envelope) or array.\n");
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: Failed to parse input as JSON: ${msg}\n`);
    process.exit(1);
  }

  if (!Array.isArray(docs)) {
    process.stderr.write("Error: documents field must be a JSON array.\n");
    process.exit(1);
  }

  log(`Summarizing ${docs.length} document(s) with model: ${modelId}`);

  const results = await summarizeDocuments(
    docs,
    {
      apiUrl: config.openrouter.api_url,
      apiKey,
      modelId,
      maxTokens: parseNonNegativeInt(opts.maxTokens, "--max-tokens"),
      lengthInstruction: config.summarize.length_instruction,
      temperature: config.summarize.temperature,
      systemPrompt: config.summarize.system_prompt,
      userPromptTemplate: config.summarize.user_prompt_template,
      instructions,
      timeoutMs: parsePositiveInt(opts.timeout, "--timeout"),
      concurrency: parsePositiveInt(opts.concurrency, "--concurrency"),
      withOriginal: opts.withOriginal ?? false,
      onDebug: verbose ? (msg) => process.stderr.write(`[debug] ${msg}\n`) : undefined,
    },
    verbose ? (msg) => process.stderr.write(msg + "\n") : undefined
  );

  if (opts.outputDir) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const outDir = resolve(opts.outputDir);
    const prefix = opts.prefix ?? "summaries";
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${prefix}-${dateStr}.json`);
    const tmpPath = outPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(results, null, 2) + "\n", "utf-8");
    renameSync(tmpPath, outPath);
    process.stderr.write(`Output: ${outPath}\n`);
  } else {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
});
