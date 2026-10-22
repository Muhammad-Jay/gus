import * as p from '@clack/prompts';
import type { WorkflowRunResult } from '../../application/use-cases/run-workflow.use-case.js';

export class ResultView {
  display(result: WorkflowRunResult): void {
    if (result.status === 'completed') {
      p.log.success('Workflow completed.');
    } else if (result.status === 'failed') {
      p.log.error(result.failure ?? 'The workflow did not complete.');
    } else {
      return;
    }

    const lines: string[] = [];
    for (const operation of result.decision?.operations ?? []) {
      const reason = operation.reason !== undefined ? ` (${operation.reason})` : '';
      lines.push(`[${operation.outcome}] ${operation.description}${reason}`);
    }

    if (lines.length > 0) {
      p.note(lines.join('\n'), 'Operations');
    }
  }
}
