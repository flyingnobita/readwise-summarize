import { describe, expect, it } from "vitest";
import {
  assertReleaseVersion,
  assertTagMatchesPackageVersion,
  buildReleasePlan,
  isValidSemver,
  parseReleaseTag,
  releaseTag,
} from "./release.js";

describe("isValidSemver", () => {
  it("accepts stable semver versions", () => {
    expect(isValidSemver("1.2.3")).toBe(true);
  });

  it("accepts prerelease versions", () => {
    expect(isValidSemver("1.2.3-beta.1")).toBe(true);
  });

  it("rejects invalid versions", () => {
    expect(isValidSemver("1.2")).toBe(false);
  });
});

describe("releaseTag", () => {
  it("prefixes versions with v", () => {
    expect(releaseTag("1.2.3")).toBe("v1.2.3");
  });
});

describe("parseReleaseTag", () => {
  it("extracts the version from a valid release tag", () => {
    expect(parseReleaseTag("v1.2.3")).toBe("1.2.3");
  });

  it("rejects tags without the v prefix", () => {
    expect(() => parseReleaseTag("1.2.3")).toThrow("must start with v");
  });

  it("rejects tags with invalid versions", () => {
    expect(() => parseReleaseTag("v1.2")).toThrow("valid semver");
  });
});

describe("assertReleaseVersion", () => {
  it("uses package version when no override is provided", () => {
    expect(assertReleaseVersion("1.2.3")).toBe("1.2.3");
  });

  it("accepts a matching override", () => {
    expect(assertReleaseVersion("1.2.3", "1.2.3")).toBe("1.2.3");
  });

  it("rejects a mismatched override", () => {
    expect(() => assertReleaseVersion("1.2.3", "1.2.4")).toThrow("does not match");
  });
});

describe("assertTagMatchesPackageVersion", () => {
  it("accepts a matching version tag", () => {
    expect(assertTagMatchesPackageVersion("1.2.3", "v1.2.3")).toBe("1.2.3");
  });

  it("rejects a mismatched version tag", () => {
    expect(() => assertTagMatchesPackageVersion("1.2.3", "v1.2.4")).toThrow("does not match");
  });
});

describe("buildReleasePlan", () => {
  it("builds the default end-to-end plan", () => {
    const plan = buildReleasePlan({
      version: "1.2.3",
      remote: "origin",
      branch: "main",
      dryRun: false,
      skipTests: false,
      skipIntegration: false,
      skipBuild: false,
      skipPush: false,
      skipPublish: false,
      skipGithubRelease: false,
    });

    expect(plan.map((step) => step.command)).toEqual([
      "pnpm",
      "pnpm",
      "pnpm",
      "git",
      "git",
      "git",
      "npm",
      "gh",
    ]);
    expect(plan[3].args).toEqual(["tag", "-a", "v1.2.3", "-m", "v1.2.3"]);
    expect(plan[7].args).toEqual([
      "release",
      "create",
      "v1.2.3",
      "--verify-tag",
      "--title",
      "v1.2.3",
      "--generate-notes",
    ]);
  });

  it("omits skipped steps and includes otp when provided", () => {
    const plan = buildReleasePlan({
      version: "1.2.3",
      remote: "origin",
      branch: "main",
      dryRun: true,
      skipTests: true,
      skipIntegration: true,
      skipBuild: false,
      skipPush: true,
      skipPublish: false,
      skipGithubRelease: true,
      otp: "123456",
    });

    expect(plan.map((step) => step.command)).toEqual(["pnpm", "git", "npm"]);
    expect(plan[2].args).toContain("--otp=123456");
  });
});
