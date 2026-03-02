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
  };
  output: {
    default_fields: string[];
  };
}

const raw = readFileSync(configPath, "utf-8");
export const config: Config = parse(raw) as unknown as Config;
