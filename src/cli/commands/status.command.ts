import { Command } from 'commander';

export function statusCommand() {
  const command = new Command('status');
  command.description('status command');
  command.action(async () => {
    console.log('gus status - coming soon');
  });
  return command;
}
