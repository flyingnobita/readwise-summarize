# 📚 readwise-summarize

![readwise-summarize banner](https://raw.githubusercontent.com/flyingnobita/readwise-summarize/main/assets/readwise-summarize-banner.png)

[![npm version](https://img.shields.io/npm/v/readwise-summarize)](https://www.npmjs.com/package/readwise-summarize)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Publish npm](https://github.com/flyingnobita/readwise-summarize/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/flyingnobita/readwise-summarize/actions/workflows/publish-npm.yml)

CLI tools for fetching content from Readwise Reader and generating AI-powered article summaries via OpenRouter.

## ✅ Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/)
- A [Readwise Reader](https://readwise.io/read) account and API token
- An [OpenRouter](https://openrouter.ai/) API key (required for `rws summarize` and `rws models rank-free`)

## ⚙️ Setup

```bash
pnpm install
```

## 📦 Install From npm

Install the published CLI globally from npm:

```bash
npm install -g readwise-summarize
```

Or with `pnpm`:

```bash
pnpm add -g readwise-summarize
```

This installs one command on your machine:

- `rws`

## 🔑 Configuration

Add credentials to `.env`:

```bash
cp .env.example .env
```

```dotenv
READWISE_TOKEN=your_token_here
OPEN_ROUTER_SUMMARIZE_API=your_key_here
```

Get your Readwise token at [readwise.io/access_token](https://readwise.io/access_token).

## 🧰 Package As CLI (Local Only)

Build and expose commands locally without publishing:

```bash
pnpm build
pnpm link --global
```

This installs one command on your machine:

- `rws`

If installed globally, you can run it directly without the `pnpm` prefix. For example:

```bash
rws fetch --limit 5
rws fetch --category rss --limit 5 --with-content | rws summarize --verbose
```

To create a distributable tarball (still local):

```bash
pnpm pack
```

## 🚢 Release Automation

This repo currently supports two release paths.

### 🖥️ Option 1: Local release command

Use the repo-local release command when publishing from your machine:

```bash
pnpm rws -- release
```

Typical flow:

```bash
# 1. Prepare the release
# - update package.json version
# - update CHANGELOG.md
# - commit changes

# 2. Preview the release plan
pnpm rws -- release --dry-run

# Optional: preview the generated release notes
pnpm rws -- release-notes

# 3. Run the release
pnpm rws -- release --otp 123456
```

`pnpm rws -- release` uses the generated `pnpm rws -- release-notes` output for the GitHub release body automatically.

Useful flags:

- `pnpm rws -- release --dry-run`
- `pnpm rws -- release --otp 123456`
- `pnpm rws -- release --skip-publish`
- `pnpm rws -- release --skip-github-release`
- `pnpm rws -- release --skip-push`
- `pnpm rws -- release-notes`

### ☁️ Option 2: GitHub release publish

If GitHub trusted publishing is configured, publishing can also happen from GitHub:

```bash
# 1. Prepare the release
# - update package.json version
# - update CHANGELOG.md
# - commit changes
# - push branch

# 2. Create and push the tag
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main
git push origin vX.Y.Z

# 3. Publish the GitHub release for that tag
pnpm rws -- release-notes X.Y.Z > /tmp/readwise-summarize-vX.Y.Z-notes.md
gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --notes-file /tmp/readwise-summarize-vX.Y.Z-notes.md
```

Publishing a GitHub release for the matching tag triggers the automated npm publish workflow.

The GitHub publish workflow upgrades npm before publishing because npm trusted publishing currently requires npm CLI `11.5.1+`.

To configure the required GitHub Actions secrets from your machine:

```bash
pnpm rws -- github-secrets set
```

The helper uses `gh secret set` to upload:

- `READWISE_TOKEN`
- `OPEN_ROUTER_SUMMARIZE_API`

You can also pass the values non-interactively:

```bash
READWISE_TOKEN=your_token_here \
OPEN_ROUTER_SUMMARIZE_API=your_key_here \
pnpm rws -- github-secrets set
```

The helper now prefers exported environment variables first and falls back to `.env` automatically.

## 🔄 Pipeline

The tools are designed for a two-step daily workflow: fetch first, summarize second.

```bash
# Step 1: fetch and write to a dated file
rws fetch --category rss --with-content --all --output-dir /data/articles

# Step 2: summarize from that file, write summaries to a dated file
rws summarize /data/articles/articles-2026-03-05.json --output-dir /data/summaries
```

`rws fetch` writes `articles-YYYY-MM-DD.json` using the machine's local timezone. The file is written atomically (`.tmp` + rename), so `rws summarize` will never read a partially-written file. The JSON envelope includes a `complete: true` field as a secondary integrity check.

Stdin piping is still supported for ad-hoc use:

```bash
pnpm --silent rws -- fetch --category rss --limit 5 --with-content | pnpm rws -- summarize --verbose
```

---

## 📥 `rws fetch`

Fetches articles from Readwise Reader and writes a dated JSON file to disk.

```bash
pnpm rws -- fetch [options]
```

### ⚙️ Options

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

### 💡 Examples

```bash
# First 5 articles from your feed
pnpm rws -- fetch --limit 5

# All email newsletters updated in the last week
pnpm rws -- fetch --category email --updated-after "1 week ago" --all

# RSS articles with full HTML content (for summarization), saved to /data/articles
pnpm rws -- fetch --category rss --limit 10 --with-content --output-dir /data/articles

# Articles by a specific author updated yesterday
pnpm rws -- fetch --author "Lenny" --category email --updated-after yesterday

# All RSS articles published since Feb 1
pnpm rws -- fetch --category rss --published-since 2026-02-01 --all
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

## `rws summarize`

Reads an `rws fetch` output file and writes AI-generated summaries to stdout.

```bash
pnpm rws -- summarize [options] <file>
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
pnpm rws -- summarize articles-2026-03-05.json --verbose

# Write summaries to a dated file instead of stdout
pnpm rws -- summarize articles-2026-03-05.json --output-dir /data/summaries

# Auto-select the best free model, then summarize
pnpm rws -- summarize articles-2026-03-05.json --scan-free --verbose

# Include the original Readwise summary alongside the AI summary
pnpm rws -- summarize articles-2026-03-05.json --with-original
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

## `rws models rank-free`

Scans OpenRouter for free models, probes each one, and ranks them by quality and speed. Useful for finding the best available free model for summarization.

```bash
pnpm rws -- models rank-free [options]
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
pnpm rws -- models rank-free --verbose
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
├── github-secrets-set.ts         # CLI subcommand: upload GitHub Actions secrets
├── openrouter-rank-free.ts       # CLI subcommand: scan and rank free OpenRouter models
├── reader-fetch.ts               # CLI subcommand: fetch articles from Readwise Reader
├── release-notes.ts              # CLI subcommand: changelog-driven release notes
├── release.ts                    # CLI subcommand: prepared npm release workflow
├── release.test.ts
├── rws.test.ts
├── rws.ts                        # Root CLI: unified command entrypoint
├── summarize.ts                  # CLI subcommand: generate AI summaries via OpenRouter
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
