export interface ChangelogEntry {
  message: string;
  releaseVersion?: string;
  releaseSummary?: string;
}

export interface ReleaseNotesResult {
  summary: string;
  changes: string[];
  markdown: string;
}

const RELEASE_ENTRY_RE = /^Release ([^:]+):\s*(.+)$/;

export function parseChangelogEntries(changelog: string): ChangelogEntry[] {
  return changelog
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const message = line.replace(/^- .* - /, "").trim();
      const releaseMatch = RELEASE_ENTRY_RE.exec(message);

      return {
        message,
        releaseVersion: releaseMatch?.[1],
        releaseSummary: releaseMatch?.[2],
      };
    });
}

export function buildReleaseNotes(
  changelog: string,
  version: string,
  packageName: string
): ReleaseNotesResult {
  const entries = parseChangelogEntries(changelog);
  const start = entries.findIndex((entry) => entry.releaseVersion === version);

  if (start === -1) {
    throw new Error(`release ${version} not found in CHANGELOG.md`);
  }

  const releaseEntry = entries[start];
  const nextReleaseIndex = entries.findIndex(
    (entry, index) => index > start && entry.releaseVersion !== undefined
  );
  const end = nextReleaseIndex === -1 ? entries.length : nextReleaseIndex;
  const changes = entries.slice(start + 1, end).map((entry) => entry.message);
  const summary =
    releaseEntry.releaseSummary ?? `Release ${version} for ${packageName}.`;

  const markdown = [
    "## Summary",
    summary,
    "",
    "## Changes",
    ...(changes.length > 0
      ? changes.map((change) => `- ${change}`)
      : ["- No additional changelog entries recorded for this release."]),
    "",
    "## Install",
    `\`npm install -g ${packageName}\``,
    "",
  ].join("\n");

  return {
    summary,
    changes,
    markdown,
  };
}
