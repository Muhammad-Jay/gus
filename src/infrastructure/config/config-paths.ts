import { homedir } from 'node:os';
import { join } from 'node:path';

export function getGlobalConfigDir(): string {
  return join(homedir(), '.config', 'gus');
}

export function getProjectConfigDir(repoRoot: string): string {
  return join(repoRoot, '.gus');
}

export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.json');
}

export function getProjectConfigPath(repoRoot: string): string {
  return join(getProjectConfigDir(repoRoot), 'config.json');
}
