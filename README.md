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

| Flag                                                                                        | If omitted                  |
| ------------------------------------------------------------------------------------------- | --------------------------- |
| `--location <loc>` — `feed` \| `new` \| `later` \| `shortlist` \| `archive`                 | All locations returned      |
| `--category <cat>` — `rss` \| `article` \| `email` \| `pdf` \| `epub` \| `tweet` \| `video` | All categories returned     |
| `--tag <tag>` — tag name; empty string for untagged                                         | All tags returned           |
| `--updated-after <date>` — ISO 8601 or natural language (e.g. `yesterday`, `1 week ago`)    | No date filter applied      |
| `--limit <n>` — results per API request, 1-100                                              | API default (100 per page)  |
| `--all` — paginate through all pages (3s delay between requests)                            | First page only             |
| `--with-content` — include full HTML content (`html_content` field)                         | `html_content` not included |

**Client-side** (applied after fetch):

| Flag                                                            | If omitted                 |
| --------------------------------------------------------------- | -------------------------- |
| `--published-since <date>` — ISO 8601 or natural language       | No date filter applied     |
| `--author <name>` — case-insensitive substring match            | All authors returned       |
| `--fields <fields>` — comma-separated list of fields to include | Default fields (see below) |

**Default output fields:** `id`, `title`, `author`, `url`, `summary`, `tags`, `published_date`, `category`

### Examples

```bash
# First 5 articles from your feed
pnpm reader-fetch --limit 5

# All email newsletters updated in the last week
pnpm reader-fetch --category email --updated-after "1 week ago" --all

# Articles by a specific author updated yesterday
pnpm reader-fetch --author "Lenny" --category email --updated-after yesterday

# All RSS articles published since Feb 1 (ISO or natural language both work)
pnpm reader-fetch --category rss --published-since 2026-02-01 --all
pnpm reader-fetch --category rss --published-since "1 month ago" --all

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
