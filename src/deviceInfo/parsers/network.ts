import type { NetworkInfo } from '../types';

const INET = /inet (\d{1,3}(?:\.\d{1,3}){3})/;

export const parseNetwork = (text: string): NetworkInfo => ({
  ipAddress: INET.exec(text)?.[1],
  airplaneMode: text.split('\n').some((line) => line.trim() === '1'),
});
