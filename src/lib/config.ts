import { readFileSync } from "fs";
import { parse } from "smol-toml";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "../../config.toml");

interface Config {
  api: {
    base_url: string;
    pagination_delay_ms: number;
    default_limit: number;
    timeout_ms: number;
  };
  output: {
    default_fields: string[];
  };
  openrouter: {
    api_url: string;
    id_suffix: string;
    min_param_b: number;
    max_age_days: number;
    concurrency: number;
    timeout_ms: number;
    max_candidates: number;
    smart_picks: number;
    extra_runs: number;
  };
  summarize: {
    model: string;
    /** 0 = omit from API request (let provider decide); positive = hard cap */
    max_tokens: number;
    /** Soft length guidance appended inside <instructions>. e.g. "Target length: around 500 characters." */
    length_instruction?: string;
    timeout_ms: number;
    concurrency: number;
    temperature: number;
    system_prompt: string;
    user_prompt_template: string;
  };
}

export function validateConfig(raw: unknown): asserts raw is Config {
  if (!raw || typeof raw !== "object") {
    throw new Error("config.toml: root must be a TOML table");
  }
  const r = raw as Record<string, unknown>;
  for (const section of ["api", "output", "openrouter", "summarize"]) {
    if (!r[section] || typeof r[section] !== "object") {
      throw new Error(`config.toml: missing or invalid [${section}] section`);
    }
  }
  const api = r["api"] as Record<string, unknown>;
  if (typeof api["timeout_ms"] !== "number") {
    throw new Error("config.toml: api.timeout_ms must be a number");
  }
  const summarize = r["summarize"] as Record<string, unknown>;
  if (typeof summarize["system_prompt"] !== "string") {
    throw new Error("config.toml: summarize.system_prompt must be a string");
  }
  if (typeof summarize["user_prompt_template"] !== "string") {
    throw new Error("config.toml: summarize.user_prompt_template must be a string");
  }
}

const raw = parse(readFileSync(configPath, "utf-8"));
validateConfig(raw);
export const config: Config = raw;
