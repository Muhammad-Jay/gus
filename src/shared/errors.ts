const UNKNOWN_ERROR_NAME = 'UnknownError';
const UNKNOWN_ERROR_MESSAGE = 'Unknown error';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function constructorName(prototype: object): string | undefined {
  const ctor = (prototype as { constructor?: unknown }).constructor;
  if (typeof ctor !== 'function') {
    return undefined;
  }
  const name = ctor.name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

export function errorChain(error: unknown): string[] {
  if (typeof error !== 'object' && typeof error !== 'function') {
    return [];
  }
  if (error === null) {
    return [];
  }

  const names: string[] = [];
  const visited = new Set<object>();
  let current: object | null = Object.getPrototypeOf(error);

  while (current && current !== Object.prototype && !visited.has(current)) {
    visited.add(current);
    const name = constructorName(current);
    if (name !== undefined) {
      names.push(name);
    }
    current = Object.getPrototypeOf(current);
  }

  return names;
}

export function errorName(error: unknown): string {
  const chain = errorChain(error);
  if (chain.length > 0) {
    return chain[0];
  }
  if (isObject(error) && typeof error.name === 'string' && error.name.length > 0) {
    return error.name;
  }
  return UNKNOWN_ERROR_NAME;
}

export function hasErrorName(error: unknown, name: string): boolean {
  return errorChain(error).includes(name);
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.length > 0 ? error.message : UNKNOWN_ERROR_MESSAGE;
  }
  if (typeof error === 'string') {
    return error.length > 0 ? error : UNKNOWN_ERROR_MESSAGE;
  }
  if (isObject(error) && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint' ||
    typeof error === 'symbol'
  ) {
    return String(error);
  }
  return UNKNOWN_ERROR_MESSAGE;
}
