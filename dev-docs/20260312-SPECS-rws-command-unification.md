# RWS Command Unification

Date: 2026-03-12
Status: Accepted

## Objective

Replace the mixed standalone CLI names with a single top-level `rws` command that owns the existing operational surface.

## Requirements

- Publish exactly one npm binary: `rws`.
- Expose the current workflows as `rws` subcommands.
- Preserve existing command behavior and flags unless the naming change requires a help-text update.
- Update tests, docs, changelog, and package metadata to reflect the new command surface.
- Keep the existing source modules reusable so the root CLI can compose them.

## Subcommands

- `rws fetch`
- `rws summarize`
- `rws models rank-free`
- `rws release`
- `rws release-notes`
- `rws github-secrets set`

## Constraints

- Do not add backward-compatible aliases for the old command names.
- Preserve existing environment variable names and file formats.
