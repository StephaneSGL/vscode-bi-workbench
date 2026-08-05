import type { HostMessage, WebviewRequest } from '../shared/messages.js';
import { WebviewRequestSchema } from '../shared/messages.js';

export type WorkbenchRequestHandler = (request: WebviewRequest) => Promise<void>;
export type WorkbenchMessagePoster = (message: HostMessage) => Promise<boolean>;

export async function dispatchWorkbenchRequest(
  raw: unknown,
  handler: WorkbenchRequestHandler | undefined,
  post: WorkbenchMessagePoster,
  reportError: (error: unknown) => void
): Promise<void> {
  const parsed = WebviewRequestSchema.safeParse(raw);
  if (!parsed.success) {
    await post({ type: 'toast', level: 'error', message: 'The workbench sent an invalid request.' });
    return;
  }

  try {
    await handler?.(parsed.data);
  } catch (error) {
    reportError(error);
    await post({
      type: 'toast',
      level: 'error',
      message: 'The request failed. Open the BI Workbench logs for details.'
    });
  }
}
