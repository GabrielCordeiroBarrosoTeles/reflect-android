// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { KeyboardInput } from '../../../src/webview/input/KeyboardInput';
import { createHarness } from './helpers';

const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit) => new KeyboardEvent(type, { cancelable: true, ...init });

const none = { shift: false, alt: false, ctrl: false, meta: false };

const setup = () => {
  const harness = createHarness();
  const inspectMode = { active: false };
  const input = new KeyboardInput(harness.canvas, harness.scheduler, harness.send, inspectMode);
  return { ...harness, input, inspectMode };
};

describe('KeyboardInput', () => {
  it('batches printable characters into a single text message per frame', () => {
    const { canvas, messages, runFrame } = setup();
    const event = key('keydown', { key: 'h', code: 'KeyH' });
    canvas.dispatchEvent(event);
    canvas.dispatchEvent(key('keydown', { key: 'i', code: 'KeyI' }));
    runFrame();
    runFrame();
    expect(event.defaultPrevented).toBe(true);
    expect(messages).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('flushes pending text before special keys and releases them on keyup', () => {
    const { canvas, messages } = setup();
    canvas.dispatchEvent(key('keydown', { key: 'a', code: 'KeyA' }));
    canvas.dispatchEvent(key('keydown', { key: 'Enter', code: 'Enter', repeat: true, shiftKey: true }));
    canvas.dispatchEvent(key('keyup', { key: 'Enter', code: 'Enter' }));
    canvas.dispatchEvent(key('keyup', { key: 'a', code: 'KeyA' }));
    expect(messages).toEqual([
      { type: 'text', text: 'a' },
      { type: 'key', input: { action: 'down', code: 'Enter', repeat: 1, modifiers: { ...none, shift: true } } },
      { type: 'key', input: { action: 'up', code: 'Enter', repeat: 0, modifiers: none } },
    ]);
  });

  it('sends non-repeating special keys with repeat 0', () => {
    const { canvas, messages } = setup();
    canvas.dispatchEvent(key('keydown', { key: 'Backspace', code: 'Backspace' }));
    expect(messages[0]).toMatchObject({ input: { repeat: 0 } });
  });

  it('pastes with Cmd+V and forwards editing shortcuts', () => {
    const { canvas, messages } = setup();
    const paste = key('keydown', { key: 'v', code: 'KeyV', metaKey: true });
    canvas.dispatchEvent(paste);
    canvas.dispatchEvent(key('keydown', { key: 'a', code: 'KeyA', ctrlKey: true }));
    expect(paste.defaultPrevented).toBe(true);
    expect(messages).toEqual([
      { type: 'paste' },
      { type: 'key', input: { action: 'down', code: 'KeyA', repeat: 0, modifiers: { ...none, ctrl: true } } },
      { type: 'key', input: { action: 'up', code: 'KeyA', repeat: 0, modifiers: { ...none, ctrl: true } } },
    ]);
  });

  it('leaves other shortcuts to VS Code', () => {
    const { canvas, messages } = setup();
    const event = key('keydown', { key: 'r', code: 'KeyR', metaKey: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(messages).toEqual([]);
  });

  it('cancels inspect mode with Escape and forwards Escape otherwise', () => {
    const { canvas, messages, inspectMode } = setup();
    inspectMode.active = true;
    const cancel = key('keydown', { key: 'Escape', code: 'Escape' });
    canvas.dispatchEvent(cancel);
    inspectMode.active = false;
    canvas.dispatchEvent(key('keydown', { key: 'Escape', code: 'Escape' }));
    expect(cancel.defaultPrevented).toBe(true);
    expect(messages.map((message) => message.type)).toEqual(['inspect-cancel', 'key']);
  });

  it('ignores composition and dead keys', () => {
    const { canvas, messages, runFrame } = setup();
    canvas.dispatchEvent(key('keydown', { key: 'Dead', code: 'KeyE', altKey: true }));
    canvas.dispatchEvent(key('keydown', { key: 'é', code: 'KeyE', isComposing: true }));
    runFrame();
    expect(messages).toEqual([]);
  });

  it('releases pressed keys on blur and on dispose', () => {
    const { canvas, messages, input } = setup();
    canvas.dispatchEvent(key('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }));
    canvas.dispatchEvent(new FocusEvent('blur'));
    canvas.dispatchEvent(key('keydown', { key: 'Tab', code: 'Tab' }));
    input.dispose();
    canvas.dispatchEvent(key('keydown', { key: 'Tab', code: 'Tab' }));
    expect(messages.map((message) => message.type === 'key' && `${message.input.action}:${message.input.code}`)).toEqual([
      'down:ArrowLeft',
      'up:ArrowLeft',
      'down:Tab',
      'up:Tab',
    ]);
  });
});
