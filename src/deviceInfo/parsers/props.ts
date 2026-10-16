import type { DeviceProps } from '../types';

export const parseProps = (text: string): DeviceProps => {
  const [manufacturer = '', model = '', androidVersion = '', sdk = '', abi = ''] = text.split('\n').map((line) => line.trim());
  return { manufacturer, model, androidVersion, sdk, abi };
};
