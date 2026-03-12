#!/usr/bin/env node

import { spawnSync } from "child_process";
import { Command } from "commander";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, "../scripts/set-github-secrets.sh");

function runInteractive(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}`);
  }
}

async function main(): Promise<void> {
  const program = createGithubSecretsSetCommand();
  await program.parseAsync();
}

export function createGithubSecretsSetCommand(): Command {
  return new Command("set")
    .description("Upload required GitHub Actions secrets with gh secret set")
    .action(async function githubSecretsSetAction() {
      runInteractive("bash", [scriptPath]);
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  });
}
