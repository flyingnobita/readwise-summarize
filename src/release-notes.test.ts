import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tsx = join(root, "node_modules/.bin/tsx");
const cli = join(__dirname, "release-notes.ts");

let tmpRepo = "";

function run(args: string[]) {
  return spawnSync(tsx, [cli, ...args], {
    cwd: tmpRepo,
    encoding: "utf-8",
  });
}

beforeEach(() => {
  tmpRepo = join(tmpdir(), `release-notes-test-${process.pid}-${Date.now()}`);
  mkdirSync(tmpRepo, { recursive: true });
  writeFileSync(
    join(tmpRepo, "package.json"),
    JSON.stringify({ name: "readwise-summarize", version: "1.2.3" }, null, 2),
    "utf-8"
  );
  writeFileSync(
    join(tmpRepo, "CHANGELOG.md"),
    `# Changelog

- Mar-10, 2026 - 05:10 PM SGT - Release 1.2.3: polish release notes generation
- Mar-10, 2026 - 05:09 PM SGT - Add changelog parsing coverage for release notes
- Mar-10, 2026 - 05:08 PM SGT - Release 1.2.2: earlier release
`,
    "utf-8"
  );
});

afterEach(() => {
  if (existsSync(tmpRepo)) {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

describe("release-notes CLI", () => {
  it("prints markdown release notes for the current package version", () => {
    const result = run([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## Summary");
    expect(result.stdout).toContain("polish release notes generation");
    expect(result.stdout).toContain("- Add changelog parsing coverage for release notes");
    expect(result.stdout).toContain("npm install -g readwise-summarize");
  });

  it("fails when the provided version does not match package.json", () => {
    const result = run(["1.2.4"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match package.json version 1.2.3");
  });
});
