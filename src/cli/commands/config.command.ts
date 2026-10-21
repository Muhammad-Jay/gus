import { Command } from 'commander';

export function configCommand() {
  const command = new Command('config');
  command.description('config command');
  command.action(async () => {
    console.log('gus config - coming soon');
  });
  return command;
}
