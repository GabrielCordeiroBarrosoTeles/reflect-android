import { describe, expect, it } from 'vitest';
import { DeviceLeasePool } from '../../src/device/DeviceLeasePool';
import { FakeAdbServerGateway } from '../fakes/FakeAdbServerGateway';
import { FakeLogger } from '../fakes/FakeLogger';
import { flushPromises } from '../fakes/PushStream';

const setup = () => {
  const gateway = new FakeAdbServerGateway();
  const logger = new FakeLogger();
  return { gateway, logger, pool: new DeviceLeasePool(gateway, logger), adb: gateway.client.adb };
};

describe('DeviceLeasePool', () => {
  it('shares one adb connection per serial and closes it after the last release', async () => {
    const { pool, gateway, adb } = setup();
    const first = await pool.acquire('A');
    const second = await pool.acquire('A');
    expect(first.adb).toBe(second.adb);
    expect(gateway.client.createdFor).toEqual([{ serial: 'A' }]);
    first.dispose();
    first.dispose();
    await flushPromises();
    expect(adb.closed).toBe(0);
    second.dispose();
    await flushPromises();
    expect(adb.closed).toBe(1);
  });

  it('reconnects after every lease was released', async () => {
    const { pool, gateway } = setup();
    (await pool.acquire('A')).dispose();
    await pool.acquire('A');
    expect(gateway.client.createdFor).toHaveLength(2);
  });

  it('forgets failed connections so the next acquire retries', async () => {
    const { pool, gateway } = setup();
    gateway.client.createAdbFailure = new Error('device gone');
    const results = await Promise.allSettled([pool.acquire('A'), pool.acquire('A')]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    gateway.client.createAdbFailure = undefined;
    await expect(pool.acquire('A')).resolves.toBeDefined();
  });

  it('logs close failures', async () => {
    const { pool, adb, logger } = setup();
    adb.closeFailure = new Error('socket closed');
    (await pool.acquire('A')).dispose();
    await flushPromises();
    expect(logger.errors).toEqual([{ message: 'Failed to close adb connection', error: adb.closeFailure }]);
  });

  it('closes every open connection on dispose', async () => {
    const { pool, adb } = setup();
    await pool.acquire('A');
    pool.dispose();
    await flushPromises();
    expect(adb.closed).toBe(1);
  });
});
