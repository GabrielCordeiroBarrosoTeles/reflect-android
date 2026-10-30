import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IosHelperUnavailableError } from '../../src/core/errors';
import { HelperProcess, createHelperProcessFactory } from '../../src/ios/HelperProcess';
import type { HelperFrame } from '../../src/ios/types';
import { FakeChildProcess, eventBytes, videoFrameBytes } from '../fakes/FakeHelperProcess';
import { FakeLogger } from '../fakes/FakeLogger';
import { FakeProcessRunner } from '../fakes/FakeProcessRunner';

describe('HelperProcess', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const child = new FakeChildProcess();
    const logger = new FakeLogger();
    const process = new HelperProcess(child, logger);
    const frames: HelperFrame[] = [];
    const exits: (number | null)[] = [];
    process.onFrame((frame) => frames.push(frame));
    process.onExit(({ code }) => exits.push(code));
    return { child, logger, process, frames, exits };
  };

  it('parses stdout into frames', () => {
    const { child, frames } = setup();
    child.stdout.emit(videoFrameBytes(true, 1, [1]));
    child.stdout.emit(eventBytes({ type: 'warning' }));
    expect(frames.map((frame) => frame.kind)).toEqual(['video-frame', 'event']);
  });

  it('writes commands as JSON lines', () => {
    const { child, process } = setup();
    process.send({ type: 'keyframe' });
    expect(child.written).toEqual(['{"type":"keyframe"}\n']);
  });

  it('forwards complete stderr lines to the logger', () => {
    const { child, logger } = setup();
    child.stderr.emit('first\nsec');
    child.stderr.emit('ond\n\n');
    expect(logger.infos).toEqual(['[ios-helper] first', '[ios-helper] second']);
  });

  it('reports exit once and stops writing afterwards', () => {
    const { child, process, exits } = setup();
    child.exit(2);
    child.exit(3);
    process.send({ type: 'keyframe' });
    process.dispose();
    expect(exits).toEqual([2]);
    expect(child.written).toEqual([]);
    expect(child.killed).toBe(0);
  });

  it('treats a spawn error as an exit', () => {
    const { child, logger, exits } = setup();
    child.fail(new Error('ENOENT'));
    expect(exits).toEqual([null]);
    expect(logger.errors[0]?.message).toBe('iOS helper failed');
  });

  it('sends stop on dispose and kills after one second', () => {
    const { child, process } = setup();
    process.dispose();
    process.dispose();
    expect(child.written).toEqual(['{"type":"stop"}\n']);
    vi.advanceTimersByTime(999);
    expect(child.killed).toBe(0);
    vi.advanceTimersByTime(1);
    expect(child.killed).toBe(1);
  });

  it('does not kill when the helper exits after stop', () => {
    const { child, process } = setup();
    process.dispose();
    child.exit(0);
    vi.advanceTimersByTime(5000);
    expect(child.killed).toBe(0);
  });
});

describe('createHelperProcessFactory', () => {
  const setup = (assertExecutable: (path: string) => Promise<void> = () => Promise.resolve()) => {
    const order: string[] = [];
    const runner = new FakeProcessRunner();
    runner.onRun = () => order.push('quarantine');
    const child = new FakeChildProcess();
    const spawn = vi.fn(() => {
      order.push('spawn');
      return child;
    });
    const factory = createHelperProcessFactory({
      helperPath: '/ext/reflect-sim-helper',
      assertExecutable,
      runner,
      spawn,
      logger: new FakeLogger(),
    });
    return { factory, order, spawn, runner };
  };

  it('clears quarantine before spawning with the helper arguments', async () => {
    const { factory, order, spawn } = setup();
    await factory('UDID-1');
    expect(order).toEqual(['quarantine', 'spawn']);
    expect(spawn).toHaveBeenCalledWith('/ext/reflect-sim-helper', [
      '--udid', 'UDID-1', '--fps', '60', '--bitrate', '8000000', '--max-size', '1920',
    ]);
  });

  it('rejects with IosHelperUnavailableError when the helper is missing', async () => {
    const { factory, spawn, runner } = setup(() => Promise.reject(new Error('ENOENT')));
    const failure = await factory('UDID-1').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IosHelperUnavailableError);
    expect((failure as IosHelperUnavailableError).path).toBe('/ext/reflect-sim-helper');
    expect(runner.calls).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
  });
});
