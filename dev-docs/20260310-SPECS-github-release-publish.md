# GitHub Release Publish Automation

Date: 2026-03-10
Status: Accepted

## Objective

Automatically publish the npm package from GitHub Actions when a GitHub release is published for a matching version tag.

## Scope

- Add a GitHub Actions workflow triggered by `release.published`.
- Verify that the GitHub release tag matches `package.json` version.
- Run the repository verification steps before publishing.
- Publish to npm from CI.

## Requirements

- Workflow must only publish from release tags shaped like `vX.Y.Z`.
- Workflow must fail if the release tag version and `package.json` version differ.
- Workflow must run `pnpm test`, `pnpm test:integration`, and `pnpm build` before publish.
- Workflow must publish with public access.
- Workflow must document required GitHub and npm configuration.

## Constraints

- Keep local `pnpm release` available for manual releases and recovery flows.
- Use npm trusted publishing for CI-based npm release publishing.
