# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Fetch articles from Readwise Reader (writes articles-YYYY-MM-DD.json to cwd or --output-dir)
pnpm reader-fetch [options]

# Generate AI summaries from a reader-fetch output file (stdout or --output-dir)
pnpm summarize <file> [options]

# Legacy: pipe reader-fetch output directly to summarize
pnpm --silent reader-fetch --with-content [options] | pnpm summarize [options]

# Scan and rank free OpenRouter models
pnpm openrouter-rank-free [options]

# Run the prepared release workflow
pnpm release [version] [options]

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

TypeScript CLI toolkit for fetching Readwise Reader articles and generating AI summaries via OpenRouter. Progress and errors go to stderr; `summarize` output goes to stdout as JSON.

**Daily workflow:**

```
reader-fetch.ts -> api.ts (fetch & paginate) -> transform.ts (filter & shape) -> articles-YYYY-MM-DD.json
                                                                                          |
summarize.ts (file arg) -> summarize.ts (lib) -> OpenRouter chat/completions API -> stdout
```

**Key design decisions:**

- Filtering is split into API-side (passed as query params) and client-side (applied post-fetch). `--updated-after`, `--location`, `--category`, `--tag`, `--limit`, `--with-content` are API-side; `--published-since`, `--author`, `--fields` are client-side.
- `tags` in `ReaderDocument` is `Record<string, { name: string }>` (Readwise API shape); `transformDocument` flattens it to `string[]`.
- `published_date` from the API is a Unix timestamp in milliseconds; `transformDocument` converts it to ISO 8601.
- `buildFields` in `transform.ts` auto-appends `html_content` to the field list when `--with-content` is passed.
- `SummarizedDocument` exposes `readwise` for the Readwise Reader URL and `source_url` only when the item came from a library/feed location and an original source URL is available.
- Pagination uses a cursor (`pageCursor` param) with a 3-second delay between pages.
- Date parsing uses `chrono-node` for natural language with ISO 8601 as fallback.
- LLM prompt and model parameters (system_prompt, user_prompt_template, temperature, max_tokens) are fully configurable in `config.toml`.
- `config.toml` bundled with the package is the default config. User overrides are loaded from a writable per-user config file, and `--scan-free` updates only that user config file atomically.
- `reader-fetch` writes output atomically: writes to `articles-YYYY-MM-DD.json.tmp` then renames to `articles-YYYY-MM-DD.json`. The JSON envelope wraps the documents array with `complete: true`, `count`, and `generated_at` metadata. `summarize` validates `complete === true` before processing.
- `summarize` accepts an optional positional file argument; falls back to stdin for legacy pipe usage. Stdin accepts either the envelope format or a bare JSON array.
- `summarize --output-dir <dir>` writes `summaries-YYYY-MM-DD.json` atomically (write temp → rename); falls back to stdout if omitted.
- `fetchImpl` is injected via options in both `summarize.ts` and `openrouter.ts` for testability without network calls.
- `pnpm release` automates the prepared npm release workflow: clean-worktree check, verification, tag, push, publish, and GitHub release creation. It supports `--dry-run` and optional npm OTP input.

**Module responsibilities:**

- `src/lib/types.ts` — `ReaderDocument` (raw API shape), `OutputDocument` (transformed)
- `src/lib/app.ts` — package identity constants and writable user-config path helpers
- `src/lib/config.ts` — loads typed config by merging bundled `config.toml` with optional user overrides via `smol-toml`
- `src/lib/api.ts` — `fetchPage`, `fetchAllDocuments` (pagination loop with cursor + delay)
- `src/lib/transform.ts` — `buildFields`, `transformDocument`, `filterByPublishedSince`, `filterByAuthor`
- `src/lib/parse-date.ts` — `parseDate` (chrono-node + ISO 8601 fallback)
- `src/lib/openrouter.ts` — `fetchFreeModels`, `filterModels`, `testModel`, `buildSelection`, `refreshFreeModels`, `mapWithConcurrency`, `inferParamBFromIdOrName`
- `src/lib/release.ts` — release version validation and release command plan generation
- `src/lib/summarize.ts` — `summarizeDocument`, `summarizeDocuments` (uses `mapWithConcurrency`)
- `src/reader-fetch.ts` — CLI wiring via `commander`, reads `READWISE_TOKEN` from env, writes dated JSON envelope file
- `src/release.ts` — CLI: automates the prepared npm release workflow with dry-run and step-skipping flags
- `src/summarize.ts` — CLI: reads file arg or stdin JSON, validates envelope, calls `summarizeDocument`/`summarizeDocuments`, handles `--scan-free` user-config update
- `src/openrouter-rank-free.ts` — CLI: calls `refreshFreeModels`, outputs ranked JSON

## Testing

- Unit tests: `src/lib/**/*.test.ts` (run by default with `pnpm test`)
- CLI unit tests: `src/*.test.ts` (also run with `pnpm test`; use subprocess via `tsx` for CLI entrypoint testing)
- Integration tests: `src/integration.test.ts` (run with `pnpm test:integration`, requires `READWISE_TOKEN` and `OPEN_ROUTER_SUMMARIZE_API`)
- All lib functions use injected `fetchImpl` for mock-based testing; no network calls in unit tests

**All code changes must include a build.** Run `pnpm build` after changes so the compiled `dist/` binaries stay in sync with source. The installed CLI commands (`reader-fetch`, `summarize`, `openrouter-rank-free`) run from `dist/` and will not reflect source changes until rebuilt.

**All code changes must be accompanied by tests.** This is a hard requirement:
- New lib functions → unit tests in `src/lib/*.test.ts`
- New CLI flags or entrypoint behavior → unit tests in `src/*.test.ts` (subprocess-based)
- Any behavior that touches live APIs or the filesystem end-to-end → integration tests in `src/integration.test.ts`
- A feature is not complete until `pnpm test` and `pnpm test:integration` both pass

**All code changes must also update documentation.** This is a hard requirement:
- `README.md` — update affected CLI options tables, examples, and output format sections
- `AGENTS.md` — update architecture, key design decisions, and module responsibilities as needed
- `CHANGELOG.md` — add an entry for every meaningful change

## Environment

- Requires `READWISE_TOKEN` in `.env` (Readwise Reader API)
- Requires `OPEN_ROUTER_SUMMARIZE_API` in `.env` (OpenRouter API, for `summarize` and `openrouter-rank-free`)
- Runtime: Node 22, managed via `mise`
- ESM project (`"type": "module"`); imports within `src/` use `.js` extensions
- Config: `config.toml` at repo root, loaded once at startup via `src/lib/config.ts`
