import type { ActionId } from '../shared/actions';
import type { ICommand } from './types';

export const actionCommandId = (id: ActionId): string => `reflect.action.${id}`;

export class RunActionCommand implements ICommand {
  readonly id: string;

  constructor(
    private readonly actionId: ActionId,
    private readonly mirrors: { runAction(id: ActionId): 'ran' | 'no-mirror' | 'unsupported' },
    private readonly notify: (message: string) => void,
  ) {
    this.id = actionCommandId(actionId);
  }

  execute(): Promise<void> {
    const outcome = this.mirrors.runAction(this.actionId);
    if (outcome === 'no-mirror') {
      this.notify('Open a device first');
    } else if (outcome === 'unsupported') {
      this.notify('Not available on this device');
    }
    return Promise.resolve();
  }
}
