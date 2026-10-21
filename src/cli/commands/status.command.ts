import { Command } from 'commander';
import { ProcessRunner } from '../../infrastructure/process/process-runner.js';
import { GitRepositoryAdapter } from '../../infrastructure/repository/providers/git-cli/git-repository.adapter.js';

export function statusCommand() {
  const command = new Command('status');
  command.description('Show repository status');
  command.action(async () => {
    try {
      const processRunner = new ProcessRunner();
      const adapter = new GitRepositoryAdapter(processRunner);
      const location = await adapter.detect(process.cwd());
      if (!location) {
        console.log('Not a git repository');
        return;
      }
      const snapshot = await adapter.inspect();
      console.log(`Repository: ${snapshot.displayName}`);
      console.log(`Branch: ${snapshot.currentBranch || 'detached'}`);
      console.log(`Changes: ${snapshot.changes.length}`);
      for (const change of snapshot.changes) {
        console.log(`  ${change.status} ${change.path}`);
      }
    } catch (error: unknown) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
  return command;
}
