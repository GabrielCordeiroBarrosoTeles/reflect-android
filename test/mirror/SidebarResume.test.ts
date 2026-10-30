import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/Emitter';
import { SidebarResume } from '../../src/mirror/SidebarResume';
import type { MirrorClosed } from '../../src/mirror/types';
import { device } from '../fakes/devices';

const setup = () => {
  const closed = new Emitter<MirrorClosed>();
  const visibility = new Emitter<boolean>();
  const mirrors = { onDidClose: closed.event, open: vi.fn() };
  const resume = new SidebarResume(mirrors, visibility.event);
  return { closed, visibility, mirrors, resume };
};

describe('SidebarResume', () => {
  it('reopens a sidebar mirror that was shut down while hidden', () => {
    const { closed, visibility, mirrors } = setup();
    const phone = device();
    closed.fire({ device: phone, location: 'secondarySidebar', reason: 'hidden' });
    visibility.fire(false);
    visibility.fire(true);
    visibility.fire(true);
    expect(mirrors.open).toHaveBeenCalledOnce();
    expect(mirrors.open).toHaveBeenCalledWith(phone, 'secondarySidebar');
  });

  it.each([
    ['closed on purpose', { location: 'secondarySidebar', reason: 'closed' }],
    ['hidden in an editor tab', { location: 'editor', reason: 'hidden' }],
  ] as const)('does not reopen a mirror %s', (_label, closedWith) => {
    const { closed, visibility, mirrors } = setup();
    closed.fire({ device: device(), ...closedWith });
    visibility.fire(true);
    expect(mirrors.open).not.toHaveBeenCalled();
  });

  it('forgets a pending resume when another mirror closes normally', () => {
    const { closed, visibility, mirrors } = setup();
    closed.fire({ device: device(), location: 'secondarySidebar', reason: 'hidden' });
    closed.fire({ device: device({ id: 'B' }), location: 'editor', reason: 'closed' });
    visibility.fire(true);
    expect(mirrors.open).not.toHaveBeenCalled();
  });

  it('stops listening after dispose', () => {
    const { closed, visibility, mirrors, resume } = setup();
    resume.dispose();
    closed.fire({ device: device(), location: 'secondarySidebar', reason: 'hidden' });
    visibility.fire(true);
    expect(mirrors.open).not.toHaveBeenCalled();
  });
});
