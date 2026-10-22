import { execa } from 'execa';

export interface ProcessRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ProcessRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  signalDescription: string | null;
  isTerminated: boolean;
  timedOut: boolean;
  spawnFailed: boolean;
  failureReason: string | null;
}

/**
 * The subset of a process result that describes why a command failed.
 *
 * The optional members allow callers that only observe the exit status to describe failures
 * without losing the details of termination, timeouts, and spawn failures.
 */
export interface ProcessFailureDetails {
  stderr: string;
  exitCode: number | null;
  signal?: string | null;
  signalDescription?: string | null;
  isTerminated?: boolean;
  timedOut?: boolean;
  spawnFailed?: boolean;
  failureReason?: string | null;
}

interface ProcessOutcome {
  stdout: string;
  stderr: string;
  exitCode?: number;
  signal?: string;
  signalDescription?: string;
  isTerminated: boolean;
  timedOut: boolean;
  failed: boolean;
  shortMessage?: string;
}

export function isSuccessfulRun(result: ProcessRunResult): boolean {
  return result.exitCode === 0 && !result.isTerminated && !result.timedOut && !result.spawnFailed;
}

export function describeProcessFailure(result: ProcessFailureDetails): string {
  const cause = describeFailureCause(result);
  const stderr = result.stderr.trim();
  if (stderr.length > 0) {
    return `${cause}: ${stderr}`;
  }
  if (result.spawnFailed === true) {
    const reason = result.failureReason?.trim() ?? '';
    return reason.length > 0 ? `${cause}: ${reason}` : cause;
  }
  return cause;
}

function describeFailureCause(result: ProcessFailureDetails): string {
  if (result.spawnFailed === true) {
    return 'the executable could not be started';
  }
  if (result.timedOut === true) {
    return 'the command timed out';
  }
  if (result.isTerminated === true) {
    const signal = result.signal ?? 'an unknown signal';
    const description = result.signalDescription ?? null;
    return description !== null
      ? `the command was terminated by ${signal} (${description})`
      : `the command was terminated by ${signal}`;
  }
  if (result.exitCode !== null) {
    return `the command exited with code ${result.exitCode}`;
  }
  return 'the command could not be executed reliably';
}

function composeFailureReason(outcome: ProcessOutcome): string {
  const shortMessage = outcome.shortMessage?.replace(/\s*\n\s*/g, '; ').trim();
  if (shortMessage !== undefined && shortMessage.length > 0) {
    return shortMessage;
  }
  if (outcome.signal !== undefined) {
    return `The command was terminated by ${outcome.signal}`;
  }
  if (outcome.exitCode !== undefined) {
    return `The command exited with code ${outcome.exitCode}`;
  }
  return 'The command failed';
}

function toProcessRunResult(outcome: ProcessOutcome): ProcessRunResult {
  const exitCode = outcome.exitCode ?? null;
  const signal = outcome.signal ?? null;
  const signalDescription = outcome.signalDescription ?? null;
  const timedOut = outcome.timedOut === true;
  const isTerminated = outcome.isTerminated === true;
  const spawnFailed =
    outcome.failed === true &&
    outcome.exitCode === undefined &&
    outcome.signal === undefined &&
    !timedOut;

  return {
    stdout: outcome.stdout,
    stderr: outcome.stderr,
    exitCode,
    signal,
    signalDescription,
    isTerminated,
    timedOut,
    spawnFailed,
    failureReason: outcome.failed ? composeFailureReason(outcome) : null,
  };
}

export class ProcessRunner {
  async run(
    executable: string,
    args: string[] = [],
    options: ProcessRunOptions = {},
  ): Promise<ProcessRunResult> {
    const result = await execa(executable, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout,
      reject: false,
    });
    return toProcessRunResult(result);
  }
}
