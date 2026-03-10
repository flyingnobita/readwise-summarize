import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tsx = join(root, "node_modules/.bin/tsx");
const cli = join(__dirname, "release.ts");

let tmpRepo = "";

function run(args: string[]) {
  return spawnSync(tsx, [cli, ...args], {
    cwd: tmpRepo,
    encoding: "utf-8",
  });
}

beforeEach(() => {
  tmpRepo = join(tmpdir(), `release-test-${process.pid}-${Date.now()}`);
  mkdirSync(tmpRepo, { recursive: true });
  writeFileSync(
    join(tmpRepo, "package.json"),
    JSON.stringify({ name: "release-test", version: "1.2.3" }, null, 2),
    "utf-8"
  );
  writeFileSync(
    join(tmpRepo, "CHANGELOG.md"),
    `# Changelog

- Mar-10, 2026 - 05:29 PM SGT - Release 1.2.3: test release notes wiring
- Mar-10, 2026 - 05:28 PM SGT - Add release plan coverage for notes files
- Mar-10, 2026 - 05:27 PM SGT - Release 1.2.2: older release
`,
    "utf-8"
  );
  spawnSync("git", ["init", "-b", "main"], { cwd: tmpRepo, encoding: "utf-8" });
  spawnSync("git", ["config", "user.name", "Test User"], { cwd: tmpRepo, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: tmpRepo, encoding: "utf-8" });
  spawnSync("git", ["add", "package.json", "CHANGELOG.md"], { cwd: tmpRepo, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "chore: init"], { cwd: tmpRepo, encoding: "utf-8" });
});

afterEach(() => {
  if (existsSync(tmpRepo)) {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

describe("release CLI", () => {
  it("prints the planned release commands in dry-run mode", () => {
    const result = run(["--dry-run", "--skip-publish", "--skip-push"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Release version: 1.2.3");
    expect(result.stdout).toContain("Tag: v1.2.3");
    expect(result.stdout).toContain("pnpm test");
    expect(result.stdout).toContain("git tag -a v1.2.3 -m v1.2.3");
    expect(result.stdout).toContain("gh release create v1.2.3 --verify-tag --title v1.2.3 --notes-file ");
  });

  it("fails when the provided version does not match package.json", () => {
    const result = run(["1.2.4", "--dry-run"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match package.json version 1.2.3");
  });
});
