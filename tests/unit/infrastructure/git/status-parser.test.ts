import { describe, expect, it } from 'vitest';
import { parseGitStatus } from '../../../../src/infrastructure/repository/providers/git-cli/status-parser';

function status(...records: string[]): string {
  return `${records.join('\0')}\0`;
}

describe('parseGitStatus', () => {
  it('returns an empty array for empty output', () => {
    expect(parseGitStatus('')).toEqual([]);
  });

  it('returns an empty array when the output only contains a NUL terminator', () => {
    expect(parseGitStatus('\0')).toEqual([]);
  });

  it('parses a staged added file', () => {
    const changes = parseGitStatus(status('A  file.txt'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'file.txt',
      status: 'added',
      stagingState: 'staged',
      hasStagedChanges: true,
      hasUnstagedChanges: false,
    });
  });

  it('parses an unstaged modified file', () => {
    const changes = parseGitStatus(status(' M modified.txt'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'modified.txt',
      status: 'modified',
      stagingState: 'unstaged',
      hasStagedChanges: false,
      hasUnstagedChanges: true,
    });
  });

  it('parses a file with staged and unstaged modifications as mixed', () => {
    const changes = parseGitStatus(status('MM both.txt'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'both.txt',
      status: 'modified',
      stagingState: 'mixed',
      hasStagedChanges: true,
      hasUnstagedChanges: true,
    });
  });

  it('parses a staged deleted file', () => {
    const changes = parseGitStatus(status('D  deleted.txt'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'deleted.txt',
      status: 'deleted',
      stagingState: 'staged',
      hasStagedChanges: true,
      hasUnstagedChanges: false,
    });
  });

  it('parses an untracked file', () => {
    const changes = parseGitStatus(status('?? untracked.txt'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'untracked.txt',
      status: 'added',
      stagingState: 'untracked',
      hasStagedChanges: false,
      hasUnstagedChanges: false,
    });
  });

  it('parses a staged rename and keeps the original path', () => {
    const changes = parseGitStatus(status('R  new.ts', 'old.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'new.ts',
      oldPath: 'old.ts',
      status: 'renamed',
      stagingState: 'staged',
      hasStagedChanges: true,
      hasUnstagedChanges: false,
    });
  });

  it('parses an unstaged rename and keeps the original path', () => {
    const changes = parseGitStatus(status(' R new.ts', 'old.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'new.ts',
      oldPath: 'old.ts',
      status: 'renamed',
      stagingState: 'unstaged',
      hasStagedChanges: false,
      hasUnstagedChanges: true,
    });
  });

  it('parses a copy and keeps the source path', () => {
    const changes = parseGitStatus(status('C  copy.ts', 'src.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'copy.ts',
      oldPath: 'src.ts',
      status: 'copied',
      stagingState: 'staged',
    });
  });

  it('parses a conflicted file as unmerged', () => {
    const changes = parseGitStatus(status('UU file.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'file.ts',
      status: 'unmerged',
    });
  });

  it('parses a filename containing a space', () => {
    const changes = parseGitStatus(status('?? space name.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('space name.ts');
    expect(changes[0].stagingState).toBe('untracked');
  });

  it('parses a filename containing a tab', () => {
    const changes = parseGitStatus(status('?? tab\tname.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('tab\tname.ts');
  });

  it('parses a filename containing a newline', () => {
    const changes = parseGitStatus(status('?? line\nbreak.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('line\nbreak.ts');
  });

  it('parses a filename with a leading dash', () => {
    const changes = parseGitStatus(status('?? -leading-dash.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('-leading-dash.ts');
  });

  it('parses a filename with a leading angle bracket', () => {
    const changes = parseGitStatus(status('?? >redirect.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('>redirect.ts');
  });

  it('parses a filename containing a double quote', () => {
    const changes = parseGitStatus(status('?? quote"name.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('quote"name.ts');
  });

  it('parses a non-ASCII filename', () => {
    const changes = parseGitStatus(status('?? café.ts', '?? 日本語.ts'));
    expect(changes).toHaveLength(2);
    expect(changes[0].path).toBe('café.ts');
    expect(changes[1].path).toBe('日本語.ts');
  });

  it('keeps a filename that looks like a status record', () => {
    const changes = parseGitStatus(status('?? R  not-a-rename.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('R  not-a-rename.ts');
    expect(changes[0].oldPath).toBeUndefined();
  });

  it('parses multiple records and consumes the original path of a rename', () => {
    const changes = parseGitStatus(
      status('A  added.ts', 'R  renamed.ts', 'original.ts', '?? untracked.ts'),
    );
    expect(changes).toHaveLength(3);
    expect(changes.map((change) => change.path)).toEqual([
      'added.ts',
      'renamed.ts',
      'untracked.ts',
    ]);
    expect(changes[1].oldPath).toBe('original.ts');
    expect(changes[2].oldPath).toBeUndefined();
  });

  it('ignores records that are not valid porcelain entries', () => {
    const changes = parseGitStatus(status('X  invalid.ts', ' M valid.ts'));
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('valid.ts');
  });
});
