import {
  ApprovalRequiredError,
  UnsafeRepositoryStateError,
} from '../../domain/errors/domain-errors.js';
import type {
  OperationPolicyDecision,
  PolicyDecision,
} from '../../domain/policy/policy-evaluator.js';
import type {
  OperationDecision,
  WorkflowDecision,
  WorkflowOperation,
} from '../../domain/workflow/workflow-decision.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';
import type { ApprovalPort, ApprovalRequest } from '../ports/approval.port.js';
import type { ProgressReporter } from '../ports/progress.port.js';
import type { RepositoryAdapter } from '../ports/repository.port.js';

export interface ExecuteWorkflowOptions {
  approval: ApprovalPort;
  progress: ProgressReporter;
}

type Resolution = { action: 'execute' } | { action: 'skip'; reason: string; declined?: boolean };

export class WorkflowExecutor {
  constructor(private repository: RepositoryAdapter) {}

  async execute(
    plan: WorkflowPlan,
    policy: OperationPolicyDecision,
    options: ExecuteWorkflowOptions,
  ): Promise<WorkflowDecision> {
    const preStaged = await this.repository.getStagedPaths();
    if (preStaged.length > 0) {
      throw new UnsafeRepositoryStateError(
        `The repository already has ${preStaged.length} staged path(s). Gus will not mix pre-existing staged work into this workflow. Unstage or commit them first.`,
      );
    }

    const operations: OperationDecision[] = [];
    const needsBranch = plan.branch.strategy === 'new' && plan.branch.name !== undefined;
    const totalFiles = plan.commits.reduce((count, commit) => count + commit.files.length, 0);

    const branchResolution: Resolution = needsBranch
      ? await this.resolve(
          'createBranch',
          policy.createBranch,
          {
            operation: 'createBranch',
            title: 'Create branch',
            description: `Create and switch to branch "${plan.branch.name}".`,
            details: [plan.branch.reason],
          },
          options,
        )
      : { action: 'skip', reason: 'The plan keeps the current branch.' };

    if (branchResolution.action === 'skip' && branchResolution.declined === true) {
      return this.abort(
        operations,
        'createBranch',
        `Skipped branch "${plan.branch.name}".`,
        'Branch creation was declined.',
      );
    }

    const stageResolution = await this.resolve(
      'stage',
      policy.stage,
      {
        operation: 'stage',
        title: 'Stage changes',
        description: `Stage ${totalFiles} file(s) across ${plan.commits.length} commit(s).`,
        details: plan.commits.map((commit, index) => `${index + 1}. ${commit.message}`),
      },
      options,
    );

    if (stageResolution.action === 'skip' && stageResolution.declined === true) {
      return this.abort(operations, 'stage', 'Skipped staging.', 'Staging was declined.');
    }

    const commitResolution = await this.resolve(
      'commit',
      policy.commit,
      {
        operation: 'commit',
        title: 'Create commits',
        description: `Create ${plan.commits.length} commit(s) on the current branch.`,
        details: plan.commits.map((commit, index) => `${index + 1}. ${commit.message}`),
      },
      options,
    );

    if (commitResolution.action === 'skip' && commitResolution.declined === true) {
      return this.abort(operations, 'commit', 'Skipped committing.', 'Committing was declined.');
    }

    if (needsBranch && plan.branch.name !== undefined) {
      if (branchResolution.action === 'skip') {
        operations.push({
          operation: 'createBranch',
          outcome: 'skipped',
          description: `Skipped branch "${plan.branch.name}".`,
          reason: branchResolution.reason,
        });
      } else {
        options.progress.emit({ type: 'branch.creating', name: plan.branch.name });
        try {
          await this.repository.createBranch(plan.branch.name);
          operations.push({
            operation: 'createBranch',
            outcome: 'executed',
            description: `Created branch "${plan.branch.name}".`,
          });
        } catch (error) {
          return this.fail(
            operations,
            'createBranch',
            `Could not create branch "${plan.branch.name}".`,
            error,
          );
        }
      }
    }

    if (stageResolution.action === 'skip' || commitResolution.action === 'skip') {
      const reason =
        stageResolution.action === 'skip'
          ? stageResolution.reason
          : commitResolution.action === 'skip'
            ? commitResolution.reason
            : 'Skipped.';

      for (const commit of plan.commits) {
        operations.push({
          operation: 'stage',
          outcome: 'skipped',
          description: `Skipped staging for "${commit.message}".`,
          reason,
        });
        operations.push({
          operation: 'commit',
          outcome: 'skipped',
          description: `Skipped commit "${commit.message}".`,
          reason,
        });
      }

      return { operations, success: true };
    }

    for (const [index, commit] of plan.commits.entries()) {
      try {
        await this.repository.stagePaths(commit.files);
        operations.push({
          operation: 'stage',
          outcome: 'executed',
          description: `Staged ${commit.files.length} file(s) for "${commit.message}".`,
        });
      } catch (error) {
        return this.fail(
          operations,
          'stage',
          `Could not stage files for "${commit.message}".`,
          error,
        );
      }

      options.progress.emit({
        type: 'commit.creating',
        index: index + 1,
        total: plan.commits.length,
      });

      try {
        const result = await this.repository.commit(commit.message);
        operations.push({
          operation: 'commit',
          outcome: 'executed',
          description: `Committed ${result.sha.slice(0, 7)}: ${commit.message}`,
        });
      } catch (error) {
        return this.fail(operations, 'commit', `Could not commit "${commit.message}".`, error);
      }
    }

    return { operations, success: true };
  }

  private async resolve(
    operation: WorkflowOperation,
    decision: PolicyDecision,
    request: ApprovalRequest,
    options: ExecuteWorkflowOptions,
  ): Promise<Resolution> {
    if (decision === 'deny') {
      return { action: 'skip', reason: `${operation} is denied by the current configuration.` };
    }

    if (decision === 'allow') {
      return { action: 'execute' };
    }

    options.progress.emit({ type: 'approval.required', operation });
    const outcome = await options.approval.requestApproval(request);

    if (outcome === 'approved') {
      return { action: 'execute' };
    }

    if (outcome === 'rejected') {
      return { action: 'skip', reason: 'Declined by the user.', declined: true };
    }

    throw new ApprovalRequiredError(
      `Approval is required to ${operation}, but no interactive terminal is available. Re-run with --yes or set the relevant policy to "allow".`,
    );
  }

  private abort(
    operations: OperationDecision[],
    operation: WorkflowOperation,
    description: string,
    failure: string,
  ): WorkflowDecision {
    operations.push({ operation, outcome: 'skipped', description, reason: failure });
    return { operations, success: false, failure };
  }

  private fail(
    operations: OperationDecision[],
    operation: WorkflowOperation,
    description: string,
    error: unknown,
  ): WorkflowDecision {
    const message = error instanceof Error ? error.message : String(error);
    operations.push({ operation, outcome: 'failed', description, reason: message });
    return { operations, success: false, failure: description };
  }
}
