# daily-brief

CLI tools for fetching content from Readwise Reader and piping it into LLM-based daily summary pipelines.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/)
- A [Readwise Reader](https://readwise.io/read) account and API token

## Setup

```bash
pnpm install
cp .env .env.example   # optional: keep a blank template
```

Add your token to `.env`:

```
READWISE_TOKEN=your_token_here
```

Get your token at [readwise.io/access_token](https://readwise.io/access_token).

## Usage

```bash
pnpm reader-fetch [options]
```

### Options

**API-side** (sent to Readwise Reader):

| Flag | Description | Default |
|------|-------------|---------|
| `--location <loc>` | `feed` \| `new` \| `later` \| `shortlist` \| `archive` | `feed` |
| `--category <cat>` | `rss` \| `article` \| `email` \| `pdf` \| `epub` \| `tweet` \| `video` | |
| `--tag <tag>` | Filter by tag name; pass empty string for untagged docs | |
| `--since <date>` | Only docs updated after this date (ISO 8601) | |
| `--limit <n>` | Results per API request, 1-100 | `100` |
| `--all` | Paginate through all pages (3s delay between requests to respect rate limits) | |
| `--with-content` | Include full HTML article content (`html_content` field) | |

**Client-side** (applied after fetch):

| Flag | Description |
|------|-------------|
| `--published-since <date>` | Only docs published on or after this date (ISO 8601) |
| `--author <name>` | Case-insensitive substring match on author name |
| `--fields <fields>` | Comma-separated list of fields to include in output (default: see below) |

**Default output fields:** `id`, `title`, `author`, `url`, `summary`, `tags`, `published_date`, `category`

### Examples

```bash
# First 5 articles from your feed
pnpm reader-fetch --limit 5

# All email newsletters updated after March 1
pnpm reader-fetch --category email --since 2026-03-01 --all

# Articles by a specific author
pnpm reader-fetch --author "Lenny" --category email

# All RSS articles published since Feb 1
pnpm reader-fetch --category rss --published-since 2026-02-01 --all

# Fetch full article HTML content
pnpm reader-fetch --limit 5 --with-content --fields title,html_content

# Minimal fields for piping to an LLM (use --silent to suppress pnpm header)
pnpm --silent reader-fetch --tag daily --fields title,url,summary,published_date | llm-process
```

## Output Format

JSON array written to stdout; progress and errors go to stderr.

```json
[
  {
    "id": "01kjpww0aa1w5wc2gfvv9m3jr5",
    "title": "Article Title",
    "author": "Author Name",
    "url": "https://read.readwise.io/read/...",
    "summary": "A brief summary of the article.",
    "tags": ["ai", "research"],
    "published_date": "2026-02-26T00:00:00.000Z",
    "category": "rss"
  }
]
```

**Field notes:**
- `tags` - flattened to an array of strings
- `published_date` - ISO 8601 string, or `null` if not set
- `html_content` - only present when `--with-content` is passed; may be `null` for some document types

> **Tip:** When piping JSON output to another command, use `pnpm --silent reader-fetch` to suppress the pnpm script header.

## Development

```bash
# Type-check
pnpm tsc --noEmit

# Run tests
pnpm test

# Watch mode
pnpm test:watch
```

## Project Structure

```
src/
├── lib/
│   ├── types.ts          # Shared interfaces and constants
│   ├── api.ts            # Readwise Reader API client
│   ├── api.test.ts
│   ├── transform.ts      # Document transformation and filtering
│   └── transform.test.ts
└── reader-fetch.ts       # CLI entry point
```
