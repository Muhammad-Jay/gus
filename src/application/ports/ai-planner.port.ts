import type { RepositoryChange } from '../../domain/repository/repository-change.js';
import type { RepositorySnapshot } from '../../domain/repository/repository-snapshot.js';
import type { CommitTemplate } from '../../domain/templates/commit-template.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';

export interface WorkflowPlanningInput {
  repositorySnapshot: RepositorySnapshot;
  changes: RepositoryChange[];
  instructions: string;
  template?: CommitTemplate;
  currentBranch: string | null;
}

export interface AiPlanner {
  plan(input: WorkflowPlanningInput): Promise<WorkflowPlan>;
}
