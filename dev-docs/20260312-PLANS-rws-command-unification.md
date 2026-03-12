# RWS Command Unification Plan

Date: 2026-03-12
Status: Completed

## Steps

1. Refactor the standalone CLI entrypoints into reusable `commander` command builders.
2. Add a new `src/rws.ts` root CLI that mounts the unified command tree.
3. Update package metadata so npm publishes only the `rws` binary and local scripts use the same naming family.
4. Update CLI and integration tests to invoke the unified command surface.
5. Update README, AGENTS, and CHANGELOG to reflect the renamed commands.
6. Verify with `pnpm test`, `pnpm test:integration`, and `pnpm build`.
