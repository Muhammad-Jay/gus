import type { CommitTemplate } from '../../domain/templates/commit-template.js';

export interface TemplateLoaderPort {
  loadTemplate(repoRoot?: string): Promise<CommitTemplate | null>;
}
