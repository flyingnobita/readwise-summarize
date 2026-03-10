import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const scriptPath = join(root, "scripts", "set-github-secrets.sh");
const script = readFileSync(scriptPath, "utf-8");

describe("set-github-secrets.sh", () => {
  it("uses strict bash settings", () => {
    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain("set -euo pipefail");
  });

  it("sets the required GitHub Actions secrets", () => {
    expect(script).toContain("gh secret set READWISE_TOKEN");
    expect(script).toContain("gh secret set OPEN_ROUTER_SUMMARIZE_API");
  });

  it("supports overriding the target repository", () => {
    expect(script).toContain('GITHUB_REPOSITORY');
    expect(script).toContain('flyingnobita/readwise-summarize');
  });

  it("reads values from the exported environment and .env fallback", () => {
    expect(script).toContain('printenv "$var_name"');
    expect(script).toContain('ENV_FILE="${ENV_FILE:-.env}"');
    expect(script).toContain('Using %s from exported environment');
    expect(script).toContain('Using %s from %s');
  });

  it("checks gh authentication before uploading secrets", () => {
    expect(script).toContain("gh auth status");
  });
});
