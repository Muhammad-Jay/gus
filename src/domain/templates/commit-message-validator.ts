import type { CommitTemplate } from './commit-template.js';

const PLACEHOLDER_PATTERN = /<[^<>]+>|\{\{[^{}]+\}\}/g;
const SUBJECT_LIMIT_PATTERN = /(\d+)\s*(?:characters?|chars?)/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstMeaningfulLine(templateBlock: string): string | null {
  for (const line of templateBlock.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

export function templateSubjectPattern(templateBlock: string): RegExp | null {
  const line = firstMeaningfulLine(templateBlock);
  if (line === null) {
    return null;
  }

  const placeholders = line.match(PLACEHOLDER_PATTERN);
  if (placeholders === null) {
    return null;
  }

  const segments = line.split(PLACEHOLDER_PATTERN).map(escapeRegex);
  return new RegExp(`^${segments.join('.+')}$`);
}

export function templateSubjectLimit(template: CommitTemplate): number | null {
  const match = template.rules.join(' ').match(SUBJECT_LIMIT_PATTERN);
  if (match === null) {
    return null;
  }

  const limit = Number(match[1]);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

export function validateCommitMessage(message: string, template: CommitTemplate): string[] {
  const errors: string[] = [];
  const subject = message.split('\n', 1)[0].trim();

  if (subject.length === 0) {
    return ['Commit message must not be empty.'];
  }

  const pattern = templateSubjectPattern(template.templateBlock);
  if (pattern !== null && !pattern.test(subject)) {
    const shape = firstMeaningfulLine(template.templateBlock) ?? '';
    errors.push(`Commit subject "${subject}" does not match the template "${shape}".`);
  }

  const limit = templateSubjectLimit(template);
  if (limit !== null && subject.length > limit) {
    errors.push(
      `Commit subject "${subject}" is ${subject.length} characters; the template allows ${limit}.`,
    );
  }

  return errors;
}
