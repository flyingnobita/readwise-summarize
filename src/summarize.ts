import { Command } from "commander";
import dotenv from "dotenv";
import { readFileSync, writeFileSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parse, stringify } from "smol-toml";
import { config } from "./lib/config.js";
import { refreshFreeModels } from "./lib/openrouter.js";
import { summarizeDocuments } from "./lib/summarize.js";
import type { OutputDocument } from "./lib/types.js";

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "../config.toml");

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("summarize")
    .description("Reads JSON array from stdin (output of reader-fetch --with-content)")
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
    .parse();

  const opts = program.opts<{
    model?: string;
    scanFree?: boolean;
    withOriginal?: boolean;
    concurrency: string;
    maxTokens: string;
    timeout: string;
    verbose?: boolean;
  }>();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    process.stderr.write("Error: OPENROUTER_API_KEY environment variable is not set.\n");
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

  // Read stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  const input = Buffer.concat(chunks).toString("utf-8").trim();

  if (!input) {
    process.stderr.write("Error: No input received from stdin.\n");
    process.exit(1);
  }

  let docs: OutputDocument[];
  try {
    docs = JSON.parse(input) as OutputDocument[];
  } catch {
    process.stderr.write("Error: Failed to parse stdin as JSON array.\n");
    process.exit(1);
  }

  if (!Array.isArray(docs)) {
    process.stderr.write("Error: stdin must be a JSON array.\n");
    process.exit(1);
  }

  log(`Summarizing ${docs.length} document(s) with model: ${modelId}`);

  const results = await summarizeDocuments(
    docs,
    {
      apiUrl: config.openrouter.api_url,
      apiKey,
      modelId,
      maxTokens: parseInt(opts.maxTokens, 10),
      temperature: config.summarize.temperature,
      systemPrompt: config.summarize.system_prompt,
      userPromptTemplate: config.summarize.user_prompt_template,
      timeoutMs: parseInt(opts.timeout, 10),
      concurrency: parseInt(opts.concurrency, 10),
      withOriginal: opts.withOriginal ?? false,
    },
    verbose ? (msg) => process.stderr.write(msg + "\n") : undefined
  );

  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
});
