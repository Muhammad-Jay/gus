import { RepositoryInspectionError } from '../../../../domain/errors/domain-errors.js';
import type { RepositoryCapabilities } from '../../../../domain/repository/repository-capabilities.js';
import { describeProcessFailure } from '../../../process/process-runner.js';
import type { GitCommandExecutor } from './git-metadata.js';
import { isGitExecutionFailure, isSuccessfulGitCommand } from './git-result.js';

const MINIMUM_RENAME_DETECTION_VERSION = { major: 2, minor: 9 };

interface GitVersion {
  major: number;
  minor: number;
}

export class GitCapabilityDetector {
  constructor(private readonly git: GitCommandExecutor) {}

  async detect(repoRoot: string): Promise<RepositoryCapabilities> {
    const versionResult = await this.git.run(['--version'], repoRoot);
    if (!isSuccessfulGitCommand(versionResult)) {
      throw new RepositoryInspectionError(
        `Failed to determine Git version: ${describeProcessFailure(versionResult)}`,
      );
    }

    const version = parseGitVersion(versionResult.stdout);
    if (version === null) {
      throw new RepositoryInspectionError(
        'Failed to determine Git version: Git returned an unrecognized version string',
      );
    }

    const bareResult = await this.git.run(['rev-parse', '--is-bare-repository'], repoRoot);
    if (!isSuccessfulGitCommand(bareResult)) {
      throw new RepositoryInspectionError(
        `Failed to determine repository layout: ${describeProcessFailure(bareResult)}`,
      );
    }

    const isBare = bareResult.stdout.trim() === 'true';
    if (isBare) {
      return {
        canCreateBranch: false,
        canCheckoutBranch: false,
        canStagePaths: false,
        canCommit: false,
        supportsRenameDetection: false,
      };
    }

    return {
      canCreateBranch: true,
      canCheckoutBranch: true,
      canStagePaths: true,
      canCommit: await this.canResolveIdentity(repoRoot),
      supportsRenameDetection: supportsRenameDetection(version),
    };
  }

  private async canResolveIdentity(repoRoot: string): Promise<boolean> {
    const author = await this.git.run(['var', 'GIT_AUTHOR_IDENT'], repoRoot);
    if (isGitExecutionFailure(author)) {
      throw new RepositoryInspectionError(
        `Failed to read the Git author identity: ${describeProcessFailure(author)}`,
      );
    }
    if (!isSuccessfulGitCommand(author)) {
      return false;
    }

    const committer = await this.git.run(['var', 'GIT_COMMITTER_IDENT'], repoRoot);
    if (isGitExecutionFailure(committer)) {
      throw new RepositoryInspectionError(
        `Failed to read the Git committer identity: ${describeProcessFailure(committer)}`,
      );
    }
    return isSuccessfulGitCommand(committer);
  }
}

function parseGitVersion(output: string): GitVersion | null {
  const match = /git version (\d+)\.(\d+)/i.exec(output);
  const major = match?.[1];
  const minor = match?.[2];
  if (major === undefined || minor === undefined) {
    return null;
  }
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
  };
}

function supportsRenameDetection(version: GitVersion): boolean {
  if (version.major !== MINIMUM_RENAME_DETECTION_VERSION.major) {
    return version.major > MINIMUM_RENAME_DETECTION_VERSION.major;
  }
  return version.minor >= MINIMUM_RENAME_DETECTION_VERSION.minor;
}
