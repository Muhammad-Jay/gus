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
  UnsafeRepositoryStateError,
} from '../../../src/domain/errors/domain-errors';
import type { OperationPolicyDecision } from '../../../src/domain/policy/policy-evaluator';
import type { RepositoryCapabilities } from '../../../src/domain/repository/repository-capabilities';
import type { RepositorySnapshot } from '../../../src/domain/repository/repository-snapshot';
import type { WorkflowPlan } from '../../../src/domain/workflow/workflow-plan';

class FakeRepository implements RepositoryAdapter {
  preStaged: string[] = [];
  createdBranches: string[] = [];
  staged: string[][] = [];
  commits: string[] = [];
  failCommitMessage?: string;

  async detect(_cwd: string): Promise<RepositoryLocation | null> {
    return null;
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
    throw new Error('not used');
  }

  async createBranch(name: string): Promise<void> {
    this.createdBranches.push(name);
  }

  async checkoutBranch(_name: string): Promise<void> {}

  async stagePaths(paths: string[]): Promise<void> {
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
  return { createBranch: 'allow', stage: 'allow', commit: 'allow', ...overrides };
}

function plan(overrides: Partial<WorkflowPlan> = {}): WorkflowPlan {
  return {
    summary: 'plan',
    branch: { strategy: 'current', reason: 'stay' },
    commits: [
      { message: 'feat: one', files: ['a.ts'] },
      { message: 'feat: two', files: ['b.ts'] },
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
    expect(repository.staged).toEqual([['a.ts'], ['b.ts']]);
    expect(repository.commits).toEqual(['feat: one', 'feat: two']);
    expect(decision.operations.map((operation) => operation.outcome)).toEqual([
      'executed',
      'executed',
      'executed',
      'executed',
      'executed',
    ]);
  });

  it('refuses to run when work is already staged', async () => {
    const repository = new FakeRepository();
    repository.preStaged = ['pre-existing.ts'];

    await expect(
      createExecutor(repository).execute(plan(), policy(), options('approved')),
    ).rejects.toBeInstanceOf(UnsafeRepositoryStateError);
    expect(repository.commits).toEqual([]);
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

  it('skips staging and committing when either is denied', async () => {
    const repository = new FakeRepository();

    const decision = await createExecutor(repository).execute(
      plan(),
      policy({ commit: 'deny' }),
      options('approved'),
    );

    expect(decision.success).toBe(true);
    expect(repository.staged).toEqual([]);
    expect(repository.commits).toEqual([]);
    expect(decision.operations.every((operation) => operation.outcome === 'skipped')).toBe(true);
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
});
