import { describe, it, expect } from 'vitest';
import { PolicyEvaluator } from '../../../../src/domain/policy/policy-evaluator';
import type { WorkflowPlan } from '../../../../src/domain/workflow/workflow-plan';

describe('PolicyEvaluator', () => {
  it('should evaluate policies correctly', () => {
    const evaluator = new PolicyEvaluator();
    const plan: WorkflowPlan = {
      summary: 'test',
      branch: { strategy: 'new', name: 'feature/test', reason: 'test' },
      commits: [{ message: 'test', files: ['test.ts'] }],
      warnings: [],
    };
    const rules = { autoCommit: 'allow' as const, autoCreateBranch: 'ask' as const, autoStage: 'deny' as const, splitChanges: 'allow' as const };
    const result = evaluator.evaluate(plan, rules);
    expect(result.createBranch).toBe('ask');
    expect(result.stage).toBe('deny');
    expect(result.commit).toBe('allow');
  });
});
