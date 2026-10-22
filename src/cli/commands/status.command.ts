import { Command } from 'commander';
import { NoRepositoryError } from '../../domain/errors/domain-errors.js';
import { createRepository } from '../composition.js';

export function statusCommand(): Command {
  const command = new Command('status');
  command.description('Show repository status without changing anything');

  command.action(async () => {
    const repository = createRepository();
    const location = await repository.detect(process.cwd());
    if (location === null) {
      throw new NoRepositoryError('No Git repository found at or above the current directory.');
    }

    const snapshot = await repository.inspect();

    console.log(`Repository: ${snapshot.displayName}`);
    console.log(`Root: ${snapshot.rootPath}`);
    console.log(`Branch: ${snapshot.currentBranch ?? '(detached)'}`);
    console.log(`Changes: ${snapshot.changes.length}`);

    for (const change of snapshot.changes) {
      console.log(`  ${change.stagingState.padEnd(9)} ${change.status.padEnd(8)} ${change.path}`);
    }
  });

  return command;
}
