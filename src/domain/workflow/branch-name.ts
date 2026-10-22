export type BranchStrategy = 'current' | 'new';

export interface BranchDecision {
  strategy: BranchStrategy;
  name?: string;
  reason: string;
}

const INVALID_BRANCH_CHARACTERS = /[ ~^:?*[\\]/;
const INVALID_BRANCH_SEQUENCES = /(\.\.|\/\/|@\{)/;

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}

export function isValidBranchName(name: string): boolean {
  if (name.length === 0 || name === '@') {
    return false;
  }

  if (hasControlCharacters(name)) {
    return false;
  }

  if (name.startsWith('/') || name.endsWith('/') || name.startsWith('-')) {
    return false;
  }

  if (name.endsWith('.') || name.endsWith('.lock')) {
    return false;
  }

  if (INVALID_BRANCH_CHARACTERS.test(name) || INVALID_BRANCH_SEQUENCES.test(name)) {
    return false;
  }

  return name
    .split('/')
    .every(
      (component) =>
        component.length > 0 && !component.startsWith('.') && !component.endsWith('.lock'),
    );
}
