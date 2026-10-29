import { describe, expect, it, vi } from 'vitest';
import type { Device } from '../../src/devices/types';
import { Emitter } from '../../src/core/Emitter';
import { MirrorManager } from '../../src/mirror/MirrorManager';
import type { IMirrorController, MirrorCloseReason, MirrorLocation } from '../../src/mirror/types';
import { device } from '../fakes/devices';

class FakeController implements IMirrorController {
  readonly closing = new Emitter<MirrorCloseReason>();
  readonly onDidDispose = this.closing.event;
  started = 0;
  revealed = 0;
  disposed = 0;
  inspecting: boolean[] = [];
  actions: string[] = [];
  unsupported = new Set<string>();

  supports(id: string): boolean {
    return !this.unsupported.has(id);
  }

  runAction(id: string): Promise<void> {
    this.actions.push(id);
    return Promise.resolve();
  }

  setInspectMode(active: boolean): void {
    this.inspecting.push(active);
  }

  constructor(
    readonly device: Device,
    readonly location: MirrorLocation,
  ) {}

  start(): void {
    this.started += 1;
  }

  reveal(): void {
    this.revealed += 1;
  }

  dispose(): void {
    this.disposed += 1;
    this.closing.fire('closed');
  }
}

const setup = () => {
  const created: FakeController[] = [];
  const manager = new MirrorManager((phone, location) => {
    const controller = new FakeController(phone, location);
    created.push(controller);
    return controller;
  });
  return { manager, created };
};

describe('MirrorManager', () => {
  it('creates and starts a controller per device at the requested location', () => {
    const { manager, created } = setup();
    manager.open(device({ id: 'A' }), 'secondarySidebar');
    manager.open(device({ id: 'B' }), 'editor');
    expect(created.map((controller) => [controller.device.id, controller.location, controller.started])).toEqual([
      ['A', 'secondarySidebar', 1],
      ['B', 'editor', 1],
    ]);
  });

  it('reveals the existing controller when the same device is opened twice', () => {
    const { manager, created } = setup();
    manager.open(device(), 'editor');
    manager.open(device(), 'secondarySidebar');
    expect(created).toHaveLength(1);
    expect(created[0]?.revealed).toBe(1);
  });

  it('forgets closed controllers and reports the device, location and reason', () => {
    const { manager, created } = setup();
    const closed = vi.fn();
    manager.onDidClose(closed);
    const phone = device();
    manager.open(phone, 'secondarySidebar');
    created[0]?.closing.fire('hidden');
    manager.open(phone, 'secondarySidebar');
    expect(closed).toHaveBeenCalledWith({ device: phone, location: 'secondarySidebar', reason: 'hidden' });
    expect(created).toHaveLength(2);
  });

  it('reports whether a mirror is open and toggles inspect mode on every controller', () => {
    const { manager, created } = setup();
    expect(manager.hasOpenMirror).toBe(false);
    manager.open(device({ id: 'A' }), 'editor');
    manager.open(device({ id: 'B' }), 'editor');
    manager.setInspectMode(true);
    expect(manager.hasOpenMirror).toBe(true);
    expect(created.map((controller) => controller.inspecting)).toEqual([[true], [true]]);
  });

  it('runs actions on the most recently opened mirror', () => {
    const { manager, created } = setup();
    expect(manager.runAction('home')).toBe('no-mirror');
    manager.open(device({ id: 'A' }), 'editor');
    manager.open(device({ id: 'B' }), 'editor');
    expect(manager.runAction('screenshot')).toBe('ran');
    expect(created.map((controller) => controller.actions)).toEqual([[], ['screenshot']]);
  });

  it('does not run an action the latest mirror does not support', () => {
    const { manager, created } = setup();
    manager.open(device({ id: 'A' }), 'editor');
    created[0]?.unsupported.add('reload');
    expect(manager.runAction('reload')).toBe('unsupported');
    expect(created[0]?.actions).toEqual([]);
  });

  it('announces opened devices', () => {
    const { manager } = setup();
    const opened = vi.fn();
    manager.onDidOpen(opened);
    const phone = device();
    manager.open(phone, 'editor');
    expect(opened).toHaveBeenCalledWith(phone);
  });

  it('moves the latest mirror to another location and reveals it when already there', () => {
    const { manager, created } = setup();
    expect(manager.move('editor')).toBe(false);
    manager.open(device({ id: 'A' }), 'secondarySidebar');
    expect(manager.move('secondarySidebar')).toBe(true);
    expect(created[0]?.revealed).toBe(1);
    expect(manager.move('editor')).toBe(true);
    expect(created[0]?.disposed).toBe(1);
    expect(created[1]).toMatchObject({ location: 'editor', started: 1 });
    expect(created[1]?.device.id).toBe('A');
  });

  it('disposes every controller', () => {
    const { manager, created } = setup();
    manager.open(device({ id: 'A' }), 'editor');
    manager.open(device({ id: 'B' }), 'editor');
    manager.dispose();
    expect(created.map((controller) => controller.disposed)).toEqual([1, 1]);
  });
});
