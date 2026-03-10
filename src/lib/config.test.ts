import { describe, it, expect } from "vitest";
import { loadConfig, updateUserConfigToml, validateConfig } from "./config.js";

function makeValid(): Record<string, unknown> {
  return {
    api: { base_url: "https://example.com/", pagination_delay_ms: 3000, default_limit: 100, timeout_ms: 30000 },
    output: { default_fields: ["id", "title"] },
    openrouter: { api_url: "https://openrouter.ai/api/v1", min_param_b: 27, max_age_days: 180, concurrency: 4, timeout_ms: 10000, max_candidates: 10, smart_picks: 3, extra_runs: 2 },
    summarize: { model: "", max_tokens: 300, timeout_ms: 30000, concurrency: 3, temperature: 0.7, system_prompt: "You are a summarizer.", user_prompt_template: "Title: {title}\n\n{html_content}" },
  };
}

describe("validateConfig", () => {
  it("passes with a complete valid config", () => {
    expect(() => validateConfig(makeValid())).not.toThrow();
  });

  it("throws when root is null", () => {
    expect(() => validateConfig(null)).toThrow("root must be a TOML table");
  });

  it("throws when root is a primitive", () => {
    expect(() => validateConfig("not an object")).toThrow("root must be a TOML table");
  });

  it.each(["api", "output", "openrouter", "summarize"])(
    "throws when [%s] section is missing",
    (section) => {
      const cfg = makeValid();
      delete cfg[section];
      expect(() => validateConfig(cfg)).toThrow(`[${section}] section`);
    }
  );

  it("throws when api.timeout_ms is missing", () => {
    const cfg = makeValid();
    delete (cfg["api"] as Record<string, unknown>)["timeout_ms"];
    expect(() => validateConfig(cfg)).toThrow("api.timeout_ms");
  });

  it("throws when api.timeout_ms is a string instead of a number", () => {
    const cfg = makeValid();
    (cfg["api"] as Record<string, unknown>)["timeout_ms"] = "30000";
    expect(() => validateConfig(cfg)).toThrow("api.timeout_ms");
  });

  it("throws when summarize.system_prompt is missing", () => {
    const cfg = makeValid();
    delete (cfg["summarize"] as Record<string, unknown>)["system_prompt"];
    expect(() => validateConfig(cfg)).toThrow("summarize.system_prompt");
  });

  it("throws when summarize.user_prompt_template is missing", () => {
    const cfg = makeValid();
    delete (cfg["summarize"] as Record<string, unknown>)["user_prompt_template"];
    expect(() => validateConfig(cfg)).toThrow("summarize.user_prompt_template");
  });
});

describe("loadConfig", () => {
  it("returns defaults when no user config is provided", () => {
    const defaults = `
[api]
base_url = "https://example.com/"
pagination_delay_ms = 3000
default_limit = 100
timeout_ms = 30000

[output]
default_fields = ["id"]

[openrouter]
api_url = "https://openrouter.ai/api/v1"
id_suffix = ":free"
min_param_b = 27
max_age_days = 180
concurrency = 1
timeout_ms = 10000
max_candidates = 10
smart_picks = 3
extra_runs = 2

[summarize]
model = ""
max_tokens = 0
timeout_ms = 30000
concurrency = 1
temperature = 0.7
system_prompt = "system"
user_prompt_template = "template"
`;
    const result = loadConfig(defaults);
    expect(result.output.default_fields).toEqual(["id"]);
    expect(result.summarize.model).toBe("");
  });

  it("overrides only provided keys from user config", () => {
    const defaults = `
[api]
base_url = "https://example.com/"
pagination_delay_ms = 3000
default_limit = 100
timeout_ms = 30000

[output]
default_fields = ["id"]

[openrouter]
api_url = "https://openrouter.ai/api/v1"
id_suffix = ":free"
min_param_b = 27
max_age_days = 180
concurrency = 1
timeout_ms = 10000
max_candidates = 10
smart_picks = 3
extra_runs = 2

[summarize]
model = ""
max_tokens = 0
timeout_ms = 30000
concurrency = 1
temperature = 0.7
system_prompt = "system"
user_prompt_template = "template"
`;
    const user = `
[summarize]
model = "test/model:free"

[openrouter]
concurrency = 4
`;
    const result = loadConfig(defaults, user);
    expect(result.summarize.model).toBe("test/model:free");
    expect(result.openrouter.concurrency).toBe(4);
    expect(result.api.base_url).toBe("https://example.com/");
  });
});

describe("updateUserConfigToml", () => {
  it("creates a summarize section when none exists", () => {
    const result = updateUserConfigToml("", "test/model:free");
    expect(result).toContain('[summarize]');
    expect(result).toContain('model = "test/model:free"');
  });

  it("preserves unrelated user overrides", () => {
    const input = `
[openrouter]
concurrency = 4
`;
    const result = updateUserConfigToml(input, "test/model:free");
    expect(result).toContain("[openrouter]");
    expect(result).toContain("concurrency = 4");
    expect(result).toContain('model = "test/model:free"');
  });
});
