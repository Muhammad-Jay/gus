import { execa } from 'execa';

export interface ProcessRunOptions {
  cwd?: string;
  env?: Record<string, string>;
}

export interface ProcessRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ProcessRunner {
  async run(
    executable: string,
    args: string[] = [],
    options: ProcessRunOptions = {}
  ): Promise<ProcessRunResult> {
    try {
      const result = await execa(executable, args, {
        cwd: options.cwd,
        env: options.env,
        reject: false,
      });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
      };
    } catch (error) {
      throw error;
    }
  }
}
