import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessRunner } from '../../../src/infrastructure/process/process-runner';
import { GitRepositoryAdapter } from '../../../src/infrastructure/repository/providers/git-cli/git-repository.adapter';

describe('GitRepositoryAdapter', () => {
  let tempDir: string;
  let adapter: GitRepositoryAdapter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gus-test-'));
    const processRunner = new ProcessRunner();
    adapter = new GitRepositoryAdapter(processRunner);

    // Initialize git repo
    await execa('git', ['init'], { cwd: tempDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should detect a git repository', async () => {
    const location = await adapter.detect(tempDir);
    expect(location).not.toBeNull();
    expect(location?.rootPath).toBe(tempDir);
  });

  it('should return null for non-git directory', async () => {
    const nonGitDir = await mkdtemp(join(tmpdir(), 'gus-non-git-'));
    const location = await adapter.detect(nonGitDir);
    expect(location).toBeNull();
    await rm(nonGitDir, { recursive: true, force: true });
  });

  it('should inspect empty repository', async () => {
    await adapter.detect(tempDir);
    const snapshot = await adapter.inspect();
    expect(snapshot.rootPath).toBe(tempDir);
    expect(snapshot.changes).toEqual([]);
  });

  it('should detect untracked files', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    await adapter.detect(tempDir);
    const snapshot = await adapter.inspect();
    expect(snapshot.changes.length).toBe(1);
    expect(snapshot.changes[0].path).toBe('test.txt');
    expect(snapshot.changes[0].stagingState).toBe('untracked');
  });

  it('should stage and commit files', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    await adapter.detect(tempDir);
    await adapter.stagePaths(['test.txt']);
    const result = await adapter.commit('initial commit');
    expect(result.sha).toBeTruthy();
    expect(result.message).toBe('initial commit');
  });
});
