import { describe, expect, it } from 'vitest';
import {
  describeBranchNameProblem,
  isValidBranchName,
} from '../../../../src/domain/workflow/branch-name.js';

describe('branch-name', () => {
  it('accepts valid one-level names', () => {
    expect(isValidBranchName('main')).toBe(true);
    expect(describeBranchNameProblem('main')).toBeNull();
  });

  it('accepts valid nested names', () => {
    expect(isValidBranchName('feature/x')).toBe(true);
    expect(describeBranchNameProblem('feature/x')).toBeNull();
    expect(isValidBranchName('feature/fix-1')).toBe(true);
    expect(describeBranchNameProblem('feature/fix-1')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(isValidBranchName('')).toBe(false);
    expect(describeBranchNameProblem('')).not.toBeNull();
  });

  it('rejects @', () => {
    expect(isValidBranchName('@')).toBe(false);
    expect(describeBranchNameProblem('@')).not.toBeNull();
  });

  it('rejects names with spaces', () => {
    expect(isValidBranchName('a b')).toBe(false);
    expect(describeBranchNameProblem('a b')).not.toBeNull();
  });

  it('rejects names with ~ ^ : ? * [ \\', () => {
    expect(isValidBranchName('a~b')).toBe(false);
    expect(describeBranchNameProblem('a~b')).not.toBeNull();
    expect(isValidBranchName('a^b')).toBe(false);
    expect(describeBranchNameProblem('a^b')).not.toBeNull();
    expect(isValidBranchName('a:b')).toBe(false);
    expect(describeBranchNameProblem('a:b')).not.toBeNull();
    expect(isValidBranchName('a?b')).toBe(false);
    expect(describeBranchNameProblem('a?b')).not.toBeNull();
    expect(isValidBranchName('a*b')).toBe(false);
    expect(describeBranchNameProblem('a*b')).not.toBeNull();
    expect(isValidBranchName('a[b')).toBe(false);
    expect(describeBranchNameProblem('a[b')).not.toBeNull();
    expect(isValidBranchName('a\\b')).toBe(false);
    expect(describeBranchNameProblem('a\\b')).not.toBeNull();
  });

  it('rejects .. and //', () => {
    expect(isValidBranchName('a..b')).toBe(false);
    expect(describeBranchNameProblem('a..b')).not.toBeNull();
    expect(isValidBranchName('a//b')).toBe(false);
    expect(describeBranchNameProblem('a//b')).not.toBeNull();
  });

  it('rejects @{', () => {
    expect(isValidBranchName('a@{b')).toBe(false);
    expect(describeBranchNameProblem('a@{b')).not.toBeNull();
  });

  it('rejects leading/trailing /', () => {
    expect(isValidBranchName('/a')).toBe(false);
    expect(describeBranchNameProblem('/a')).not.toBeNull();
    expect(isValidBranchName('a/')).toBe(false);
    expect(describeBranchNameProblem('a/')).not.toBeNull();
  });

  it('rejects trailing .', () => {
    expect(isValidBranchName('a.')).toBe(false);
    expect(describeBranchNameProblem('a.')).not.toBeNull();
  });

  it('rejects components starting with .', () => {
    expect(isValidBranchName('.a')).toBe(false);
    expect(describeBranchNameProblem('.a')).not.toBeNull();
    expect(isValidBranchName('a/.b')).toBe(false);
    expect(describeBranchNameProblem('a/.b')).not.toBeNull();
  });

  it('rejects .lock components/endings', () => {
    expect(isValidBranchName('a.lock')).toBe(false);
    expect(describeBranchNameProblem('a.lock')).not.toBeNull();
    expect(isValidBranchName('a/b.lock')).toBe(false);
    expect(describeBranchNameProblem('a/b.lock')).not.toBeNull();
    expect(isValidBranchName('a.lock/b')).toBe(false);
    expect(describeBranchNameProblem('a.lock/b')).not.toBeNull();
  });

  it('rejects leading -', () => {
    expect(isValidBranchName('-a')).toBe(false);
    expect(describeBranchNameProblem('-a')).not.toBeNull();
  });

  it('rejects control characters', () => {
    expect(isValidBranchName('a\u0001b')).toBe(false);
    expect(describeBranchNameProblem('a\u0001b')).not.toBeNull();
    expect(isValidBranchName('a\nb')).toBe(false);
    expect(describeBranchNameProblem('a\nb')).not.toBeNull();
  });
});
