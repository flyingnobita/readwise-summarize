#!/usr/bin/env node

import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { Command } from "commander";
import { fileURLToPath } from "url";
import { assertReleaseVersion } from "./lib/release.js";
import { buildReleaseNotes } from "./lib/release-notes.js";

async function main(): Promise<void> {
  const program = createReleaseNotesCommand();
  await program.parseAsync();
}

export function createReleaseNotesCommand(): Command {
  return new Command("release-notes")
    .description("Generate changelog-driven release notes for a version")
    .argument("[version]", "Release version. Must match a Release X.Y.Z changelog entry.")
    .action(async function releaseNotesCommandAction(versionArg?: string) {
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

      const version = assertReleaseVersion(packageJson.version, versionArg);
      const changelog = readFileSync(changelogPath, "utf-8");
      const notes = buildReleaseNotes(changelog, version, packageJson.name);

      process.stdout.write(notes.markdown);
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  });
}
