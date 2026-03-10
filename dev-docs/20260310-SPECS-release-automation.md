# Release Automation

Date: 2026-03-10
Status: Accepted

## Objective

Automate the repetitive npm release workflow for this repository after release content has already been prepared.

## Scope

- Automate verification, tagging, pushing, npm publish, and GitHub release creation.
- Do not auto-write release notes or changelog content.
- Do not auto-bump versions in this change.

## Requirements

- Release automation must fail fast if the git worktree is dirty.
- Release automation must use the current `package.json` version unless an explicit matching version is provided.
- Release automation must support a `--dry-run` mode that prints planned commands without executing them.
- Release automation must allow skipping push, npm publish, or GitHub release steps for recovery workflows.
- Release automation must support npm 2FA by accepting an optional OTP value.

## Constraints

- Keep the workflow repo-local and developer-invoked.
- Prefer deterministic shell command planning over hidden side effects.
