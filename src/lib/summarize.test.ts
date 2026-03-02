import { describe, it, expect, vi, afterEach } from "vitest";
import { summarizeDocument, summarizeDocuments, compactMarkdown } from "./summarize.js";
import type { SummarizeOptions } from "./summarize.js";
import type { OutputDocument } from "./types.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOpts(overrides: Partial<SummarizeOptions> = {}): SummarizeOptions {
  return {
    apiUrl: "https://openrouter.ai/api/v1",
    apiKey: "test-key",
    modelId: "test/model:free",
    maxTokens: 300,
    temperature: 0.7,
    systemPrompt: "You are a summarizer.",
    userPromptTemplate: "Title: {title}\nAuthor: {author}\n\n{html_content}",
    instructions: "Summarize concisely.",
    timeoutMs: 5000,
    concurrency: 2,
    withOriginal: false,
    ...overrides,
  };
}

function makeDoc(overrides: Partial<OutputDocument> = {}): OutputDocument {
  return {
    id: "doc-1",
    title: "Test Article",
    author: "Test Author",
    url: "https://example.com/article",
    html_content: "<p>This is the article content.</p>",
    summary: "Original summary text.",
    ...overrides,
  };
}

function makeSuccessResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
    text: async () => "",
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// compactMarkdown
// ---------------------------------------------------------------------------

describe("compactMarkdown", () => {
  it("strips trailing whitespace from each line", () => {
    expect(compactMarkdown("hello   \nworld  ")).toBe("hello\nworld");
  });

  it("collapses multiple blank lines into one", () => {
    expect(compactMarkdown("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims leading and trailing whitespace from the whole string", () => {
    expect(compactMarkdown("\n\nhello\n\n")).toBe("hello");
  });

  it("returns empty string unchanged", () => {
    expect(compactMarkdown("")).toBe("");
  });

  it("preserves single blank lines (paragraph separation)", () => {
    expect(compactMarkdown("para one\n\npara two")).toBe("para one\n\npara two");
  });
});

// ---------------------------------------------------------------------------
// summarizeDocument — success path
// ---------------------------------------------------------------------------

describe("summarizeDocument", () => {
  it("sends correct headers and body, returns parsed summary", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("AI-generated summary."));
    const opts = makeOpts({ fetchImpl: mockFetch });
    const doc = makeDoc();

    const result = await summarizeDocument(doc, opts);

    expect(result.ai_summary).toBe("AI-generated summary.");
    expect(result.id).toBe("doc-1");
    expect(result.title).toBe("Test Article");
    expect(result.author).toBe("Test Author");
    expect(result.link).toBe("https://example.com/article");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>)["HTTP-Referer"]).toBe(
      "https://github.com/flyingnobita/daily-brief"
    );
    expect((init.headers as Record<string, string>)["X-Title"]).toBe("daily-brief");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test/model:free");
    expect(body.max_tokens).toBe(300);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("Test Article");
    expect(body.messages[1].content).toContain("Test Author");
    expect(body.messages[1].content).toContain("<p>This is the article content.</p>");
  });

  it("sends system_prompt, temperature, and substituted user_prompt_template in request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("summary"));
    const opts = makeOpts({
      fetchImpl: mockFetch,
      systemPrompt: "Custom system prompt.",
      userPromptTemplate: "Title: {title}\nAuthor: {author}\n\n{html_content}",
      temperature: 0.3,
    });
    const doc = makeDoc({ title: "My Title", author: "My Author", html_content: "<p>Content</p>" });

    await summarizeDocument(doc, opts);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.temperature).toBe(0.3);
    expect(body.messages[0].content).toBe("Custom system prompt.");
    expect(body.messages[1].content).toContain("My Title");
    expect(body.messages[1].content).toContain("My Author");
    expect(body.messages[1].content).toContain("<p>Content</p>");
  });

  it("substitutes {url} placeholder in user prompt template", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("summary"));
    const opts = makeOpts({
      fetchImpl: mockFetch,
      userPromptTemplate:
        "<instructions>\n{instructions}\n</instructions>\n\n<context>\nSource URL: {url}\nTitle: {title}\nAuthor: {author}\n</context>\n\n<content>\n{html_content}\n</content>",
    });
    const doc = makeDoc({ url: "https://example.com/article" });

    await summarizeDocument(doc, opts);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.messages[1].content).toContain("Source URL: https://example.com/article");
    expect(body.messages[1].content).toContain("<context>");
    expect(body.messages[1].content).toContain("</context>");
  });

  it("omits max_tokens from request body when maxTokens is 0", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("summary"));
    await summarizeDocument(makeDoc(), makeOpts({ fetchImpl: mockFetch, maxTokens: 0 }));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.max_tokens).toBeUndefined();
  });

  it("includes max_tokens in request body when maxTokens is positive", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("summary"));
    await summarizeDocument(makeDoc(), makeOpts({ fetchImpl: mockFetch, maxTokens: 512 }));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.max_tokens).toBe(512);
  });

  it("appends lengthInstruction to instructions inside <instructions> block", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("summary"));
    const opts = makeOpts({
      fetchImpl: mockFetch,
      userPromptTemplate: "<instructions>\n{instructions}\n</instructions>",
      instructions: "Summarize concisely.",
      lengthInstruction: "Target length: around 500 characters.",
    });

    await summarizeDocument(makeDoc(), opts);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.messages[1].content).toContain("Summarize concisely.\nTarget length: around 500 characters.");
  });

  it("does not append lengthInstruction when it is empty or whitespace", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("summary"));
    const opts = makeOpts({
      fetchImpl: mockFetch,
      userPromptTemplate: "<instructions>\n{instructions}\n</instructions>",
      instructions: "Summarize concisely.",
      lengthInstruction: "   ",
    });

    await summarizeDocument(makeDoc(), opts);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.messages[1].content).toBe("<instructions>\nSummarize concisely.\n</instructions>");
  });

  it("uses source_url over url for link field", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("summary"));
    const doc = makeDoc({
      url: "https://reader.example.com/item",
      source_url: "https://original.example.com/article",
    });

    const result = await summarizeDocument(doc, makeOpts({ fetchImpl: mockFetch }));
    expect(result.link).toBe("https://original.example.com/article");
  });

  it("includes original_summary when withOriginal is true", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("AI summary"));
    const doc = makeDoc({ summary: "Original summary." });

    const result = await summarizeDocument(doc, makeOpts({ withOriginal: true, fetchImpl: mockFetch }));
    expect(result.original_summary).toBe("Original summary.");
  });

  it("does not include original_summary when withOriginal is false", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("AI summary"));
    const doc = makeDoc({ summary: "Original summary." });

    const result = await summarizeDocument(doc, makeOpts({ withOriginal: false, fetchImpl: mockFetch }));
    expect(result.original_summary).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // summarizeDocument — missing html_content
  // ---------------------------------------------------------------------------

  it("returns [no content available] when html_content is missing", async () => {
    const mockFetch = vi.fn();
    const doc = makeDoc({ html_content: undefined });

    const result = await summarizeDocument(doc, makeOpts({ fetchImpl: mockFetch }));
    expect(result.ai_summary).toBe("[no content available]");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns [no content available] when html_content is empty string", async () => {
    const mockFetch = vi.fn();
    const doc = makeDoc({ html_content: "" });

    const result = await summarizeDocument(doc, makeOpts({ fetchImpl: mockFetch }));
    expect(result.ai_summary).toBe("[no content available]");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // summarizeDocument — API error
  // ---------------------------------------------------------------------------

  it("returns [summarization failed] on non-ok HTTP response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(500, "Internal Server Error"));

    const result = await summarizeDocument(makeDoc(), makeOpts({ fetchImpl: mockFetch }));
    expect(result.ai_summary).toMatch(/\[summarization failed: HTTP 500/);
  });

  it("returns [summarization failed] on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network failure"));

    const result = await summarizeDocument(makeDoc(), makeOpts({ fetchImpl: mockFetch }));
    expect(result.ai_summary).toBe("[summarization failed: network failure]");
  });

  it("returns [summarization failed] on timeout/abort", async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const result = await summarizeDocument(makeDoc(), makeOpts({ fetchImpl: mockFetch, timeoutMs: 1 }));
    expect(result.ai_summary).toMatch(/\[summarization failed:/);
  });
});

// ---------------------------------------------------------------------------
// summarizeDocuments
// ---------------------------------------------------------------------------

describe("summarizeDocuments", () => {
  it("processes all documents and returns results", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return makeSuccessResponse(`Summary ${callCount}`);
    });

    const docs = [makeDoc({ id: "1", url: "https://a.com" }), makeDoc({ id: "2", url: "https://b.com" }), makeDoc({ id: "3", url: "https://c.com" })];

    const results = await summarizeDocuments(docs, makeOpts({ fetchImpl: mockFetch }));
    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("calls onProgress for each document", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse("summary"));
    const progressMessages: string[] = [];

    const docs = [makeDoc({ id: "1" }), makeDoc({ id: "2" })];
    await summarizeDocuments(docs, makeOpts({ fetchImpl: mockFetch }), (msg) => {
      progressMessages.push(msg);
    });

    expect(progressMessages).toHaveLength(2);
  });

  it("respects concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const mockFetch = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return makeSuccessResponse("summary");
    });

    const docs = Array.from({ length: 6 }, (_, i) =>
      makeDoc({ id: String(i), url: `https://example.com/${i}` })
    );

    await summarizeDocuments(docs, makeOpts({ fetchImpl: mockFetch, concurrency: 2 }));
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("handles empty array", async () => {
    const results = await summarizeDocuments([], makeOpts());
    expect(results).toEqual([]);
  });
});
