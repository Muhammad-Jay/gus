import { Command } from 'commander';
import { version } from '../version.js';
import { runCommand } from './commands/run.command.js';
import { statusCommand } from './commands/status.command.js';
import { configCommand } from './commands/config.command.js';
import { modelsCommand } from './commands/models.command.js';
import { initCommand } from './commands/init.command.js';

export function createProgram() {
  const program = new Command();
  
  program
    .name('gus')
    .description('AI-assisted repository workflow automation tool')
    .version(version);
  
  program.addCommand(runCommand());
  program.addCommand(statusCommand());
  program.addCommand(configCommand());
  program.addCommand(modelsCommand());
  program.addCommand(initCommand());
  
  return program;
}
