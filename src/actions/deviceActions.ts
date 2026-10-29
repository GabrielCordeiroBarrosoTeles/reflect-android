import type { ActionId } from '../shared/actions';
import type { ActionContext, DeviceAction } from './types';

const NO_MODIFIERS = { shift: false, alt: false, ctrl: false, meta: false };

const reload = async ({ device, control, services }: ActionContext): Promise<void> => {
  if (await services.reloadApp(device)) {
    return;
  }
  for (let press = 0; press < 2; press += 1) {
    await control.key({ action: 'down', code: 'KeyR', repeat: 0, modifiers: NO_MODIFIERS });
    await control.key({ action: 'up', code: 'KeyR', repeat: 0, modifiers: NO_MODIFIERS });
  }
};

const reverseMetro = async ({ device, services }: ActionContext): Promise<void> => {
  const port = await services.reverseMetro(device);
  services.notify(`adb reverse tcp:${port} is active`);
};

export const DEVICE_ACTIONS: Readonly<Record<ActionId, DeviceAction>> = {
  back: ({ control }) => control.pressButton('back'),
  home: ({ control }) => control.pressButton('home'),
  recents: ({ control }) => control.pressButton('recents'),
  rotate: ({ control }) => control.rotate(),
  screenPower: ({ mirror }) => mirror.toggleScreenPower(),
  screenshot: ({ mirror }) => mirror.takeScreenshot(),
  record: ({ mirror }) => mirror.toggleRecording(),
  devMenu: ({ control }) => control.pressButton('menu'),
  reload,
  reverseMetro,
};
