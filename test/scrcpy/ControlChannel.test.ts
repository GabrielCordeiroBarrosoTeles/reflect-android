import { AndroidKeyCode, AndroidKeyEventAction, AndroidMotionEventAction, AndroidScreenPowerMode, ScrcpyPointerId } from '@yume-chan/scrcpy';
import { describe, expect, it } from 'vitest';
import { ControlChannel } from '../../src/scrcpy/ControlChannel';
import type { VideoSize } from '../../src/platform/types';
import { FakeControlWriter } from '../fakes/FakeControlWriter';

const none = { shift: false, alt: false, ctrl: false, meta: false };

const DEFAULT_SIZE: VideoSize = { width: 1000, height: 2000 };

const setup = (options: { readonly size?: VideoSize | null; readonly connected?: boolean } = {}) => {
  const size = options.size === null ? undefined : (options.size ?? DEFAULT_SIZE);
  const connected = options.connected ?? true;
  const writer = new FakeControlWriter();
  const channel = new ControlChannel(
    () => (connected ? writer.asWriter() : undefined),
    () => size,
  );
  return { writer, channel };
};

describe('ControlChannel', () => {
  it('converts normalized touches into device pixels', async () => {
    const { writer, channel } = setup();
    await channel.touch({ action: 'down', pointer: 'primary', x: 0.25, y: 0.5 });
    await channel.touch({ action: 'move', pointer: 'virtual', x: 1.4, y: -1 });
    await channel.touch({ action: 'up', pointer: 'primary', x: 0.25, y: 0.5 });
    await channel.touch({ action: 'cancel', pointer: 'virtual', x: 0, y: 0 });
    const touches = writer.calls.map((call) => call.args[0] as Record<string, unknown>);
    expect(touches[0]).toMatchObject({
      action: AndroidMotionEventAction.Down,
      pointerId: ScrcpyPointerId.Finger,
      pointerX: 250,
      pointerY: 1000,
      videoWidth: 1000,
      videoHeight: 2000,
      pressure: 1,
    });
    expect(touches[1]).toMatchObject({ pointerId: ScrcpyPointerId.VirtualFinger, pointerX: 1000, pointerY: 0, pressure: 1 });
    expect(touches[2]).toMatchObject({ action: AndroidMotionEventAction.Up, pressure: 0 });
    expect(touches[3]).toMatchObject({ action: AndroidMotionEventAction.Cancel, pressure: 0 });
  });

  it('clamps scroll amounts to the [-1, 1] range', async () => {
    const { writer, channel } = setup();
    await channel.scroll({ x: 0.5, y: 0.5, scrollX: 3, scrollY: -3 });
    expect(writer.calls[0]?.args[0]).toMatchObject({ pointerX: 500, pointerY: 1000, scrollX: 1, scrollY: -1 });
  });

  it('injects mapped key codes with meta state', async () => {
    const { writer, channel } = setup();
    await channel.key({ action: 'down', code: 'KeyA', repeat: 1, modifiers: { ...none, meta: true } });
    await channel.key({ action: 'up', code: 'KeyA', repeat: 0, modifiers: none });
    expect(writer.calls[0]?.args[0]).toMatchObject({ action: AndroidKeyEventAction.Down, keyCode: AndroidKeyCode.KeyA, repeat: 1 });
    expect(writer.calls[1]?.args[0]).toMatchObject({ action: AndroidKeyEventAction.Up });
  });

  it('ignores keys without an Android equivalent', async () => {
    const { writer, channel } = setup();
    await channel.key({ action: 'down', code: 'ShiftLeft', repeat: 0, modifiers: none });
    expect(writer.calls).toEqual([]);
  });

  it('types text and presses back as backOrScreenOn down then up', async () => {
    const { writer, channel } = setup();
    await channel.text('hello');
    await channel.pressButton('back');
    expect(writer.calls.map((call) => [call.method, call.args[0]])).toEqual([
      ['injectText', 'hello'],
      ['backOrScreenOn', AndroidKeyEventAction.Down],
      ['backOrScreenOn', AndroidKeyEventAction.Up],
    ]);
  });

  it.each([
    ['home', AndroidKeyCode.AndroidHome],
    ['recents', AndroidKeyCode.AndroidAppSwitch],
    ['menu', AndroidKeyCode.ContextMenu],
    ['lock', AndroidKeyCode.Power],
    ['volumeUp', AndroidKeyCode.VolumeUp],
    ['volumeDown', AndroidKeyCode.VolumeDown],
  ] as const)('presses %s as down followed by up', async (button, keyCode) => {
    const { writer, channel } = setup();
    await channel.pressButton(button);
    expect(writer.calls.map((call) => [call.method, call.args[0]])).toEqual([
      ['injectKeyCode', expect.objectContaining({ keyCode, action: AndroidKeyEventAction.Down })],
      ['injectKeyCode', expect.objectContaining({ keyCode, action: AndroidKeyEventAction.Up })],
    ]);
  });

  it.each(['siri', 'shake'] as const)('ignores %s, which Android has no equivalent for', async (button) => {
    const { writer, channel } = setup();
    await channel.pressButton(button);
    expect(writer.calls).toEqual([]);
  });

  it('rotates and switches the screen power', async () => {
    const { writer, channel } = setup();
    await channel.rotate();
    await channel.setScreenPower(false);
    await channel.setScreenPower(true);
    expect(writer.calls.map((call) => [call.method, call.args[0]])).toEqual([
      ['rotateDevice', undefined],
      ['setScreenPowerMode', AndroidScreenPowerMode.Off],
      ['setScreenPowerMode', AndroidScreenPowerMode.Normal],
    ]);
  });

  it('sends the clipboard with paste enabled', async () => {
    const { writer, channel } = setup();
    await channel.paste('clip');
    expect(writer.calls[0]).toEqual({ method: 'setClipboard', args: [{ sequence: 0n, paste: true, content: 'clip' }] });
  });

  it('does nothing while disconnected', async () => {
    const { writer, channel } = setup({ size: null, connected: false });
    await channel.touch({ action: 'down', pointer: 'primary', x: 0, y: 0 });
    await channel.scroll({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
    await channel.key({ action: 'down', code: 'KeyA', repeat: 0, modifiers: none });
    await channel.text('x');
    for (const button of ['back', 'home', 'recents', 'menu', 'lock', 'volumeUp', 'volumeDown', 'siri', 'shake'] as const) {
      await channel.pressButton(button);
    }
    await channel.rotate();
    await channel.setScreenPower(false);
    await channel.paste('x');
    expect(writer.calls).toEqual([]);
  });

  it('ignores pointer input until the video size is known', async () => {
    const { writer, channel } = setup({ size: null });
    await channel.touch({ action: 'down', pointer: 'primary', x: 0, y: 0 });
    await channel.scroll({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
    expect(writer.calls).toEqual([]);
  });
});
