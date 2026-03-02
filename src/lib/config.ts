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
    max_tokens: number;
    timeout_ms: number;
    concurrency: number;
    temperature: number;
    system_prompt: string;
    user_prompt_template: string;
  };
}

const raw = readFileSync(configPath, "utf-8");
export const config: Config = parse(raw) as unknown as Config;
