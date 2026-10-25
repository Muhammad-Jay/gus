import { describe, expect, it } from 'vitest';
import type { ApprovalOutcome, ApprovalPort } from '../../../src/application/ports/approval.port';
import { NullProgressReporter } from '../../../src/application/ports/progress.port';
import type {
  CommitResult,
  RepositoryAdapter,
  RepositoryLocation,
} from '../../../src/application/ports/repository.port';
import { WorkflowExecutor } from '../../../src/application/services/workflow-executor.service';
import {
  ApprovalRequiredError,
  OperationFailedError,
  PolicyDeniedError,
  UnsafeRepositoryStateError,
  UnsupportedRepositoryError,
} from '../../../src/domain/errors/domain-errors';
import type { OperationPolicyDecision } from '../../../src/domain/policy/policy-evaluator';
import type { ChangeContent } from '../../../src/domain/repository/change-content';
import type { RepositoryCapabilities } from '../../../src/domain/repository/repository-capabilities';
import type { RepositoryChange } from '../../../src/domain/repository/repository-change';
import type { RepositorySnapshot } from '../../../src/domain/repository/repository-snapshot';
import type { StagedPath } from '../../../src/domain/workflow/commit-group';
import type { WorkflowPlan } from '../../../src/domain/workflow/workflow-plan';

const defaultSnapshot: RepositorySnapshot = {
  rootPath: '/repo',
  displayName: 'repo',
  currentBranch: 'main',
  isDetached: false,
  isOperationInProgress: false,
  changes: [{ path: 'a.ts', status: 'modified', stagingState: 'unstaged' }],
  headSha: 'head-1',
  indexFingerprint: 'index-1',
  worktreeFingerprint: 'worktree-1',
};

class FakeRepository implements RepositoryAdapter {
  preStaged: string[] = [];
  createdBranches: string[] = [];
  staged: StagedPath[][] = [];
  commits: string[] = [];
  failCommitMessage?: string;
  inspectSnapshot: RepositorySnapshot = defaultSnapshot;
  capabilities: RepositoryCapabilities = {
    canCreateBranch: true,
    canCheckoutBranch: true,
    canStagePaths: true,
    canCommit: true,
    supportsRenameDetection: true,
  };

  async detect(_cwd: string): Promise<RepositoryLocation | null> {
    return null;
  }

  async getCapabilities(): Promise<RepositoryCapabilities> {
    return this.capabilities;
  }

  async inspect(): Promise<RepositorySnapshot> {
    return this.inspectSnapshot;
  }

  async getChangeContents(changes: RepositoryChange[]): Promise<ChangeContent[]> {
    return changes.map((change) => ({
      path: change.path,
      ...(change.oldPath !== undefined ? { oldPath: change.oldPath } : {}),
      status: change.status,
      stagingState: change.stagingState,
      stagedDiff: '',
      unstagedDiff: '',
      addedContent: '',
      truncated: false,
      contentOmitted: false,
    }));
  }

  async validateBranchName(_name: string): Promise<void> {}

  async branchExists(_name: string): Promise<boolean> {
    return false;
  }

  async createBranch(name: string): Promise<void> {
    this.createdBranches.push(name);
  }

  async checkoutBranch(_name: string): Promise<void> {}

  async stagePaths(paths: StagedPath[]): Promise<void> {
    this.staged.push(paths);
  }

  async getStagedPaths(): Promise<string[]> {
    return this.preStaged;
  }

  async commit(message: string): Promise<CommitResult> {
    if (message === this.failCommitMessage) {
      throw new OperationFailedError('commit failed');
    }
    this.commits.push(message);
    return { sha: 'abcdef1234567890', message };
  }

  async verify(): Promise<RepositorySnapshot> {
    throw new Error('not used');
  }
}

function approval(outcome: ApprovalOutcome): ApprovalPort {
  return { requestApproval: async () => outcome };
}

function policy(overrides: Partial<OperationPolicyDecision> = {}): OperationPolicyDecision {
  return {
    createBranch: 'allow',
    stage: 'allow',
    commit: 'allow',
    splitChanges: 'allow',
    ...overrides,
  };
}

function stagedPath(path: string, oldPath?: string): StagedPath {
  return oldPath !== undefined ? { path, oldPath } : { path };
}

function plan(overrides: Partial<WorkflowPlan> = {}): WorkflowPlan {
  return {
    summary: 'plan',
    branch: { strategy: 'current', reason: 'stay' },
    commits: [
      { message: 'feat: one', files: [stagedPath('a.ts')] },
      { message: 'feat: two', files: [stagedPath('b.ts')] },
    ],
    warnings: [],
    ...overrides,
  };
}

function createExecutor(repository: FakeRepository): WorkflowExecutor {
  return new WorkflowExecutor(repository);
}

const options = (outcome: ApprovalOutcome) => ({
  approval: approval(outcome),
  progress: new NullProgressReporter(),
  originalSnapshot: defaultSnapshot,
});

describe('WorkflowExecutor', () => {
  it('executes allowed operations in order', async () => {
    const repository = new FakeRepository();
    const decision = await createExecutor(repository).execute(
      plan({
        branch: { strategy: 'new', name: 'feature/x', reason: 'isolate' },
      }),
      policy(),
      options('approved'),
    );

    expect(decision.success).toBe(true);
    expect(repository.createdBranches).toEqual(['feature/x']);
    expect(repository.staged).toEqual([[stagedPath('a.ts')], [stagedPath('b.ts')]]);
    expect(repository.commits).toEqual(['feat: one', 'feat: two']);
    expect(decision.operations.map((operation) => operation.outcome)).toEqual([
      'executed',
      'executed',
      'executed',
      'executed',
      'executed',
    ]);
  });

  it('executes when approval is granted', async () => {
    const repository = new FakeRepository();

    const decision = await createExecutor(repository).execute(
      plan(),
      policy({ stage: 'ask', commit: 'ask' }),
      options('approved'),
    );

    expect(decision.success).toBe(true);
    expect(repository.commits).toEqual(['feat: one', 'feat: two']);
  });

  it('fails safely when approval is unavailable', async () => {
    const repository = new FakeRepository();

    await expect(
      createExecutor(repository).execute(plan(), policy({ commit: 'ask' }), options('unavailable')),
    ).rejects.toBeInstanceOf(ApprovalRequiredError);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('does not mutate anything when approval is declined', async () => {
    const repository = new FakeRepository();

    const decision = await createExecutor(repository).execute(
      plan(),
      policy({ stage: 'ask' }),
      options('rejected'),
    );

    expect(decision.success).toBe(false);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('refuses to run when committing is denied', async () => {
    const repository = new FakeRepository();

    await expect(
      createExecutor(repository).execute(
        plan(),
        policy({ commit: 'deny', splitChanges: 'allow' }),
        options('approved'),
      ),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
    expect(repository.createdBranches).toEqual([]);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('refuses to run when staging is denied', async () => {
    const repository = new FakeRepository();

    await expect(
      createExecutor(repository).execute(
        plan(),
        policy({ stage: 'deny', splitChanges: 'allow' }),
        options('approved'),
      ),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
    expect(repository.commits).toEqual([]);
  });

  it('requires approval before splitting changes into multiple commits', async () => {
    const repository = new FakeRepository();

    const decision = await createExecutor(repository).execute(
      plan(),
      policy({ splitChanges: 'ask' }),
      options('approved'),
    );

    expect(decision.success).toBe(true);
    expect(repository.commits).toEqual(['feat: one', 'feat: two']);
  });

  it('does not mutate anything when splitting is declined', async () => {
    const repository = new FakeRepository();

    const decision = await createExecutor(repository).execute(
      plan({ branch: { strategy: 'new', name: 'feature/x', reason: 'isolate' } }),
      policy({ splitChanges: 'ask' }),
      options('rejected'),
    );

    expect(decision.success).toBe(false);
    expect(repository.createdBranches).toEqual([]);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('refuses to split when splitting is denied', async () => {
    const repository = new FakeRepository();

    await expect(
      createExecutor(repository).execute(
        plan(),
        policy({ splitChanges: 'deny' }),
        options('approved'),
      ),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
    expect(repository.commits).toEqual([]);
  });

  it('does not ask about splitting for a single commit', async () => {
    const repository = new FakeRepository();
    let prompts = 0;

    const decision = await createExecutor(repository).execute(
      plan({ commits: [{ message: 'feat: one', files: [stagedPath('a.ts')] }] }),
      policy({ splitChanges: 'ask' }),
      {
        approval: {
          requestApproval: async () => {
            prompts += 1;
            return 'approved';
          },
        },
        progress: new NullProgressReporter(),
        originalSnapshot: defaultSnapshot,
      },
    );

    expect(decision.success).toBe(true);
    expect(prompts).toBe(0);
  });

  it('reports partial failure and keeps completed operations', async () => {
    const repository = new FakeRepository();
    repository.failCommitMessage = 'feat: two';

    const decision = await createExecutor(repository).execute(
      plan(),
      policy(),
      options('approved'),
    );

    expect(decision.success).toBe(false);
    expect(decision.failure).toBe('Could not commit "feat: two".');
    expect(repository.commits).toEqual(['feat: one']);
    expect(decision.operations.map((operation) => operation.outcome)).toEqual([
      'executed',
      'executed',
      'executed',
      'failed',
    ]);
  });

  it('when createBranch throws, the workflow stops and NO staging or commit call is made', async () => {
    const repository = new FakeRepository();
    repository.createBranch = async () => {
      throw new OperationFailedError('branch failed');
    };
    const executor = createExecutor(repository);
    const result = await executor.execute(
      plan({ branch: { strategy: 'new', name: 'feature/x', reason: 'test' } }),
      policy({ createBranch: 'allow' }),
      options('approved'),
    );

    expect(result.success).toBe(false);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('throws UnsafeRepositoryStateError when unexpected staged changes appear before a commit', async () => {
    const repository = new FakeRepository();
    // Simulate staged changes appearing before the second commit
    // Call #1: before 1st commit, Call #2: before 2nd commit
    let callCount = 0;
    const originalGetStagedPaths = repository.getStagedPaths.bind(repository);
    repository.getStagedPaths = async () => {
      callCount += 1;
      if (callCount === 2) {
        return ['unexpected.ts'];
      }
      return originalGetStagedPaths();
    };

    await expect(
      createExecutor(repository).execute(plan(), policy(), options('approved')),
    ).rejects.toBeInstanceOf(UnsafeRepositoryStateError);
    expect(repository.commits).toEqual(['feat: one']);
  });

  it('rejects stale plan when repository changes during approval wait', async () => {
    const repository = new FakeRepository();
    const originalSnapshot: RepositorySnapshot = {
      rootPath: '/repo',
      displayName: 'repo',
      currentBranch: 'main',
      isDetached: false,
      isOperationInProgress: false,
      changes: [{ path: 'a.ts', status: 'modified', stagingState: 'unstaged' }],
      headSha: 'head-1',
      indexFingerprint: 'index-1',
      worktreeFingerprint: 'worktree-1',
    };
    // Return a different snapshot on the second inspect (after approvals)
    repository.inspectSnapshot = {
      ...originalSnapshot,
      worktreeFingerprint: 'worktree-2',
    };

    await expect(
      createExecutor(repository).execute(plan(), policy(), options('approved')),
    ).rejects.toBeInstanceOf(UnsafeRepositoryStateError);
    expect(repository.createdBranches).toEqual([]);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('refuses to create branch when repository does not support it', async () => {
    const repository = new FakeRepository();
    repository.capabilities = { ...repository.capabilities, canCreateBranch: false };

    await expect(
      createExecutor(repository).execute(
        plan({ branch: { strategy: 'new', name: 'feature/x', reason: 'isolate' } }),
        policy(),
        options('approved'),
      ),
    ).rejects.toBeInstanceOf(UnsupportedRepositoryError);
    expect(repository.createdBranches).toEqual([]);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('refuses to stage when repository does not support it', async () => {
    const repository = new FakeRepository();
    repository.capabilities = { ...repository.capabilities, canStagePaths: false };

    await expect(
      createExecutor(repository).execute(plan(), policy(), options('approved')),
    ).rejects.toBeInstanceOf(UnsupportedRepositoryError);
    expect(repository.createdBranches).toEqual([]);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('refuses to commit when repository does not support it', async () => {
    const repository = new FakeRepository();
    repository.capabilities = { ...repository.capabilities, canCommit: false };

    await expect(
      createExecutor(repository).execute(plan(), policy(), options('approved')),
    ).rejects.toBeInstanceOf(UnsupportedRepositoryError);
    expect(repository.createdBranches).toEqual([]);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
  });

  it('records commit results with SHA, message, and expected files', async () => {
    const repository = new FakeRepository();
    const decision = await createExecutor(repository).execute(
      plan({
        commits: [
          { message: 'feat: one', files: [stagedPath('a.ts')] },
          { message: 'feat: two', files: [stagedPath('b.ts')] },
        ],
      }),
      policy(),
      options('approved'),
    );

    expect(decision.success).toBe(true);
    expect(decision.commitResults).toHaveLength(2);
    expect(decision.commitResults[0]).toMatchObject({
      sha: 'abcdef1234567890',
      message: 'feat: one',
      expectedFiles: ['a.ts'],
    });
    expect(decision.commitResults[1]).toMatchObject({
      sha: 'abcdef1234567890',
      message: 'feat: two',
      expectedFiles: ['b.ts'],
    });
  });

  it('records commit results with expected files including renamed files', async () => {
    const repository = new FakeRepository();
    const decision = await createExecutor(repository).execute(
      plan({
        commits: [{ message: 'feat: rename', files: [stagedPath('new.ts', 'old.ts')] }],
      }),
      policy(),
      options('approved'),
    );

    expect(decision.success).toBe(true);
    expect(decision.commitResults[0]).toMatchObject({
      sha: 'abcdef1234567890',
      message: 'feat: rename',
      expectedFiles: ['new.ts'],
    });
  });

  it('returns empty commitResults on early abort', async () => {
    const repository = new FakeRepository();
    const decision = await createExecutor(repository).execute(
      plan(),
      policy({ stage: 'ask' }),
      options('rejected'),
    );

    expect(decision.success).toBe(false);
    expect(decision.commitResults).toEqual([]);
  });

  it('returns empty commitResults on early failure', async () => {
    const repository = new FakeRepository();
    repository.failCommitMessage = 'feat: one';

    const decision = await createExecutor(repository).execute(
      plan(),
      policy(),
      options('approved'),
    );

    expect(decision.success).toBe(false);
    expect(decision.commitResults).toEqual([]);
  });
});
