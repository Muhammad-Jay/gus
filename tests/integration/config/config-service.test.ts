import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidConfigurationError } from '../../../src/domain/errors/domain-errors';
import { ConfigService } from '../../../src/infrastructure/config/config-service';

describe('ConfigService', () => {
  let globalDir: string;
  let repoRoot: string;

  beforeEach(async () => {
    globalDir = await mkdtemp(join(tmpdir(), 'gus-global-'));
    repoRoot = await mkdtemp(join(tmpdir(), 'gus-repo-'));
  });

  afterEach(async () => {
    await rm(globalDir, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  });

  async function writeProjectConfig(value: unknown): Promise<void> {
    await mkdir(join(repoRoot, '.gus'), { recursive: true });
    await writeFile(join(repoRoot, '.gus', 'config.json'), JSON.stringify(value), 'utf-8');
  }

  it('falls back to defaults when no files exist', async () => {
    const service = new ConfigService({ globalDir });
    const { configuration, sources } = await service.getResolved(repoRoot);

    expect(configuration.ai).toEqual({ provider: 'google', model: 'gemini-2.5-flash' });
    expect(sources['ai.provider']).toBe('default');
    expect(sources['ai.model']).toBe('default');
    expect(sources['workflow.autoCommit']).toBe('default');
    expect(sources['ai.temperature']).toBeUndefined();
  });

  it('applies global then project configuration', async () => {
    const service = new ConfigService({ globalDir });
    await service.write('global', { ai: { model: 'gpt-4o' } });
    await writeProjectConfig({ ai: { provider: 'openai' }, workflow: { autoCommit: 'allow' } });

    const { configuration, sources } = await service.getResolved(repoRoot);

    expect(configuration.ai?.model).toBe('gpt-4o');
    expect(configuration.ai?.provider).toBe('openai');
    expect(configuration.workflow?.autoCommit).toBe('allow');
    expect(sources['ai.model']).toBe('global');
    expect(sources['workflow.autoCommit']).toBe('project');
    expect(sources['ai.temperature']).toBeUndefined();
  });

  it('gives constructor overrides the highest precedence', async () => {
    const service = new ConfigService({
      globalDir,
      overrides: { ai: { model: 'override-model' } },
    });
    await service.write('global', { ai: { model: 'gpt-4o' } });

    const { configuration, sources } = await service.getResolved(repoRoot);

    expect(configuration.ai?.model).toBe('override-model');
    expect(sources['ai.model']).toBe('override');
  });

  it('writes and reads back a merged configuration without dropping existing keys', async () => {
    const service = new ConfigService({ globalDir });
    await service.write('global', { ai: { model: 'gpt-4o' } });
    await service.write('global', { workflow: { autoCommit: 'deny' } });

    const stored = await service.read('global');

    expect(stored.ai?.model).toBe('gpt-4o');
    expect(stored.workflow?.autoCommit).toBe('deny');
  });

  it('reports the location for each scope', async () => {
    const service = new ConfigService({ globalDir });

    expect(service.getLocation('global')).toBe(join(globalDir, 'config.json'));
    expect(service.getLocation('project', repoRoot)).toBe(join(repoRoot, '.gus', 'config.json'));
    expect(() => service.getLocation('project')).toThrow(/requires a repository root/i);
  });

  it('rejects unknown keys in a configuration file', async () => {
    const service = new ConfigService({ globalDir });
    await writeProjectConfig({ ai: { model: 'gpt-4o', unknown: true } });

    await expect(service.getResolved(repoRoot)).rejects.toBeInstanceOf(InvalidConfigurationError);
  });

  it('rejects invalid values in a configuration file', async () => {
    const service = new ConfigService({ globalDir });
    await writeProjectConfig({ workflow: { autoCommit: 'maybe' } });

    await expect(service.getResolved(repoRoot)).rejects.toBeInstanceOf(InvalidConfigurationError);
  });
});
