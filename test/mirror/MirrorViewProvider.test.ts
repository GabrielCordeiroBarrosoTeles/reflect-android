import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MIRROR_VIEW_ID, MirrorViewProvider } from '../../src/mirror/MirrorViewProvider';
import type { WebviewToHostMessage } from '../../src/shared/protocol';
import { Emitter } from '../../src/core/Emitter';
import { device } from '../fakes/devices';
import { FakeDeviceTracker } from '../fakes/FakeDeviceTracker';
import { FakeWebviewView, commands } from '../mocks/vscode';

const phone = device({ id: 'A' });
const from = (message: WebviewToHostMessage) => ({ deviceId: undefined, message });
const idle = { deviceId: undefined, message: { type: 'idle' } };
const list = (devices: unknown[] = []) => ({ deviceId: undefined, message: { type: 'device-list', devices } });
const hidden = (value = false) => ({ deviceId: undefined, message: { type: 'simulator-hidden', hidden: value } });
const idleScreen = [idle, list(), hidden()];

const simulator = device({ id: 'UDID-1', platform: 'ios', kind: 'simulator', name: 'iPhone 15', model: undefined, detail: 'iOS 26.0' });
const item = { id: 'UDID-1', name: 'iPhone 15', detail: 'iOS 26.0', platform: 'ios', kind: 'simulator', state: 'ready' };
const emulator = device({ id: 'emulator-5554', kind: 'emulator', name: 'sdk gphone64 arm64', model: 'sdk gphone64 arm64', detail: 'sdk_gphone64_arm64' });
const emulatorItem = { id: 'emulator-5554', name: 'sdk gphone64 arm64', detail: 'sdk_gphone64_arm64', platform: 'android', kind: 'emulator', state: 'ready' };

const setup = () => {
  const discovery = new FakeDeviceTracker();
  const hiddenEmitter = new Emitter<boolean>();
  const simulatorWindow = { hidden: false, onDidChangeHidden: hiddenEmitter.event };
  const windowsEmitter = new Emitter<void>();
  const hiddenWindows = new Set<string>();
  const deviceWindows = { isHidden: (id: string) => hiddenWindows.has(id), onDidChange: windowsEmitter.event };
  const provider = new MirrorViewProvider(vscode.Uri.file('/ext'), discovery, simulatorWindow, deviceWindows);
  const view = new FakeWebviewView();
  const resolve = (target = view) => provider.resolveWebviewView(target as unknown as vscode.WebviewView);
  return { provider, view, resolve, discovery, simulatorWindow, hiddenEmitter, hiddenWindows, windowsEmitter };
};

describe('MirrorViewProvider', () => {
  it('uses the contributed view id', () => {
    expect(MIRROR_VIEW_ID).toBe('reflect.deviceView');
  });

  it('renders the mirror page when the view resolves', () => {
    const { view, resolve, provider } = setup();
    expect(provider.visible).toBe(false);
    resolve();
    expect(view.webview.options).toEqual({ enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(vscode.Uri.file('/ext'), 'dist')] });
    expect(view.webview.html).toContain('webview:/ext/dist/webview.js');
    expect(provider.visible).toBe(true);
  });

  it('shows the idle screen when the webview is ready without a device', () => {
    const { view, resolve } = setup();
    resolve();
    view.webview.received.fire(from({ type: 'ready' }));
    expect(view.webview.posted).toEqual(idleScreen);
  });

  it('lets the claimed device own the webview', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const surface = provider.claim(phone);
    const messages = vi.fn();
    surface.channel.onMessage(messages);
    view.webview.received.fire(from({ type: 'ready' }));
    expect(view.webview.posted).toEqual([]);
    expect(messages).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('stamps posts with the device that claims the sidebar and clears it on release', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const surface = provider.claim(phone);
    surface.channel.post({ type: 'toolbar-state', state: { recordingSince: undefined, screenOff: false } });
    surface.dispose();
    expect(view.webview.posted).toEqual([
      { deviceId: 'A', message: { type: 'toolbar-state', state: { recordingSince: undefined, screenOff: false } } },
      ...idleScreen,
    ]);
  });

  it('runs the open device command from the idle screen', () => {
    const { view, resolve } = setup();
    resolve();
    view.webview.received.fire(from({ type: 'open-device' }));
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.openDevice');
  });

  it('runs the open device command with the row id', () => {
    const { view, resolve } = setup();
    resolve();
    view.webview.received.fire(from({ type: 'open-device', deviceId: 'UDID-1' }));
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.openDevice', 'UDID-1');
  });

  it('boots a simulator and shows the Simulator app on request', () => {
    const { view, resolve } = setup();
    resolve();
    view.webview.received.fire(from({ type: 'boot-device', deviceId: 'UDID-1' }));
    view.webview.received.fire(from({ type: 'show-in-simulator' }));
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.bootSimulator', 'UDID-1');
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.showInSimulator');
  });

  it('posts the device list to the idle screen whenever discovery changes', () => {
    const { view, resolve, discovery } = setup();
    resolve();
    discovery.setDevices([simulator]);
    expect(view.webview.posted).toEqual([list([item])]);
  });

  it('marks rows whose window Reflect hid and posts the list again when that changes', () => {
    const { view, resolve, discovery, hiddenWindows, windowsEmitter } = setup();
    resolve();
    discovery.setDevices([emulator, simulator]);
    hiddenWindows.add('emulator-5554');
    windowsEmitter.fire();
    expect(view.webview.posted).toEqual([list([emulatorItem, item]), list([{ ...emulatorItem, windowHidden: true }, item])]);
  });

  it('shows a device window again on request', () => {
    const { view, resolve } = setup();
    resolve();
    view.webview.received.fire(from({ type: 'show-device-window', deviceId: 'emulator-5554' }));
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.showDeviceWindow', 'emulator-5554');
  });

  it('posts the Simulator window state to the idle screen', () => {
    const { view, resolve, hiddenEmitter, simulatorWindow } = setup();
    resolve();
    simulatorWindow.hidden = true;
    hiddenEmitter.fire(true);
    expect(view.webview.posted).toEqual([hidden(true)]);
  });

  it('leaves the webview alone while a device owns it', () => {
    const { view, resolve, discovery, hiddenEmitter, windowsEmitter, provider } = setup();
    resolve();
    provider.claim(phone);
    discovery.setDevices([simulator]);
    hiddenEmitter.fire(true);
    windowsEmitter.fire();
    expect(view.webview.posted).toEqual([]);
  });

  it('stops listening to discovery after dispose', () => {
    const { view, resolve, discovery, windowsEmitter, provider } = setup();
    resolve();
    provider.dispose();
    discovery.setDevices([simulator]);
    windowsEmitter.fire();
    expect(view.webview.posted).toEqual([]);
  });

  it('reveals the view through its focus command', () => {
    setup().provider.reveal();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.deviceView.focus');
  });

  it('reports visibility changes and treats a disposed view as hidden', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const changes: boolean[] = [];
    provider.onDidChangeVisibility((visible) => changes.push(visible));
    view.setVisible(false);
    view.dispose();
    expect(changes).toEqual([false, false]);
    expect(provider.visible).toBe(false);
  });

  it('switches to a new webview when the view resolves again', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const next = new FakeWebviewView();
    resolve(next);
    const changes: boolean[] = [];
    provider.onDidChangeVisibility((visible) => changes.push(visible));
    view.setVisible(false);
    provider.channel.post({ type: 'idle' });
    expect(changes).toEqual([]);
    expect(next.webview.posted).toEqual([idle]);
  });

  it('releases the previous owner when a new device claims the sidebar', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const first = provider.claim(phone);
    const closed = vi.fn();
    first.onDidDispose(closed);
    provider.claim(phone);
    expect(closed).toHaveBeenCalledOnce();
    expect(view.webview.posted).toEqual([]);
  });

  it('returns to the idle screen when the owner releases the sidebar', () => {
    const { view, resolve, provider } = setup();
    resolve();
    provider.claim(phone).dispose();
    view.webview.received.fire(from({ type: 'ready' }));
    expect(view.webview.posted).toEqual([...idleScreen, ...idleScreen]);
  });

  it('releases the owner and the view on dispose', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const surface = provider.claim(phone);
    const closed = vi.fn();
    surface.onDidDispose(closed);
    provider.dispose();
    view.webview.received.fire(from({ type: 'open-device' }));
    expect(closed).toHaveBeenCalledOnce();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });
});
