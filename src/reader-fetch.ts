#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";
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
  const program = new Command();

  program
    .name("reader-fetch")
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
    .option("--limit <n>", "Max results per page, 1-100; omit for API default (100)", String(config.api.default_limit))
    .option("--all", "Paginate through all pages; omit for first page only")
    .option(
      "--fields <fields>",
      `Comma-separated fields to include in output; omit for defaults (${DEFAULT_FIELDS_STR})`,
      DEFAULT_FIELDS_STR
    )
    .parse();

  const opts = program.opts<{
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
  }>();

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

  const params: Record<string, string> = { limit: opts.limit };
  if (opts.location) params["location"] = opts.location;
  if (opts.tag !== undefined) params["tag"] = opts.tag;
  if (opts.category) params["category"] = opts.category;
  if (updatedAfterDate) params["updatedAfter"] = updatedAfterDate.toISOString();
  if (opts.withContent) params["withHtmlContent"] = "true";

  process.stderr.write("Fetching from Readwise Reader...\n");

  let rawDocs;
  try {
    rawDocs = await fetchAllDocuments(token, params, {
      paginate: opts.all ?? false,
      onPage: (pageNum, count) => {
        process.stderr.write(`  Page ${pageNum}: ${count} results\n`);
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

  process.stderr.write(`Total: ${output.length} documents\n`);
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main();
