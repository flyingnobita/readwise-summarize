# Changelog

- Mar-10, 2026 - 03:34 PM SGT - Clarify required runtime credentials in `.env.example` with explicit comments for Readwise and OpenRouter setup
- Mar-10, 2026 - 03:26 PM SGT - Add `pnpm release` automation for prepared npm releases with clean-worktree checks, verification, tag/push, npm publish, GitHub release creation, and dry-run support
- Mar-10, 2026 - 02:36 PM SGT - Harden package release hygiene: align package identity and MIT licensing, move mutable summarize model config to a user-writable config file, and fix summarize output docs to match runtime fields
- Mar-05, 2026 - 10:55 PM SGT - Add --verbose flag to reader-fetch; all progress output is now gated behind it, consistent with summarize
- Mar-05, 2026 - 10:35 PM SGT - Add --prefix flag to both reader-fetch and summarize to customize output filename prefix; defaults to "articles" and "summaries" respectively
- Mar-05, 2026 - 10:20 PM SGT - Add --output-dir flag to summarize; writes summaries-YYYY-MM-DD.json atomically alongside reader-fetch's articles file
- Mar-05, 2026 - 12:00 PM SGT - Switch reader-fetch output from stdout to a dated file (articles-YYYY-MM-DD.json) with atomic write and JSON envelope; add --output-dir flag; update summarize to accept file argument and validate envelope completeness
- Mar-03, 2026 - 09:11 PM SGT - Package CLI for local npm distribution: add build/prepack scripts, bin mappings, shebangs for executable entrypoints, and local packaging instructions in README
- Mar 02, 2026 - 11:30 PM PST - Add summarize CLI for AI article summarization via OpenRouter; expose LLM prompt and model parameters to config.toml; add integration test suite with live credentials
- Mar 02, 2026 - 11:00 PM PST - Fix reader-fetch --with-content silently omitting html_content from output; extract buildFields() with regression tests
- Feb 28, 2026 - Add openrouter-rank-free CLI for scanning and ranking free OpenRouter models
