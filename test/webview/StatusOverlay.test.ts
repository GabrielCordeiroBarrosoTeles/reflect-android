// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceListItem } from '../../src/shared/protocol';
import { StatusOverlay } from '../../src/webview/StatusOverlay';

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML =
    '<div class="status"><span class="status__title"></span><span class="status__detail"></span><div class="status__devices"></div><button class="status__action" hidden></button><button class="status__link" hidden>Show in Simulator</button></div>';
  root = document.querySelector<HTMLElement>('.status')!;
});

const text = (selector: string) => root.querySelector(selector)?.textContent;

const item = (overrides: Partial<DeviceListItem>): DeviceListItem => ({
  id: 'A',
  name: 'Pixel 8',
  detail: 'husky',
  platform: 'android',
  kind: 'physical',
  state: 'ready',
  ...overrides,
});

const DEVICES: readonly DeviceListItem[] = [
  item({ id: 'SIM-OFF', name: 'iPhone SE', detail: 'iOS 26.0', platform: 'ios', kind: 'simulator', state: 'shutdown' }),
  item({ id: 'EMU', name: 'Pixel_7_API_34', kind: 'emulator', detail: undefined as never }),
  item({ id: 'SIM-ON', name: 'iPhone 15', detail: 'iOS 26.0', platform: 'ios', kind: 'simulator' }),
  item({ id: 'PHONE' }),
  item({ id: 'LOCKED', name: 'Galaxy', state: 'unauthorized' }),
];

const groups = () => [...root.querySelectorAll('.status__group')].map((group) => group.querySelector('.status__group-title')?.textContent);
const rows = (group: number) =>
  [...(root.querySelectorAll('.status__group')[group]?.querySelectorAll('.status__row') ?? [])].map((row) => ({
    name: row.querySelector('.status__row-name')?.textContent,
    detail: row.querySelector('.status__row-detail')?.textContent,
    button: row.querySelector('button')?.textContent ?? null,
  }));

describe('StatusOverlay', () => {
  it('shows connection states with the device name', () => {
    new StatusOverlay(root, () => undefined).show('connecting', 'Pixel 8');
    expect(root.hidden).toBe(false);
    expect(root.dataset.state).toBe('connecting');
    expect(text('.status__title')).toBe('Connecting…');
    expect(text('.status__detail')).toBe('Pixel 8');
  });

  it('prefers the detail over the device name', () => {
    new StatusOverlay(root, () => undefined).show('error', 'Pixel 8', 'server crashed');
    expect(text('.status__title')).toBe('Unable to mirror');
    expect(text('.status__detail')).toBe('server crashed');
  });

  it('hides while streaming', () => {
    new StatusOverlay(root, () => undefined).show('streaming', 'Pixel 8');
    expect(root.hidden).toBe(true);
  });

  it('shows arbitrary messages as errors', () => {
    new StatusOverlay(root, () => undefined).showMessage('WebCodecs unavailable', 'no decoder');
    expect(root.hidden).toBe(false);
    expect(root.dataset.state).toBe('error');
    expect(text('.status__title')).toBe('WebCodecs unavailable');
  });

  it('shows the idle screen with its action and hides the action afterwards', () => {
    const onAction = vi.fn();
    const overlay = new StatusOverlay(root, onAction);
    const action = root.querySelector<HTMLButtonElement>('.status__action')!;
    overlay.showIdle();
    expect(root.dataset.state).toBe('idle');
    expect(text('.status__title')).toBe('No device mirrored');
    expect(action.hidden).toBe(false);
    action.click();
    expect(onAction).toHaveBeenCalledOnce();
    overlay.show('connecting', 'Pixel 8');
    expect(action.hidden).toBe(true);
  });

  it('offers a reconnect action after giving up', () => {
    const onAction = vi.fn();
    const overlay = new StatusOverlay(root, onAction);
    const action = root.querySelector<HTMLButtonElement>('.status__action')!;
    overlay.show('disconnected', 'Pixel 8', 'Device not found', true);
    expect(action.hidden).toBe(false);
    expect(action.textContent).toBe('Reconnect');
    action.click();
    expect(onAction).toHaveBeenCalledWith('reconnect');
    overlay.showIdle();
    expect(action.textContent).toBe('Open Device');
    action.click();
    expect(onAction).toHaveBeenLastCalledWith('open-device');
  });

  it('lists devices in groups with Bring to Reflect or Boot per state when idle', () => {
    const overlay = new StatusOverlay(root, () => undefined);
    overlay.setDevices(DEVICES);
    overlay.showIdle();
    expect(text('.status__title')).toBe('No device mirrored');
    expect(groups()).toEqual(['Android devices', 'Android Emulators', 'iOS Simulators']);
    expect(rows(0)).toEqual([
      { name: 'Pixel 8', detail: 'husky', button: 'Bring to Reflect' },
      { name: 'Galaxy', detail: 'unauthorized', button: null },
    ]);
    expect(rows(1)).toEqual([{ name: 'Pixel_7_API_34', detail: '', button: 'Bring to Reflect' }]);
    expect(rows(2)).toEqual([
      { name: 'iPhone 15', detail: 'iOS 26.0', button: 'Bring to Reflect' },
      { name: 'iPhone SE', detail: 'iOS 26.0', button: 'Boot' },
    ]);
    expect(root.querySelector<HTMLButtonElement>('.status__action')?.hidden).toBe(true);
  });

  it('posts open-device with the row id and boot-device for shut-down simulators', () => {
    const onAction = vi.fn();
    const overlay = new StatusOverlay(root, onAction);
    overlay.setDevices(DEVICES);
    overlay.showIdle();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.status__row button')];
    buttons.find((button) => button.dataset.deviceId === 'SIM-ON')?.click();
    expect(onAction).toHaveBeenLastCalledWith('open-device', 'SIM-ON');
    buttons.find((button) => button.dataset.deviceId === 'SIM-OFF')?.click();
    expect(onAction).toHaveBeenLastCalledWith('boot-device', 'SIM-OFF');
  });

  it('re-renders the list when it changes while idle and falls back to the empty state', () => {
    const overlay = new StatusOverlay(root, () => undefined);
    overlay.showIdle();
    expect(groups()).toEqual([]);
    overlay.setDevices([item({})]);
    expect(groups()).toEqual(['Android devices']);
    overlay.setDevices([]);
    expect(groups()).toEqual([]);
    expect(text('.status__detail')).toBe('Connect a phone via USB with USB debugging on.');
    expect(root.querySelector<HTMLButtonElement>('.status__action')?.hidden).toBe(false);
  });

  it('does not touch the screen when the list changes outside the idle view', () => {
    const overlay = new StatusOverlay(root, () => undefined);
    overlay.show('connecting', 'Pixel 8');
    overlay.setDevices([item({})]);
    expect(groups()).toEqual([]);
    expect(text('.status__title')).toBe('Connecting…');
    overlay.showIdle();
    expect(groups()).toEqual(['Android devices']);
    overlay.show('streaming', 'Pixel 8');
    expect(groups()).toEqual([]);
  });

  it('offers Show in Simulator only in the idle view while the Simulator app is hidden', () => {
    const onAction = vi.fn();
    const overlay = new StatusOverlay(root, onAction);
    const link = root.querySelector<HTMLButtonElement>('.status__link')!;
    overlay.showIdle();
    expect(link.hidden).toBe(true);
    overlay.setSimulatorHidden(true);
    expect(link.hidden).toBe(false);
    link.click();
    expect(onAction).toHaveBeenCalledWith('show-in-simulator');
    overlay.show('connecting', 'iPhone 15');
    expect(link.hidden).toBe(true);
    overlay.showIdle();
    expect(link.hidden).toBe(false);
    overlay.setSimulatorHidden(false);
    expect(link.hidden).toBe(true);
  });

  it('requires its child elements', () => {
    expect(() => new StatusOverlay(document.createElement('div'), () => undefined)).toThrow('Missing element .status__title');
  });
});
