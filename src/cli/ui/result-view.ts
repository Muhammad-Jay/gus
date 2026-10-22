import type { WorkflowRunResult } from '../../application/use-cases/run-workflow.use-case.js';

export class ResultView {
  display(result: WorkflowRunResult): void {
    console.log('\nResult:');
    console.log(`  Status: ${result.status}`);

    for (const operation of result.decision?.operations ?? []) {
      const reason = operation.reason !== undefined ? ` (${operation.reason})` : '';
      console.log(`  - [${operation.outcome}] ${operation.description}${reason}`);
    }

    if (result.failure !== undefined) {
      console.log(`  Failure: ${result.failure}`);
    }

    console.log();
  }
}
