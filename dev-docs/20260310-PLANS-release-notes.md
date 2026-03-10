# Release Notes Generator Plan

Date: 2026-03-10
Status: Completed

## Steps

1. Add changelog parsing and release-note rendering helpers in `src/lib/release-notes.ts`.
2. Add a small CLI entrypoint in `src/release-notes.ts`.
3. Cover parsing and CLI behavior with unit tests.
4. Document the command in the README and agent docs.
5. Verify with `pnpm test`, `pnpm test:integration`, and `pnpm build`.
