import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IosDeviceControl } from '../../src/ios/IosDeviceControl';
import { SimulatorPasteboard } from '../../src/ios/SimulatorPasteboard';
import type { HelperCommand, ISimctl } from '../../src/ios/types';
import type { KeyInput } from '../../src/shared/protocol';
import { HELLO } from '../fakes/FakeHelperProcess';

const setup = (pasteboardText = 'before') => {
  const sent: HelperCommand[] = [];
  const order: string[] = [];
  let board = pasteboardText;
  const simctl: ISimctl = {
    run: vi.fn((args: readonly string[], input?: string) => {
      order.push(`simctl ${args[0]}`);
      if (args[0] === 'pbcopy') {
        board = input ?? '';
      }
      return Promise.resolve(args[0] === 'pbpaste' ? board : '');
    }),
  };
  const pasteboard = new SimulatorPasteboard(simctl, 'UDID-1');
  const timerApi = { setTimeout: vi.fn((callback: () => void, delayMs: number) => setTimeout(callback, delayMs)) };
  const control = new IosDeviceControl(
    (command) => {
      order.push(command.type === 'key' ? `key ${command.usage} ${command.down ? 'down' : 'up'}` : command.type);
      sent.push(command);
    },
    HELLO,
    pasteboard,
    timerApi,
  );
  return { control, sent, simctl, order, timerApi, pasteboard };
};

const settle = <T>(promise: Promise<T>): Promise<T> => vi.advanceTimersByTimeAsync(1000).then(() => promise);

const NONE = { shift: false, ctrl: false, alt: false, meta: false };
const key = (action: 'down' | 'up', code: string, modifiers: Partial<typeof NONE> = {}): KeyInput => ({
  action,
  code,
  repeat: 0,
  modifiers: { ...NONE, ...modifiers },
});

const keys = (sent: readonly HelperCommand[]) => sent.map((command) => (command.type === 'key' ? [command.usage, command.down] : [command.type]));

describe('IosDeviceControl', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('converts normalized touch to device points', async () => {
    const { control, sent } = setup();
    await control.touch({ action: 'down', pointer: 'primary', x: 0.5, y: 0.5 });
    expect(sent).toEqual([{ type: 'touch', phase: 'down', x: 196.5, y: 426, id: 1 }]);
  });

  it('ignores the virtual pinch pointer and maps cancel to up', async () => {
    const { control, sent } = setup();
    await control.touch({ action: 'down', pointer: 'virtual', x: 1, y: 0 });
    await control.touch({ action: 'move', pointer: 'virtual', x: 1, y: 0 });
    await control.touch({ action: 'cancel', pointer: 'primary', x: 0, y: 1 });
    expect(sent).toEqual([{ type: 'touch', phase: 'up', x: 0, y: 852, id: 1 }]);
  });

  it('coalesces scrolls within the interval into one command with summed deltas', async () => {
    const { control, sent, timerApi } = setup();
    await control.scroll({ x: 0.5, y: 0.5, scrollX: 0, scrollY: -1 });
    await control.scroll({ x: 0.1, y: 0.1, scrollX: 0.5, scrollY: -2 });
    await control.scroll({ x: 0.1, y: 0.1, scrollX: 0, scrollY: -1 });
    expect(sent).toEqual([]);
    expect(timerApi.setTimeout).toHaveBeenCalledTimes(1);
    expect(timerApi.setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([{ type: 'scroll', x: 196.5, y: 426, dx: -20, dy: -160 }]);
  });

  it('starts a new batch after a flush', async () => {
    const { control, sent } = setup();
    await control.scroll({ x: 0, y: 0, scrollX: 0, scrollY: 1 });
    vi.advanceTimersByTime(100);
    await control.scroll({ x: 1, y: 1, scrollX: 0, scrollY: 1 });
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([
      { type: 'scroll', x: 0, y: 0, dx: -0, dy: 40 },
      { type: 'scroll', x: 393, y: 852, dx: -0, dy: 40 },
    ]);
  });

  it('sends mapped keys and ignores unmapped ones', async () => {
    const { control, sent } = setup();
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

  it('pastes non-ASCII text through the simulator pasteboard and restores what was there', async () => {
    const { control, order, simctl } = setup('before');
    await settle(control.text('olá'));
    expect(simctl.run).toHaveBeenNthCalledWith(2, ['pbcopy', 'UDID-1'], 'olá');
    expect(simctl.run).toHaveBeenNthCalledWith(3, ['pbcopy', 'UDID-1'], 'before');
    expect(order).toEqual(['simctl pbpaste', 'simctl pbcopy', 'key 227 down', 'key 25 down', 'key 25 up', 'key 227 up', 'simctl pbcopy']);
  });

  it('waits for the simulator to consume Cmd+V before restoring the pasteboard', async () => {
    const { control, order } = setup();
    const typed = control.text('ç');
    await vi.advanceTimersByTimeAsync(299);
    expect(order.at(-1)).toBe('key 227 up');
    await vi.advanceTimersByTimeAsync(1);
    await typed;
    expect(order.at(-1)).toBe('simctl pbcopy');
  });

  it('never reports text it pushed itself as a device clipboard change', async () => {
    const { control, pasteboard } = setup('user copy');
    const changes: string[] = [];
    pasteboard.onDidChange((text) => changes.push(text));
    await pasteboard.poll();
    await settle(control.text('ação'));
    await settle(control.paste('from host'));
    await pasteboard.poll();
    expect(changes).toEqual([]);
  });

  it('pastes host text with Cmd+V and leaves it on the simulator pasteboard', async () => {
    const { control, sent, simctl } = setup();
    await settle(control.paste('x'));
    expect(simctl.run).toHaveBeenCalledTimes(1);
    expect(simctl.run).toHaveBeenCalledWith(['pbcopy', 'UDID-1'], 'x');
    expect(keys(sent)).toEqual([[227, true], [25, true], [25, false], [227, false]]);
  });

  it('keeps text, keys and pastes in the order they were sent', async () => {
    const { control, order } = setup();
    const done = Promise.all([control.text('a'), control.text('çã'), control.text('o'), control.key(key('down', 'Enter')), control.key(key('up', 'Enter'))]);
    await settle(done);
    expect(order).toEqual([
      'key 4 down',
      'key 4 up',
      'simctl pbpaste',
      'simctl pbcopy',
      'key 227 down',
      'key 25 down',
      'key 25 up',
      'key 227 up',
      'simctl pbcopy',
      'key 18 down',
      'key 18 up',
      'key 40 down',
      'key 40 up',
    ]);
  });

  it('keeps the queue running after a failed paste', async () => {
    const { control, simctl, order } = setup();
    vi.mocked(simctl.run).mockRejectedValueOnce(new Error('pbpaste failed')).mockRejectedValueOnce(new Error('pbcopy failed'));
    await expect(settle(control.text('ç'))).rejects.toThrow('pbcopy failed');
    await control.text('a');
    expect(order.slice(-2)).toEqual(['key 4 down', 'key 4 up']);
  });

  it('restores the pasteboard even when the paste keystrokes fail', async () => {
    const simctl: ISimctl = { run: vi.fn((args: readonly string[]) => Promise.resolve(args[0] === 'pbpaste' ? 'before' : '')) };
    const control = new IosDeviceControl(
      (command) => {
        if (command.type === 'key') {
          throw new Error('helper gone');
        }
      },
      HELLO,
      new SimulatorPasteboard(simctl, 'UDID-1'),
      { setTimeout },
    );
    await expect(control.text('ç')).rejects.toThrow('helper gone');
    expect(simctl.run).toHaveBeenLastCalledWith(['pbcopy', 'UDID-1'], 'before');
  });

  it('holds Cmd around a shortcut whose Meta key was not forwarded', async () => {
    const { control, sent } = setup();
    await control.key(key('down', 'KeyA', { meta: true }));
    await control.key(key('up', 'KeyA', { meta: true }));
    expect(keys(sent)).toEqual([[227, true], [4, true], [4, false], [227, false]]);
  });

  it('adds every missing modifier and releases them in reverse order', async () => {
    const { control, sent } = setup();
    await control.key(key('down', 'KeyZ', { meta: true, shift: true, ctrl: true, alt: true }));
    await control.key(key('up', 'KeyZ', { meta: true, shift: true, ctrl: true, alt: true }));
    expect(keys(sent)).toEqual([
      [227, true],
      [224, true],
      [226, true],
      [225, true],
      [29, true],
      [29, false],
      [225, false],
      [226, false],
      [224, false],
      [227, false],
    ]);
  });

  it('does not add a modifier the user is already holding', async () => {
    const { control, sent } = setup();
    await control.key(key('down', 'ShiftRight', { shift: true }));
    await control.key(key('down', 'ArrowLeft', { shift: true }));
    await control.key(key('down', 'ArrowLeft', { shift: true }));
    await control.key(key('up', 'ArrowLeft', { shift: true }));
    await control.key(key('up', 'ShiftRight'));
    expect(keys(sent)).toEqual([[229, true], [80, true], [80, true], [80, false], [229, false]]);
  });

  it('reloads with Cmd+R', async () => {
    const { control, sent } = setup();
    await control.reloadShortcut();
    expect(keys(sent)).toEqual([[227, true], [21, true], [21, false], [227, false]]);
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
