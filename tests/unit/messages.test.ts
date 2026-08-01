import { describe, expect, it } from 'vitest';
import { WebviewRequestSchema } from '../../src/shared/messages.js';

describe('webview message validation', () => {
  it('accepts a valid visual and rejects unknown messages', () => {
    expect(WebviewRequestSchema.safeParse({
      type: 'upsertVisual',
      reportId: 'r',
      pageId: 'p',
      visual: {
        id: 'v', title: 'Revenue', type: 'bar', tableId: 't', categoryField: 'region', valueField: 'amount',
        aggregation: 'sum', columns: [], limit: 100, width: 6, height: 4
      }
    }).success).toBe(true);
    expect(WebviewRequestSchema.safeParse({ type: 'deleteEverything' }).success).toBe(false);
  });
});
