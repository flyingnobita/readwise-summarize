import type { ListResponse, ReaderDocument } from "./types.js";
import { config } from "./config.js";

export async function fetchPage(
  token: string,
  params: Record<string, string>
): Promise<ListResponse> {
  const url = new URL(config.api.base_url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.api.timeout_ms);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${token}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API error ${response.status}: ${body.slice(0, 200)}`);
    }

    return (await response.json()) as ListResponse;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function fetchAllDocuments(
  token: string,
  params: Record<string, string>,
  options: {
    paginate: boolean;
    onPage?: (pageNum: number, count: number) => void;
  }
): Promise<ReaderDocument[]> {
  const results: ReaderDocument[] = [];
  let pageNum = 0;
  let cursor: string | null = null;
  const pageParams = { ...params };

  do {
    if (cursor) {
      pageParams["pageCursor"] = cursor;
    }

    const page = await fetchPage(token, pageParams);
    pageNum++;
    options.onPage?.(pageNum, page.results.length);
    results.push(...page.results);

    cursor = page.nextPageCursor;

    if (cursor && options.paginate) {
      await new Promise((resolve) => setTimeout(resolve, config.api.pagination_delay_ms));
    }
  } while (cursor && options.paginate);

  return results;
}
