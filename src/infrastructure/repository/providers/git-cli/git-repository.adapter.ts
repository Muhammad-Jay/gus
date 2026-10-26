import { basename } from 'node:path';
import type {
  CommitResult,
  RepositoryAdapter,
  RepositoryLocation,
} from '../../../../application/ports/repository.port.js';
import {
  InvalidBranchNameError,
  NoRepositoryError,
  OperationFailedError,
  RepositoryInspectionError,
  UnsafeRepositoryStateError,
} from '../../../../domain/errors/domain-errors.js';
import type { ChangeContent } from '../../../../domain/repository/change-content.js';
import type { RepositoryCapabilities } from '../../../../domain/repository/repository-capabilities.js';
import type { RepositoryChange } from '../../../../domain/repository/repository-change.js';
import type { RepositorySnapshot } from '../../../../domain/repository/repository-snapshot.js';
import { describeBranchNameProblem } from '../../../../domain/workflow/branch-name.js';
import type { StagedPath } from '../../../../domain/workflow/commit-group.js';
import { type ProcessRunner, describeProcessFailure } from '../../../process/process-runner.js';
import { ChangeContentCollector, DEFAULT_EXCLUDED_PATHS } from './change-content.js';
import { GitCommandRunner } from './git-command-runner.js';
import { GitMetadataResolver, type InProgressOperation } from './git-metadata.js';
import { RepositoryFingerprintCalculator } from './repository-fingerprint.js';
import { parseGitStatus } from './status-parser.js';

export class GitRepositoryAdapter implements RepositoryAdapter {
  private git: GitCommandRunner;
  private metadata: GitMetadataResolver;
  private fingerprintCalculator: RepositoryFingerprintCalculator;
  private changeContentCollector: ChangeContentCollector;
  private repoRoot?: string;

  constructor(processRunner: ProcessRunner, excludedPaths?: string[]) {
    this.git = new GitCommandRunner(processRunner);
    this.metadata = new GitMetadataResolver(this.git);
    this.fingerprintCalculator = new RepositoryFingerprintCalculator(this.git);
    this.changeContentCollector = new ChangeContentCollector(
      this.git,
      excludedPaths ?? DEFAULT_EXCLUDED_PATHS,
    );
  }

  async detect(cwd: string): Promise<RepositoryLocation | null> {
    const result = await this.git.run(['rev-parse', '--show-toplevel'], cwd);
    if (result.exitCode !== 0) {
      return null;
    }
    const rootPath = result.stdout.trim();
    this.repoRoot = rootPath;
    return {
      rootPath,
      displayName: basename(rootPath),
    };
  }

  async getCapabilities(): Promise<RepositoryCapabilities> {
    return {
      canCreateBranch: true,
      canCheckoutBranch: true,
      canStagePaths: true,
      canCommit: true,
      supportsRenameDetection: true,
    };
  }

  async inspect(): Promise<RepositorySnapshot> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }

    // Check for unsafe states
    const inProgressOperation = await this.detectInProgressOperation();
    if (inProgressOperation !== null) {
      throw new UnsafeRepositoryStateError(
        `Repository operation in progress: ${inProgressOperation}. Gus will not modify a repository while Git is finishing another operation.`,
      );
    }

    // Get current branch
    const branchResult = await this.git.run(['branch', '--show-current'], this.repoRoot);
    let currentBranch: string | null = null;
    let isDetached = false;

    if (branchResult.exitCode === 0 && branchResult.stdout.trim()) {
      currentBranch = branchResult.stdout.trim();
    } else {
      // Check if detached
      const headResult = await this.git.run(['rev-parse', '--abbrev-ref', 'HEAD'], this.repoRoot);
      if (headResult.stdout.trim() === 'HEAD') {
        isDetached = true;
      }
    }

    // Get status
    const statusResult = await this.git.run(
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      this.repoRoot,
    );
    if (statusResult.exitCode !== 0) {
      throw new RepositoryInspectionError(
        `Failed to inspect repository status: ${describeProcessFailure(statusResult)}`,
      );
    }
    const changes = parseGitStatus(statusResult.stdout);
    const fingerprints = await this.fingerprintCalculator.compute(this.repoRoot);

    return {
      rootPath: this.repoRoot,
      displayName: basename(this.repoRoot),
      currentBranch,
      isDetached,
      isOperationInProgress: false,
      changes,
      headSha: fingerprints.headSha,
      indexFingerprint: fingerprints.indexFingerprint,
      worktreeFingerprint: fingerprints.worktreeFingerprint,
    };
  }

  async getChangeContents(changes: RepositoryChange[]): Promise<ChangeContent[]> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    return this.changeContentCollector.collect(this.repoRoot, changes);
  }

  async validateBranchName(name: string): Promise<void> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }

    const problem = describeBranchNameProblem(name);
    if (problem !== null) {
      throw new InvalidBranchNameError(`Invalid branch name "${name}": ${problem}`, name);
    }

    const result = await this.git.run(['check-ref-format', '--branch', name], this.repoRoot);
    if (result.exitCode === null) {
      throw new RepositoryInspectionError(
        `Failed to validate branch name "${name}": ${describeProcessFailure(result)}`,
      );
    }
    if (result.exitCode !== 0) {
      let message = describeProcessFailure(result).trim();
      message = message.replace(/^fatal:\s*/i, '');
      message = message.replace(/^['"]|['"]$/g, '');
      throw new InvalidBranchNameError(`Invalid branch name "${name}": ${message}`, name);
    }
  }

  async branchExists(name: string): Promise<boolean> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    return this.metadata.branchExists(this.repoRoot, name);
  }

  async createBranch(name: string): Promise<void> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    await this.validateBranchName(name);
    if (await this.branchExists(name)) {
      throw new OperationFailedError(
        `A branch named "${name}" already exists. Choose a different branch name.`,
      );
    }
    const result = await this.git.run(['checkout', '-b', name], this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(`Failed to create branch: ${describeProcessFailure(result)}`);
    }
  }

  async checkoutBranch(name: string): Promise<void> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    await this.validateBranchName(name);
    const result = await this.git.run(['checkout', name], this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to checkout branch: ${describeProcessFailure(result)}`,
      );
    }
  }

  async stagePaths(paths: StagedPath[]): Promise<void> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    if (paths.length === 0) {
      return;
    }

    const args = ['--literal-pathspecs', 'add', '--'];
    for (const entry of paths) {
      args.push(entry.path);
    }

    const result = await this.git.run(args, this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(`Failed to stage paths: ${describeProcessFailure(result)}`);
    }

    // Verify the index matches exactly the expected paths
    await this.verifyStagedPaths(paths);
  }

  private async verifyStagedPaths(expectedPaths: StagedPath[]): Promise<void> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }

    const result = await this.git.run(
      ['--literal-pathspecs', 'diff', '--cached', '--name-only', '-z'],
      this.repoRoot,
    );
    if (result.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to inspect staged paths: ${describeProcessFailure(result)}`,
      );
    }

    const actualPaths = result.stdout.split('\0').filter((path) => path.length > 0);
    const expectedPathSet = new Set(expectedPaths.map((entry) => entry.path));

    const missing = [...expectedPathSet].filter((path) => !actualPaths.includes(path));
    const unexpected = actualPaths.filter((path) => !expectedPathSet.has(path));

    if (missing.length > 0 || unexpected.length > 0) {
      const details: string[] = [];
      if (missing.length > 0) {
        details.push(`Missing expected staged paths: ${missing.join(', ')}`);
      }
      if (unexpected.length > 0) {
        details.push(`Unexpected staged paths: ${unexpected.join(', ')}`);
      }
      throw new OperationFailedError(`Index verification failed: ${details.join('; ')}`);
    }
  }

  async getStagedPaths(): Promise<string[]> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    const result = await this.git.run(
      ['--literal-pathspecs', 'diff', '--cached', '--name-only', '-z'],
      this.repoRoot,
    );
    if (result.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to inspect staged paths: ${describeProcessFailure(result)}`,
      );
    }
    return result.stdout.split('\0').filter((path) => path.length > 0);
  }

  async commit(message: string): Promise<CommitResult> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    const result = await this.git.run(['commit', '-m', message], this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(`Failed to commit: ${describeProcessFailure(result)}`);
    }
    const shaResult = await this.git.run(['rev-parse', 'HEAD'], this.repoRoot);
    if (shaResult.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to read the commit SHA: ${describeProcessFailure(shaResult)}`,
      );
    }
    const sha = shaResult.stdout.trim();
    if (sha.length === 0) {
      throw new OperationFailedError('Failed to read the commit SHA: Git returned an empty SHA');
    }
    return { sha, message };
  }

  async verify(): Promise<RepositorySnapshot> {
    return this.inspect();
  }

  private async detectInProgressOperation(): Promise<InProgressOperation | null> {
    if (!this.repoRoot) {
      return null;
    }
    return this.metadata.detectInProgressOperation(this.repoRoot);
  }
}
