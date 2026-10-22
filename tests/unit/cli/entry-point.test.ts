import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isEntryPoint } from '../../../src/cli/main';

const directories: string[] = [];

function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'gus-entry-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('isEntryPoint', () => {
  it('detects the module when invoked directly', () => {
    const directory = createDirectory();
    const target = join(directory, 'main.js');
    writeFileSync(target, '');

    expect(isEntryPoint(target, pathToFileURL(target).href)).toBe(true);
  });

  it('detects the module when invoked through a symlink', () => {
    const directory = createDirectory();
    const target = join(directory, 'main.js');
    const link = join(directory, 'gus');
    writeFileSync(target, '');
    symlinkSync(target, link);

    expect(isEntryPoint(link, pathToFileURL(target).href)).toBe(true);
  });

  it('ignores a different entry module', () => {
    const directory = createDirectory();
    const target = join(directory, 'main.js');
    const other = join(directory, 'other.js');
    writeFileSync(target, '');
    writeFileSync(other, '');

    expect(isEntryPoint(other, pathToFileURL(target).href)).toBe(false);
  });

  it('returns false when the entry is unavailable', () => {
    const directory = createDirectory();
    const target = join(directory, 'main.js');
    writeFileSync(target, '');

    expect(isEntryPoint(undefined, pathToFileURL(target).href)).toBe(false);
    expect(isEntryPoint(join(directory, 'does-not-exist'), pathToFileURL(target).href)).toBe(false);
  });
});
