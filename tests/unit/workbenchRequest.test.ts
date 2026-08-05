import { describe, expect, it, vi } from 'vitest';
import { dispatchWorkbenchRequest } from '../../src/ui/workbenchRequest.js';

describe('workbench request error boundary', () => {
  it('rejects malformed webview messages without invoking the handler', async () => {
    const handler = vi.fn(async () => undefined);
    const post = vi.fn(async () => true);

    await dispatchWorkbenchRequest({ type: 'not-a-real-request' }, handler, post, vi.fn());

    expect(handler).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith({
      type: 'toast',
      level: 'error',
      message: 'The workbench sent an invalid request.'
    });
  });

  it('logs handler failures and sends a stable message without leaking details', async () => {
    const failure = new Error('C:/private/project/data.duckdb');
    const reportError = vi.fn();
    const post = vi.fn(async () => true);

    await dispatchWorkbenchRequest(
      { type: 'ready' },
      async () => { throw failure; },
      post,
      reportError
    );

    expect(reportError).toHaveBeenCalledWith(failure);
    expect(post).toHaveBeenCalledWith({
      type: 'toast',
      level: 'error',
      message: 'The request failed. Open the BI Workbench logs for details.'
    });
    expect(JSON.stringify(post.mock.calls)).not.toContain('private/project');
  });
});
