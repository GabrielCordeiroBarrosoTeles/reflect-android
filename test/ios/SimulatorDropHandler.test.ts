import { describe, expect, it, vi } from 'vitest';
import { SimulatorDropHandler } from '../../src/ios/SimulatorDropHandler';
import type { ISimctl } from '../../src/ios/types';

const UDID = 'UDID-1';

const setup = () => {
  const run = vi.fn((_args: readonly string[]) => Promise.resolve(''));
  const simctl: ISimctl = { run, screenshot: () => Promise.resolve(new Uint8Array()) };
  return { run, handler: new SimulatorDropHandler(simctl) };
};

const file = (name: string, directory = '/drop') => ({ name, path: `${directory}/${name}` });

describe('SimulatorDropHandler', () => {
  it.each([
    ['Demo.app', ['install', UDID, '/drop/Demo.app']],
    ['build.ipa', ['install', UDID, '/drop/build.ipa']],
    ['shot.png', ['addmedia', UDID, '/drop/shot.png']],
    ['shot.JPG', ['addmedia', UDID, '/drop/shot.JPG']],
    ['shot.jpeg', ['addmedia', UDID, '/drop/shot.jpeg']],
    ['shot.heic', ['addmedia', UDID, '/drop/shot.heic']],
    ['anim.gif', ['addmedia', UDID, '/drop/anim.gif']],
    ['clip.mov', ['addmedia', UDID, '/drop/clip.mov']],
    ['clip.mp4', ['addmedia', UDID, '/drop/clip.mp4']],
    ['clip.m4v', ['addmedia', UDID, '/drop/clip.m4v']],
    ['ca.pem', ['keychain', UDID, 'add-root-cert', '/drop/ca.pem']],
    ['ca.cer', ['keychain', UDID, 'add-root-cert', '/drop/ca.cer']],
    ['ca.crt', ['keychain', UDID, 'add-root-cert', '/drop/ca.crt']],
    ['ca.der', ['keychain', UDID, 'add-root-cert', '/drop/ca.der']],
  ])('routes %s to simctl', async (name, args) => {
    const { run, handler } = setup();
    const result = await handler.add(UDID, [file(name)]);
    expect(run).toHaveBeenCalledExactlyOnceWith(args);
    expect(result.added).toEqual([file(name)]);
    expect(result.unsupported).toEqual([]);
  });

  it('batches consecutive media into one addmedia call', async () => {
    const { run, handler } = setup();
    await handler.add(UDID, [file('a.png'), file('b.jpg'), file('c.mov')]);
    expect(run).toHaveBeenCalledExactlyOnceWith(['addmedia', UDID, '/drop/a.png', '/drop/b.jpg', '/drop/c.mov']);
  });

  it('keeps the drop order across kinds', async () => {
    const { run, handler } = setup();
    await handler.add(UDID, [file('a.png'), file('Demo.app'), file('b.jpg'), file('ca.pem')]);
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ['addmedia', UDID, '/drop/a.png'],
      ['install', UDID, '/drop/Demo.app'],
      ['addmedia', UDID, '/drop/b.jpg'],
      ['keychain', UDID, 'add-root-cert', '/drop/ca.pem'],
    ]);
  });

  it('summarises what was added', async () => {
    const { handler } = setup();
    const result = await handler.add(UDID, [file('Demo.app'), file('a.png'), file('b.png'), file('c.mov')]);
    expect(result.message).toBe('Installed 1 app, added 3 photos/videos');
  });

  it('pluralises apps, singularises media and mentions certificates', async () => {
    const { handler } = setup();
    expect((await handler.add(UDID, [file('a.app'), file('b.ipa'), file('x.png'), file('ca.der'), file('ca2.pem')])).message).toBe(
      'Installed 2 apps, added 1 photo/video, added 2 certificates',
    );
    expect((await handler.add(UDID, [file('ca.pem')])).message).toBe('Added 1 certificate');
    expect((await handler.add(UDID, [file('x.png'), file('y.png')])).message).toBe('Added 2 photos/videos');
  });

  it('reports unsupported files without calling simctl for them', async () => {
    const { run, handler } = setup();
    const result = await handler.add(UDID, [file('notes.txt')]);
    expect(run).not.toHaveBeenCalled();
    expect(result.added).toEqual([]);
    expect(result.unsupported).toEqual([file('notes.txt')]);
    expect(result.message).toBe("Reflect can't add notes.txt to the simulator");
  });

  it('combines the summary with the unsupported message', async () => {
    const { handler } = setup();
    const result = await handler.add(UDID, [file('a.png'), file('notes.txt'), file('data')]);
    expect(result.message).toBe("Added 1 photo/video. Reflect can't add notes.txt, data to the simulator");
  });

  it('returns an empty message when nothing was dropped', async () => {
    const { handler } = setup();
    expect((await handler.add(UDID, [])).message).toBe('');
  });

  it('propagates a simctl failure', async () => {
    const { run, handler } = setup();
    run.mockRejectedValueOnce(new Error('install failed'));
    await expect(handler.add(UDID, [file('Demo.app')])).rejects.toThrow('install failed');
  });
});
