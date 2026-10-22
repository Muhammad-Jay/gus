import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessRunner } from '../../../src/infrastructure/process/process-runner';
import { GitCommandRunner } from '../../../src/infrastructure/repository/providers/git-cli/git-command-runner';
import { RepositoryFingerprintCalculator } from '../../../src/infrastructure/repository/providers/git-cli/repository-fingerprint';

describe('RepositoryFingerprintCalculator', () => {
  let tempDir: string;
  let calculator: RepositoryFingerprintCalculator;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gus-fingerprint-'));
    calculator = new RepositoryFingerprintCalculator(new GitCommandRunner(new ProcessRunner()));

    await execa('git', ['init'], { cwd: tempDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function commitFile(name: string, content: string, message: string): Promise<void> {
    await writeFile(join(tempDir, name), content);
    await execa('git', ['add', name], { cwd: tempDir });
    await execa('git', ['commit', '-m', message], { cwd: tempDir });
  }

  it('should produce a stable fingerprint for an unchanged repository', async () => {
    await commitFile('tracked.txt', 'original\n', 'initial');

    const first = await calculator.compute(tempDir);
    const second = await calculator.compute(tempDir);

    expect(second).toEqual(first);
  });

  it('should change the worktree fingerprint when the content of a modified file changes', async () => {
    await commitFile('tracked.txt', 'original\n', 'initial');

    await writeFile(join(tempDir, 'tracked.txt'), 'first revision\n');
    const statusBefore = await execa('git', ['status', '--porcelain=v1', '-z'], { cwd: tempDir });
    const first = await calculator.compute(tempDir);

    await writeFile(join(tempDir, 'tracked.txt'), 'second revision with other content\n');
    const statusAfter = await execa('git', ['status', '--porcelain=v1', '-z'], { cwd: tempDir });
    const second = await calculator.compute(tempDir);

    expect(statusAfter.stdout).toBe(statusBefore.stdout);
    expect(first.worktreeFingerprint).not.toBe(second.worktreeFingerprint);
  });

  it('should change the index fingerprint when a change is staged', async () => {
    await commitFile('tracked.txt', 'original\n', 'initial');

    const before = await calculator.compute(tempDir);

    await writeFile(join(tempDir, 'tracked.txt'), 'changed\n');
    await execa('git', ['add', 'tracked.txt'], { cwd: tempDir });
    const after = await calculator.compute(tempDir);

    expect(after.indexFingerprint).not.toBe(before.indexFingerprint);
  });

  it('should change the head sha when a commit is created', async () => {
    await commitFile('tracked.txt', 'original\n', 'initial');

    const before = await calculator.compute(tempDir);

    await commitFile('second.txt', 'second\n', 'second commit');
    const after = await calculator.compute(tempDir);

    expect(after.headSha).not.toBe(before.headSha);
  });

  it('should return a null head sha for a repository without commits', async () => {
    const result = await calculator.compute(tempDir);

    expect(result.headSha).toBeNull();
  });

  it('should change the worktree fingerprint when the content of an untracked file changes', async () => {
    await writeFile(join(tempDir, 'untracked.txt'), 'first revision\n');
    const statusBefore = await execa('git', ['status', '--porcelain=v1', '-z'], { cwd: tempDir });
    const first = await calculator.compute(tempDir);

    await writeFile(join(tempDir, 'untracked.txt'), 'second revision with other content\n');
    const statusAfter = await execa('git', ['status', '--porcelain=v1', '-z'], { cwd: tempDir });
    const second = await calculator.compute(tempDir);

    expect(statusAfter.stdout).toBe(statusBefore.stdout);
    expect(first.worktreeFingerprint).not.toBe(second.worktreeFingerprint);
  });

  it('should report the head sha returned by git', async () => {
    await commitFile('tracked.txt', 'original\n', 'initial');

    const result = await calculator.compute(tempDir);
    const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd: tempDir });

    expect(result.headSha).toBe(stdout.trim());
  });

  it('should keep the index fingerprint stable when only the worktree content changes', async () => {
    await commitFile('tracked.txt', 'original\n', 'initial');

    const before = await calculator.compute(tempDir);

    await writeFile(join(tempDir, 'tracked.txt'), 'changed\n');
    const after = await calculator.compute(tempDir);

    expect(after.indexFingerprint).toBe(before.indexFingerprint);
    expect(after.worktreeFingerprint).not.toBe(before.worktreeFingerprint);
  });
});
