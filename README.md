# readwise-summarize

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

## Install From npm

Install the published CLI globally from npm:

```bash
npm install -g readwise-summarize
```

This installs these commands on your machine:

- `reader-fetch`
- `summarize`
- `openrouter-rank-free`

## Configuration

Add credentials to `.env`:

```bash
cp .env.example .env
```

```dotenv
READWISE_TOKEN=your_token_here
OPEN_ROUTER_SUMMARIZE_API=your_key_here
```

Get your Readwise token at [readwise.io/access_token](https://readwise.io/access_token).

## Package As CLI (Local Only)

Build and expose commands locally without publishing:

```bash
pnpm build
pnpm link --global
```

This installs these commands on your machine:

- `reader-fetch`
- `summarize`
- `openrouter-rank-free`

If installed globally, you can run them directly without the `pnpm` prefix. For example:

```bash
reader-fetch --limit 5
reader-fetch --category rss --limit 5 --with-content | summarize --verbose
```

To create a distributable tarball (still local):

```bash
pnpm pack
```

## Release Automation

This repo currently supports two release paths.

### Option 1: Local release command

Use the repo-local release command when publishing from your machine:

```bash
pnpm release
```

Typical flow:

```bash
# 1. Prepare the release
# - update package.json version
# - update CHANGELOG.md
# - commit changes

# 2. Preview the release plan
pnpm release --dry-run

# 3. Run the release
pnpm release --otp 123456
```

Useful flags:

- `pnpm release --dry-run`
- `pnpm release --otp 123456`
- `pnpm release --skip-publish`
- `pnpm release --skip-github-release`
- `pnpm release --skip-push`

### Option 2: GitHub release publish

If GitHub trusted publishing is configured, publishing can also happen from GitHub:

```bash
# 1. Prepare the release
# - update package.json version
# - update CHANGELOG.md
# - commit changes
# - push branch

# 2. Create and push the tag
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin master
git push origin vX.Y.Z

# 3. Publish the GitHub release for that tag
gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --generate-notes
```

Publishing a GitHub release for the matching tag triggers the automated npm publish workflow.

To configure the required GitHub Actions secrets from your machine:

```bash
pnpm set-github-secrets
```

The helper uses `gh secret set` to upload:

- `READWISE_TOKEN`
- `OPEN_ROUTER_SUMMARIZE_API`

You can also pass the values non-interactively:

```bash
READWISE_TOKEN=your_token_here \
OPEN_ROUTER_SUMMARIZE_API=your_key_here \
pnpm set-github-secrets
```

The helper now prefers exported environment variables first and falls back to `.env` automatically.

## Pipeline

The tools are designed for a two-step daily workflow: fetch first, summarize second.

```bash
# Step 1: fetch and write to a dated file
reader-fetch --category rss --with-content --all --output-dir /data/articles

# Step 2: summarize from that file, write summaries to a dated file
summarize /data/articles/articles-2026-03-05.json --output-dir /data/summaries
```

`reader-fetch` writes `articles-YYYY-MM-DD.json` using the machine's local timezone. The file is written atomically (`.tmp` + rename), so `summarize` will never read a partially-written file. The JSON envelope includes a `complete: true` field as a secondary integrity check.

Stdin piping is still supported for ad-hoc use:

```bash
pnpm --silent reader-fetch --category rss --limit 5 --with-content | pnpm summarize --verbose
```

---

## `reader-fetch`

Fetches articles from Readwise Reader and writes a dated JSON file to disk.

```bash
pnpm reader-fetch [options]
```

### Options

**API-side** (sent to Readwise Reader):

| Flag                                                                                        | If omitted                  |
| ------------------------------------------------------------------------------------------- | --------------------------- |
| `--location <loc>` — `feed` \| `new` \| `later` \| `shortlist` \| `archive`                 | All locations               |
| `--category <cat>` — `rss` \| `article` \| `email` \| `pdf` \| `epub` \| `tweet` \| `video` | All categories              |
| `--tag <tag>` — tag name; empty string for untagged                                         | All tags                    |
| `--updated-after <date>` — ISO 8601 or natural language (e.g. `yesterday`, `1 week ago`)    | No date filter              |
| `--limit <n>` — results per API request, 1-100                                              | 100 per page                |
| `--all` — paginate through all pages (3s delay between requests)                            | First page only             |
| `--with-content` — include full HTML content (`html_content` field)                         | `html_content` not included |

**Client-side** (applied after fetch):

| Flag                                                            | If omitted                 |
| --------------------------------------------------------------- | -------------------------- |
| `--published-since <date>` — ISO 8601 or natural language       | No date filter             |
| `--author <name>` — case-insensitive substring match            | All authors                |
| `--fields <fields>` — comma-separated list of fields to include | Default fields (see below) |
| `--output-dir <dir>` — directory to write the output file       | Current working directory  |
| `--prefix <name>` — filename prefix for output file             | `articles`                 |
| `--verbose` — print progress to stderr                          | off                        |

**Default output fields:** `id`, `title`, `author`, `site_name`, `url`, `source_url`, `summary`, `tags`, `published_date`, `category`

### Examples

```bash
# First 5 articles from your feed
pnpm reader-fetch --limit 5

# All email newsletters updated in the last week
pnpm reader-fetch --category email --updated-after "1 week ago" --all

# RSS articles with full HTML content (for summarization), saved to /data/articles
pnpm reader-fetch --category rss --limit 10 --with-content --output-dir /data/articles

# Articles by a specific author updated yesterday
pnpm reader-fetch --author "Lenny" --category email --updated-after yesterday

# All RSS articles published since Feb 1
pnpm reader-fetch --category rss --published-since 2026-02-01 --all
```

### Output Format

Writes `<prefix>-YYYY-MM-DD.json` to the output directory (date from machine local timezone; prefix defaults to `articles`). Progress and errors go to stderr.

```json
{
  "complete": true,
  "count": 42,
  "generated_at": "2026-03-05T10:00:00.000Z",
  "documents": [
    {
      "id": "01kjpww0aa1w5wc2gfvv9m3jr5",
      "title": "Article Title",
      "author": "Author Name",
      "site_name": "Site Name",
      "url": "https://read.readwise.io/read/...",
      "source_url": "https://original-site.com/article",
      "summary": "A brief summary of the article.",
      "tags": ["ai", "research"],
      "published_date": "2026-02-26T00:00:00.000Z",
      "category": "rss"
    }
  ]
}
```

**Field notes:**

- `complete` — always `true`; signals the file was fully and successfully written
- `tags` — flattened to an array of strings
- `source_url` — original article URL; `url` is the Readwise Reader URL
- `published_date` — ISO 8601 string, or `null` if not set
- `html_content` — only present when `--with-content` is passed; may be `null` for some document types

---

## `summarize`

Reads a `reader-fetch` output file and writes AI-generated summaries to stdout.

```bash
pnpm summarize [options] <file>
```

Falls back to reading a JSON array from stdin if no file argument is given (legacy pipe usage).

### Options

| Flag                                                                               | Default                        |
| ---------------------------------------------------------------------------------- | ------------------------------ |
| `--model <id>` — model ID e.g. `google/gemma-3-27b-it:free`                        | `config.summarize.model`       |
| `--scan-free` — scan OpenRouter for the best free model, save it to config, use it | —                              |
| `--with-original` — include the original Readwise `summary` field in output        | off                            |
| `--concurrency <n>` — parallel workers                                             | `config.summarize.concurrency` |
| `--max-tokens <n>` — max tokens per summary                                        | `config.summarize.max_tokens`  |
| `--timeout <ms>` — per-request timeout                                             | `config.summarize.timeout_ms`  |
| `--verbose` — print progress to stderr                                             | off                            |
| `--output-dir <dir>` — directory to write `<prefix>-YYYY-MM-DD.json`               | stdout                         |
| `--prefix <name>` — filename prefix for output file                                | `summaries`                    |

**Model resolution order:** `--model` → `--scan-free` result → `config.summarize.model` → error

### LLM Configuration (`config.toml`)

```toml
[summarize]
model = ""               # default model; overridden by --model or --scan-free
max_tokens = 0
timeout_ms = 30000
concurrency = 1
temperature = 0.7
system_prompt = "You are a concise article summarizer. Summarize the article in 3-5 sentences focusing on key insights and takeaways."
user_prompt_template = "Title: {title}\nAuthor: {author}\n\n{html_content}"
```

The `user_prompt_template` supports `{title}`, `{author}`, `{url}`, and `{html_content}` placeholders.

User overrides are loaded from a writable per-user config file instead of modifying the packaged `config.toml`.

- macOS: `~/Library/Application Support/readwise-summarize/config.toml`
- Linux: `$XDG_CONFIG_HOME/readwise-summarize/config.toml` or `~/.config/readwise-summarize/config.toml`
- Windows: `%APPDATA%\\readwise-summarize\\config.toml`
- Override location for tests or automation: `READWISE_SUMMARIZE_CONFIG_DIR`

### Examples

```bash
# Summarize today's fetch using the configured model
pnpm summarize articles-2026-03-05.json --verbose

# Write summaries to a dated file instead of stdout
pnpm summarize articles-2026-03-05.json --output-dir /data/summaries

# Auto-select the best free model, then summarize
pnpm summarize articles-2026-03-05.json --scan-free --verbose

# Include the original Readwise summary alongside the AI summary
pnpm summarize articles-2026-03-05.json --with-original
```

### Output Format

```json
[
  {
    "id": "01kjpww0aa1w5wc2gfvv9m3jr5",
    "title": "Article Title",
    "author": "Author Name",
    "site_name": "Site Name",
    "readwise": "https://read.readwise.io/read/...",
    "source_url": "https://original-site.com/article",
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

| Flag                                                         | Default                            |
| ------------------------------------------------------------ | ---------------------------------- |
| `--min-params <Nb>` — minimum parameter count e.g. `27b`     | `config.openrouter.min_param_b`    |
| `--max-age-days <n>` — max model age in days; `0` to disable | `config.openrouter.max_age_days`   |
| `--concurrency <n>` — parallel test workers                  | `config.openrouter.concurrency`    |
| `--timeout <ms>` — per-model timeout                         | `config.openrouter.timeout_ms`     |
| `--candidates <n>` — max candidates to output                | `config.openrouter.max_candidates` |
| `--smart <n>` — smart-first picks (newest + largest context) | `config.openrouter.smart_picks`    |
| `--runs <n>` — extra timing runs for median latency          | `config.openrouter.extra_runs`     |
| `--verbose` — print progress to stderr                       | off                                |

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
│   ├── app.ts                    # App identity and user-config path helpers
│   ├── config.ts                 # config.toml loader
│   ├── config.test.ts
│   ├── api.ts                    # Readwise Reader API client (fetch + pagination)
│   ├── api.test.ts
│   ├── transform.ts              # Document transformation, filtering, field selection
│   ├── transform.test.ts
│   ├── parse-date.ts             # Natural language + ISO 8601 date parsing
│   ├── parse-date.test.ts
│   ├── openrouter.ts             # OpenRouter model scanning, probing, ranking
│   ├── openrouter.test.ts
│   ├── release.ts                # Release plan validation and command generation
│   ├── release.test.ts
│   ├── summarize.ts              # LLM summarization logic
│   └── summarize.test.ts
├── reader-fetch.ts               # CLI: fetch articles from Readwise Reader
├── release.ts                    # CLI: prepared npm release workflow
├── release.test.ts
├── summarize.ts                  # CLI: generate AI summaries via OpenRouter
├── openrouter-rank-free.ts       # CLI: scan and rank free OpenRouter models
└── integration.test.ts           # Integration tests (live API credentials required)
.github/workflows/publish-npm.yml # GitHub release -> npm publish workflow
config.toml                       # All runtime configuration
vitest.config.ts                  # Unit test config
vitest.integration.config.ts      # Integration test config
```

## Credit

[https://github.com/steipete/summarize](https://github.com/steipete/summarize) for the summarize tool

## License

MIT
