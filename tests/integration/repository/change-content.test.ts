import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessRunner } from '../../../src/infrastructure/process/process-runner';
import { GitRepositoryAdapter } from '../../../src/infrastructure/repository/providers/git-cli/git-repository.adapter';

describe('GitRepositoryAdapter.getChangeContents', () => {
  let tempDir: string;
  let adapter: GitRepositoryAdapter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gus-change-content-'));
    adapter = new GitRepositoryAdapter(new ProcessRunner());

    await execa('git', ['init'], { cwd: tempDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function commitAll(message: string): Promise<void> {
    await execa('git', ['add', '.'], { cwd: tempDir });
    await execa('git', ['commit', '-m', message], { cwd: tempDir });
  }

  async function collect() {
    await adapter.detect(tempDir);
    const snapshot = await adapter.inspect();
    return adapter.getChangeContents(snapshot.changes);
  }

  it('returns the staged diff of a staged file', async () => {
    await writeFile(join(tempDir, 'staged.txt'), 'first\nsecond\n');
    await execa('git', ['add', 'staged.txt'], { cwd: tempDir });

    const contents = await collect();

    expect(contents).toHaveLength(1);
    expect(contents[0].path).toBe('staged.txt');
    expect(contents[0].stagedDiff).toContain('+second');
    expect(contents[0].unstagedDiff).toBe('');
    expect(contents[0].contentOmitted).toBe(false);
  });

  it('returns the unstaged diff of a modified file', async () => {
    await writeFile(join(tempDir, 'tracked.txt'), 'first\n');
    await commitAll('initial');
    await writeFile(join(tempDir, 'tracked.txt'), 'first\nchanged\n');

    const contents = await collect();

    expect(contents).toHaveLength(1);
    expect(contents[0].unstagedDiff).toContain('+changed');
    expect(contents[0].stagedDiff).toBe('');
  });

  it('returns the content of an untracked file', async () => {
    await writeFile(join(tempDir, 'untracked.txt'), 'brand new content\n');

    const contents = await collect();

    expect(contents).toHaveLength(1);
    expect(contents[0].path).toBe('untracked.txt');
    expect(contents[0].addedContent).toBe('brand new content\n');
  });

  it('returns the diff of a deleted file', async () => {
    await writeFile(join(tempDir, 'deleted.txt'), 'first\nsecond\n');
    await commitAll('initial');
    await rm(join(tempDir, 'deleted.txt'));

    const contents = await collect();

    expect(contents).toHaveLength(1);
    expect(contents[0].status).toBe('deleted');
    expect(contents[0].unstagedDiff).toContain('-first');
    expect(contents[0].unstagedDiff).toContain('-second');
  });

  it('returns the diff of a renamed file', async () => {
    await writeFile(join(tempDir, 'old.txt'), 'first\nsecond\n');
    await commitAll('initial');
    await execa('git', ['mv', 'old.txt', 'new.txt'], { cwd: tempDir });

    const contents = await collect();

    expect(contents).toHaveLength(1);
    expect(contents[0].status).toBe('renamed');
    expect(contents[0].oldPath).toBe('old.txt');
    expect(contents[0].stagedDiff).toContain('rename from old.txt');
    expect(contents[0].stagedDiff).toContain('rename to new.txt');
  });
});
