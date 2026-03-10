# Release Notes Publish Integration

Date: 2026-03-10
Status: Implemented

## Context

The repo now has a changelog-driven release notes generator, but the main `pnpm release` flow still delegates GitHub release bodies to `--generate-notes`. That leaves the release flow inconsistent and bypasses the curated notes source.

## Requirements

1. Make `pnpm release` use generated changelog-driven release notes for GitHub releases.
2. Keep `--dry-run` readable without mutating repo files.
3. Avoid leaving temporary note files behind after a release run.
4. Keep the manual GitHub release path documented with the same notes source.
