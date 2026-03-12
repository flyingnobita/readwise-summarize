#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";
import { writeFileSync, renameSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { config } from "./lib/config.js";
import { parseDate } from "./lib/parse-date.js";
import { fetchAllDocuments } from "./lib/api.js";
import {
  transformDocument,
  filterByPublishedSince,
  filterByAuthor,
  buildFields,
} from "./lib/transform.js";

dotenv.config({ quiet: true });

const DEFAULT_FIELDS_STR = config.output.default_fields.join(",");

function parseDateOpt(flag: string, value: string): Date {
  const date = parseDate(value);
  if (!date) {
    process.stderr.write(`Error: ${flag} "${value}" is not a valid date.\n`);
    process.exit(1);
  }
  return date;
}

async function main(): Promise<void> {
  const program = createFetchCommand();
  await program.parseAsync();
}

export function createFetchCommand(): Command {
  return new Command("fetch")
    .description("Fetch articles from Readwise Reader")
    .option("--tag <tag>", "Filter by tag; omit for all tags, empty string for untagged")
    .option(
      "--location <loc>",
      "feed | new | later | shortlist | archive; omit for all locations"
    )
    .option(
      "--category <cat>",
      "rss | article | email | pdf | epub | tweet | video; omit for all categories"
    )
    .option(
      "--updated-after <date>",
      "Only docs updated after this date (ISO 8601 or natural language e.g. 'yesterday', '1 week ago'); omit for no date filter"
    )
    .option(
      "--published-since <date>",
      "Client-side: only docs published on or after this date (ISO 8601 or natural language); omit for no date filter"
    )
    .option(
      "--author <name>",
      "Client-side: case-insensitive substring match on author; omit for all authors"
    )
    .option("--with-content", "Include full HTML content (html_content field); omit to exclude")
    .option("--limit <n>", "Max results per page (1-100); values outside this range are ignored and the API default (100) is used", String(config.api.default_limit))
    .option("--all", "Paginate through all pages; omit for first page only")
    .option(
      "--fields <fields>",
      `Comma-separated fields to include in output, or "all" for every available field; omit for defaults (${DEFAULT_FIELDS_STR})`,
      DEFAULT_FIELDS_STR
    )
    .option("--output-dir <dir>", "Directory to write <prefix>-YYYY-MM-DD.json (default: cwd)")
    .option("--prefix <name>", "Filename prefix for output file (default: articles)")
    .option("--verbose", "Print progress to stderr")
    .action(async function fetchCommandAction() {
      const opts = this.opts<{
        tag?: string;
        location?: string;
        category?: string;
        updatedAfter?: string;
        publishedSince?: string;
        author?: string;
        withContent?: boolean;
        limit: string;
        all?: boolean;
        fields: string;
        outputDir?: string;
        prefix?: string;
        verbose?: boolean;
      }>();

      const verbose = opts.verbose ?? false;
      const log = (msg: string) => {
        if (verbose) process.stderr.write(msg + "\n");
      };

      const token = process.env.READWISE_TOKEN;
      if (!token) {
        process.stderr.write("Error: READWISE_TOKEN environment variable is not set.\n");
        process.exit(1);
      }

      const fields = buildFields(
        opts.fields.split(",").map((f) => f.trim()).filter(Boolean),
        opts.withContent ?? false
      );

      const publishedSinceMs = opts.publishedSince
        ? parseDateOpt("--published-since", opts.publishedSince).getTime()
        : null;

      const updatedAfterDate = opts.updatedAfter
        ? parseDateOpt("--updated-after", opts.updatedAfter)
        : null;

      const limitNum = parseInt(opts.limit, 10);
      const params: Record<string, string> = {};
      if (!isNaN(limitNum) && limitNum >= 1 && limitNum <= 100) {
        params["limit"] = opts.limit;
      }
      if (opts.location) params["location"] = opts.location;
      if (opts.tag !== undefined) params["tag"] = opts.tag;
      if (opts.category) params["category"] = opts.category;
      if (updatedAfterDate) params["updatedAfter"] = updatedAfterDate.toISOString();
      if (opts.withContent) params["withHtmlContent"] = "true";

      log("Fetching from Readwise Reader...");

      let rawDocs;
      try {
        rawDocs = await fetchAllDocuments(token, params, {
          paginate: opts.all ?? false,
          onPage: (pageNum, count) => {
            log(`  Page ${pageNum}: ${count} results`);
          },
        });
      } catch (err) {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        process.exit(1);
      }

      const filtered = filterByAuthor(
        filterByPublishedSince(rawDocs, publishedSinceMs),
        opts.author
      );

      const output = filtered.map((doc) => transformDocument(doc, fields));

      log(`Total: ${output.length} documents`);

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const outDir = resolve(opts.outputDir ?? ".");
      const prefix = opts.prefix ?? "articles";
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, `${prefix}-${dateStr}.json`);
      const tmpPath = outPath + ".tmp";

      const envelope = {
        complete: true,
        count: output.length,
        generated_at: now.toISOString(),
        documents: output,
      };

      writeFileSync(tmpPath, JSON.stringify(envelope, null, 2) + "\n", "utf-8");
      renameSync(tmpPath, outPath);
      log(`Output: ${outPath}`);
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
