import '@vscode/codicons/dist/codicon.css';
import './styles.css';
import type { HostToWebviewMessage, LogLevel, MirrorEnvelope, WebviewToHostMessage } from '../shared/protocol';
import { preferredAcceleration, probeDecoderSupport } from './decoderSupport';
import { CanvasPointMapper } from './input/CanvasPointMapper';
import { FrameScheduler } from './input/FrameScheduler';
import { KeyboardInput } from './input/KeyboardInput';
import { PointerInput } from './input/PointerInput';
import { WheelInput } from './input/WheelInput';
import { WheelPinch } from './input/WheelPinch';
import { InspectHighlightView } from './InspectHighlightView';
import { InspectModeView } from './InspectModeView';
import { StatusOverlay } from './StatusOverlay';
import { Toolbar } from './Toolbar';
import './types';
import { VideoRenderer } from './VideoRenderer';
import { ViewOptions } from './ViewOptions';

const FRAME_REPORT_DELAY_MS = 3000;

const hostApi = acquireVsCodeApi();
let currentDeviceId: string | undefined;

const vscode = {
  postMessage: (message: WebviewToHostMessage): void => hostApi.postMessage({ deviceId: currentDeviceId, message }),
  getState: (): unknown => hostApi.getState(),
  setState: (state: unknown): void => hostApi.setState(state),
};

const log = (level: LogLevel, message: string): void => vscode.postMessage({ type: 'log', level, message });

const describeError = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

const queryElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element ${selector}`);
  }
  return element;
};

const bootstrap = async (): Promise<void> => {
  const canvas = queryElement<HTMLCanvasElement>('.screen');
  const overlay = new StatusOverlay(queryElement<HTMLElement>('.status'), (action) => vscode.postMessage({ type: action }));

  if (!VideoRenderer.isSupported) {
    log('error', 'WebCodecs VideoDecoder is not available in this webview');
    overlay.showMessage('WebCodecs unavailable', 'This editor build cannot decode H.264 video.');
    return;
  }

  const support = await probeDecoderSupport();
  log('info', `H.264 decoder support: hardware=${support.hardware} software=${support.software}`);
  if (!support.hardware && !support.software) {
    overlay.showMessage('H.264 not supported', 'This editor build has no H.264 decoder available.');
    return;
  }

  let frameReport: ReturnType<typeof setTimeout> | undefined;
  const renderer = new VideoRenderer(canvas, preferredAcceleration(support), {
    onDecoderFailure: (error) => log('error', `Decoder failure: ${describeError(error)}`),
    onResyncNeeded: () => vscode.postMessage({ type: 'resync' }),
  });

  const scheduleFrameReport = (): void => {
    clearTimeout(frameReport);
    frameReport = setTimeout(() => log('info', `Frames rendered after ${FRAME_REPORT_DELAY_MS} ms: ${renderer.framesRendered}`), FRAME_REPORT_DELAY_MS);
  };

  const toolbarRoot = queryElement<HTMLElement>('.toolbar');
  const toolbar = new Toolbar(toolbarRoot, (id) => vscode.postMessage({ type: 'action', id }));
  const viewOptions = new ViewOptions(toolbarRoot, queryElement<HTMLElement>('.stage'), canvas, vscode);
  const inspectMode = new InspectModeView(queryElement<HTMLElement>('.inspect-banner'), canvas);
  const highlight = new InspectHighlightView(
    queryElement<HTMLElement>('.inspect-highlight'),
    queryElement<HTMLElement>('.inspect-highlight__label'),
    canvas,
    inspectMode,
  );

  const handlers: { [K in HostToWebviewMessage['type']]: (message: Extract<HostToWebviewMessage, { type: K }>) => void } = {
    'inspect-mode': ({ active }) => {
      inspectMode.set(active);
      highlight.hide();
    },
    'inspect-highlight': (message) => highlight.show(message.highlight),
    'toolbar-state': ({ state }) => toolbar.update(state),
    'capture-screenshot': ({ requestId }) => {
      void renderer
        .snapshot()
        .catch(() => undefined)
        .then((data) => vscode.postMessage({ type: 'screenshot', requestId, data }));
    },
    capabilities: ({ actions }) => toolbar.setAvailable(actions),
    idle: () => {
      overlay.showIdle();
      canvas.hidden = true;
      renderer.dispose();
    },
    'session-state': ({ state, deviceName, detail, canReconnect }) => {
      overlay.show(state, deviceName, detail, canReconnect);
      canvas.hidden = state !== 'streaming';
      if (state === 'streaming') {
        scheduleFrameReport();
        return;
      }
      renderer.dispose();
    },
    'video-config': ({ config }) => {
      log('info', `Video config: ${config.width}x${config.height} codec=0x${config.codec.toString(16)}`);
      renderer.configure(config);
    },
    'video-packet': ({ packet }) => renderer.render(packet),
  };

  window.addEventListener('message', (event: MessageEvent<MirrorEnvelope<HostToWebviewMessage>>) => {
    currentDeviceId = event.data.deviceId;
    const { message } = event.data;
    (handlers[message.type] as (value: HostToWebviewMessage) => void)(message);
  });

  const send = (message: Parameters<typeof vscode.postMessage>[0]): void => vscode.postMessage(message);
  const scheduler = new FrameScheduler();
  const mapper = new CanvasPointMapper(canvas);
  const inputs = [
    new PointerInput(canvas, mapper, scheduler, send, inspectMode),
    new WheelInput(canvas, mapper, scheduler, send, new WheelPinch(scheduler, send)),
    new KeyboardInput(canvas, scheduler, send, inspectMode),
  ];

  window.addEventListener('unload', () => {
    inputs.forEach((input) => input.dispose());
    toolbar.dispose();
    highlight.dispose();
    viewOptions.dispose();
    scheduler.dispose();
    renderer.dispose();
  });

  vscode.postMessage({ type: 'ready' });
};

void bootstrap().catch((error: unknown) => log('error', `Webview bootstrap failed: ${describeError(error)}`));
