import { describe, expect, it } from 'vitest';
import type { StagedPath } from '../../../../src/domain/workflow/commit-group';
import {
  CommitGroupSchema,
  StagedPathSchema,
  WorkflowPlanSchema,
} from '../../../../src/infrastructure/ai/schemas/workflow-plan.schema';

describe('StagedPath schema', () => {
  it('accepts valid path without oldPath', () => {
    const result = StagedPathSchema.safeParse({ path: 'src/file.ts' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.path).toBe('src/file.ts');
      expect(result.data.oldPath).toBeUndefined();
    }
  });

  it('accepts valid path with oldPath', () => {
    const result = StagedPathSchema.safeParse({ path: 'src/renamed.ts', oldPath: 'src/old.ts' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.path).toBe('src/renamed.ts');
      expect(result.data.oldPath).toBe('src/old.ts');
    }
  });

  it('rejects missing path', () => {
    const result = StagedPathSchema.safeParse({ oldPath: 'src/old.ts' });
    expect(result.success).toBe(false);
  });

  it('rejects empty path', () => {
    const result = StagedPathSchema.safeParse({ path: '' });
    expect(result.success).toBe(false);
  });

  it('rejects non-string path', () => {
    const result = StagedPathSchema.safeParse({ path: 123 });
    expect(result.success).toBe(false);
  });
});

describe('CommitGroup schema', () => {
  it('accepts valid commit group with StagedPath objects', () => {
    const result = CommitGroupSchema.safeParse({
      message: 'feat: add feature',
      files: [{ path: 'src/file1.ts' }, { path: 'src/file2.ts', oldPath: 'src/old.ts' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects commit group with string files (old format)', () => {
    const result = CommitGroupSchema.safeParse({
      message: 'feat: add feature',
      files: ['src/file1.ts', 'src/file2.ts'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects commit group with empty files array', () => {
    const result = CommitGroupSchema.safeParse({
      message: 'feat: add feature',
      files: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects commit group with missing path in files', () => {
    const result = CommitGroupSchema.safeParse({
      message: 'feat: add feature',
      files: [{ oldPath: 'src/old.ts' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects commit group with empty path in files', () => {
    const result = CommitGroupSchema.safeParse({
      message: 'feat: add feature',
      files: [{ path: '' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkflowPlan schema', () => {
  it('accepts valid workflow plan with StagedPath objects', () => {
    const result = WorkflowPlanSchema.safeParse({
      summary: 'Add feature and fix bug',
      branch: { strategy: 'current', reason: 'changes belong here' },
      commits: [
        {
          message: 'feat: add feature',
          files: [{ path: 'src/feature.ts' }],
        },
        {
          message: 'fix: handle edge case',
          files: [{ path: 'src/renamed.ts', oldPath: 'src/old-name.ts' }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects workflow plan with old string format', () => {
    const result = WorkflowPlanSchema.safeParse({
      summary: 'Add feature',
      branch: { strategy: 'current', reason: 'changes belong here' },
      commits: [
        {
          message: 'feat: add feature',
          files: ['src/feature.ts'],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
