#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";
import { config } from "./lib/config.js";
import { refreshFreeModels } from "./lib/openrouter.js";
import { resolve } from "path";
import { fileURLToPath } from "url";

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const program = createOpenrouterRankFreeCommand();
  await program.parseAsync();
}

export function createOpenrouterRankFreeCommand(): Command {
  return new Command("rank-free")
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
    .action(async function openrouterRankFreeAction() {
      const opts = this.opts<{
        minParams: string;
        maxAgeDays: string;
        concurrency: string;
        timeout: string;
        candidates: string;
        smart: string;
        runs: string;
        verbose?: boolean;
      }>();

      const apiKey = process.env.OPEN_ROUTER_SUMMARIZE_API;
      if (!apiKey) {
        process.stderr.write("Error: OPEN_ROUTER_SUMMARIZE_API environment variable is not set.\n");
        process.exit(1);
      }

      const minParamRaw = opts.minParams.toLowerCase().replace(/b$/, "");
      const minParamB = parseFloat(minParamRaw);
      if (isNaN(minParamB)) {
        process.stderr.write(`Error: invalid --min-params value: "${opts.minParams}"\n`);
        process.exit(1);
      }

      const maxAgeDays = parseInt(opts.maxAgeDays, 10);
      if (isNaN(maxAgeDays) || maxAgeDays < 0) {
        process.stderr.write(`Error: --max-age-days must be a non-negative integer, got "${opts.maxAgeDays}".\n`);
        process.exit(1);
      }
      const concurrency = parseInt(opts.concurrency, 10);
      if (isNaN(concurrency) || concurrency <= 0) {
        process.stderr.write(`Error: --concurrency must be a positive integer, got "${opts.concurrency}".\n`);
        process.exit(1);
      }
      const timeoutMs = parseInt(opts.timeout, 10);
      if (isNaN(timeoutMs) || timeoutMs <= 0) {
        process.stderr.write(`Error: --timeout must be a positive integer, got "${opts.timeout}".\n`);
        process.exit(1);
      }
      const maxCandidates = parseInt(opts.candidates, 10);
      if (isNaN(maxCandidates) || maxCandidates <= 0) {
        process.stderr.write(`Error: --candidates must be a positive integer, got "${opts.candidates}".\n`);
        process.exit(1);
      }
      const smartPicks = parseInt(opts.smart, 10);
      if (isNaN(smartPicks) || smartPicks < 0) {
        process.stderr.write(`Error: --smart must be a non-negative integer, got "${opts.smart}".\n`);
        process.exit(1);
      }
      const extraRuns = parseInt(opts.runs, 10);
      if (isNaN(extraRuns) || extraRuns < 0) {
        process.stderr.write(`Error: --runs must be a non-negative integer, got "${opts.runs}".\n`);
        process.exit(1);
      }

      const verbose = opts.verbose ?? false;

      const ranked = await refreshFreeModels({
        apiUrl: config.openrouter.api_url,
        apiKey,
        idSuffix: config.openrouter.id_suffix,
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
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
