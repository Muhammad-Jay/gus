import type { WorkflowPlan } from '../workflow/workflow-plan.js';
import type { PolicyRules, PolicyValue } from './policy-rules.js';

export type PolicyDecision = 'allow' | 'ask' | 'deny' | 'blocked';

export interface OperationPolicyDecision {
  createBranch: PolicyDecision;
  stage: PolicyDecision;
  commit: PolicyDecision;
  splitChanges: PolicyDecision;
}

function evaluateRule(value: PolicyValue): PolicyDecision {
  return value === 'deny' ? 'deny' : value === 'ask' ? 'ask' : 'allow';
}

export class PolicyEvaluator {
  evaluate(plan: WorkflowPlan, rules: PolicyRules): OperationPolicyDecision {
    return {
      createBranch: plan.branch.strategy === 'new' ? evaluateRule(rules.autoCreateBranch) : 'allow',
      stage: evaluateRule(rules.autoStage),
      commit: evaluateRule(rules.autoCommit),
      splitChanges: plan.commits.length > 1 ? evaluateRule(rules.splitChanges) : 'allow',
    };
  }
}
