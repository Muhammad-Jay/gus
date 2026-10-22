import { describe, expect, it } from 'vitest';
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
    const rules = {
      autoCommit: 'allow' as const,
      autoCreateBranch: 'ask' as const,
      autoStage: 'deny' as const,
      splitChanges: 'allow' as const,
    };
    const result = evaluator.evaluate(plan, rules);
    expect(result.createBranch).toBe('ask');
    expect(result.stage).toBe('deny');
    expect(result.commit).toBe('allow');
    expect(result.splitChanges).toBe('allow');
  });

  it('only evaluates splitting when the plan has multiple commits', () => {
    const evaluator = new PolicyEvaluator();
    const rules = {
      autoCommit: 'allow' as const,
      autoCreateBranch: 'allow' as const,
      autoStage: 'allow' as const,
      splitChanges: 'deny' as const,
    };
    const single: WorkflowPlan = {
      summary: 'test',
      branch: { strategy: 'current', reason: 'test' },
      commits: [{ message: 'test', files: ['test.ts'] }],
      warnings: [],
    };
    const multiple: WorkflowPlan = {
      ...single,
      commits: [
        { message: 'one', files: ['one.ts'] },
        { message: 'two', files: ['two.ts'] },
      ],
    };

    expect(evaluator.evaluate(single, rules).splitChanges).toBe('allow');
    expect(evaluator.evaluate(multiple, rules).splitChanges).toBe('deny');
    expect(evaluator.evaluate(single, rules).createBranch).toBe('allow');
  });
});
