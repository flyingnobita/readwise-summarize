# Release Notes Publish Integration Plan

Date: 2026-03-10
Status: Completed

## Steps

1. Add notes-file support to the release command plan.
2. Generate temporary GitHub release notes files during `pnpm release`.
3. Update release CLI tests for the new `gh release create --notes-file` behavior.
4. Update README, AGENTS, and CHANGELOG to reflect the new flow.
5. Verify with tests and build.
