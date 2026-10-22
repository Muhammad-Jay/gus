import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RepositoryInspectionError } from '../../../../domain/errors/domain-errors.js';
import {
  type ProcessFailureDetails,
  describeProcessFailure,
} from '../../../process/process-runner.js';

export interface GitCommandResult extends ProcessFailureDetails {
  stdout: string;
}

export interface GitCommandExecutor {
  run(args: string[], cwd: string): Promise<GitCommandResult>;
}

/**
 * Git operations that may be in progress inside a repository.
 *
 * Detection precedence when several states are present at once:
 * `merge` > `rebase` > `cherry-pick` > `revert` > `sequencer` > `bisect`.
 *
 * The state files are looked up inside the resolved Git directory, which for a linked worktree is
 * the worktree-specific directory (`<main>/.git/worktrees/<name>`). That is where Git keeps the
 * per-worktree state files, so linked worktrees never see each other's in-progress operations.
 */
export type InProgressOperation =
  | 'merge'
  | 'rebase'
  | 'cherry-pick'
  | 'revert'
  | 'sequencer'
  | 'bisect';

const IN_PROGRESS_STATE_FILES: ReadonlyArray<{
  operation: InProgressOperation;
  names: readonly string[];
}> = [
  { operation: 'merge', names: ['MERGE_HEAD'] },
  { operation: 'rebase', names: ['rebase-merge', 'rebase-apply', 'REBASE_HEAD'] },
  { operation: 'cherry-pick', names: ['CHERRY_PICK_HEAD'] },
  { operation: 'revert', names: ['REVERT_HEAD'] },
  { operation: 'sequencer', names: ['sequencer'] },
  { operation: 'bisect', names: ['BISECT_LOG'] },
];

export class GitMetadataResolver {
  constructor(private git: GitCommandExecutor) {}

  async resolveGitDir(repoRoot: string): Promise<string> {
    const result = await this.git.run(['rev-parse', '--absolute-git-dir'], repoRoot);
    if (result.exitCode !== 0) {
      throw new RepositoryInspectionError(
        `Failed to resolve Git directory: ${describeProcessFailure(result)}`,
      );
    }
    const gitDir = result.stdout.trim();
    if (!gitDir) {
      throw new RepositoryInspectionError(
        'Failed to resolve Git directory: Git returned an empty path',
      );
    }
    return gitDir;
  }

  async resolveGitPath(repoRoot: string, name: string): Promise<string> {
    const result = await this.git.run(
      ['rev-parse', '--path-format=absolute', '--git-path', name],
      repoRoot,
    );
    if (result.exitCode === 0) {
      const path = result.stdout.trim();
      if (path) {
        return path;
      }
    }
    const gitDir = await this.resolveGitDir(repoRoot);
    return join(gitDir, name);
  }

  async detectInProgressOperation(repoRoot: string): Promise<InProgressOperation | null> {
    const gitDir = await this.resolveGitDir(repoRoot);
    for (const state of IN_PROGRESS_STATE_FILES) {
      for (const name of state.names) {
        if (existsSync(join(gitDir, name))) {
          return state.operation;
        }
      }
    }
    return null;
  }

  /**
   * Reports whether a local branch exists.
   *
   * A missing reference is reported as `false`. When Git could not be executed reliably, for
   * example because the executable is missing or the process was terminated, the existence of the
   * branch is unknown, so an error is raised instead of reporting a missing branch.
   */
  async branchExists(repoRoot: string, branchName: string): Promise<boolean> {
    const result = await this.git.run(
      ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
      repoRoot,
    );
    if (result.exitCode === null) {
      throw new RepositoryInspectionError(
        `Failed to check whether branch "${branchName}" exists: ${describeProcessFailure(result)}`,
      );
    }
    return result.exitCode === 0;
  }
}
