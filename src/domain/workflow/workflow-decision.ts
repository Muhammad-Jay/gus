export type WorkflowOperation = 'createBranch' | 'stage' | 'commit';

export type OperationOutcome = 'executed' | 'approved' | 'denied' | 'skipped' | 'failed';

export interface OperationDecision {
  operation: WorkflowOperation;
  outcome: OperationOutcome;
  reason?: string;
}

export interface WorkflowDecision {
  operations: OperationDecision[];
  success: boolean;
}
