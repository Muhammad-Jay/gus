import type { BranchDecision } from './branch-strategy.js';
import type { CommitGroup } from './commit-group.js';

export interface WorkflowPlan {
  summary: string;
  branch: BranchDecision;
  commits: CommitGroup[];
  warnings: string[];
}
