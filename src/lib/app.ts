import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

export const APP_NAME = "readwise-summarize";
export const APP_REPOSITORY = "https://github.com/flyingnobita/readwise-summarize";

function resolveConfigBaseDir(): string {
  if (process.env.READWISE_SUMMARIZE_CONFIG_DIR) {
    return process.env.READWISE_SUMMARIZE_CONFIG_DIR;
  }

  if (process.platform === "win32") {
    return process.env.APPDATA ? join(process.env.APPDATA, APP_NAME) : join(homedir(), "AppData", "Roaming", APP_NAME);
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  return join(xdgConfigHome || join(homedir(), ".config"), APP_NAME);
}

export function getUserConfigPath(): string {
  return join(resolveConfigBaseDir(), "config.toml");
}

export function readOptionalTextFile(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

export function writeAtomicFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, path);
}
