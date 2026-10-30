import { describe, expect, it, vi } from 'vitest';
import { DropStaging } from '../../src/mirror/DropStaging';

const setup = () => {
  const fs = {
    mkdir: vi.fn((_path: string) => Promise.resolve()),
    writeFile: vi.fn((_path: string, _data: Uint8Array) => Promise.resolve()),
    rm: vi.fn((_path: string) => Promise.resolve()),
  };
  const staging = new DropStaging('/tmp', () => 'uuid-1', fs);
  return { fs, staging };
};

describe('DropStaging', () => {
  it('writes each file under reflect-drops/<uuid>/<name> and returns their paths', async () => {
    const { fs, staging } = setup();
    const staged = await staging.stage([
      { name: 'a.png', data: new Uint8Array([1]) },
      { name: 'b.mov', data: new Uint8Array([2]) },
    ]);
    expect(fs.mkdir).toHaveBeenCalledWith('/tmp/reflect-drops/uuid-1');
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/reflect-drops/uuid-1/a.png', new Uint8Array([1]));
    expect(staged.files).toEqual([
      { name: 'a.png', path: '/tmp/reflect-drops/uuid-1/a.png' },
      { name: 'b.mov', path: '/tmp/reflect-drops/uuid-1/b.mov' },
    ]);
  });

  it('strips directories from dropped names so nothing escapes the drop folder', async () => {
    const { fs, staging } = setup();
    const staged = await staging.stage([{ name: '../../evil.png', data: new Uint8Array([1]) }]);
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/reflect-drops/uuid-1/evil.png', expect.anything());
    expect(staged.files[0]?.name).toBe('evil.png');
  });

  it('removes the drop folder on release', async () => {
    const { fs, staging } = setup();
    const staged = await staging.stage([{ name: 'a.png', data: new Uint8Array([1]) }]);
    await staged.release();
    expect(fs.rm).toHaveBeenCalledWith('/tmp/reflect-drops/uuid-1');
  });

  it('touches nothing for an empty drop', async () => {
    const { fs, staging } = setup();
    const staged = await staging.stage([]);
    await staged.release();
    expect(staged.files).toEqual([]);
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.rm).not.toHaveBeenCalled();
  });

  it('cleans up the folder when writing fails', async () => {
    const { fs, staging } = setup();
    fs.writeFile.mockRejectedValueOnce(new Error('disk full'));
    await expect(staging.stage([{ name: 'a.png', data: new Uint8Array([1]) }])).rejects.toThrow('disk full');
    expect(fs.rm).toHaveBeenCalledWith('/tmp/reflect-drops/uuid-1');
  });

  it('still reports the write failure when the cleanup also fails', async () => {
    const { fs, staging } = setup();
    fs.writeFile.mockRejectedValueOnce(new Error('disk full'));
    fs.rm.mockRejectedValueOnce(new Error('busy'));
    await expect(staging.stage([{ name: 'a.png', data: new Uint8Array([1]) }])).rejects.toThrow('disk full');
  });
});
