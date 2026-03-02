import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPage } from "./api.js";
import { BASE_URL } from "./types.js";

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
