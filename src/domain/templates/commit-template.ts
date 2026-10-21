export interface CommitTemplate {
  raw: string;
  templateBlock: string;
  rules: string[];
  placeholders: string[];
}

export interface TemplateContext {
  type?: string;
  scope?: string;
  summary: string;
  body?: string;
  footer?: string;
}
