import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { join } from 'node:path';
import type {
  CommitResult,
  RepositoryAdapter,
  RepositoryLocation,
} from '../../../../application/ports/repository.port.js';
import {
  NoRepositoryError,
  OperationFailedError,
  UnsafeRepositoryStateError,
} from '../../../../domain/errors/domain-errors.js';
import type { RepositoryCapabilities } from '../../../../domain/repository/repository-capabilities.js';
import type { RepositorySnapshot } from '../../../../domain/repository/repository-snapshot.js';
import type { ProcessRunner } from '../../../process/process-runner.js';
import { GitCommandRunner } from './git-command-runner.js';
import { parseGitStatus } from './status-parser.js';

export class GitRepositoryAdapter implements RepositoryAdapter {
  private git: GitCommandRunner;
  private repoRoot?: string;

  constructor(processRunner: ProcessRunner) {
    this.git = new GitCommandRunner(processRunner);
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
    if (await this.isOperationInProgress()) {
      throw new UnsafeRepositoryStateError(
        'Repository operation in progress (merge/rebase/cherry-pick)',
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
    const statusResult = await this.git.run(['status', '--porcelain=v1'], this.repoRoot);
    const changes = parseGitStatus(statusResult.stdout);

    return {
      rootPath: this.repoRoot,
      displayName: basename(this.repoRoot),
      currentBranch,
      isDetached,
      isOperationInProgress: false,
      changes,
    };
  }

  async createBranch(name: string): Promise<void> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    const result = await this.git.run(['checkout', '-b', name], this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(`Failed to create branch: ${result.stderr.trim()}`);
    }
  }

  async checkoutBranch(name: string): Promise<void> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    const result = await this.git.run(['checkout', name], this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(`Failed to checkout branch: ${result.stderr.trim()}`);
    }
  }

  async stagePaths(paths: string[]): Promise<void> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    if (paths.length === 0) {
      return;
    }
    const result = await this.git.run(['add', '--', ...paths], this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(`Failed to stage paths: ${result.stderr.trim()}`);
    }
  }

  async getStagedPaths(): Promise<string[]> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    const result = await this.git.run(['diff', '--cached', '--name-only', '-z'], this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(`Failed to inspect staged paths: ${result.stderr.trim()}`);
    }
    return result.stdout.split('\0').filter((path) => path.length > 0);
  }

  async commit(message: string): Promise<CommitResult> {
    if (!this.repoRoot) {
      throw new NoRepositoryError('No repository detected');
    }
    const result = await this.git.run(['commit', '-m', message], this.repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(`Failed to commit: ${result.stderr.trim()}`);
    }
    // Get commit SHA
    const shaResult = await this.git.run(['rev-parse', 'HEAD'], this.repoRoot);
    const sha = shaResult.stdout.trim();
    return { sha, message };
  }

  async verify(): Promise<RepositorySnapshot> {
    return this.inspect();
  }

  private async isOperationInProgress(): Promise<boolean> {
    if (!this.repoRoot) return false;
    const gitDir = join(this.repoRoot, '.git');
    if (existsSync(join(gitDir, 'MERGE_HEAD'))) return true;
    if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return true;
    if (existsSync(join(gitDir, 'REBASE_HEAD'))) return true;
    if (existsSync(join(gitDir, 'rebase-merge'))) return true;
    if (existsSync(join(gitDir, 'rebase-apply'))) return true;
    return false;
  }
}
