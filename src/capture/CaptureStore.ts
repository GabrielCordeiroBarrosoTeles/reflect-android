import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ICaptureStore } from './types';

const pad = (value: number): string => String(value).padStart(2, '0');

const timestamp = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'device';

export class CaptureStore implements ICaptureStore {
  constructor(
    private readonly resolveDirectory: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async save(bytes: Uint8Array, extension: string, label: string): Promise<string> {
    const path = await this.reserve(extension, label);
    await writeFile(path, bytes);
    return path;
  }

  async reserve(extension: string, label: string): Promise<string> {
    const directory = this.resolveDirectory();
    await mkdir(directory, { recursive: true });
    return join(directory, `reflect-${slug(label)}-${timestamp(this.now())}.${extension}`);
  }
}
