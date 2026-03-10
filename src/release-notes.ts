#!/usr/bin/env node

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import { assertReleaseVersion } from "./lib/release.js";
import { buildReleaseNotes } from "./lib/release-notes.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("release-notes")
    .description("Generate changelog-driven release notes for a version")
    .argument("[version]", "Release version. Must match a Release X.Y.Z changelog entry.")
    .parse();

  const cwd = process.cwd();
  const packageJsonPath = join(cwd, "package.json");
  const changelogPath = join(cwd, "CHANGELOG.md");

  if (!existsSync(packageJsonPath)) {
    process.stderr.write("Error: package.json not found in current directory.\n");
    process.exit(1);
  }

  if (!existsSync(changelogPath)) {
    process.stderr.write("Error: CHANGELOG.md not found in current directory.\n");
    process.exit(1);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
    name?: string;
    version?: string;
  };

  if (!packageJson.version) {
    process.stderr.write("Error: package.json is missing version.\n");
    process.exit(1);
  }

  if (!packageJson.name) {
    process.stderr.write("Error: package.json is missing name.\n");
    process.exit(1);
  }

  const version = assertReleaseVersion(packageJson.version, program.args[0] as string | undefined);
  const changelog = readFileSync(changelogPath, "utf-8");
  const notes = buildReleaseNotes(changelog, version, packageJson.name);

  process.stdout.write(notes.markdown);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
