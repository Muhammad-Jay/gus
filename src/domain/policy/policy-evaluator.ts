import type { WorkflowPlan } from '../workflow/workflow-plan.js';
import type { PolicyRules, PolicyValue } from './policy-rules.js';

export type PolicyDecision = 'allow' | 'ask' | 'deny' | 'blocked';

export interface OperationPolicyDecision {
  createBranch: PolicyDecision;
  stage: PolicyDecision;
  commit: PolicyDecision;
}

export class PolicyEvaluator {
  evaluate(plan: WorkflowPlan, rules: PolicyRules): OperationPolicyDecision {
    const decisions: OperationPolicyDecision = {
      createBranch: 'allow',
      stage: 'allow',
      commit: 'allow',
    };

    // Evaluate branch creation
    if (plan.branch.strategy === 'new') {
      decisions.createBranch =
        rules.autoCreateBranch === 'deny'
          ? 'deny'
          : rules.autoCreateBranch === 'ask'
            ? 'ask'
            : 'allow';
    }

    // Evaluate staging
    decisions.stage =
      rules.autoStage === 'deny' ? 'deny' : rules.autoStage === 'ask' ? 'ask' : 'allow';

    // Evaluate commit
    decisions.commit =
      rules.autoCommit === 'deny' ? 'deny' : rules.autoCommit === 'ask' ? 'ask' : 'allow';

    return decisions;
  }
}
