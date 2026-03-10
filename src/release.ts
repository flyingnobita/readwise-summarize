#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { Command } from "commander";
import {
  assertReleaseVersion,
  buildReleasePlan,
  releaseTag,
} from "./lib/release.js";

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || `${command} failed`;
    throw new Error(message);
  }

  return result.stdout.trim();
}

function runInteractive(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}`);
  }
}

function ensureCleanWorktree(cwd: string): void {
  const status = runCommand("git", ["status", "--short"], cwd);
  if (status) {
    throw new Error("git worktree is not clean");
  }
}

function ensureTagDoesNotExist(cwd: string, tag: string): void {
  const result = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
    cwd,
    stdio: "ignore",
  });
  if (result.status === 0) {
    throw new Error(`tag already exists: ${tag}`);
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("release")
    .description("Run the verified npm release workflow for the current package version")
    .argument("[version]", "Release version. Must match package.json if provided.")
    .option("--remote <name>", "Git remote to push to", "origin")
    .option("--otp <code>", "One-time password for npm 2FA")
    .option("--skip-tests", "Skip unit tests")
    .option("--skip-integration", "Skip integration tests")
    .option("--skip-build", "Skip build")
    .option("--skip-push", "Skip git push steps")
    .option("--skip-publish", "Skip npm publish")
    .option("--skip-github-release", "Skip GitHub release creation")
    .option("--dry-run", "Print planned commands without executing them")
    .parse();

  const cwd = process.cwd();
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    process.stderr.write("Error: package.json not found in current directory.\n");
    process.exit(1);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
    version?: string;
  };
  if (!packageJson.version) {
    process.stderr.write("Error: package.json is missing version.\n");
    process.exit(1);
  }

  const opts = program.opts<{
    remote: string;
    otp?: string;
    skipTests?: boolean;
    skipIntegration?: boolean;
    skipBuild?: boolean;
    skipPush?: boolean;
    skipPublish?: boolean;
    skipGithubRelease?: boolean;
    dryRun?: boolean;
  }>();

  const version = assertReleaseVersion(packageJson.version, program.args[0] as string | undefined);
  const branch = runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const tag = releaseTag(version);

  ensureCleanWorktree(cwd);
  ensureTagDoesNotExist(cwd, tag);

  const plan = buildReleasePlan({
    version,
    remote: opts.remote,
    branch,
    dryRun: opts.dryRun ?? false,
    skipTests: opts.skipTests ?? false,
    skipIntegration: opts.skipIntegration ?? false,
    skipBuild: opts.skipBuild ?? false,
    skipPush: opts.skipPush ?? false,
    skipPublish: opts.skipPublish ?? false,
    skipGithubRelease: opts.skipGithubRelease ?? false,
    otp: opts.otp,
  });

  if (opts.dryRun) {
    process.stdout.write(`Release version: ${version}\n`);
    process.stdout.write(`Branch: ${branch}\n`);
    process.stdout.write(`Tag: ${tag}\n`);
    for (const step of plan) {
      process.stdout.write(`- ${step.description}: ${step.command} ${step.args.join(" ")}\n`);
    }
    return;
  }

  for (const step of plan) {
    process.stderr.write(`${step.description}...\n`);
    runInteractive(step.command, step.args, cwd);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
