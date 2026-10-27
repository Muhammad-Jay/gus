import { describe, expect, it } from 'vitest';
import { mergeConfigurations } from '../../../../src/infrastructure/config/config-merger';

describe('mergeConfigurations', () => {
  it('should merge configurations with precedence', () => {
    const global = { ai: { model: 'gpt-4' } };
    const project = { ai: { provider: 'openai' } };
    const result = mergeConfigurations(global, project);
    expect(result.ai?.model).toBe('gpt-4');
    expect(result.ai?.provider).toBe('openai');
  });

  it('should extend excluded paths instead of replacing defaults', () => {
    const result = mergeConfigurations(
      { privacy: { excludedPaths: ['**/.env*', '**/*.key'] } },
      { privacy: { excludedPaths: ['generated/**', '**/.env*'] } },
      { privacy: { excludedPaths: ['tmp/**'] } },
    );

    expect(result.privacy?.excludedPaths).toEqual([
      '**/.env*',
      '**/*.key',
      'generated/**',
      'tmp/**',
    ]);
  });

  it('should override with later configs', () => {
    const first = { workflow: { autoCommit: 'ask' as const } };
    const second = { workflow: { autoCommit: 'allow' as const } };
    const result = mergeConfigurations(first, second);
    expect(result.workflow?.autoCommit).toBe('allow');
  });
});
