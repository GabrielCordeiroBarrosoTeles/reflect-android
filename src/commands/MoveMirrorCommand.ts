import type { MirrorLocation } from '../mirror/types';
import type { ICommand } from './types';

export class MoveMirrorCommand implements ICommand {
  constructor(
    readonly id: string,
    private readonly location: MirrorLocation,
    private readonly mirrors: { move(location: MirrorLocation): boolean },
    private readonly openNew: () => Promise<unknown>,
  ) {}

  async execute(): Promise<void> {
    if (!this.mirrors.move(this.location)) {
      await this.openNew();
    }
  }
}
