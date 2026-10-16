import { randomBytes } from 'node:crypto';

export const createNonce = (): string => randomBytes(16).toString('base64');
