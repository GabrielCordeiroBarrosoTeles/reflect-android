import type { ActionId } from '../shared/actions';
import type { ICommand } from './types';

export const actionCommandId = (id: ActionId): string => `reflect.action.${id}`;

export class RunActionCommand implements ICommand {
  readonly id: string;

  constructor(
    private readonly actionId: ActionId,
    private readonly mirrors: { runAction(id: ActionId): boolean },
    private readonly notify: (message: string) => void,
  ) {
    this.id = actionCommandId(actionId);
  }

  execute(): Promise<void> {
    if (!this.mirrors.runAction(this.actionId)) {
      this.notify('Open a device first');
    }
    return Promise.resolve();
  }
}
