import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CommitTemplate } from '../../domain/templates/commit-template.js';

export class TemplateLoader {
  constructor(private globalDir?: string) {}

  async loadTemplate(repoRoot?: string): Promise<CommitTemplate | null> {
    if (repoRoot) {
      const projectPath = join(repoRoot, '.gus', 'TEMPLATE.md');
      if (existsSync(projectPath)) {
        return this.loadFromPath(projectPath);
      }
    }

    const globalPath = join(this.globalDir ?? join(homedir(), '.config', 'gus'), 'TEMPLATE.md');
    if (existsSync(globalPath)) {
      return this.loadFromPath(globalPath);
    }

    return null;
  }

  private async loadFromPath(path: string): Promise<CommitTemplate> {
    const raw = await readFile(path, 'utf-8');
    const templateBlockMatch = raw.match(/```commit-template\n([\s\S]*?)\n```/);
    const templateBlock = templateBlockMatch ? templateBlockMatch[1] : '';

    const placeholders: string[] = [];
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null = placeholderRegex.exec(templateBlock);
    while (match !== null) {
      if (!placeholders.includes(match[1])) {
        placeholders.push(match[1]);
      }
      match = placeholderRegex.exec(templateBlock);
    }

    const rules: string[] = [];
    const rulesSection = raw.split('## Rules')[1];
    if (rulesSection) {
      const ruleLines = rulesSection.split('\n').filter((line) => line.trim().startsWith('-'));
      rules.push(...ruleLines.map((line) => line.trim()));
    }

    return {
      raw,
      templateBlock,
      rules,
      placeholders,
    };
  }
}
