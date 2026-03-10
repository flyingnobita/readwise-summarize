# Release Notes Generator

Date: 2026-03-10
Status: Implemented

## Context

GitHub auto-generated release notes are too file- and PR-oriented for this repo. The project already maintains a curated `CHANGELOG.md`, so release notes should be derived from that source instead of relying on GitHub's generic notes.

## Requirements

1. Add a repo-local generator that builds Markdown release notes from `CHANGELOG.md`.
2. Anchor each release on a `Release X.Y.Z:` changelog entry.
3. Include non-release changelog entries that belong to the target release window.
4. Keep the output concise and user-facing.
5. Support local invocation without mutating git or GitHub state.

## Constraints

1. The generator must work from the repo root using existing Node tooling.
2. The output must be deterministic for a given changelog and version.
3. Fail clearly when the requested release cannot be found in `CHANGELOG.md`.
