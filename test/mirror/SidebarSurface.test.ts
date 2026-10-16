import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/Emitter';
import { SidebarSurface } from '../../src/mirror/SidebarSurface';
import { FakeChannel } from '../fakes/FakeSurface';

const setup = () => {
  const visibility = new Emitter<boolean>();
  const host = { channel: new FakeChannel(), visible: true, onDidChangeVisibility: visibility.event, reveal: vi.fn() };
  const onRelease = vi.fn();
  return { host, visibility, onRelease, surface: new SidebarSurface(host, onRelease) };
};

describe('SidebarSurface', () => {
  it('delegates channel, visibility and reveal to the sidebar host', () => {
    const { host, visibility, surface } = setup();
    const changes: boolean[] = [];
    surface.onDidChangeVisibility((visible) => changes.push(visible));
    visibility.fire(false);
    surface.reveal();
    host.visible = false;
    expect(surface.channel).toBe(host.channel);
    expect(surface.visible).toBe(false);
    expect(changes).toEqual([false]);
    expect(host.reveal).toHaveBeenCalledOnce();
  });

  it('releases the host and notifies only once', () => {
    const { onRelease, surface } = setup();
    const closed = vi.fn();
    surface.onDidDispose(closed);
    surface.dispose();
    surface.dispose();
    expect(onRelease).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
  });
});
