import { describe, expect, it } from 'vitest';
import { parseGitStatus } from '../../../../src/infrastructure/repository/providers/git-cli/status-parser';

describe('parseGitStatus', () => {
  it('should return empty array for empty output', () => {
    const result = parseGitStatus('');
    expect(result).toEqual([]);
  });

  it('should parse added files', () => {
    const output = 'A  file.txt\n';
    const result = parseGitStatus(output);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('file.txt');
    expect(result[0].status).toBe('added');
    expect(result[0].stagingState).toBe('staged');
  });

  it('should parse modified files', () => {
    const output = ' M modified.txt\n';
    const result = parseGitStatus(output);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('modified.txt');
    expect(result[0].status).toBe('modified');
  });

  it('should parse untracked files', () => {
    const output = '?? untracked.txt\n';
    const result = parseGitStatus(output);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('untracked.txt');
    expect(result[0].stagingState).toBe('untracked');
  });

  it('should parse deleted files', () => {
    const output = 'D  deleted.txt\n';
    const result = parseGitStatus(output);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('deleted');
  });
});
