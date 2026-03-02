import { Command } from "commander";
import dotenv from "dotenv";
import { DEFAULT_FIELDS } from "./lib/types.js";
import { fetchAllDocuments } from "./lib/api.js";
import {
  transformDocument,
  filterByPublishedSince,
  filterByAuthor,
} from "./lib/transform.js";

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("reader-fetch")
    .description("Fetch articles from Readwise Reader")
    .option("--tag <tag>", "Filter by Readwise tag (empty string = untagged)")
    .option(
      "--location <loc>",
      "feed | new | later | shortlist | archive",
      "feed"
    )
    .option(
      "--category <cat>",
      "rss | article | email | pdf | epub | tweet | video"
    )
    .option("--since <date>", "Filter by updatedAfter (ISO 8601, e.g. 2026-03-01)")
    .option(
      "--published-since <date>",
      "Client-side filter on published_date (ISO 8601)"
    )
    .option(
      "--author <name>",
      "Client-side author filter (case-insensitive substring)"
    )
    .option("--with-content", "Include full HTML content (html_content field)")
    .option("--limit <n>", "Max results per page, 1-100", "100")
    .option("--all", "Paginate through all results")
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in output",
      DEFAULT_FIELDS.join(",")
    )
    .parse();

  const opts = program.opts<{
    tag?: string;
    location: string;
    category?: string;
    since?: string;
    publishedSince?: string;
    author?: string;
    withContent?: boolean;
    limit: string;
    all?: boolean;
    fields: string;
  }>();

  const token = process.env.READWISE_TOKEN;
  if (!token) {
    process.stderr.write(
      "Error: READWISE_TOKEN environment variable is not set.\n"
    );
    process.exit(1);
  }

  const fields = opts.fields
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const publishedSinceMs = opts.publishedSince
    ? new Date(opts.publishedSince).getTime()
    : null;

  if (publishedSinceMs !== null && isNaN(publishedSinceMs)) {
    process.stderr.write(
      `Error: --published-since "${opts.publishedSince}" is not a valid date.\n`
    );
    process.exit(1);
  }

  const params: Record<string, string> = {
    location: opts.location,
    limit: opts.limit,
  };

  if (opts.tag !== undefined) params["tag"] = opts.tag;
  if (opts.category) params["category"] = opts.category;
  if (opts.since) params["updatedAfter"] = opts.since;
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
