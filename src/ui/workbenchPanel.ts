import * as vscode from 'vscode';
import type { HostMessage } from '../shared/messages.js';
import { dispatchWorkbenchRequest, type WorkbenchRequestHandler } from './workbenchRequest.js';

export type WorkbenchErrorHandler = (error: unknown) => void;

export class WorkbenchPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private handler?: WorkbenchRequestHandler;
  private errorHandler?: WorkbenchErrorHandler;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  setRequestHandler(handler: WorkbenchRequestHandler): void {
    this.handler = handler;
  }

  setErrorHandler(handler: WorkbenchErrorHandler): void {
    this.errorHandler = handler;
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
      this.panel.webview.onDidReceiveMessage((raw: unknown) => {
        void dispatchWorkbenchRequest(
          raw,
          this.handler,
          async (message) => this.post(message),
          (error) => this.reportError(error)
        ).catch((error: unknown) => {
          this.reportError(error);
        });
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

  private reportError(error: unknown): void {
    if (this.errorHandler) {
      try {
        this.errorHandler(error);
        return;
      } catch (reportingError) {
        console.error('BI Workbench error reporter failed.', reportingError);
      }
    }
    console.error('BI Workbench webview request failed.', error);
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
