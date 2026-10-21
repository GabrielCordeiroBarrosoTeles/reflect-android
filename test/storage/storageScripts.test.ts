import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildClearStorageScript, buildReadStorageScript, buildRemoveStorageScript, buildSetStorageScript, parseStorageResult, READ_STORAGE_RESULT_SCRIPT } from '../../src/storage/storageScripts';
import { createStorageSandbox, settle } from '../fakes/storageSandbox';

const runRead = async (sandbox: ReturnType<typeof createStorageSandbox>, script = buildReadStorageScript()) => {
  await sandbox.evaluate(script);
  await settle();
  return parseStorageResult(await sandbox.evaluate(READ_STORAGE_RESULT_SCRIPT));
};

describe('storage scripts in a Metro-like runtime', () => {
  it('finds AsyncStorage among the Metro modules and reads every key sorted', async () => {
    const sandbox = createStorageSandbox({ 'user.token': 'abc', 'cart': '{"items":[1,2]}', empty: null });
    expect(await runRead(sandbox)).toEqual({
      status: 'ok',
      entries: [
        { key: 'cart', value: '{"items":[1,2]}' },
        { key: 'empty', value: null },
        { key: 'user.token', value: 'abc' },
      ],
    });
  });

  it('supports Map module registries and default exports', async () => {
    expect(await runRead(createStorageSandbox({ a: '1' }, { asMap: true, asDefault: true }))).toEqual({ status: 'ok', entries: [{ key: 'a', value: '1' }] });
  });

  it('removes a key and returns what is left, escaping the key', async () => {
    const sandbox = createStorageSandbox({ "it's": 'x', keep: 'y' });
    expect(await runRead(sandbox, buildRemoveStorageScript("it's"))).toEqual({ status: 'ok', entries: [{ key: 'keep', value: 'y' }] });
    expect(sandbox.store).toEqual({ keep: 'y' });
  });

  it('creates and updates keys with quotes and unicode, then returns everything', async () => {
    const sandbox = createStorageSandbox({ a: '1' });
    expect(await runRead(sandbox, buildSetStorageScript('perfil "ação"', '{"nome":"João \'Zé\'"}'))).toEqual({
      status: 'ok',
      entries: [
        { key: 'a', value: '1' },
        { key: 'perfil "ação"', value: '{"nome":"João \'Zé\'"}' },
      ],
    });
    await runRead(sandbox, buildSetStorageScript('a', '2'));
    expect(sandbox.store.a).toBe('2');
  });

  it('clears every key with multiRemove or one by one', async () => {
    for (const withoutMultiRemove of [false, true]) {
      const sandbox = createStorageSandbox({ a: '1', b: '2' }, { withoutMultiRemove });
      expect(await runRead(sandbox, buildClearStorageScript())).toEqual({ status: 'ok', entries: [] });
      expect(sandbox.store).toEqual({});
    }
  });

  it('reports a missing AsyncStorage and storage errors', async () => {
    const noMetro = createContext({});
    runInContext(buildReadStorageScript(), noMetro);
    expect(parseStorageResult(runInContext(READ_STORAGE_RESULT_SCRIPT, noMetro))).toEqual({ status: 'unavailable' });
    expect(await runRead(createStorageSandbox({}, { failWith: 'disk full' }))).toEqual({ status: 'error', message: 'disk full' });
  });

  it('turns synchronous failures into errors', () => {
    const context = createContext({ __r: { getModules: () => ({ 1: { isInitialized: true, publicModule: { exports: { getAllKeys: () => { throw 'boom'; }, multiGet: () => [], setItem: () => undefined, removeItem: () => undefined } } } }) } });
    runInContext(buildReadStorageScript(), context);
    expect(parseStorageResult(runInContext(READ_STORAGE_RESULT_SCRIPT, context))).toEqual({ status: 'error', message: 'boom' });
  });
});

describe('parseStorageResult', () => {
  it('parses every status and rejects anything else', () => {
    expect(parseStorageResult('{"status":"pending"}')).toEqual({ status: 'pending' });
    expect(parseStorageResult('{"status":"ok"}')).toEqual({ status: 'ok', entries: [] });
    expect(parseStorageResult('{"status":"ok","entries":[{"key":"a","value":1},{"key":"b","value":"2"},null]}')).toEqual({ status: 'ok', entries: [{ key: 'b', value: '2' }] });
    const unexpected = { status: 'error', message: 'Unexpected answer from the app' };
    expect([parseStorageResult(undefined), parseStorageResult('{'), parseStorageResult('3'), parseStorageResult('{"status":"weird"}')]).toEqual([unexpected, unexpected, unexpected, unexpected]);
  });
});
