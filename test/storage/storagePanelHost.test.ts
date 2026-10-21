import { describe, expect, it, vi } from 'vitest';
import { AddStorageKeyCommand, ClearStorageCommand, CopyStorageJsonCommand, RefreshStorageCommand } from '../../src/commands/StorageCommands';
import { Emitter } from '../../src/core/Emitter';
import { MetroUnavailableError } from '../../src/core/errors';
import { byteSize, formatBytes, imageSourceOf, jsonProblem, parseStorageValue, toEditableText, toStoredText, valueKind } from '../../src/storage/storageValue';
import { StorageTab } from '../../src/tools/StorageTab';
import type { IStorageReader, StorageResult } from '../../src/storage/types';
import { deviceInfo } from '../fakes/devices';
import { FakeActiveDeviceContext } from '../fakes/FakeActiveDeviceContext';
import { FakeClipboard } from '../fakes/FakeClipboard';
import { FakeToolsChannel } from '../fakes/FakeToolsChannel';
import { flushPromises } from '../fakes/PushStream';

const device = deviceInfo({ serial: 'A' });
const loaded = (entries: { key: string; value: string | null }[]): StorageResult => ({ status: 'ok', entries });

describe('storage values', () => {
  it('detects kinds, sizes and editable text', () => {
    expect(['{"a":1}', '[1]', 'text', '42', 'true', null, '"quoted"'].map(valueKind)).toEqual(['object', 'array', 'string', 'number', 'boolean', 'null', 'string']);
    expect([parseStorageValue(null), parseStorageValue('x')]).toEqual([null, 'x']);
    expect([byteSize('ação'), byteSize(null)]).toEqual([6, 0]);
    expect([formatBytes(12), formatBytes(1536), formatBytes(3 * 1024 * 1024)]).toEqual(['12 B', '1.5 KB', '3.0 MB']);
    expect([toEditableText('{"a":1}'), toEditableText('text'), toEditableText(null)]).toEqual(['{\n  "a": 1\n}', 'text', '']);
    expect([jsonProblem('{"a":1}'), typeof jsonProblem('{')]).toEqual([undefined, 'string']);
  });

  it('recognizes image links and inline images', () => {
    expect(imageSourceOf(' https://minio.example.com/hmlqa/driverLogo.png ')).toBe('https://minio.example.com/hmlqa/driverLogo.png');
    expect(imageSourceOf('http://cdn.example.com/a/b.JPEG?v=2#x')).toBe('http://cdn.example.com/a/b.JPEG?v=2#x');
    expect(imageSourceOf('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect([imageSourceOf('https://example.com/page'), imageSourceOf('logo.png'), imageSourceOf('javascript:alert(1).png'), imageSourceOf('https://x.com/a b.png'), imageSourceOf('data:text/html;base64,AA==')]).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it('keeps the original JSON layout when saving', () => {
    expect(toStoredText('{"a":1}', '{\n  "a": 2\n}')).toBe('{"a":2}');
    expect(toStoredText('{\n "a": 1\n}', '{\n  "a": 2\n}')).toBe('{\n  "a": 2\n}');
    expect(toStoredText('{"a":1}', '{ broken')).toBe('{ broken');
    expect(toStoredText('plain', '{"a":1}')).toBe('{"a":1}');
    expect(toStoredText(null, 'x')).toBe('x');
  });
});

const setup = (results: (StorageResult | Error | string)[] = [loaded([{ key: 'a', value: '{"x":1}' }])]) => {
  const next = () => {
    const result = results.length > 1 ? results.shift() : results[0];
    return result instanceof Error || typeof result === 'string' ? Promise.reject(result) : Promise.resolve(result as StorageResult);
  };
  const reader: IStorageReader = { readAll: vi.fn(next), remove: vi.fn(next), set: vi.fn(next), clear: vi.fn(next) };
  const context = new FakeActiveDeviceContext();
  context.mirroredDevice = device;
  const connection = new Emitter<boolean>();
  const confirm = vi.fn((_message: string, _action: string) => Promise.resolve(true));
  const notify = vi.fn();
  const channel = new FakeToolsChannel();
  const tab = new StorageTab({ reader, context, onDidChangeConnection: connection.event, confirm, notify }, channel);
  const setConnected = (value: boolean) => connection.fire(value);
  return { tab, reader, context, setConnected, confirm, notify, channel };
};

describe('StorageTab', () => {
  it('syncs its state and loads on refresh', async () => {
    const { tab, channel } = setup();
    tab.sync();
    expect(channel.posted).toEqual([{ type: 'storage-state', state: { kind: 'idle' } }]);
    await tab.refresh();
    expect(channel.posted).toContainEqual({ type: 'storage-state', state: { kind: 'loading' } });
    expect(channel.last('storage-state')).toEqual({ type: 'storage-state', state: { kind: 'loaded', entries: [{ key: 'a', value: '{"x":1}' }] } });
  });

  it('shows the idle state without a mirrored device', async () => {
    const { tab, context, channel, reader } = setup();
    context.mirroredDevice = undefined;
    await tab.refresh();
    expect(channel.last('storage-state')?.state).toEqual({ kind: 'idle' });
    expect(reader.readAll).not.toHaveBeenCalled();
  });

  it('saves and creates keys and reports them', async () => {
    const { tab, reader, channel, notify } = setup();
    await tab.write('a', '{"x":2}', false);
    await tab.write('b', 'novo', true);
    expect(reader.set).toHaveBeenCalledWith(device, 'a', '{"x":2}');
    expect(channel.posted).toContainEqual({ type: 'storage-saved', key: 'b' });
    expect(notify.mock.calls).toEqual([['Saved "a"'], ['Created "b"']]);
  });

  it('does not report a save that failed', async () => {
    const { tab, channel, notify } = setup([{ status: 'unavailable' }]);
    await tab.write('a', '1', false);
    expect(channel.last('storage-saved')).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it('deletes one key or everything only after confirmation', async () => {
    const { tab, reader, confirm } = setup();
    confirm.mockResolvedValueOnce(false);
    await tab.remove('a');
    expect(reader.remove).not.toHaveBeenCalled();
    await tab.remove('a');
    expect(reader.remove).toHaveBeenCalledWith(device, 'a');
    confirm.mockResolvedValueOnce(false);
    await tab.clear();
    expect(reader.clear).not.toHaveBeenCalled();
    await tab.clear();
    expect(reader.clear).toHaveBeenCalledWith(device);
    expect(confirm.mock.calls.map(([message, action]) => [message, action])).toEqual([
      ['Delete "a" from the app\'s AsyncStorage?', 'Delete'],
      ['Delete "a" from the app\'s AsyncStorage?', 'Delete'],
      ["Delete all 1 keys from the app's AsyncStorage?", 'Delete All'],
      ["Delete all 1 keys from the app's AsyncStorage?", 'Delete All'],
    ]);
  });

  it('explains every failure', async () => {
    const { tab, channel } = setup([{ status: 'unavailable' }, { status: 'error', message: 'boom' }, { status: 'miss' }, new MetroUnavailableError(8081), 'plain']);
    const states: unknown[] = [];
    for (let index = 0; index < 5; index += 1) {
      await tab.refresh();
      states.push(channel.last('storage-state')?.state);
    }
    expect(states).toEqual([
      { kind: 'unavailable' },
      { kind: 'failed', message: 'boom' },
      { kind: 'failed', message: 'The app did not answer in time.' },
      { kind: 'failed', message: 'Metro is not reachable on port 8081' },
      { kind: 'failed', message: 'plain' },
    ]);
  });

  it('exposes a snapshot of the loaded keys and nothing otherwise', async () => {
    const { tab } = setup([loaded([{ key: 'a', value: '{"x":1}' }, { key: 'b', value: null }]), { status: 'unavailable' }]);
    expect(tab.snapshot()).toEqual({});
    await tab.refresh();
    expect(tab.snapshot()).toEqual({ a: { x: 1 }, b: null });
    await tab.refresh();
    expect(tab.snapshot()).toEqual({});
  });

  it('follows the app connection and the device only while the tab is active', async () => {
    const { reader, context, setConnected, channel, tab } = setup();
    channel.active = 'device';
    setConnected(true);
    context.setMirroredDevice(device);
    await flushPromises();
    expect(reader.readAll).not.toHaveBeenCalled();
    channel.active = 'storage';
    setConnected(false);
    setConnected(true);
    context.setMirroredDevice(device);
    await flushPromises();
    expect(reader.readAll).toHaveBeenCalledTimes(2);
    tab.dispose();
  });

  it('ignores answers that arrive after a newer request', async () => {
    let resolveFirst: (value: StorageResult) => void = () => undefined;
    const { reader, tab, channel } = setup();
    vi.mocked(reader.readAll).mockReturnValueOnce(new Promise<StorageResult>((resolve) => (resolveFirst = resolve)));
    const first = tab.refresh();
    await tab.refresh();
    resolveFirst(loaded([{ key: 'stale', value: 'x' }]));
    await first;
    expect(channel.last('storage-state')).toEqual({ type: 'storage-state', state: { kind: 'loaded', entries: [{ key: 'a', value: '{"x":1}' }] } });
  });

  it('reveals the tab and opens the new key form', async () => {
    const { tab, channel } = setup();
    await tab.showNewKeyForm();
    expect(channel.reveal).toHaveBeenCalledWith('storage');
    expect(channel.posted.at(-1)).toEqual({ type: 'storage-new-key' });
  });
});

describe('storage commands', () => {
  it('delegates to the panel and copies the snapshot as JSON', async () => {
    const panel = { refresh: vi.fn(() => Promise.resolve()), clear: vi.fn(() => Promise.resolve()), showNewKeyForm: vi.fn(() => Promise.resolve()), snapshot: () => ({ a: 1 }) };
    const clipboard = new FakeClipboard();
    const notify = vi.fn();
    await new RefreshStorageCommand(panel).execute();
    await new AddStorageKeyCommand(panel).execute();
    await new ClearStorageCommand(panel).execute();
    await new CopyStorageJsonCommand(panel, clipboard, notify).execute();
    expect([panel.refresh, panel.showNewKeyForm, panel.clear].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
    expect(clipboard.text).toBe('{\n  "a": 1\n}');
    expect(notify).toHaveBeenCalledWith('Copied 1 AsyncStorage keys as JSON');
  });
});
