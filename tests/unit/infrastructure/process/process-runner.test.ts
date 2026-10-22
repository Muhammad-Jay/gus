import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ProcessRunner,
  isSuccessfulRun,
} from '../../../../src/infrastructure/process/process-runner';
import { createProcessRunResult } from '../../../helpers/process-runner-fake';

const LONG_RUNNING_SCRIPT = 'setTimeout(() => {}, 10000)';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForPid(pidFile: string, timeoutMs = 10000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await readFile(pidFile, 'utf8');
      const pid = Number.parseInt(content.trim(), 10);
      if (Number.isInteger(pid) && pid > 0) {
        return pid;
      }
    } catch {
      await delay(25);
    }
  }
  throw new Error('The child process did not report its pid in time');
}

describe('ProcessRunner', () => {
  const runner = new ProcessRunner();

  it('reports a successful command with exit code 0', async () => {
    const result = await runner.run(process.execPath, ['-e', 'process.stdout.write("ok")']);

    expect(result.exitCode).toBe(0);
    expect(result.isTerminated).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.spawnFailed).toBe(false);
    expect(result.signal).toBeNull();
    expect(result.failureReason).toBeNull();
    expect(isSuccessfulRun(result)).toBe(true);
  });

  it('reports a non-zero exit code as a failure', async () => {
    const result = await runner.run(process.execPath, ['-e', 'process.exit(3)']);

    expect(result.exitCode).toBe(3);
    expect(result.spawnFailed).toBe(false);
    expect(result.isTerminated).toBe(false);
    expect(isSuccessfulRun(result)).toBe(false);
  });

  it('reports a signal-terminated process as a failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gus-process-signal-'));
    const pidFile = join(directory, 'pid');
    const script = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ${LONG_RUNNING_SCRIPT}`;

    const pending = runner.run(process.execPath, ['-e', script]);
    const pid = await waitForPid(pidFile);
    process.kill(pid, 'SIGTERM');

    try {
      const result = await pending;

      expect(result.exitCode).toBeNull();
      expect(result.signal).toBe('SIGTERM');
      expect(result.signalDescription).not.toBeNull();
      expect(result.isTerminated).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.spawnFailed).toBe(false);
      expect(isSuccessfulRun(result)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports a timed out process as a failure', async () => {
    const result = await runner.run(process.execPath, ['-e', LONG_RUNNING_SCRIPT], {
      timeout: 250,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.isTerminated).toBe(true);
    expect(result.spawnFailed).toBe(false);
    expect(result.failureReason).not.toBeNull();
    expect(isSuccessfulRun(result)).toBe(false);
  });

  it('reports a missing executable as a spawn failure', async () => {
    const result = await runner.run('gus-missing-executable-for-tests', []);

    expect(result.spawnFailed).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.signal).toBeNull();
    expect(result.isTerminated).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.failureReason).toBeTruthy();
    expect(result.failureReason?.length ?? 0).toBeGreaterThan(0);
    expect(isSuccessfulRun(result)).toBe(false);
  });

  it('provides a failure reason for a failing command', async () => {
    const result = await runner.run(process.execPath, [
      '-e',
      'process.stderr.write("boom"); process.exit(1);',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.failureReason).toBeTruthy();
    expect(result.failureReason).not.toContain('    at ');
  });

  it('captures stdout and stderr separately', async () => {
    const result = await runner.run(process.execPath, [
      '-e',
      'process.stdout.write("out"); process.stderr.write("err");',
    ]);

    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
  });

  it('runs the command in the requested working directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gus-process-cwd-'));

    try {
      const result = await runner.run(
        process.execPath,
        ['-e', 'process.stdout.write(process.cwd())'],
        { cwd: directory },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(await realpath(directory));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('isSuccessfulRun', () => {
  it('returns true only for a completed process with exit code 0', () => {
    expect(isSuccessfulRun(createProcessRunResult())).toBe(true);
    expect(isSuccessfulRun(createProcessRunResult({ exitCode: 0 }))).toBe(true);
  });

  it('returns false for every non-success combination', () => {
    const combinations: Array<Partial<ReturnType<typeof createProcessRunResult>>> = [
      { exitCode: 1 },
      { exitCode: null },
      { exitCode: 0, isTerminated: true },
      { exitCode: 0, timedOut: true },
      { exitCode: 0, spawnFailed: true },
      { exitCode: null, isTerminated: true },
      { exitCode: null, timedOut: true },
      { exitCode: null, spawnFailed: true },
      { exitCode: 0, isTerminated: true, timedOut: true },
      { exitCode: 3, spawnFailed: true },
    ];

    for (const combination of combinations) {
      expect(isSuccessfulRun(createProcessRunResult(combination))).toBe(false);
    }
  });
});
