import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoveryAvailability } from '../../src/devices/DiscoveryAvailability';
import { IosPlatform } from '../../src/ios/IosPlatform';
import { SimulatorDiscovery } from '../../src/ios/SimulatorDiscovery';
import type { ISimctl } from '../../src/ios/types';
import { MirrorController } from '../../src/mirror/MirrorController';
import type { MirrorServices } from '../../src/mirror/types';
import { FakeClipboard } from '../fakes/FakeClipboard';
import { FakeHelperProcess } from '../fakes/FakeHelperProcess';
import { FakeLogger } from '../fakes/FakeLogger';
import { FakeSurface } from '../fakes/FakeSurface';
import { IPHONE_15_BOOTED_UDID, simctlDevicesJson } from '../ios/fixtures';

const POLL_MS = 2000;

const setup = async () => {
  let state: 'Booted' | 'Shutdown' = 'Booted';
  const simctl: ISimctl = { run: vi.fn((args: readonly string[]) => Promise.resolve(args[0] === 'list' ? simctlDevicesJson(state) : '')) };
  const logger = new FakeLogger();
  const discovery = new SimulatorDiscovery(simctl, logger, { intervalMs: POLL_MS, failureBackoffMs: 30_000, maxFailureBackoffMs: 300_000 }, () =>
    Promise.resolve(true),
  );
  await discovery.start();
  const availability = new DiscoveryAvailability(discovery);
  const helpers: FakeHelperProcess[] = [];
  const spawn = vi.fn(() => {
    const helper = new FakeHelperProcess();
    helpers.push(helper);
    return Promise.resolve(helper);
  });
  const platform = new IosPlatform(spawn, simctl, logger, { makeRoom: () => Promise.resolve() }, availability);
  const simulator = discovery.devices.find((device) => device.id === IPHONE_15_BOOTED_UDID)!;
  const surface = new FakeSurface();
  const services: MirrorServices = {
    logger,
    clipboard: new FakeClipboard(''),
    onError: vi.fn(),
    inspector: { inspectAt: vi.fn(), hoverAt: vi.fn(), cancel: vi.fn() },
    actions: { reloadApp: vi.fn(), reverseMetro: vi.fn(), notify: vi.fn() },
    captures: { save: vi.fn(), reserve: vi.fn() },
    createRecorder: vi.fn(),
    onCaptured: vi.fn(),
    availability,
    reconnectTiming: { baseDelayMs: 500, maxDelayMs: 8000, giveUpAfterMs: 120_000 },
    capabilities: () => platform.capabilities(),
  };
  const controller = new MirrorController(simulator, surface, platform.createMirrorSession(simulator), services);
  const stream = async (helper: FakeHelperProcess | undefined) => {
    helper?.hello();
    helper?.config(884, 1920);
    helper?.frame();
    await vi.advanceTimersByTimeAsync(0);
  };
  const lastState = () => surface.channel.posted.filter((message) => message.type === 'session-state').at(-1);
  return { controller, discovery, helpers, spawn, stream, lastState, setState: (next: typeof state) => (state = next) };
};

describe('iOS Simulator shutdown and reboot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('disconnects with simulator copy when it shuts down and streams again when it boots', async () => {
    const context = await setup();
    context.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await context.stream(context.helpers[0]);
    expect(context.lastState()).toMatchObject({ state: 'streaming' });

    context.setState('Shutdown');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(context.helpers[0]?.disposed).toBe(true);
    expect(context.lastState()).toEqual({
      type: 'session-state',
      state: 'disconnected',
      deviceName: 'iPhone 15',
      detail: 'Simulator was shut down — it will reconnect when it boots again',
    });
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(context.spawn).toHaveBeenCalledTimes(1);

    context.setState('Booted');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(context.spawn).toHaveBeenCalledTimes(2);
    await context.stream(context.helpers[1]);
    expect(context.lastState()).toMatchObject({ state: 'streaming' });

    context.controller.dispose();
    context.discovery.dispose();
  });

  it('gives up with simulator copy when it stays shut down', async () => {
    const context = await setup();
    context.controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await context.stream(context.helpers[0]);
    context.setState('Shutdown');
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await vi.advanceTimersByTimeAsync(121_000);
    expect(context.lastState()).toEqual({
      type: 'session-state',
      state: 'disconnected',
      deviceName: 'iPhone 15',
      detail: 'Simulator not found. Boot it from the Reflect side bar.',
      canReconnect: true,
    });
    context.controller.dispose();
    context.discovery.dispose();
  });
});
