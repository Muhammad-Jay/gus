export type BranchStrategy = 'current' | 'new';

export interface BranchDecision {
  strategy: BranchStrategy;
  name?: string;
  reason: string;
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}

function hasSpace(value: string): boolean {
  return value.includes(' ');
}

function containsInvalidChars(value: string): boolean {
  for (const character of value) {
    if (
      character === ' ' ||
      character === '~' ||
      character === '^' ||
      character === ':' ||
      character === '?' ||
      character === '*' ||
      character === '[' ||
      character === '\\'
    ) {
      return true;
    }
  }
  return false;
}

function checkBranchNameRules(name: string): string | null {
  if (name.length === 0) {
    return 'must not be empty';
  }

  if (name === '@') {
    return 'must not be the single character "@"';
  }

  if (hasControlCharacters(name)) {
    return 'must not contain control characters';
  }

  if (hasSpace(name)) {
    return 'must not contain a space';
  }

  if (name.startsWith('-')) {
    return 'must not start with "-"';
  }

  if (name.startsWith('/') || name.endsWith('/')) {
    return 'must not start or end with "/"';
  }

  if (name.endsWith('.')) {
    return 'must not end with "."';
  }

  if (name.endsWith('.lock')) {
    return 'must not end with ".lock"';
  }

  if (name.includes('..')) {
    return 'must not contain ".."';
  }

  if (name.includes('//')) {
    return 'must not contain "//"';
  }

  if (name.includes('@{')) {
    return 'must not contain "@{"';
  }

  if (containsInvalidChars(name)) {
    return 'must not contain invalid characters (~, ^, :, ?, *, [, \\, space)';
  }

  const components = name.split('/');
  for (const component of components) {
    if (component.length === 0) {
      return 'must not contain empty path components';
    }
    if (component.startsWith('.')) {
      return 'must not contain a path component that begins with "."';
    }
    if (component.endsWith('.lock')) {
      return 'must not contain a path component that ends with ".lock"';
    }
  }

  return null;
}

export function describeBranchNameProblem(name: string): string | null {
  return checkBranchNameRules(name);
}

export function isValidBranchName(name: string): boolean {
  return checkBranchNameRules(name) === null;
}
