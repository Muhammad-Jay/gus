import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';

export interface WorkflowPlanningInput {
  repositorySnapshot: any;
  changes: any[];
  instructions: string;
  template?: any;
  currentBranch: string | null;
}

export interface AiPlanner {
  plan(input: WorkflowPlanningInput): Promise<WorkflowPlan>;
}
