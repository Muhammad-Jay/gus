import { describe, it, expect } from 'vitest';
import { WorkflowPlanSchema } from '../../../../src/infrastructure/ai/schemas/workflow-plan.schema';

describe('WorkflowPlanSchema', () => {
  it('should validate a valid plan', () => {
    const plan = {
      summary: 'test plan',
      branch: { strategy: 'current', reason: 'changes belong here' },
      commits: [{ message: 'feat: add feature', files: ['test.ts'] }],
      warnings: [],
    };
    const result = WorkflowPlanSchema.parse(plan);
    expect(result).toBeTruthy();
  });

  it('should reject invalid plan', () => {
    const plan = { summary: 'test' };
    expect(() => WorkflowPlanSchema.parse(plan)).toThrow();
  });
});
