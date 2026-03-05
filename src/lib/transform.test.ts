import { describe, it, expect } from "vitest";
import {
  transformDocument,
  filterByPublishedSince,
  filterByAuthor,
  buildFields,
  ALL_FIELDS,
} from "./transform.js";
import type { ReaderDocument } from "./types.js";

function makeDoc(overrides: Partial<ReaderDocument> = {}): ReaderDocument {
  return {
    id: "doc-1",
    url: "https://example.com",
    source_url: "https://example.com/source",
    title: "Test Title",
    author: "Test Author",
    category: "article",
    location: "feed",
    tags: {},
    word_count: 100,
    reading_time: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    published_date: null,
    summary: "Test summary",
    image_url: "",
    reading_progress: 0,
    ...overrides,
  };
}

// --- transformDocument ---

describe("transformDocument", () => {
  it("projects only the requested fields", () => {
    const doc = makeDoc({ id: "abc", title: "Hello" });
    const result = transformDocument(doc, ["id", "title"]);
    expect(result).toEqual({ id: "abc", title: "Hello" });
  });

  it("silently drops unknown field names", () => {
    const doc = makeDoc({ id: "abc" });
    const result = transformDocument(doc, ["id", "nonexistent"]);
    expect(result).toEqual({ id: "abc" });
    expect(Object.keys(result)).not.toContain("nonexistent");
  });

  it("flattens tags from Record<string,{name}> to string[]", () => {
    const doc = makeDoc({
      tags: {
        "tag-id-1": { name: "ai" },
        "tag-id-2": { name: "research" },
      },
    });
    const result = transformDocument(doc, ["tags"]);
    expect(result.tags).toEqual(expect.arrayContaining(["ai", "research"]));
    expect(result.tags).toHaveLength(2);
  });

  it("converts published_date from Unix ms to ISO string", () => {
    const ms = new Date("2026-02-15T12:00:00.000Z").getTime();
    const doc = makeDoc({ published_date: ms });
    const result = transformDocument(doc, ["published_date"]);
    expect(result.published_date).toBe("2026-02-15T12:00:00.000Z");
  });

  it("converts published_date to null when field is null", () => {
    const doc = makeDoc({ published_date: null });
    const result = transformDocument(doc, ["published_date"]);
    expect(result.published_date).toBeNull();
  });

  it("converts published_date when value is 0 (Unix epoch)", () => {
    const doc = makeDoc({ published_date: 0 });
    const result = transformDocument(doc, ["published_date"]);
    expect(result.published_date).toBe("1970-01-01T00:00:00.000Z");
  });
});

// --- buildFields ---

describe("buildFields", () => {
  const defaults = ["id", "title", "author", "url", "summary"];

  it("returns default fields unchanged when withContent is false", () => {
    expect(buildFields(defaults, false)).toEqual(defaults);
  });

  it("appends html_content when withContent is true", () => {
    const result = buildFields(defaults, true);
    expect(result).toContain("html_content");
    expect(result[result.length - 1]).toBe("html_content");
  });

  it("does not duplicate html_content if already in defaults", () => {
    const withHtml = [...defaults, "html_content"];
    const result = buildFields(withHtml, true);
    expect(result.filter((f) => f === "html_content")).toHaveLength(1);
  });

  it("does not mutate the input array", () => {
    const copy = [...defaults];
    buildFields(defaults, true);
    expect(defaults).toEqual(copy);
  });

  it('returns all available fields when passed ["all"]', () => {
    const result = buildFields(["all"], false);
    expect(result).toEqual([...ALL_FIELDS]);
  });

  it('ignores withContent when passed ["all"] since html_content is already included', () => {
    const result = buildFields(["all"], true);
    expect(result).toEqual([...ALL_FIELDS]);
    expect(result.filter((f) => f === "html_content")).toHaveLength(1);
  });
});

// --- filterByPublishedSince ---

describe("filterByPublishedSince", () => {
  const threshold = new Date("2026-02-01T00:00:00.000Z").getTime();

  it("returns all docs when thresholdMs is null", () => {
    const docs = [makeDoc({ published_date: null }), makeDoc({ published_date: 0 })];
    expect(filterByPublishedSince(docs, null)).toHaveLength(2);
  });

  it("excludes a doc whose published_date is null", () => {
    const docs = [makeDoc({ published_date: null })];
    expect(filterByPublishedSince(docs, threshold)).toHaveLength(0);
  });

  it("excludes a doc whose published_date is before the threshold", () => {
    const before = new Date("2026-01-31T23:59:59.999Z").getTime();
    const docs = [makeDoc({ published_date: before })];
    expect(filterByPublishedSince(docs, threshold)).toHaveLength(0);
  });

  it("includes a doc whose published_date equals the threshold exactly", () => {
    const docs = [makeDoc({ published_date: threshold })];
    expect(filterByPublishedSince(docs, threshold)).toHaveLength(1);
  });

  it("includes a doc whose published_date is after the threshold", () => {
    const after = new Date("2026-03-01T00:00:00.000Z").getTime();
    const docs = [makeDoc({ published_date: after })];
    expect(filterByPublishedSince(docs, threshold)).toHaveLength(1);
  });
});

// --- filterByAuthor ---

describe("filterByAuthor", () => {
  const docs = [
    makeDoc({ author: "Alan Turing" }),
    makeDoc({ author: "Grace Hopper" }),
    makeDoc({ author: "Ada Lovelace" }),
  ];

  it("returns all docs when author is undefined", () => {
    expect(filterByAuthor(docs, undefined)).toHaveLength(3);
  });

  it("returns all docs when author is an empty string", () => {
    expect(filterByAuthor(docs, "")).toHaveLength(3);
  });

  it("matches case-insensitively", () => {
    const result = filterByAuthor(docs, "GRACE HOPPER");
    expect(result).toHaveLength(1);
    expect(result[0].author).toBe("Grace Hopper");
  });

  it("matches partial substring", () => {
    const result = filterByAuthor(docs, "turing");
    expect(result).toHaveLength(1);
    expect(result[0].author).toBe("Alan Turing");
  });

  it("excludes docs that do not match", () => {
    const result = filterByAuthor(docs, "Knuth");
    expect(result).toHaveLength(0);
  });
});
