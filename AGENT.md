# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the CLI
pnpm reader-fetch [options]
pnpm --silent reader-fetch [options]   # suppress pnpm header for piping

# Type-check
pnpm tsc --noEmit

# Run tests
pnpm test

# Run a single test file
pnpm test src/lib/parse-date.test.ts

# Watch mode
pnpm test:watch
```

## Architecture

The project is a TypeScript CLI that fetches documents from the Readwise Reader API and outputs JSON to stdout (progress/errors go to stderr), designed for piping into LLM-based daily summary pipelines.

**Data flow:** `reader-fetch.ts` (CLI entry) -> `api.ts` (fetch & paginate) -> `transform.ts` (filter & shape) -> stdout

**Key design decisions:**

- Filtering is split into API-side (passed as query params to Readwise) and client-side (applied post-fetch). `--updated-after`, `--location`, `--category`, `--tag`, `--limit` are API-side; `--published-since`, `--author`, `--fields` are client-side.
- `tags` in `ReaderDocument` is `Record<string, { name: string }>` (Readwise API shape); `transformDocument` flattens it to `string[]` in `OutputDocument`.
- `published_date` from the API is a Unix timestamp in milliseconds; `transformDocument` converts it to ISO 8601 string.
- Pagination uses a cursor (`pageCursor` param) with a 3-second delay between pages (Readwise rate limiting).
- Date parsing uses `chrono-node` for natural language with ISO 8601 as fallback.

**Module responsibilities:**

- `src/lib/types.ts` - `ReaderDocument` (raw API shape), `OutputDocument` (transformed), `BASE_URL`, `DEFAULT_FIELDS`
- `src/lib/api.ts` - `fetchPage` and `fetchAllDocuments` (pagination loop)
- `src/lib/transform.ts` - `transformDocument`, `filterByPublishedSince`, `filterByAuthor`
- `src/lib/parse-date.ts` - `parseDate` (chrono-node + ISO 8601 fallback)
- `src/reader-fetch.ts` - CLI wiring via `commander`, reads `READWISE_TOKEN` from env

## Environment

- Requires `READWISE_TOKEN` in `.env` (loaded via `dotenv`)
- Runtime: Node 22, managed via `mise`
- ESM project (`"type": "module"`); imports within `src/` use `.js` extensions
