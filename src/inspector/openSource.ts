import * as vscode from 'vscode';
import type { SourceLocation } from './types';

export const openSource = async (source: SourceLocation): Promise<void> => {
  const position = new vscode.Position(Math.max(0, source.line - 1), Math.max(0, source.column - 1));
  await vscode.window.showTextDocument(vscode.Uri.file(source.file), {
    selection: new vscode.Range(position, position),
    preview: true,
  });
};
