export interface ReaderDocument {
  id: string;
  url: string;
  source_url: string;
  title: string;
  author: string;
  site_name?: string;
  category: string;
  location: string;
  tags: Record<string, { name: string }>;
  word_count: number;
  reading_time: number;
  created_at: string;
  updated_at: string;
  published_date: number | null; // Unix timestamp (ms)
  summary: string;
  image_url: string;
  reading_progress: number;
  html_content?: string;
}

export interface ListResponse {
  count: number;
  nextPageCursor: string | null;
  results: ReaderDocument[];
}

export interface OutputDocument {
  id?: string;
  title?: string;
  author?: string;
  site_name?: string;
  url?: string;
  source_url?: string;
  category?: string;
  location?: string;
  tags?: string[];
  word_count?: number;
  reading_time?: number;
  created_at?: string;
  updated_at?: string;
  published_date?: string | null;
  summary?: string;
  image_url?: string;
  reading_progress?: number;
  html_content?: string;
  [key: string]: unknown;
}

