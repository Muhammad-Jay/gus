import { homedir } from 'node:os';
import { join } from 'node:path';

export function getGlobalConfigDir(globalDir?: string): string {
  return globalDir ?? join(homedir(), '.config', 'gus');
}

export function getGlobalConfigPath(globalDir?: string): string {
  return join(getGlobalConfigDir(globalDir), 'config.json');
}

export function getProjectConfigDir(repoRoot: string): string {
  return join(repoRoot, '.gus');
}

export function getProjectConfigPath(repoRoot: string): string {
  return join(getProjectConfigDir(repoRoot), 'config.json');
}
