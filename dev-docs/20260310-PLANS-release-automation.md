# Release Automation Plan

Date: 2026-03-10
Status: In Progress

## Steps

- Add a small release helper library for version/tag validation and command plan generation.
- Add a release CLI entrypoint with `--dry-run` and step-skipping flags.
- Add helper tests and subprocess CLI tests.
- Update package scripts and docs to document the automated release flow.
- Run full verification including integration tests.
