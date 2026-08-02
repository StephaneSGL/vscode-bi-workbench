import * as vscode from 'vscode';
import type { HostMessage, WebviewRequest } from '../shared/messages.js';
import { WebviewRequestSchema } from '../shared/messages.js';

export type WorkbenchRequestHandler = (request: WebviewRequest) => Promise<void>;

export class WorkbenchPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private handler?: WorkbenchRequestHandler;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  setRequestHandler(handler: WorkbenchRequestHandler): void {
    this.handler = handler;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One, false);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'biWorkbench.main',
      'BI Workbench',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media')]
      }
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'bi-workbench.svg');
    this.panel.webview.html = this.html(this.panel.webview);
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (raw: unknown) => {
        const parsed = WebviewRequestSchema.safeParse(raw);
        if (!parsed.success) {
          await this.post({ type: 'toast', level: 'error', message: 'The workbench sent an invalid request.' });
          return;
        }
        await this.handler?.(parsed.data);
      }),
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      })
    );
  }

  async post(message: HostMessage): Promise<boolean> {
    return this.panel ? this.panel.webview.postMessage(message) : false;
  }

  dispose(): void {
    this.panel?.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private html(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'));
    const nonce = crypto.randomUUID().replaceAll('-', '');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>BI Workbench</title>
</head>
<body>
  <div id="app" aria-live="polite"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
