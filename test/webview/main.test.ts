// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../src/shared/protocol';
import { flushPromises } from '../fakes/PushStream';

const fakes = vi.hoisted(() => ({
  supported: true,
  support: { hardware: true, software: true },
  renderers: [] as {
    acceleration: string;
    listener: { onDecoderFailure(error: unknown): void; onResyncNeeded(): void };
    configured: unknown[];
    rendered: unknown[];
    disposed: number;
    framesRendered: number;
  }[],
}));

vi.mock('../../src/webview/VideoRenderer', () => ({
  VideoRenderer: class {
    static get isSupported() {
      return fakes.supported;
    }
    configured: unknown[] = [];
    rendered: unknown[] = [];
    disposed = 0;
    framesRendered = 12;
    snapshotResult: Promise<Uint8Array | undefined> = Promise.resolve(new Uint8Array([4]));
    snapshot() {
      return this.snapshotResult;
    }
    constructor(
      readonly canvas: HTMLCanvasElement,
      readonly acceleration: string,
      readonly listener: never,
    ) {
      fakes.renderers.push(this as never);
    }
    configure(config: unknown) {
      this.configured.push(config);
    }
    render(packet: unknown) {
      this.rendered.push(packet);
    }
    dispose() {
      this.disposed += 1;
    }
  },
}));

vi.mock('../../src/webview/decoderSupport', () => ({
  probeDecoderSupport: () => Promise.resolve(fakes.support),
  preferredAcceleration: (support: { hardware: boolean }) => (support.hardware ? 'prefer-hardware' : 'no-preference'),
}));

const MARKUP =
  '<nav class="toolbar"></nav><div class="inspect-banner" hidden></div><main class="stage"><canvas class="screen" hidden></canvas><div class="inspect-highlight" hidden><span class="inspect-highlight__label"></span></div><div class="status"><span class="status__title"></span><span class="status__detail"></span><button class="status__action" hidden></button></div></main>';

const boot = async (markup = MARKUP) => {
  document.body.innerHTML = markup;
  const posted: WebviewToHostMessage[] = [];
  vi.stubGlobal('acquireVsCodeApi', () => ({
    postMessage: (message: WebviewToHostMessage) => posted.push(message),
    getState: () => undefined,
    setState: vi.fn(),
  }));
  vi.resetModules();
  await import('../../src/webview/main');
  await flushPromises();
  return { posted, canvas: document.querySelector<HTMLCanvasElement>('.screen'), title: () => document.querySelector('.status__title')?.textContent };
};

const deliver = (message: HostToWebviewMessage) => window.dispatchEvent(new MessageEvent('message', { data: message }));

beforeEach(() => {
  fakes.supported = true;
  fakes.support = { hardware: true, software: true };
  fakes.renderers.length = 0;
});

describe('webview main', () => {
  it('reports decoder support and announces readiness', async () => {
    const { posted } = await boot();
    expect(posted).toEqual([
      { type: 'log', level: 'info', message: 'H.264 decoder support: hardware=true software=true' },
      { type: 'ready' },
    ]);
    expect(fakes.renderers[0]?.acceleration).toBe('prefer-hardware');
  });

  it('explains when WebCodecs is unavailable', async () => {
    fakes.supported = false;
    const { posted, title } = await boot();
    expect(title()).toBe('WebCodecs unavailable');
    expect(posted).toEqual([{ type: 'log', level: 'error', message: 'WebCodecs VideoDecoder is not available in this webview' }]);
  });

  it('explains when no H.264 decoder exists', async () => {
    fakes.support = { hardware: false, software: false };
    const { posted, title } = await boot();
    expect(title()).toBe('H.264 not supported');
    expect(posted.some((message) => message.type === 'ready')).toBe(false);
  });

  it('routes host messages to the overlay and the renderer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { posted, canvas, title } = await bootWithRealTimersForImport();
    const renderer = fakes.renderers[0]!;
    deliver({ type: 'session-state', state: 'connecting', deviceName: 'Pixel' });
    expect(title()).toBe('Connecting…');
    expect(canvas?.hidden).toBe(true);
    expect(renderer.disposed).toBe(1);
    deliver({ type: 'video-config', config: { codec: 0x68323634, width: 1080, height: 2400 } });
    deliver({ type: 'video-packet', packet: { kind: 'configuration', data: new Uint8Array([1]), keyframe: undefined, pts: undefined } });
    deliver({ type: 'session-state', state: 'streaming', deviceName: 'Pixel' });
    deliver({ type: 'session-state', state: 'streaming', deviceName: 'Pixel' });
    expect(canvas?.hidden).toBe(false);
    expect(renderer.configured).toHaveLength(1);
    expect(renderer.rendered).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(posted).toContainEqual({ type: 'log', level: 'info', message: 'Video config: 1080x2400 codec=0x68323634' });
    expect(posted.filter((message) => message.type === 'log' && message.message.startsWith('Frames rendered'))).toEqual([
      { type: 'log', level: 'info', message: 'Frames rendered after 3000 ms: 12' },
    ]);
    vi.useRealTimers();
  });

  it('reports decoder failures and resync requests to the host', async () => {
    const { posted } = await boot();
    const { listener } = fakes.renderers[0]!;
    listener.onDecoderFailure(new TypeError('bad frame'));
    listener.onDecoderFailure('weird');
    listener.onResyncNeeded();
    expect(posted.slice(-3)).toEqual([
      { type: 'log', level: 'error', message: 'Decoder failure: TypeError: bad frame' },
      { type: 'log', level: 'error', message: 'Decoder failure: weird' },
      { type: 'resync' },
    ]);
  });

  it('forwards input from the canvas', async () => {
    const { posted, canvas } = await boot();
    canvas?.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', metaKey: true, cancelable: true }));
    expect(posted.at(-1)).toEqual({ type: 'paste' });
  });

  it('shows the idle screen and asks the host to open a device', async () => {
    const { posted, canvas, title } = await boot();
    deliver({ type: 'session-state', state: 'streaming', deviceName: 'Pixel' });
    deliver({ type: 'idle' });
    expect(title()).toBe('No device mirrored');
    expect(canvas?.hidden).toBe(true);
    expect(fakes.renderers[0]?.disposed).toBe(1);
    document.querySelector<HTMLButtonElement>('.status__action')?.click();
    expect(posted.at(-1)).toEqual({ type: 'open-device' });
  });

  it('toggles inspect mode from the host and reports inspect clicks', async () => {
    const { posted, canvas } = await boot();
    deliver({ type: 'inspect-mode', active: true });
    expect(document.querySelector<HTMLElement>('.inspect-banner')?.hidden).toBe(false);
    canvas?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', cancelable: true }));
    expect(posted.at(-1)).toEqual({ type: 'inspect-cancel' });
  });

  it('draws the hovered component and clears it when inspect mode ends', async () => {
    const { canvas } = await boot();
    const box = document.querySelector<HTMLElement>('.inspect-highlight');
    deliver({ type: 'inspect-mode', active: true });
    canvas?.dispatchEvent(new PointerEvent('pointermove'));
    deliver({ type: 'inspect-highlight', highlight: { name: 'Text', owner: undefined, location: undefined, x: 0, y: 0.5, width: 1, height: 0.1, margin: { top: 0, right: 0, bottom: 0, left: 0 }, padding: { top: 0, right: 0, bottom: 0, left: 0 } } });
    expect(box?.hidden).toBe(false);
    expect(box?.textContent).toBe('<Text>');
    deliver({ type: 'inspect-mode', active: false });
    expect(box?.hidden).toBe(true);
  });

  it('renders the toolbar, sends actions and reflects its state', async () => {
    const { posted } = await boot();
    document.querySelector<HTMLButtonElement>('[aria-label="Home"]')?.click();
    deliver({ type: 'toolbar-state', state: { recordingSince: undefined, screenOff: true } });
    expect(posted.at(-1)).toEqual({ type: 'action', id: 'home' });
    expect(document.querySelector('[aria-label="Turn Device Screen On/Off"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('answers screenshot requests with the decoded frame, or nothing on failure', async () => {
    const { posted } = await boot();
    deliver({ type: 'capture-screenshot', requestId: 3 });
    await vi.waitFor(() => expect(posted.at(-1)).toEqual({ type: 'screenshot', requestId: 3, data: new Uint8Array([4]) }));
    (fakes.renderers[0] as unknown as { snapshotResult: Promise<unknown> }).snapshotResult = Promise.reject(new Error('no frame'));
    deliver({ type: 'capture-screenshot', requestId: 4 });
    await vi.waitFor(() => expect(posted.at(-1)).toEqual({ type: 'screenshot', requestId: 4, data: undefined }));
  });

  it('asks the host to reconnect from the overlay', async () => {
    const { posted } = await boot();
    deliver({ type: 'session-state', state: 'disconnected', deviceName: 'Pixel', detail: 'gone', canReconnect: true });
    document.querySelector<HTMLButtonElement>('.status__action')?.click();
    expect(posted.at(-1)).toEqual({ type: 'reconnect' });
  });

  it('toggles the device frame from the toolbar', async () => {
    await boot();
    document.querySelector<HTMLButtonElement>('[aria-label="Show Device Frame"]')?.click();
    expect(document.querySelector('.stage')?.classList.contains('stage--framed')).toBe(true);
  });

  it('releases everything on unload', async () => {
    await boot();
    window.dispatchEvent(new Event('unload'));
    expect(fakes.renderers[0]?.disposed).toBe(1);
  });

  it('logs bootstrap failures when the markup is incomplete', async () => {
    const { posted } = await boot('<div></div>');
    expect(posted).toEqual([{ type: 'log', level: 'error', message: 'Webview bootstrap failed: Error: Missing element .screen' }]);
  });
});

async function bootWithRealTimersForImport() {
  vi.useRealTimers();
  const result = await boot();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return result;
}
