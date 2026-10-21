import type { ExecutionResult } from '../../application/services/workflow-executor.service.js';

export class ResultView {
  display(result: ExecutionResult) {
    console.log('\n✅ Result:');
    if (result.success) {
      console.log('  Status: Success');
    } else {
      console.log('  Status: Failed');
    }
    if (result.operations) {
      for (const op of result.operations) {
        console.log(`  • ${op}`);
      }
    }
    console.log();
  }
}
