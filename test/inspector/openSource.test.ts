import { describe, expect, it } from 'vitest';
import { openSource } from '../../src/inspector/openSource';
import { Position, Range, window } from '../mocks/vscode';

describe('openSource', () => {
  it('opens the file with the cursor on the component line', async () => {
    await openSource({ file: '/app/src/Demo.tsx', line: 58, column: 11 });
    expect(window.showTextDocument).toHaveBeenCalledWith(expect.objectContaining({ fsPath: '/app/src/Demo.tsx' }), {
      selection: new Range(new Position(57, 10), new Position(57, 10)),
      preview: true,
    });
  });

  it('clamps invalid positions to the start of the file', async () => {
    await openSource({ file: '/a.ts', line: 0, column: 0 });
    expect(window.showTextDocument).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ selection: new Range(new Position(0, 0), new Position(0, 0)) }));
  });
});
