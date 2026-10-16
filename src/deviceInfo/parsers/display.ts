import type { DisplayInfo } from '../types';
import { keyValues, toNumber } from './sections';

export const parseDisplay = (text: string): DisplayInfo => {
  const values = keyValues(text);
  return {
    resolution: values.get('Override size') ?? values.get('Physical size'),
    density: toNumber(values.get('Override density') ?? values.get('Physical density')),
  };
};
