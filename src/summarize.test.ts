/**
 * CLI tests for rws summarize.
 *
 * Runs the CLI as a subprocess via tsx. All success-path tests use documents
 * with no html_content so summarizeDocument returns "[no content available]"
 * without making any OpenRouter API calls.
 */

import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tsx = join(root, "node_modules/.bin/tsx");
const cli = join(__dirname, "rws.ts");

const tmpDir = join(tmpdir(), `summarize-test-${process.pid}`);

afterAll(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

function writeTemp(name: string, content: unknown): string {
  mkdirSync(tmpDir, { recursive: true });
  const path = join(tmpDir, name);
  writeFileSync(
    path,
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
    "utf-8"
  );
  return path;
}

function run(args: string[], stdinInput?: string) {
  return spawnSync(tsx, [cli, "summarize", ...args], {
    cwd: root,
    input: stdinInput,
    encoding: "utf-8",
    env: {
      ...process.env,
      OPEN_ROUTER_SUMMARIZE_API: "test-key",
      READWISE_SUMMARIZE_CONFIG_DIR: join(tmpDir, "config"),
    },
  });
}

// A doc without html_content — summarize returns "[no content available]" with no API call
const noContentDoc = { id: "doc-1", title: "Test Article", url: "https://example.com" };

function makeEnvelope(documents: unknown[], complete: unknown = true) {
  return {
    complete,
    count: (documents as unknown[]).length,
    generated_at: new Date().toISOString(),
    documents,
  };
}

// ---------------------------------------------------------------------------
// File argument — error cases
// ---------------------------------------------------------------------------

describe("summarize CLI — file argument errors", () => {
  it("exits 1 with error when file does not exist", () => {
    const result = run(["/nonexistent/path/articles.json"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("File not found");
  });

  it("exits 1 with error when file contains invalid JSON", () => {
    const file = writeTemp("invalid.json", "this is not json {{{");
    const result = run([file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Failed to parse input as JSON");
  });

  it("exits 1 when envelope has complete: false", () => {
    const file = writeTemp("incomplete.json", makeEnvelope([noContentDoc], false));
    const result = run([file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("incomplete or was not fully written");
  });

  it("exits 1 when envelope is missing the complete field", () => {
    const file = writeTemp("no-complete.json", { count: 1, documents: [noContentDoc] });
    const result = run([file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("incomplete or was not fully written");
  });

  it("exits 1 when envelope documents field is not an array", () => {
    const file = writeTemp("bad-docs.json", { complete: true, documents: "not-an-array" });
    const result = run([file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("documents field must be a JSON array");
  });

  it("exits 1 when envelope documents field is missing", () => {
    const file = writeTemp("missing-docs.json", { complete: true, count: 0 });
    const result = run([file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("documents field must be a JSON array");
  });

  it("exits 1 when file contains a bare non-array JSON value", () => {
    const file = writeTemp("bare-string.json", '"just a string"');
    const result = run([file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Input must be a JSON object (envelope) or array");
  });
});

// ---------------------------------------------------------------------------
// File argument — success cases (no API call: docs have no html_content)
// ---------------------------------------------------------------------------

describe("summarize CLI — file argument success", () => {
  it("processes a valid envelope file and outputs a JSON array", () => {
    const file = writeTemp("valid.json", makeEnvelope([noContentDoc]));
    const result = run([file]);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as unknown[];
    expect(Array.isArray(output)).toBe(true);
    expect(output).toHaveLength(1);
  });

  it("sets ai_summary to [no content available] for docs without html_content", () => {
    const file = writeTemp("no-html.json", makeEnvelope([noContentDoc]));
    const result = run([file]);
    expect(result.status).toBe(0);
    const [doc] = JSON.parse(result.stdout) as Array<{ ai_summary: string }>;
    expect(doc.ai_summary).toBe("[no content available]");
  });

  it("processes multiple documents from a valid envelope", () => {
    const docs = [
      { id: "1", title: "First", url: "https://a.com" },
      { id: "2", title: "Second", url: "https://b.com" },
      { id: "3", title: "Third", url: "https://c.com" },
    ];
    const file = writeTemp("multi.json", makeEnvelope(docs));
    const result = run([file]);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as unknown[];
    expect(output).toHaveLength(3);
  });

  it("preserves title, author, readwise URL, and source_url in output", () => {
    const doc = {
      id: "1",
      title: "My Title",
      author: "My Author",
      location: "feed",
      source_url: "https://original.com",
      url: "https://reader.com",
    };
    const file = writeTemp("meta.json", makeEnvelope([doc]));
    const result = run([file]);
    expect(result.status).toBe(0);
    const [out] = JSON.parse(result.stdout) as Array<{
      title: string;
      author: string;
      readwise: string;
      source_url: string;
    }>;
    expect(out.title).toBe("My Title");
    expect(out.author).toBe("My Author");
    expect(out.readwise).toBe("https://reader.com");
    expect(out.source_url).toBe("https://original.com");
  });
});

// ---------------------------------------------------------------------------
// --output-dir flag
// ---------------------------------------------------------------------------

describe("summarize CLI — --output-dir", () => {
  it("writes summaries-YYYY-MM-DD.json to the specified directory", () => {
    const outDir = join(tmpDir, "out-dir-test");
    const file = writeTemp("out-input.json", makeEnvelope([noContentDoc]));
    const result = run([file, "--output-dir", outDir]);
    expect(result.status).toBe(0);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const expectedFile = join(outDir, `summaries-${dateStr}.json`);

    expect(existsSync(expectedFile)).toBe(true);
    expect(existsSync(expectedFile + ".tmp")).toBe(false);

    const output = JSON.parse(readFileSync(expectedFile, "utf-8")) as unknown[];
    expect(Array.isArray(output)).toBe(true);
    expect(output).toHaveLength(1);
  });

  it("writes nothing to stdout when --output-dir is set", () => {
    const outDir = join(tmpDir, "out-dir-stdout-test");
    const file = writeTemp("out-stdout.json", makeEnvelope([noContentDoc]));
    const result = run([file, "--output-dir", outDir]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("creates the output directory if it does not exist", () => {
    const outDir = join(tmpDir, "out-dir-new", "nested");
    const file = writeTemp("out-new.json", makeEnvelope([noContentDoc]));
    const result = run([file, "--output-dir", outDir]);
    expect(result.status).toBe(0);
    expect(existsSync(outDir)).toBe(true);
  });

  it("uses custom prefix in filename when --prefix is given", () => {
    const outDir = join(tmpDir, "prefix-test");
    const file = writeTemp("prefix-input.json", makeEnvelope([noContentDoc]));
    const result = run([file, "--output-dir", outDir, "--prefix", "daily"]);
    expect(result.status).toBe(0);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    expect(existsSync(join(outDir, `daily-${dateStr}.json`))).toBe(true);
    expect(existsSync(join(outDir, `summaries-${dateStr}.json`))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stdin — legacy bare array and envelope
// ---------------------------------------------------------------------------

describe("summarize CLI — stdin input", () => {
  it("accepts a bare JSON array from stdin (legacy format)", () => {
    const input = JSON.stringify([noContentDoc]);
    const result = run([], input);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as unknown[];
    expect(Array.isArray(output)).toBe(true);
    expect(output).toHaveLength(1);
  });

  it("accepts envelope format from stdin", () => {
    const input = JSON.stringify(makeEnvelope([noContentDoc]));
    const result = run([], input);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as unknown[];
    expect(output).toHaveLength(1);
  });

  it("exits 1 when stdin is empty", () => {
    const result = run([], "");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No input received from stdin");
  });

  it("exits 1 when stdin envelope has complete: false", () => {
    const input = JSON.stringify(makeEnvelope([noContentDoc], false));
    const result = run([], input);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("incomplete or was not fully written");
  });
});
