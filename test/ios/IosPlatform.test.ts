import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/Emitter';
import { HelperMirrorSession } from '../../src/ios/HelperMirrorSession';
import { IosPlatform } from '../../src/ios/IosPlatform';
import type { HelperCommand } from '../../src/ios/types';
import { device } from '../fakes/devices';
import { FakeHelperProcess } from '../fakes/FakeHelperProcess';
import { FakeLogger } from '../fakes/FakeLogger';

const simulator = { ...device(), id: 'UDID-1', platform: 'ios' as const, kind: 'simulator' as const, name: 'iPhone 15' };

describe('IosPlatform', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const build = () => {
    const helper = new FakeHelperProcess();
    const simctl = { run: vi.fn(() => Promise.resolve('')) };
    const window = { makeRoom: vi.fn((_send: (command: HelperCommand) => void) => Promise.resolve()) };
    const availabilityEmitter = new Emitter<void>();
    const availability = { ready: true, onDidChange: availabilityEmitter.event, isReady: () => availability.ready };
    const platform = new IosPlatform(() => Promise.resolve(helper), simctl, new FakeLogger(), window, availability);
    return { platform, helper, simctl, window, availability, availabilityEmitter };
  };

  it('has no back, reverse Metro or logs', () => {
    const { actions, tools } = build().platform.capabilities();
    expect(actions).toEqual(['home', 'recents', 'rotate', 'screenPower', 'screenshot', 'record', 'devMenu', 'reload']);
    expect(actions).not.toContain('back');
    expect(actions).not.toContain('reverseMetro');
    expect(tools).toEqual(['component', 'network', 'storage']);
    expect(tools).not.toContain('logs');
  });

  it('explains reconnects in simulator terms', () => {
    expect(build().platform.capabilities().copy).toEqual({
      reconnecting: 'Simulator was shut down — it will reconnect when it boots again',
      gaveUp: 'Simulator not found. Boot it from the Reflect side bar.',
    });
  });

  it('creates a helper mirror session whose control drives the helper', async () => {
    const { platform, helper } = build();
    const session = platform.createMirrorSession(simulator);
    expect(session).toBeInstanceOf(HelperMirrorSession);
    const started = session.start();
    await vi.advanceTimersByTimeAsync(0);
    helper.hello();
    helper.config(884, 1920);
    helper.frame();
    await started;
    await session.control.touch({ action: 'down', pointer: 'primary', x: 0.5, y: 0.5 });
    await session.control.scroll({ x: 0.5, y: 0.5, scrollX: 0, scrollY: 1 });
    await vi.advanceTimersByTimeAsync(100);
    expect(helper.sent).toEqual([
      { type: 'touch', phase: 'down', x: 196.5, y: 426, id: 1 },
      { type: 'scroll', x: 196.5, y: 426, dx: -0, dy: 40 },
    ]);
    session.dispose();
  });

  it('moves the Simulator window out of the way once the mirror streams, through its own helper', async () => {
    const { platform, helper, window } = build();
    window.makeRoom.mockImplementation((send) => Promise.resolve(send({ type: 'simulatorApp', action: 'hide' })));
    const session = platform.createMirrorSession(simulator);
    const started = session.start();
    await vi.advanceTimersByTimeAsync(0);
    helper.hello();
    helper.config(884, 1920);
    expect(window.makeRoom).not.toHaveBeenCalled();
    helper.frame();
    await started;
    expect(window.makeRoom).toHaveBeenCalledOnce();
    expect(helper.sent).toContainEqual({ type: 'simulatorApp', action: 'hide' });
    session.dispose();
  });

  it('pastes through the simulator with the device UDID', async () => {
    const { platform, helper, simctl } = build();
    const session = platform.createMirrorSession(simulator);
    const started = session.start();
    await vi.advanceTimersByTimeAsync(0);
    helper.hello();
    helper.config(884, 1920);
    helper.frame();
    await started;
    const pasted = session.control.paste('olá');
    await vi.advanceTimersByTimeAsync(1000);
    await pasted;
    expect(simctl.run).toHaveBeenCalledWith(['pbcopy', 'UDID-1'], 'olá');
    session.dispose();
  });

  it('disconnects the session when the simulator stops being ready', async () => {
    const { platform, helper, availability, availabilityEmitter } = build();
    const session = platform.createMirrorSession(simulator);
    const started = session.start();
    await vi.advanceTimersByTimeAsync(0);
    helper.hello();
    helper.config(884, 1920);
    helper.frame();
    await started;
    availability.ready = false;
    availabilityEmitter.fire();
    expect(session.state).toBe('disconnected');
    expect(helper.disposed).toBe(true);
    session.dispose();
  });
});
