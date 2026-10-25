import type { WorkflowDecision } from '../../domain/workflow/workflow-decision.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';
import type {
  BranchVerification,
  CommitVerification,
  WorkflowVerification,
} from '../../domain/workflow/workflow-verification.js';
import type { RepositoryAdapter } from '../ports/repository.port.js';

export class WorkflowVerifier {
  constructor(private readonly repository: RepositoryAdapter) {}

  async verify(plan: WorkflowPlan, decision: WorkflowDecision): Promise<WorkflowVerification> {
    const snapshot = await this.repository.inspect();
    const actualBranch = snapshot.currentBranch;

    const branch = this.verifyBranch(plan, actualBranch);
    const commits = this.verifyCommits(plan, decision);

    const overallSuccess = branch.matches && commits.every((c) => c.matches);

    return { branch, commits, overallSuccess };
  }

  private verifyBranch(plan: WorkflowPlan, actualBranch: string | null): BranchVerification {
    const { strategy, name } = plan.branch;

    if (strategy === 'current') {
      return {
        expectedStrategy: 'current',
        expectedName: undefined,
        actualBranch,
        matches: true,
      };
    }

    const matches = actualBranch === name;
    return {
      expectedStrategy: 'new',
      expectedName: name,
      actualBranch,
      matches,
      mismatchReason: matches
        ? undefined
        : `Expected branch "${name}", but current branch is "${actualBranch ?? 'detached'}"`,
    };
  }

  private verifyCommits(plan: WorkflowPlan, decision: WorkflowDecision): CommitVerification[] {
    const results: CommitVerification[] = [];

    for (let i = 0; i < plan.commits.length; i++) {
      const planned = plan.commits[i];
      const executed = decision.commitResults[i];

      if (!executed) {
        results.push({
          expectedMessage: planned.message,
          actualSha: undefined,
          actualMessage: undefined,
          expectedFiles: planned.files.map((f) => f.path),
          actualFiles: [],
          matches: false,
          mismatchReason: `No commit result found for planned commit ${i + 1}`,
        });
        continue;
      }

      const expectedFiles = planned.files.map((f) => f.path);
      const actualFiles = executed.expectedFiles;

      const filesMatch = this.arraysEqual(expectedFiles.sort(), actualFiles.sort());
      const messageMatch = executed.message === planned.message;
      const shaExists = executed.sha.length > 0;

      const matches = filesMatch && messageMatch && shaExists;

      let mismatchReason: string | undefined;
      if (!shaExists) {
        mismatchReason = 'Commit SHA is empty';
      } else if (!messageMatch) {
        mismatchReason = `Commit message mismatch: expected "${planned.message}", got "${executed.message}"`;
      } else if (!filesMatch) {
        mismatchReason = `File assignment mismatch: expected [${expectedFiles.join(', ')}], got [${actualFiles.join(', ')}]`;
      }

      results.push({
        expectedMessage: planned.message,
        actualSha: executed.sha,
        actualMessage: executed.message,
        expectedFiles,
        actualFiles,
        matches,
        mismatchReason,
      });
    }

    return results;
  }

  private arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => val === b[idx]);
  }
}
