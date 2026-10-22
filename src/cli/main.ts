#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CommanderError } from 'commander';
import { ExitCode, type ExitCodeValue } from '../shared/exit-codes.js';
import { presentError } from './errors/error-mapper.js';
import { createProgram } from './program.js';

export function isEntryPoint(
  entry: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (entry === undefined) {
    return false;
  }

  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

export async function main(argv: string[] = process.argv): Promise<ExitCodeValue> {
  const program = createProgram();
  program.exitOverride();

  try {
    await program.parseAsync(argv);

    return typeof process.exitCode === 'number'
      ? (process.exitCode as ExitCodeValue)
      : ExitCode.Success;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? ExitCode.Success : ExitCode.InvalidInput;
    }

    const presentation = presentError(error);
    process.stderr.write(`\n${presentation.title}: ${presentation.message}\n`);
    for (const step of presentation.nextSteps) {
      process.stderr.write(`  - ${step}\n`);
    }

    return presentation.exitCode;
  }
}

if (isEntryPoint()) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
