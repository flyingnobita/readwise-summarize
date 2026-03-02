import type { OutputDocument, ReaderDocument } from "./types.js";

/**
 * Build the output field list from the configured default fields,
 * automatically appending "html_content" when withContent is true.
 */
export function buildFields(defaultFields: string[], withContent: boolean): string[] {
  const fields = [...defaultFields];
  if (withContent && !fields.includes("html_content")) {
    fields.push("html_content");
  }
  return fields;
}

export function transformDocument(
  doc: ReaderDocument,
  fields: string[]
): OutputDocument {
  const tagNames = Object.values(doc.tags ?? {}).map((t) => t.name);

  const publishedDate =
    doc.published_date != null
      ? new Date(doc.published_date).toISOString()
      : null;

  const full: OutputDocument = {
    id: doc.id,
    title: doc.title,
    author: doc.author,
    url: doc.url,
    source_url: doc.source_url,
    category: doc.category,
    location: doc.location,
    tags: tagNames,
    word_count: doc.word_count,
    reading_time: doc.reading_time,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    published_date: publishedDate,
    summary: doc.summary,
    image_url: doc.image_url,
    reading_progress: doc.reading_progress,
    html_content: doc.html_content,
  };

  const result: OutputDocument = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(full, field)) {
      result[field] = full[field];
    }
  }
  return result;
}

export function filterByPublishedSince(
  docs: ReaderDocument[],
  thresholdMs: number | null
): ReaderDocument[] {
  if (thresholdMs === null) return docs;
  return docs.filter(
    (doc) => doc.published_date !== null && doc.published_date >= thresholdMs
  );
}

export function filterByAuthor(
  docs: ReaderDocument[],
  author: string | undefined
): ReaderDocument[] {
  if (!author) return docs;
  const query = author.toLowerCase();
  return docs.filter((doc) => doc.author.toLowerCase().includes(query));
}
