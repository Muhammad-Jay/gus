import { Command } from 'commander';

export function modelsCommand() {
  const command = new Command('models');
  command.description('models command');
  command.action(async () => {
    console.log('gus models - coming soon');
  });
  return command;
}
