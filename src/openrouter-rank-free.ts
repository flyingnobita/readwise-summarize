import { Command } from "commander";
import dotenv from "dotenv";
import { config } from "./lib/config.js";
import { refreshFreeModels } from "./lib/openrouter.js";

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("openrouter-rank-free")
    .description("Scan OpenRouter free models, probe them, and rank by quality and speed")
    .option(
      "--min-params <Nb>",
      "Minimum parameter count e.g. 27b (default: from config)",
      String(config.openrouter.min_param_b)
    )
    .option(
      "--max-age-days <n>",
      "Max model age in days, 0 to disable (default: from config)",
      String(config.openrouter.max_age_days)
    )
    .option(
      "--concurrency <n>",
      "Parallel test workers (default: from config)",
      String(config.openrouter.concurrency)
    )
    .option(
      "--timeout <ms>",
      "Per-model timeout in ms (default: from config)",
      String(config.openrouter.timeout_ms)
    )
    .option(
      "--candidates <n>",
      "Max candidates to output (default: from config)",
      String(config.openrouter.max_candidates)
    )
    .option(
      "--smart <n>",
      "Smart-first picks (default: from config)",
      String(config.openrouter.smart_picks)
    )
    .option(
      "--runs <n>",
      "Extra timing runs (default: from config)",
      String(config.openrouter.extra_runs)
    )
    .option("--verbose", "Print progress to stderr")
    .parse();

  const opts = program.opts<{
    minParams: string;
    maxAgeDays: string;
    concurrency: string;
    timeout: string;
    candidates: string;
    smart: string;
    runs: string;
    verbose?: boolean;
  }>();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    process.stderr.write("Error: OPENROUTER_API_KEY environment variable is not set.\n");
    process.exit(1);
  }

  // Parse --min-params: strip trailing "b" if present, then parse as float
  const minParamRaw = opts.minParams.toLowerCase().replace(/b$/, "");
  const minParamB = parseFloat(minParamRaw);
  if (isNaN(minParamB)) {
    process.stderr.write(`Error: invalid --min-params value: "${opts.minParams}"\n`);
    process.exit(1);
  }

  const maxAgeDays = parseInt(opts.maxAgeDays, 10);
  const concurrency = parseInt(opts.concurrency, 10);
  const timeoutMs = parseInt(opts.timeout, 10);
  const maxCandidates = parseInt(opts.candidates, 10);
  const smartPicks = parseInt(opts.smart, 10);
  const extraRuns = parseInt(opts.runs, 10);

  const verbose = opts.verbose ?? false;

  const ranked = await refreshFreeModels({
    apiUrl: config.openrouter.api_url,
    apiKey,
    minParamB,
    maxAgeDays,
    concurrency,
    timeoutMs,
    maxCandidates,
    smartPicks,
    extraRuns,
    onProgress: verbose ? (msg) => process.stderr.write(msg + "\n") : undefined,
  });

  process.stdout.write(JSON.stringify(ranked, null, 2) + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
});
