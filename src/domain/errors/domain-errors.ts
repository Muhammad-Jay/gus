export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class RepositoryError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class UnsafeRepositoryStateError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRepositoryStateError';
  }
}

export class NoRepositoryError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'NoRepositoryError';
  }
}
