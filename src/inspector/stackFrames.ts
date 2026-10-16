import type { SourceLocation, StackFrame } from './types';

const FRAME = /^\s*at\s+(?:(.+?)\s+\()?(https?:\/\/.+?):(\d+):(\d+)\)?\s*$/;

export const parseStackFrames = (stacks: readonly string[]): StackFrame[] =>
  stacks.flatMap((stack) =>
    stack.split('\n').flatMap((line) => {
      const match = FRAME.exec(line);
      if (!match) {
        return [];
      }
      return [{ methodName: match[1] ?? 'anonymous', file: match[2] as string, lineNumber: Number(match[3]), column: Number(match[4]) }];
    }),
  );

const isUserCode = (file: string): boolean => file.startsWith('/') && !file.includes('/node_modules/');

export const findUserFrame = (frames: readonly StackFrame[]): StackFrame | undefined => frames.find((candidate) => isUserCode(candidate.file));

export const toSourceLocation = (frame: StackFrame): SourceLocation => ({ file: frame.file, line: frame.lineNumber, column: frame.column });

export const findUserSource = (frames: readonly StackFrame[]): SourceLocation | undefined => {
  const frame = findUserFrame(frames);
  return frame && toSourceLocation(frame);
};
