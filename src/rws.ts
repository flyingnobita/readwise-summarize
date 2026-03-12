#!/usr/bin/env node

import { Command } from "commander";
import { createGithubSecretsSetCommand } from "./github-secrets-set.js";
import { createOpenrouterRankFreeCommand } from "./openrouter-rank-free.js";
import { createFetchCommand } from "./reader-fetch.js";
import { createReleaseCommand } from "./release.js";
import { createReleaseNotesCommand } from "./release-notes.js";
import { createSummarizeCommand } from "./summarize.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("rws")
    .description("Readwise summarize toolkit")
    .addCommand(createFetchCommand())
    .addCommand(createSummarizeCommand())
    .addCommand(createReleaseCommand())
    .addCommand(createReleaseNotesCommand());

  const modelsCommand = new Command("models")
    .description("Model discovery and ranking commands")
    .addCommand(createOpenrouterRankFreeCommand());

  const githubSecretsCommand = new Command("github-secrets")
    .description("GitHub Actions secret management commands")
    .addCommand(createGithubSecretsSetCommand());

  program.addCommand(modelsCommand);
  program.addCommand(githubSecretsCommand);

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
