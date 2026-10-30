import { extname } from 'node:path';
import type { AddFilesResult, DroppedFile } from '../platform/types';
import type { ISimctl } from './types';

type DropKind = 'app' | 'media' | 'certificate';

const KIND_BY_EXTENSION: Readonly<Record<string, DropKind>> = {
  '.app': 'app',
  '.ipa': 'app',
  '.png': 'media',
  '.jpg': 'media',
  '.jpeg': 'media',
  '.heic': 'media',
  '.gif': 'media',
  '.mov': 'media',
  '.mp4': 'media',
  '.m4v': 'media',
  '.pem': 'certificate',
  '.cer': 'certificate',
  '.crt': 'certificate',
  '.der': 'certificate',
};

interface Step {
  readonly kind: DropKind;
  readonly files: DroppedFile[];
}

const kindOf = (file: DroppedFile): DropKind | undefined => KIND_BY_EXTENSION[extname(file.name).toLowerCase()];

const countOf = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export class SimulatorDropHandler {
  constructor(private readonly simctl: ISimctl) {}

  async add(udid: string, files: readonly DroppedFile[]): Promise<AddFilesResult> {
    const steps: Step[] = [];
    const unsupported: DroppedFile[] = [];
    for (const file of files) {
      const kind = kindOf(file);
      if (kind === undefined) {
        unsupported.push(file);
        continue;
      }
      const last = steps.at(-1);
      if (kind === 'media' && last?.kind === 'media') {
        last.files.push(file);
        continue;
      }
      steps.push({ kind, files: [file] });
    }
    for (const step of steps) {
      await this.simctl.run(this.commandFor(udid, step));
    }
    const added = steps.flatMap((step) => step.files);
    return { added, unsupported, message: this.summarize(steps, unsupported) };
  }

  private commandFor(udid: string, { kind, files }: Step): string[] {
    const paths = files.map(({ path }) => path);
    switch (kind) {
      case 'app':
        return ['install', udid, ...paths];
      case 'media':
        return ['addmedia', udid, ...paths];
      case 'certificate':
        return ['keychain', udid, 'add-root-cert', ...paths];
    }
  }

  private summarize(steps: readonly Step[], unsupported: readonly DroppedFile[]): string {
    const total = (kind: DropKind): number => steps.filter((step) => step.kind === kind).reduce((sum, step) => sum + step.files.length, 0);
    const apps = total('app');
    const media = total('media');
    const certificates = total('certificate');
    const parts = [
      apps > 0 ? `installed ${countOf(apps, 'app', 'apps')}` : '',
      media > 0 ? `added ${countOf(media, 'photo/video', 'photos/videos')}` : '',
      certificates > 0 ? `added ${countOf(certificates, 'certificate', 'certificates')}` : '',
    ].filter(Boolean);
    const sentences = [
      parts.length > 0 ? capitalize(parts.join(', ')) : '',
      unsupported.length > 0 ? `Reflect can't add ${unsupported.map(({ name }) => name).join(', ')} to the simulator` : '',
    ].filter(Boolean);
    return sentences.join('. ');
  }
}
