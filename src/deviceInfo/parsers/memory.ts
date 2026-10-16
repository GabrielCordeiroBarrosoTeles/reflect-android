import type { MemoryInfo } from '../types';
import { keyValues, toNumber } from './sections';

const kilobytes = (value: string | undefined): number | undefined => toNumber(value?.replace(/\s*kB$/i, ''));

export const parseMemory = (text: string): MemoryInfo | undefined => {
  const values = keyValues(text);
  const totalKb = kilobytes(values.get('MemTotal'));
  const availableKb = kilobytes(values.get('MemAvailable'));
  return totalKb === undefined || availableKb === undefined ? undefined : { totalKb, availableKb };
};
