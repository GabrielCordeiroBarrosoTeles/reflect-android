import { describe, expect, it, vi } from 'vitest';
import { IosDeviceControl } from '../../src/ios/IosDeviceControl';
import type { HelperCommand, ISimctl } from '../../src/ios/types';
import type { KeyInput } from '../../src/shared/protocol';
import { HELLO } from '../fakes/FakeHelperProcess';

const setup = () => {
  const sent: HelperCommand[] = [];
  const order: string[] = [];
  const simctl: ISimctl = {
    run: vi.fn((args: readonly string[]) => {
      order.push(`simctl ${args[0]}`);
      return Promise.resolve('');
    }),
  };
  const timers: (() => void)[] = [];
  const timerApi = { setTimeout: vi.fn((callback: () => void) => void timers.push(callback)) };
  const control = new IosDeviceControl(
    (command) => {
      order.push(command.type);
      sent.push(command);
    },
    HELLO,
    simctl,
    'UDID-1',
    timerApi,
  );
  return { control, sent, simctl, order, timers, timerApi };
};

const keys = (sent: readonly HelperCommand[]) => sent.map((command) => (command.type === 'key' ? [command.usage, command.down] : [command.type]));

describe('IosDeviceControl', () => {
  it('converts normalized touch to device points', async () => {
    const { control, sent } = setup();
    await control.touch({ action: 'down', pointer: 'primary', x: 0.5, y: 0.5 });
    expect(sent).toEqual([{ type: 'touch', phase: 'down', x: 196.5, y: 426, id: 1 }]);
  });

  it('uses id 2 for the virtual pointer and maps cancel to up', async () => {
    const { control, sent } = setup();
    await control.touch({ action: 'move', pointer: 'virtual', x: 1, y: 0 });
    await control.touch({ action: 'cancel', pointer: 'primary', x: 0, y: 1 });
    expect(sent).toEqual([
      { type: 'touch', phase: 'move', x: 393, y: 0, id: 2 },
      { type: 'touch', phase: 'up', x: 0, y: 852, id: 1 },
    ]);
  });

  it('coalesces scrolls within the interval into one command with summed deltas', async () => {
    const { control, sent, timers, timerApi } = setup();
    await control.scroll({ x: 0.5, y: 0.5, scrollX: 0, scrollY: -1 });
    await control.scroll({ x: 0.1, y: 0.1, scrollX: 0.5, scrollY: -2 });
    await control.scroll({ x: 0.1, y: 0.1, scrollX: 0, scrollY: -1 });
    expect(sent).toEqual([]);
    expect(timerApi.setTimeout).toHaveBeenCalledTimes(1);
    expect(timerApi.setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
    timers[0]?.();
    expect(sent).toEqual([{ type: 'scroll', x: 196.5, y: 426, dx: -20, dy: -160 }]);
  });

  it('starts a new batch after a flush', async () => {
    const { control, sent, timers } = setup();
    await control.scroll({ x: 0, y: 0, scrollX: 0, scrollY: 1 });
    timers[0]?.();
    await control.scroll({ x: 1, y: 1, scrollX: 0, scrollY: 1 });
    timers[1]?.();
    expect(sent).toEqual([
      { type: 'scroll', x: 0, y: 0, dx: -0, dy: 40 },
      { type: 'scroll', x: 393, y: 852, dx: -0, dy: 40 },
    ]);
  });

  it('sends mapped keys and ignores unmapped ones', async () => {
    const { control, sent } = setup();
    const key = (action: 'down' | 'up', code: string): KeyInput => ({ action, code, repeat: 0, modifiers: { shift: false, ctrl: false, alt: false, meta: false } });
    await control.key(key('down', 'KeyA'));
    await control.key(key('up', 'KeyA'));
    await control.key(key('down', 'F13'));
    expect(sent).toEqual([
      { type: 'key', usage: 4, down: true },
      { type: 'key', usage: 4, down: false },
    ]);
  });

  it('types ASCII text as keystrokes without the clipboard', async () => {
    const { control, sent, simctl } = setup();
    await control.text('oK');
    expect(simctl.run).not.toHaveBeenCalled();
    expect(keys(sent)).toEqual([[18, true], [18, false], [225, true], [14, true], [14, false], [225, false]]);
  });

  it('sends four key commands for two lowercase characters', async () => {
    const { control, sent } = setup();
    await control.text('ok');
    expect(sent).toHaveLength(4);
  });

  it('pastes non-ASCII text through the simulator clipboard', async () => {
    const { control, order, simctl } = setup();
    await control.text('olá');
    expect(simctl.run).toHaveBeenCalledWith(['pbcopy', 'UDID-1'], 'olá');
    expect(order).toEqual(['simctl pbcopy', 'key', 'key', 'key', 'key']);
  });

  it('pastes with Cmd+V', async () => {
    const { control, sent } = setup();
    await control.paste('x');
    expect(keys(sent)).toEqual([[227, true], [25, true], [25, false], [227, false]]);
  });

  it.each([
    ['home', 'home'],
    ['recents', 'appSwitcher'],
    ['menu', 'shake'],
    ['shake', 'shake'],
    ['lock', 'lock'],
    ['volumeUp', 'volumeUp'],
    ['volumeDown', 'volumeDown'],
    ['siri', 'siri'],
  ] as const)('maps button %s to %s', async (button, name) => {
    const { control, sent } = setup();
    await control.pressButton(button);
    expect(sent).toEqual([
      { type: 'button', name, down: true },
      { type: 'button', name, down: false },
    ]);
  });

  it('does nothing for back', async () => {
    const { control, sent } = setup();
    await control.pressButton('back');
    expect(sent).toEqual([]);
  });

  it('rotates', async () => {
    const { control, sent } = setup();
    await control.rotate();
    expect(sent).toEqual([{ type: 'rotate' }]);
  });

  it('turns the screen off with lock and on with home', async () => {
    const { control, sent } = setup();
    await control.setScreenPower(false);
    await control.setScreenPower(true);
    expect(sent).toEqual([
      { type: 'button', name: 'lock', down: true },
      { type: 'button', name: 'lock', down: false },
      { type: 'button', name: 'home', down: true },
      { type: 'button', name: 'home', down: false },
    ]);
  });
});
