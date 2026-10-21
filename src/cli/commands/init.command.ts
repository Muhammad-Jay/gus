import { Command } from 'commander';

export function initCommand() {
  const command = new Command('init');
  command.description('init command');
  command.action(async () => {
    console.log('gus init - coming soon');
  });
  return command;
}
