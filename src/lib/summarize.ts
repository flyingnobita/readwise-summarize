import { mapWithConcurrency } from "./openrouter.js";
import type { OutputDocument } from "./types.js";

/**
 * Compact markdown/text to reduce token count without changing meaning.
 * - Strips trailing whitespace from each line
 * - Collapses runs of blank lines to a single blank line
 * - Trims leading/trailing whitespace from the whole string
 */
export function compactMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SummarizeOptions {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  /** 0 = omit max_tokens from request; positive = hard cap */
  maxTokens: number;
  /** Soft length guidance appended inside <instructions>. Mirrors steipete's lengthInstruction. */
  lengthInstruction?: string;
  temperature: number;
  systemPrompt: string;
  userPromptTemplate: string;
  instructions: string;
  timeoutMs: number;
  concurrency: number;
  withOriginal: boolean;
  fetchImpl?: typeof fetch;
  onDebug?: (msg: string) => void;
}

export interface SummarizedDocument {
  id?: string;
  title?: string;
  author?: string;
  link: string;
  ai_summary: string;
  original_summary?: string;
}

export async function summarizeDocument(
  doc: OutputDocument,
  opts: SummarizeOptions
): Promise<SummarizedDocument> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const link = (doc.source_url as string | undefined) ?? (doc.url as string) ?? "";

  const base: SummarizedDocument = {
    id: doc.id as string | undefined,
    title: doc.title as string | undefined,
    author: doc.author as string | undefined,
    link,
    ai_summary: "",
  };

  if (opts.withOriginal && doc.summary) {
    base.original_summary = doc.summary as string;
  }

  if (!doc.html_content) {
    base.ai_summary = "[no content available]";
    return base;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const instructionParts = [opts.instructions];
    if (opts.lengthInstruction?.trim()) instructionParts.push(opts.lengthInstruction.trim());
    const instructions = instructionParts.join("\n");

    const response = await fetchImpl(`${opts.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/flyingnobita/daily-brief",
        "X-Title": "daily-brief",
      },
      body: JSON.stringify({
        model: opts.modelId,
        ...(opts.maxTokens > 0 ? { max_tokens: opts.maxTokens } : {}),
        temperature: opts.temperature,
        messages: [
          {
            role: "system",
            content: opts.systemPrompt,
          },
          {
            role: "user",
            content: opts.userPromptTemplate
              .replace("{instructions}", instructions)
              .replace("{url}", link)
              .replace("{title}", doc.title ?? "")
              .replace("{author}", doc.author ?? "")
              .replace("{html_content}", compactMarkdown(doc.html_content ?? "")),
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text();
      base.ai_summary = `[summarization failed: HTTP ${response.status}: ${body.slice(0, 200)}]`;
      return base;
    }

    const data = (await response.json()) as {
      choices: { finish_reason?: string; message: { content: string | null } }[];
    };
    opts.onDebug?.(JSON.stringify(data));
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";
    if (!content) {
      const reason = choice?.finish_reason;
      const detail = reason === "length" ? "hit token limit (increase max_tokens)" : "model returned empty content";
      base.ai_summary = `[summarization failed: ${detail}]`;
      return base;
    }
    base.ai_summary = content;
    return base;
  } catch (err: unknown) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    base.ai_summary = `[summarization failed: ${message}]`;
    return base;
  }
}

export async function summarizeDocuments(
  docs: OutputDocument[],
  opts: SummarizeOptions,
  onProgress?: (msg: string) => void
): Promise<SummarizedDocument[]> {
  return mapWithConcurrency(docs, opts.concurrency, async (doc) => {
    const result = await summarizeDocument(doc, opts);
    onProgress?.(`Summarized: ${doc.title ?? doc.url ?? "unknown"}`);
    return result;
  });
}
