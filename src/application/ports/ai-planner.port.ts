import type { Configuration } from '../../domain/config/configuration.js';
import type { ChangeContent } from '../../domain/repository/change-content.js';
import type { RepositoryChange } from '../../domain/repository/repository-change.js';
import type { RepositorySnapshot } from '../../domain/repository/repository-snapshot.js';
import type { CommitTemplate } from '../../domain/templates/commit-template.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';

export interface WorkflowPlanningInput {
  repositorySnapshot: RepositorySnapshot;
  changes: RepositoryChange[];
  changeContents: ChangeContent[];
  instructions: string;
  template?: CommitTemplate;
  commitStyle?: string;
  defaultBranch?: string;
  currentBranch: string | null;
}

export interface AiPlanner {
  plan(input: WorkflowPlanningInput): Promise<WorkflowPlan>;
}

export interface ResolvedPlanner {
  provider: string;
  modelId: string;
  planner: AiPlanner;
}

export interface AiPlannerFactory {
  create(configuration: Configuration): ResolvedPlanner;
}
