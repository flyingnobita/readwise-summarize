# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Fetch articles from Readwise Reader
pnpm reader-fetch [options]
pnpm --silent reader-fetch [options]       # suppress pnpm header for piping

# Generate AI summaries from reader-fetch output
pnpm --silent reader-fetch --with-content [options] | pnpm summarize [options]

# Scan and rank free OpenRouter models
pnpm openrouter-rank-free [options]

# Type-check
pnpm exec tsc --noEmit

# Run unit tests
pnpm test

# Run a single test file
pnpm exec vitest run src/lib/parse-date.test.ts

# Watch mode
pnpm test:watch

# Run integration tests (requires live credentials in .env)
pnpm test:integration
```

## Architecture

TypeScript CLI toolkit for fetching Readwise Reader articles and generating AI summaries via OpenRouter. All output goes to stdout as JSON; progress and errors go to stderr.

**Pipelines:**

```
reader-fetch.ts -> api.ts (fetch & paginate) -> transform.ts (filter & shape) -> stdout
                                                                                    |
summarize.ts (stdin) -> summarize.ts (lib) -> OpenRouter chat/completions API -> stdout
```

**Key design decisions:**

- Filtering is split into API-side (passed as query params) and client-side (applied post-fetch). `--updated-after`, `--location`, `--category`, `--tag`, `--limit`, `--with-content` are API-side; `--published-since`, `--author`, `--fields` are client-side.
- `tags` in `ReaderDocument` is `Record<string, { name: string }>` (Readwise API shape); `transformDocument` flattens it to `string[]`.
- `published_date` from the API is a Unix timestamp in milliseconds; `transformDocument` converts it to ISO 8601.
- `buildFields` in `transform.ts` auto-appends `html_content` to the field list when `--with-content` is passed.
- `link` in `SummarizedDocument` is `source_url ?? url` (source_url is the original article URL; url is the Readwise Reader URL).
- Pagination uses a cursor (`pageCursor` param) with a 3-second delay between pages.
- Date parsing uses `chrono-node` for natural language with ISO 8601 as fallback.
- LLM prompt and model parameters (system_prompt, user_prompt_template, temperature, max_tokens) are fully configurable in `config.toml`.
- `--scan-free` probes live OpenRouter free models and atomically updates `config.toml` with the top result (write temp → rename).
- `fetchImpl` is injected via options in both `summarize.ts` and `openrouter.ts` for testability without network calls.

**Module responsibilities:**

- `src/lib/types.ts` — `ReaderDocument` (raw API shape), `OutputDocument` (transformed)
- `src/lib/config.ts` — loads and exports typed `config` from `config.toml` via `smol-toml`
- `src/lib/api.ts` — `fetchPage`, `fetchAllDocuments` (pagination loop with cursor + delay)
- `src/lib/transform.ts` — `buildFields`, `transformDocument`, `filterByPublishedSince`, `filterByAuthor`
- `src/lib/parse-date.ts` — `parseDate` (chrono-node + ISO 8601 fallback)
- `src/lib/openrouter.ts` — `fetchFreeModels`, `filterModels`, `testModel`, `buildSelection`, `refreshFreeModels`, `mapWithConcurrency`, `inferParamBFromIdOrName`
- `src/lib/summarize.ts` — `summarizeDocument`, `summarizeDocuments` (uses `mapWithConcurrency`)
- `src/reader-fetch.ts` — CLI wiring via `commander`, reads `READWISE_TOKEN` from env
- `src/summarize.ts` — CLI: reads stdin JSON, calls `summarizeDocument`/`summarizeDocuments`, handles `--scan-free` config update
- `src/openrouter-rank-free.ts` — CLI: calls `refreshFreeModels`, outputs ranked JSON

## Testing

- Unit tests: `src/lib/**/*.test.ts` (run by default with `pnpm test`)
- Integration tests: `src/integration.test.ts` (run with `pnpm test:integration`, requires `READWISE_TOKEN` and `OPENROUTER_API_KEY`)
- All lib functions use injected `fetchImpl` for mock-based testing; no network calls in unit tests

## Environment

- Requires `READWISE_TOKEN` in `.env` (Readwise Reader API)
- Requires `OPENROUTER_API_KEY` in `.env` (OpenRouter API, for `summarize` and `openrouter-rank-free`)
- Runtime: Node 22, managed via `mise`
- ESM project (`"type": "module"`); imports within `src/` use `.js` extensions
- Config: `config.toml` at repo root, loaded once at startup via `src/lib/config.ts`
