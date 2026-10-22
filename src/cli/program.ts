import { Command } from 'commander';
import { version } from '../version.js';
import { configCommand } from './commands/config.command.js';
import { initCommand } from './commands/init.command.js';
import { modelsCommand } from './commands/models.command.js';
import { type RunOptions, executeRun, runCommand } from './commands/run.command.js';
import { statusCommand } from './commands/status.command.js';

function configureCommand(command: Command): void {
  command.exitOverride();
  command.allowExcessArguments(false);
  for (const child of command.commands) {
    configureCommand(child);
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('gus')
    .description('AI-assisted repository workflow automation tool')
    .version(version)
    .option('--dry-run', 'Show the plan without changing the repository')
    .option('-y, --yes', 'Approve all operations without prompting')
    .option('--provider <name>', 'Override the AI provider for this run')
    .option('--model <id>', 'Override the AI model for this run')
    .action(async (options: RunOptions) => {
      await executeRun(options);
    });

  program.addCommand(runCommand());
  program.addCommand(statusCommand());
  program.addCommand(configCommand());
  program.addCommand(modelsCommand());
  program.addCommand(initCommand());

  configureCommand(program);

  return program;
}
