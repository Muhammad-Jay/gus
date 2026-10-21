import type { CommitTemplate, TemplateContext } from '../../domain/templates/commit-template.js';

export function validateTemplate(template: CommitTemplate, context: TemplateContext): boolean {
  if (template.placeholders.includes('summary') && !context.summary) {
    return false;
  }
  return true;
}

export function renderTemplate(template: CommitTemplate, context: TemplateContext): string {
  let result = template.templateBlock;

  // Replace placeholders
  result = result.replace(/\{\{type\}\}/g, context.type ?? '');
  result = result.replace(/\{\{scope\}\}/g, context.scope ?? '');
  result = result.replace(/\{\{scope_suffix\}\}/g, context.scope ? `(${context.scope})` : '');
  result = result.replace(/\{\{summary\}\}/g, context.summary);
  result = result.replace(/\{\{body\}\}/g, context.body ?? '');
  result = result.replace(/\{\{footer\}\}/g, context.footer ?? '');

  // Clean up extra blank lines
  result = result.replace(/\n\n\n+/g, '\n\n');
  result = result.trim();

  return result;
}
