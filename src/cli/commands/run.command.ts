import { Command } from 'commander';

export function runCommand() {
  const command = new Command('run');
  command.description('Run the default workflow');
  command.action(async () => {
    console.log('Gus workflow - coming soon');
  });
  return command;
}
