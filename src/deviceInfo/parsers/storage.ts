import type { StorageInfo } from '../types';
import { toNumber } from './sections';

export const parseStorage = (text: string): StorageInfo | undefined => {
  const columns = text.slice(text.lastIndexOf('\n') + 1).trim().split(/\s+/);
  const totalKb = toNumber(columns[1]);
  const availableKb = toNumber(columns[3]);
  return totalKb === undefined || availableKb === undefined ? undefined : { totalKb, availableKb };
};
