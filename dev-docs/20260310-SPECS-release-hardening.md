# Release Hardening

Date: 2026-03-10
Status: Accepted

## Objective

Prepare the existing Node/TypeScript CLI for public distribution by fixing package identity drift, removing self-modifying installed assets, and aligning docs with runtime behavior.

## Scope

- Keep the current implementation as a Node CLI package.
- Do not build a Python implementation in this change.
- Make later PyPI wrapping feasible by stabilizing CLI behavior and metadata first.

## Requirements

- Package metadata, README, runtime identifiers, and license declarations must agree on product identity.
- Mutable configuration must be stored in a user-writable location, not inside the installed package directory.
- Default config must continue to ship with the package and remain the base configuration.
- Runtime behavior and documentation must agree on summarize output fields.
- Changes must be covered by tests.
- Release verification must include install, unit tests, integration tests, build, and package dry-run.

## Constraints

- Preserve current CLI command names unless there is a hard technical reason to change them.
- Preserve existing config structure where feasible.
- Keep environment-variable based credentials unchanged.
