import { beforeEach, vi } from 'vitest';
import { resetVscodeMock } from './mocks/vscode';

beforeEach(() => {
  vi.clearAllMocks();
  resetVscodeMock();
});
