export interface ReleaseConfig {
  version: string;
  remote: string;
  branch: string;
  dryRun: boolean;
  skipTests: boolean;
  skipIntegration: boolean;
  skipBuild: boolean;
  skipPush: boolean;
  skipPublish: boolean;
  skipGithubRelease: boolean;
  githubReleaseNotesFile?: string;
  otp?: string;
}

export interface ReleaseCommand {
  description: string;
  command: string;
  args: string[];
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version);
}

export function releaseTag(version: string): string {
  return `v${version}`;
}

export function parseReleaseTag(tag: string): string {
  if (!tag.startsWith("v")) {
    throw new Error(`release tag must start with v: ${tag}`);
  }

  const version = tag.slice(1);
  if (!isValidSemver(version)) {
    throw new Error(`release tag does not contain a valid semver: ${tag}`);
  }

  return version;
}

export function assertReleaseVersion(
  packageVersion: string,
  requestedVersion?: string
): string {
  if (!isValidSemver(packageVersion)) {
    throw new Error(`package.json version is not a valid semver: ${packageVersion}`);
  }

  if (requestedVersion === undefined) {
    return packageVersion;
  }

  if (!isValidSemver(requestedVersion)) {
    throw new Error(`requested version is not a valid semver: ${requestedVersion}`);
  }

  if (requestedVersion !== packageVersion) {
    throw new Error(
      `requested version ${requestedVersion} does not match package.json version ${packageVersion}`
    );
  }

  return requestedVersion;
}

export function assertTagMatchesPackageVersion(
  packageVersion: string,
  tag: string
): string {
  const tagVersion = parseReleaseTag(tag);
  return assertReleaseVersion(packageVersion, tagVersion);
}

export function buildReleasePlan(config: ReleaseConfig): ReleaseCommand[] {
  const tag = releaseTag(config.version);
  const commands: ReleaseCommand[] = [];

  if (!config.skipTests) {
    commands.push({
      description: "Run unit tests",
      command: "pnpm",
      args: ["test"],
    });
  }

  if (!config.skipIntegration) {
    commands.push({
      description: "Run integration tests",
      command: "pnpm",
      args: ["test:integration"],
    });
  }

  if (!config.skipBuild) {
    commands.push({
      description: "Build distributable files",
      command: "pnpm",
      args: ["build"],
    });
  }

  commands.push({
    description: `Create annotated tag ${tag}`,
    command: "git",
    args: ["tag", "-a", tag, "-m", tag],
  });

  if (!config.skipPush) {
    commands.push({
      description: `Push branch ${config.branch} to ${config.remote}`,
      command: "git",
      args: ["push", config.remote, config.branch],
    });
    commands.push({
      description: `Push tag ${tag} to ${config.remote}`,
      command: "git",
      args: ["push", config.remote, tag],
    });
  }

  if (!config.skipPublish) {
    commands.push({
      description: "Publish package to npm",
      command: "npm",
      args: [
        "publish",
        "--access",
        "public",
        ...(config.otp ? [`--otp=${config.otp}`] : []),
      ],
    });
  }

  if (!config.skipGithubRelease) {
    commands.push({
      description: `Create GitHub release ${tag}`,
      command: "gh",
      args: [
        "release",
        "create",
        tag,
        "--verify-tag",
        "--title",
        tag,
        ...(config.githubReleaseNotesFile
          ? ["--notes-file", config.githubReleaseNotesFile]
          : ["--generate-notes"]),
      ],
    });
  }

  return commands;
}
