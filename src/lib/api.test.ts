import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPage, fetchAllDocuments } from "./api.js";
import { config } from "./config.js";
import type { ReaderDocument } from "./types.js";

const BASE_URL = config.api.base_url;

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(response: { ok: boolean; status?: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      response.ok
        ? { ok: true, json: async () => response.body }
        : {
            ok: false,
            status: response.status,
            text: async () => response.body,
          }
    )
  );
}

describe("fetchPage", () => {
  it("returns parsed ListResponse on 200 OK", async () => {
    const payload = { count: 1, nextPageCursor: null, results: [] };
    mockFetch({ ok: true, body: payload });

    const result = await fetchPage("test-token", { location: "feed" });
    expect(result).toEqual(payload);
  });

  it("throws with 'API error 401' message on 401 response", async () => {
    mockFetch({ ok: false, status: 401, body: '{"detail":"Invalid token."}' });

    await expect(
      fetchPage("bad-token", { location: "feed" })
    ).rejects.toThrow('API error 401: {"detail":"Invalid token."}');
  });

  it("throws with 'API error 429' message on 429 response", async () => {
    mockFetch({
      ok: false,
      status: 429,
      body: '{"detail":"Request was throttled."}',
    });

    await expect(
      fetchPage("test-token", { location: "feed" })
    ).rejects.toThrow("API error 429:");
  });

  it("passes an AbortController signal to the fetch call", async () => {
    const payload = { count: 0, nextPageCursor: null, results: [] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPage("test-token", {});

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeDefined();
  });

  it("builds the URL correctly from params", async () => {
    const payload = { count: 0, nextPageCursor: null, results: [] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPage("test-token", { location: "feed", limit: "5", tag: "ai" });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe(BASE_URL);
    expect(calledUrl.searchParams.get("location")).toBe("feed");
    expect(calledUrl.searchParams.get("limit")).toBe("5");
    expect(calledUrl.searchParams.get("tag")).toBe("ai");
  });
});

// ---------------------------------------------------------------------------
// fetchAllDocuments
// ---------------------------------------------------------------------------

function makeDoc(id: string): ReaderDocument {
  return {
    id,
    url: `https://example.com/${id}`,
    source_url: "",
    title: `Doc ${id}`,
    author: "Author",
    category: "article",
    location: "feed",
    tags: {},
    word_count: 100,
    reading_time: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    published_date: null,
    summary: "",
    image_url: "",
    reading_progress: 0,
  };
}

describe("fetchAllDocuments", () => {
  it("returns all results from a single page when there is no next cursor", async () => {
    const docs = [makeDoc("a"), makeDoc("b")];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ count: 2, nextPageCursor: null, results: docs }),
      })
    );

    const result = await fetchAllDocuments("token", {}, { paginate: false });
    expect(result).toEqual(docs);
  });

  it("stops after the first page when paginate=false even if a cursor is returned", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 1, nextPageCursor: "cursor-abc", results: [makeDoc("a")] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAllDocuments("token", {}, { paginate: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it("paginates through multiple pages when paginate=true, passing the cursor as pageCursor", async () => {
    const page1 = { count: 1, nextPageCursor: "cursor-1", results: [makeDoc("a")] };
    const page2 = { count: 1, nextPageCursor: null, results: [makeDoc("b")] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn) => { (fn as () => void)(); return 0 as unknown as ReturnType<typeof setTimeout>; });

    const result = await fetchAllDocuments("token", {}, { paginate: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");

    const secondCallUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(secondCallUrl.searchParams.get("pageCursor")).toBe("cursor-1");
  });

  it("calls onPage callback with page number and result count for each page", async () => {
    const page1 = { count: 2, nextPageCursor: "cursor-1", results: [makeDoc("a"), makeDoc("b")] };
    const page2 = { count: 1, nextPageCursor: null, results: [makeDoc("c")] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn) => { (fn as () => void)(); return 0 as unknown as ReturnType<typeof setTimeout>; });

    const pages: { pageNum: number; count: number }[] = [];
    await fetchAllDocuments("token", {}, {
      paginate: true,
      onPage: (pageNum, count) => pages.push({ pageNum, count }),
    });

    expect(pages).toEqual([
      { pageNum: 1, count: 2 },
      { pageNum: 2, count: 1 },
    ]);
  });
});
