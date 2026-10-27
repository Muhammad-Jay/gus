import micromatch from 'micromatch';

export function isPathExcluded(path: string, excludedPaths: readonly string[]): boolean {
  if (excludedPaths.length === 0) {
    return false;
  }
  return micromatch.isMatch(path, [...excludedPaths]);
}
