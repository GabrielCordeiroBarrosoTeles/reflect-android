import { describe, expect, it } from 'vitest';
import { AdbServerGateway, DEFAULT_ADB_ENDPOINT } from '../../src/adb/AdbServerGateway';
import type { IAdbLocator } from '../../src/adb/types';
import { AdbNotFoundError, AdbServerUnavailableError } from '../../src/core/errors';
import { FakeAdbServerClient } from '../fakes/FakeAdbServerClient';
import { FakeProcessRunner } from '../fakes/FakeProcessRunner';

class FakeLocator implements IAdbLocator {
  calls = 0;
  failure: Error | undefined;

  locate(): Promise<string> {
    this.calls += 1;
    return this.failure ? Promise.reject(this.failure) : Promise.resolve('/sdk/adb');
  }
}

const setup = () => {
  const locator = new FakeLocator();
  const runner = new FakeProcessRunner();
  const client = new FakeAdbServerClient();
  return { locator, runner, client, gateway: new AdbServerGateway(locator, runner, client) };
};

describe('AdbServerGateway', () => {
  it('targets the standard local adb server port', () => {
    expect(DEFAULT_ADB_ENDPOINT).toEqual({ host: '127.0.0.1', port: 5037 });
  });

  it('reuses a running server without touching the adb binary', async () => {
    const { gateway, client, locator, runner } = setup();
    expect(await gateway.getClient()).toBe(client);
    expect(await gateway.getClient()).toBe(client);
    expect(locator.calls).toBe(0);
    expect(runner.calls).toEqual([]);
  });

  it('starts the server when it is not reachable', async () => {
    const { gateway, client, runner } = setup();
    client.reachable = false;
    runner.onRun = () => {
      client.reachable = true;
    };
    expect(await gateway.getClient()).toBe(client);
    expect(runner.calls).toEqual([{ executable: '/sdk/adb', args: ['start-server'] }]);
  });

  it('wraps start-server failures', async () => {
    const { gateway, client, runner } = setup();
    client.reachable = false;
    runner.failure = new Error('exit 1');
    const error = await gateway.getClient().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AdbServerUnavailableError);
    expect((error as Error).cause).toBe(runner.failure);
  });

  it('fails when the server is still unreachable after starting', async () => {
    const { gateway, client } = setup();
    client.reachable = false;
    await expect(gateway.getClient()).rejects.toBeInstanceOf(AdbServerUnavailableError);
  });

  it('propagates locator failures and retries on the next call', async () => {
    const { gateway, client, locator } = setup();
    client.reachable = false;
    locator.failure = new AdbNotFoundError([]);
    await expect(gateway.getClient()).rejects.toBeInstanceOf(AdbNotFoundError);
    client.reachable = true;
    expect(await gateway.getClient()).toBe(client);
  });
});
