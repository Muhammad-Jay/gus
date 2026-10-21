import { ProcessRunner } from '../../../process/process-runner.js';

export class GitCommandRunner {
  constructor(private processRunner: ProcessRunner) {}

  async run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.processRunner.run('git', args, { cwd });
  }
}
