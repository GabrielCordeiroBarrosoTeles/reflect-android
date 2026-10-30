import { describe, expect, it, vi } from 'vitest';
import { DropServices } from '../../src/mirror/DropServices';

const setup = (chosen: readonly { fsPath: string }[] | undefined) => {
  const picker = { showOpenDialog: vi.fn(() => Promise.resolve(chosen)) };
  const uris = { parse: vi.fn((value: string) => ({ fsPath: value.replace('file://', '') })) };
  const staged = { files: [], release: () => Promise.resolve() };
  const staging = { stage: vi.fn(() => Promise.resolve(staged)) };
  return { picker, uris, staging, staged, services: new DropServices(picker, uris, staging) };
};

describe('DropServices', () => {
  it('lets the user pick files and folders and returns their paths', async () => {
    const { picker, services } = setup([{ fsPath: '/a/Demo.app' }, { fsPath: '/a/pic.png' }]);
    await expect(services.pickFiles()).resolves.toEqual(['/a/Demo.app', '/a/pic.png']);
    expect(picker.showOpenDialog).toHaveBeenCalledWith({ canSelectMany: true, canSelectFiles: true, canSelectFolders: true, openLabel: 'Add to Simulator' });
  });

  it('returns nothing when the dialog is cancelled', async () => {
    await expect(setup(undefined).services.pickFiles()).resolves.toEqual([]);
  });

  it('converts a dropped uri into a file system path', () => {
    expect(setup([]).services.uriToPath('file:///a/Demo.app')).toBe('/a/Demo.app');
  });

  it('stages contents through the staging area', async () => {
    const { services, staging, staged } = setup([]);
    const contents = [{ name: 'a.png', data: new Uint8Array([1]) }];
    await expect(services.stage(contents)).resolves.toBe(staged);
    expect(staging.stage).toHaveBeenCalledWith(contents);
  });
});
