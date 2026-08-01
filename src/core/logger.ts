import type * as vscode from 'vscode';

const SECRET_PATTERN = /(password|passwd|token|secret|api[-_]?key|authorization)\s*[:=]\s*([^\s,;]+)/gi;

export class Logger {
  constructor(private readonly channel: vscode.OutputChannel) {}

  info(message: string): void {
    this.channel.appendLine(`${new Date().toISOString()} INFO  ${this.redact(message)}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`${new Date().toISOString()} WARN  ${this.redact(message)}`);
  }

  error(operation: string, error: unknown): void {
    const details = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    this.channel.appendLine(`${new Date().toISOString()} ERROR ${this.redact(operation)}\n${this.redact(details)}`);
  }

  show(): void {
    this.channel.show(true);
  }

  private redact(value: string): string {
    return value.replace(SECRET_PATTERN, '$1=[REDACTED]');
  }
}
