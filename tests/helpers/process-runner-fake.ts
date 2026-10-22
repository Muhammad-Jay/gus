import type {
  ProcessRunOptions,
  ProcessRunResult,
} from '../../src/infrastructure/process/process-runner';

export function createProcessRunResult(
  overrides: Partial<ProcessRunResult> = {},
): ProcessRunResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    signal: null,
    signalDescription: null,
    isTerminated: false,
    timedOut: false,
    spawnFailed: false,
    failureReason: null,
    ...overrides,
  };
}

export class FakeProcessRunner {
  constructor(private readonly handler: (args: string[]) => ProcessRunResult) {}

  async run(
    _executable: string,
    args: string[] = [],
    _options?: ProcessRunOptions,
  ): Promise<ProcessRunResult> {
    return this.handler(args);
  }
}
