#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { CommanderError } from 'commander';
import { ExitCode, type ExitCodeValue } from '../shared/exit-codes.js';
import { presentError } from './errors/error-mapper.js';
import { createProgram } from './program.js';

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
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
