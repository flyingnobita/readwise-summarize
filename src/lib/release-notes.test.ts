import { describe, expect, it } from "vitest";
import { buildReleaseNotes, parseChangelogEntries } from "./release-notes.js";

const changelog = `# Changelog

- Mar-10, 2026 - 05:10 PM SGT - Release 1.0.3: retry GitHub-trusted npm publishing from the corrected 1.0.2 code state after the mis-tagged 1.0.2 release
- Mar-10, 2026 - 05:03 PM SGT - Release 1.0.2: upgrade npm in GitHub trusted-publishing workflow to satisfy npm trusted-publishing requirements and unblock CI-based npm publish
- Mar-10, 2026 - 05:00 PM SGT - Fix GitHub trusted-publishing workflow to upgrade npm before publish because npm trusted publishing requires npm CLI 11.5.1 or later
- Mar-10, 2026 - 04:50 PM SGT - Release 1.0.1: add pnpm set-github-secrets and streamline release docs
- Mar-10, 2026 - 04:45 PM SGT - Add a helper script for GitHub Actions secrets
`;

describe("parseChangelogEntries", () => {
  it("extracts changelog bullet messages and release markers", () => {
    const entries = parseChangelogEntries(changelog);

    expect(entries[0]).toEqual({
      message:
        "Release 1.0.3: retry GitHub-trusted npm publishing from the corrected 1.0.2 code state after the mis-tagged 1.0.2 release",
      releaseVersion: "1.0.3",
      releaseSummary:
        "retry GitHub-trusted npm publishing from the corrected 1.0.2 code state after the mis-tagged 1.0.2 release",
    });
    expect(entries[2]).toEqual({
      message:
        "Fix GitHub trusted-publishing workflow to upgrade npm before publish because npm trusted publishing requires npm CLI 11.5.1 or later",
      releaseVersion: undefined,
      releaseSummary: undefined,
    });
  });
});

describe("buildReleaseNotes", () => {
  it("builds release notes for a release with additional changelog entries", () => {
    const notes = buildReleaseNotes(changelog, "1.0.2", "readwise-summarize");

    expect(notes.summary).toBe(
      "upgrade npm in GitHub trusted-publishing workflow to satisfy npm trusted-publishing requirements and unblock CI-based npm publish"
    );
    expect(notes.changes).toEqual([
      "Fix GitHub trusted-publishing workflow to upgrade npm before publish because npm trusted publishing requires npm CLI 11.5.1 or later",
    ]);
    expect(notes.markdown).toContain("## Summary");
    expect(notes.markdown).toContain("## Changes");
    expect(notes.markdown).toContain("## Install");
    expect(notes.markdown).toContain("npm install -g readwise-summarize");
  });

  it("falls back when a release has no additional changelog entries", () => {
    const notes = buildReleaseNotes(changelog, "1.0.3", "readwise-summarize");

    expect(notes.changes).toEqual([]);
    expect(notes.markdown).toContain(
      "No additional changelog entries recorded for this release."
    );
  });

  it("fails when the requested release is missing", () => {
    expect(() => buildReleaseNotes(changelog, "9.9.9", "readwise-summarize")).toThrow(
      "release 9.9.9 not found"
    );
  });
});
