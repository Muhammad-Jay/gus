import type { WorkflowOperation } from '../../domain/workflow/workflow-decision.js';

export type { WorkflowOperation } from '../../domain/workflow/workflow-decision.js';

export type ApprovalOperation = WorkflowOperation;

export interface ApprovalRequest {
  operation: ApprovalOperation;
  title: string;
  description: string;
  details?: string[];
}

export type ApprovalOutcome = 'approved' | 'rejected' | 'unavailable';

export interface ApprovalPort {
  requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome>;
}
