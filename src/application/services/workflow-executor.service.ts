import type { RepositoryAdapter } from '../ports/repository.port.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';
import type { OperationPolicyDecision } from '../../domain/policy/policy-evaluator.js';

export interface ExecutionResult {
  success: boolean;
  operations: string[];
}

export class WorkflowExecutor {
  constructor(private repository: RepositoryAdapter) {}

  async execute(plan: WorkflowPlan, policy: OperationPolicyDecision): Promise<ExecutionResult> {
    const operations: string[] = [];

    try {
      // Create branch if needed
      if (plan.branch.strategy === 'new' && plan.branch.name && policy.createBranch !== 'deny') {
        await this.repository.createBranch(plan.branch.name);
        operations.push(`Created branch ${plan.branch.name}`);
      }

      // Stage and commit each commit group
      for (let i = 0; i < plan.commits.length; i++) {
        const commit = plan.commits[i];
        // Stage files
        if (commit.files.length > 0 && policy.stage !== 'deny') {
          await this.repository.stagePaths(commit.files);
          operations.push(`Staged ${commit.files.length} files`);
        }
        // Commit
        if (policy.commit !== 'deny') {
          const result = await this.repository.commit(commit.message);
          operations.push(`Committed: ${result.message}`);
        }
      }

      return { success: true, operations };
    } catch (error) {
      return { success: false, operations };
    }
  }
}
