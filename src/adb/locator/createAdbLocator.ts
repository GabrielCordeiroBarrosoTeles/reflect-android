import { homedir } from 'node:os';
import type { IAdbLocator } from '../types';
import { AdbLocator } from './AdbLocator';
import { AndroidHomeResolver } from './AndroidHomeResolver';
import { ConfigResolver } from './ConfigResolver';
import { DefaultSdkResolver } from './DefaultSdkResolver';
import { PathResolver } from './PathResolver';

export const createAdbLocator = (readConfiguredPath: () => string | undefined): IAdbLocator => {
  const head = new ConfigResolver(readConfiguredPath);
  head
    .setNext(new AndroidHomeResolver(process.env))
    .setNext(new DefaultSdkResolver(homedir(), process.platform))
    .setNext(new PathResolver(process.env));
  return new AdbLocator(head);
};
