export type BranchStrategy = 'current' | 'new';

export interface BranchDecision {
  strategy: BranchStrategy;
  name?: string;
  reason: string;
}
