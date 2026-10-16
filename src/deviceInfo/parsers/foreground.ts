const ACTIVITY = /\bu\d+ ([\w.]+)\//;

export const parseForeground = (text: string): string | undefined => ACTIVITY.exec(text)?.[1];
