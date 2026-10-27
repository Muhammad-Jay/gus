import type { ProcessFailureDetails } from '../../../process/process-runner.js';

export function isGitExecutionFailure(result: ProcessFailureDetails): boolean {
  return (
    result.exitCode === null ||
    result.spawnFailed === true ||
    result.timedOut === true ||
    result.isTerminated === true
  );
}

export function isSuccessfulGitCommand(result: ProcessFailureDetails): boolean {
  return (
    result.exitCode === 0 &&
    result.spawnFailed !== true &&
    result.timedOut !== true &&
    result.isTerminated !== true
  );
}
