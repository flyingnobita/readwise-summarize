# daily-brief

CLI tools for fetching content from Readwise Reader and generating AI-powered article summaries via OpenRouter.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/)
- A [Readwise Reader](https://readwise.io/read) account and API token
- An [OpenRouter](https://openrouter.ai/) API key (required for `summarize` and `openrouter-rank-free`)

## Setup

```bash
pnpm install
```

Add credentials to `.env`:

```
READWISE_TOKEN=your_token_here
OPENROUTER_API_KEY=your_key_here
```

Get your Readwise token at [readwise.io/access_token](https://readwise.io/access_token).

## Pipeline

The tools are designed to be piped together. Use `--silent` on `reader-fetch` to suppress the pnpm header from entering the pipe:

```bash
pnpm --silent reader-fetch --category rss --limit 5 --with-content | pnpm summarize --verbose
```

---

## `reader-fetch`

Fetches articles from Readwise Reader and writes a JSON array to stdout.

```bash
pnpm reader-fetch [options]
```

### Options

**API-side** (sent to Readwise Reader):

| Flag | If omitted |
| --- | --- |
| `--location <loc>` — `feed` \| `new` \| `later` \| `shortlist` \| `archive` | All locations |
| `--category <cat>` — `rss` \| `article` \| `email` \| `pdf` \| `epub` \| `tweet` \| `video` | All categories |
| `--tag <tag>` — tag name; empty string for untagged | All tags |
| `--updated-after <date>` — ISO 8601 or natural language (e.g. `yesterday`, `1 week ago`) | No date filter |
| `--limit <n>` — results per API request, 1-100 | 100 per page |
| `--all` — paginate through all pages (3s delay between requests) | First page only |
| `--with-content` — include full HTML content (`html_content` field) | `html_content` not included |

**Client-side** (applied after fetch):

| Flag | If omitted |
| --- | --- |
| `--published-since <date>` — ISO 8601 or natural language | No date filter |
| `--author <name>` — case-insensitive substring match | All authors |
| `--fields <fields>` — comma-separated list of fields to include | Default fields (see below) |

**Default output fields:** `id`, `title`, `author`, `url`, `source_url`, `summary`, `tags`, `published_date`, `category`

### Examples

```bash
# First 5 articles from your feed
pnpm reader-fetch --limit 5

# All email newsletters updated in the last week
pnpm reader-fetch --category email --updated-after "1 week ago" --all

# RSS articles with full HTML content (for summarization)
pnpm reader-fetch --category rss --limit 10 --with-content

# Articles by a specific author updated yesterday
pnpm reader-fetch --author "Lenny" --category email --updated-after yesterday

# All RSS articles published since Feb 1
pnpm reader-fetch --category rss --published-since 2026-02-01 --all
```

### Output Format

JSON array written to stdout; progress and errors go to stderr.

```json
[
  {
    "id": "01kjpww0aa1w5wc2gfvv9m3jr5",
    "title": "Article Title",
    "author": "Author Name",
    "url": "https://read.readwise.io/read/...",
    "source_url": "https://original-site.com/article",
    "summary": "A brief summary of the article.",
    "tags": ["ai", "research"],
    "published_date": "2026-02-26T00:00:00.000Z",
    "category": "rss"
  }
]
```

**Field notes:**

- `tags` — flattened to an array of strings
- `source_url` — original article URL; `url` is the Readwise Reader URL
- `published_date` — ISO 8601 string, or `null` if not set
- `html_content` — only present when `--with-content` is passed; may be `null` for some document types

---

## `summarize`

Reads a JSON array from stdin (output of `reader-fetch --with-content`) and writes AI-generated summaries to stdout.

```bash
pnpm --silent reader-fetch [options] | pnpm summarize [options]
```

### Options

| Flag | Default |
| --- | --- |
| `--model <id>` — model ID e.g. `google/gemma-3-27b-it:free` | `config.summarize.model` |
| `--scan-free` — scan OpenRouter for the best free model, save it to config, use it | — |
| `--with-original` — include the original Readwise `summary` field in output | off |
| `--concurrency <n>` — parallel workers | `config.summarize.concurrency` |
| `--max-tokens <n>` — max tokens per summary | `config.summarize.max_tokens` |
| `--timeout <ms>` — per-request timeout | `config.summarize.timeout_ms` |
| `--verbose` — print progress to stderr | off |

**Model resolution order:** `--model` → `--scan-free` result → `config.summarize.model` → error

### LLM Configuration (`config.toml`)

```toml
[summarize]
model = ""               # default model; overridden by --model or --scan-free
max_tokens = 300
timeout_ms = 30000
concurrency = 3
temperature = 0.7
system_prompt = "You are a concise article summarizer. Summarize the article in 3-5 sentences focusing on key insights and takeaways."
user_prompt_template = "Title: {title}\nAuthor: {author}\n\n{html_content}"
```

The `user_prompt_template` supports `{title}`, `{author}`, and `{html_content}` placeholders.

### Examples

```bash
# Summarize today's RSS feed using the configured model
pnpm --silent reader-fetch --category rss --updated-after today --with-content | pnpm summarize --verbose

# Auto-select the best free model, then summarize
pnpm --silent reader-fetch --category rss --limit 5 --with-content | pnpm summarize --scan-free --verbose

# Include the original Readwise summary alongside the AI summary
pnpm --silent reader-fetch --limit 3 --with-content | pnpm summarize --with-original
```

### Output Format

```json
[
  {
    "id": "01kjpww0aa1w5wc2gfvv9m3jr5",
    "title": "Article Title",
    "author": "Author Name",
    "link": "https://original-site.com/article",
    "ai_summary": "AI-generated summary of the article.",
    "original_summary": "Original Readwise summary (only with --with-original)."
  }
]
```

---

## `openrouter-rank-free`

Scans OpenRouter for free models, probes each one, and ranks them by quality and speed. Useful for finding the best available free model for summarization.

```bash
pnpm openrouter-rank-free [options]
```

### Options

| Flag | Default |
| --- | --- |
| `--min-params <Nb>` — minimum parameter count e.g. `27b` | `config.openrouter.min_param_b` |
| `--max-age-days <n>` — max model age in days; `0` to disable | `config.openrouter.max_age_days` |
| `--concurrency <n>` — parallel test workers | `config.openrouter.concurrency` |
| `--timeout <ms>` — per-model timeout | `config.openrouter.timeout_ms` |
| `--candidates <n>` — max candidates to output | `config.openrouter.max_candidates` |
| `--smart <n>` — smart-first picks (newest + largest context) | `config.openrouter.smart_picks` |
| `--runs <n>` — extra timing runs for median latency | `config.openrouter.extra_runs` |
| `--verbose` — print progress to stderr | off |

### Example

```bash
pnpm openrouter-rank-free --verbose
```

---

## Development

```bash
# Type-check
pnpm exec tsc --noEmit

# Run unit tests
pnpm test

# Watch mode
pnpm test:watch

# Run integration tests (requires live credentials in .env)
pnpm test:integration
```

## Project Structure

```
src/
├── lib/
│   ├── types.ts                  # Shared interfaces (ReaderDocument, OutputDocument)
│   ├── config.ts                 # config.toml loader
│   ├── api.ts                    # Readwise Reader API client (fetch + pagination)
│   ├── api.test.ts
│   ├── transform.ts              # Document transformation, filtering, field selection
│   ├── transform.test.ts
│   ├── parse-date.ts             # Natural language + ISO 8601 date parsing
│   ├── parse-date.test.ts
│   ├── openrouter.ts             # OpenRouter model scanning, probing, ranking
│   ├── openrouter.test.ts
│   ├── summarize.ts              # LLM summarization logic
│   └── summarize.test.ts
├── reader-fetch.ts               # CLI: fetch articles from Readwise Reader
├── summarize.ts                  # CLI: generate AI summaries via OpenRouter
├── openrouter-rank-free.ts       # CLI: scan and rank free OpenRouter models
└── integration.test.ts           # Integration tests (live API credentials required)
config.toml                       # All runtime configuration
vitest.config.ts                  # Unit test config
vitest.integration.config.ts      # Integration test config
```
