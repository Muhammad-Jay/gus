import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';

export function initCommand() {
  const command = new Command('init');
  command.description('Initialize project configuration');
  command.action(async () => {
    const cwd = process.cwd();
    const gusDir = join(cwd, '.gus');
    if (!existsSync(gusDir)) {
      await mkdir(gusDir, { recursive: true });
    }
    const gusMdPath = join(gusDir, 'GUS.md');
    if (!existsSync(gusMdPath)) {
      await writeFile(
        gusMdPath,
        '# Gus Instructions\n\n## Workflow\n- Prefer feature branches for new functionality\n',
      );
    }
    console.log('Initialized .gus/ directory');
  });
  return command;
}
