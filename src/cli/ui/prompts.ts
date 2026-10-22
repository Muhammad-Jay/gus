import * as p from '@clack/prompts';
import type {
  ApprovalOutcome,
  ApprovalPort,
  ApprovalRequest,
} from '../../application/ports/approval.port.js';

export class ClackApproval implements ApprovalPort {
  async requestApproval(request: ApprovalRequest): Promise<ApprovalOutcome> {
    if (request.details !== undefined && request.details.length > 0) {
      p.note(request.details.join('\n'), request.title);
    }

    const answer = await p.confirm({
      message: request.description,
      initialValue: true,
    });

    if (p.isCancel(answer)) {
      return 'rejected';
    }

    return answer ? 'approved' : 'rejected';
  }
}

export class AutoApproval implements ApprovalPort {
  async requestApproval(): Promise<ApprovalOutcome> {
    return 'approved';
  }
}

export class NonInteractiveApproval implements ApprovalPort {
  async requestApproval(): Promise<ApprovalOutcome> {
    return 'unavailable';
  }
}
