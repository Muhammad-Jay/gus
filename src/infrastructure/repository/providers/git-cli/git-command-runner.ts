import type { ProcessRunResult, ProcessRunner } from '../../../process/process-runner.js';

export class GitCommandRunner {
  constructor(private processRunner: ProcessRunner) {}

  async run(args: string[], cwd: string): Promise<ProcessRunResult> {
    return this.processRunner.run('git', args, { cwd });
  }
}
