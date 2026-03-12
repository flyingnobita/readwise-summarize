import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tsx = join(root, "node_modules/.bin/tsx");
const cli = join(__dirname, "rws.ts");

function run(args: string[]) {
  return spawnSync(tsx, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
  });
}

describe("rws CLI", () => {
  it("lists the unified command surface in help output", () => {
    const result = run(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fetch");
    expect(result.stdout).toContain("summarize");
    expect(result.stdout).toContain("models");
    expect(result.stdout).toContain("release");
    expect(result.stdout).toContain("release-notes");
    expect(result.stdout).toContain("github-secrets");
  });

  it("lists nested model commands in help output", () => {
    const result = run(["models", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("rank-free");
  });

  it("lists nested GitHub secret commands in help output", () => {
    const result = run(["github-secrets", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("set");
  });
});
