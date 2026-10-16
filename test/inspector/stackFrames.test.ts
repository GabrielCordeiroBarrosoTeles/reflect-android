import { describe, expect, it } from 'vitest';
import { findUserSource, parseStackFrames } from '../../src/inspector/stackFrames';

describe('parseStackFrames', () => {
  it('parses named and anonymous frames and skips other lines', () => {
    const stack = [
      'Error: react-stack-top-frame',
      '    at exports.jsx (http://127.0.0.1:8081/index.bundle?platform=android:1200:30)',
      '    at http://127.0.0.1:8081/index.bundle?platform=android:57599:18',
      '    at native code',
    ].join('\n');
    expect(parseStackFrames([stack])).toEqual([
      { methodName: 'exports.jsx', file: 'http://127.0.0.1:8081/index.bundle?platform=android', lineNumber: 1200, column: 30 },
      { methodName: 'anonymous', file: 'http://127.0.0.1:8081/index.bundle?platform=android', lineNumber: 57599, column: 18 },
    ]);
  });
});

describe('findUserSource', () => {
  it('returns the first frame from the user project', () => {
    const frames = [
      { file: '/app/node_modules/react/jsx.js', lineNumber: 1, column: 1, methodName: 'jsx' },
      { file: 'http://unsymbolicated', lineNumber: 2, column: 2, methodName: 'x' },
      { file: '/app/src/screens/Demo/index.tsx', lineNumber: 58, column: 11, methodName: 'Demo' },
      { file: '/app/App.tsx', lineNumber: 13, column: 1, methodName: 'App' },
    ];
    expect(findUserSource(frames)).toEqual({ file: '/app/src/screens/Demo/index.tsx', line: 58, column: 11 });
  });

  it('returns undefined when every frame is library code', () => {
    expect(findUserSource([{ file: '/app/node_modules/x.js', lineNumber: 1, column: 1, methodName: 'x' }])).toBeUndefined();
  });
});
