import { afterEach, describe, expect, it, vi } from 'vitest';
import { StderrProgressReporter } from '../../../src/cli/ui/progress';

describe('StderrProgressReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes privacy warnings to stderr', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reporter = new StderrProgressReporter();

    reporter.emit({ type: 'privacy.warning', message: 'Provider warning' });

    expect(error).toHaveBeenCalledWith('Warning: Provider warning');
  });

  it('ignores non-warning events', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reporter = new StderrProgressReporter();

    reporter.emit({ type: 'repository.inspecting' });

    expect(error).not.toHaveBeenCalled();
  });
});
