// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DropTarget, MAX_DROPPED_FILE_BYTES } from '../../src/webview/DropTarget';

interface FakeTransfer {
  types: string[];
  files: File[];
  data: Record<string, string>;
  dropEffect: string;
  getData(type: string): string;
}

const transfer = (init: { types?: string[]; files?: File[]; data?: Record<string, string> } = {}): FakeTransfer => {
  const data = init.data ?? {};
  return {
    types: init.types ?? [...Object.keys(data), ...(init.files?.length ? ['Files'] : [])],
    files: init.files ?? [],
    data,
    dropEffect: 'none',
    getData: (type) => data[type] ?? '',
  };
};

const fire = (target: Element, type: string, dataTransfer: FakeTransfer, relatedTarget: EventTarget | null = null): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer, relatedTarget });
  target.dispatchEvent(event);
  return event;
};

const fileOf = (name: string, bytes: number[] = [1, 2]) => new File([new Uint8Array(bytes)], name);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (enabled = true) => {
  document.body.innerHTML = '<div class="stage"><canvas class="screen"></canvas></div>';
  const stage = document.querySelector<HTMLElement>('.stage')!;
  const onDrop = vi.fn();
  const onError = vi.fn();
  const target = new DropTarget(stage, onDrop, onError);
  target.setEnabled(enabled);
  return { stage, canvas: stage.querySelector('.screen')!, target, onDrop, onError };
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('DropTarget', () => {
  it('highlights the stage while files are dragged over it and accepts the drop as a copy', () => {
    const { stage } = setup();
    const dt = transfer({ files: [fileOf('a.png')] });
    const event = fire(stage, 'dragenter', dt);
    expect(event.defaultPrevented).toBe(true);
    expect(stage.classList.contains('stage--drop')).toBe(true);
    fire(stage, 'dragover', dt);
    expect(dt.dropEffect).toBe('copy');
  });

  it.each(['text/uri-list', 'application/vnd.code.uri-list'])('also reacts to %s drags from the Explorer', (type) => {
    const { stage } = setup();
    fire(stage, 'dragover', transfer({ data: { [type]: 'file:///a/Demo.app' } }));
    expect(stage.classList.contains('stage--drop')).toBe(true);
  });

  it('ignores drags that carry nothing it understands', () => {
    const { stage } = setup();
    const event = fire(stage, 'dragover', transfer({ types: ['text/plain'] }));
    expect(event.defaultPrevented).toBe(false);
    expect(stage.classList.contains('stage--drop')).toBe(false);
  });

  it('ignores drags without a data transfer', () => {
    const { stage } = setup();
    const event = new Event('dragover', { cancelable: true });
    stage.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing while disabled', () => {
    const { stage, onDrop } = setup(false);
    const dt = transfer({ files: [fileOf('a.png')] });
    expect(fire(stage, 'dragover', dt).defaultPrevented).toBe(false);
    expect(fire(stage, 'drop', dt).defaultPrevented).toBe(false);
    expect(stage.classList.contains('stage--drop')).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('clears the highlight when disabled mid-drag', () => {
    const { stage, target } = setup();
    fire(stage, 'dragover', transfer({ files: [fileOf('a.png')] }));
    target.setEnabled(false);
    expect(stage.classList.contains('stage--drop')).toBe(false);
  });

  it('keeps the highlight while the pointer moves between children and clears it when it leaves', () => {
    const { stage, canvas } = setup();
    const dt = transfer({ files: [fileOf('a.png')] });
    fire(stage, 'dragover', dt);
    fire(stage, 'dragleave', dt, canvas);
    expect(stage.classList.contains('stage--drop')).toBe(true);
    fire(stage, 'dragleave', dt, document.body);
    expect(stage.classList.contains('stage--drop')).toBe(false);
    fire(stage, 'dragover', dt);
    fire(stage, 'dragleave', dt, null);
    expect(stage.classList.contains('stage--drop')).toBe(false);
  });

  it('posts the contents of dropped files', async () => {
    const { stage, onDrop } = setup();
    const event = fire(stage, 'drop', transfer({ files: [fileOf('a.png', [1, 2]), fileOf('b.mov', [3])] }));
    expect(event.defaultPrevented).toBe(true);
    await flush();
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      [],
      [
        { name: 'a.png', data: new Uint8Array([1, 2]) },
        { name: 'b.mov', data: new Uint8Array([3]) },
      ],
      [],
    );
    expect(stage.classList.contains('stage--drop')).toBe(false);
  });

  it('posts the uris of an Explorer drag once, even when both uri types are present', async () => {
    const { stage, onDrop } = setup();
    fire(
      stage,
      'drop',
      transfer({
        data: {
          'text/uri-list': '# comment\r\nfile:///a/Demo.app\r\nfile:///a/pic.png\r\n',
          'application/vnd.code.uri-list': 'file:///a/Demo.app\r\n',
        },
      }),
    );
    await flush();
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(['file:///a/Demo.app', 'file:///a/pic.png'], [], []);
  });

  it('does not send a file twice when it also arrives as a uri', async () => {
    const { stage, onDrop } = setup();
    fire(stage, 'drop', transfer({ data: { 'text/uri-list': 'file:///a/My%20Pic.png/' }, files: [fileOf('My Pic.png'), fileOf('other.png')] }));
    await flush();
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(['file:///a/My%20Pic.png/'], [{ name: 'other.png', data: new Uint8Array([1, 2]) }], []);
  });

  it('compares malformed uris by their raw last segment', async () => {
    const { stage, onDrop } = setup();
    fire(stage, 'drop', transfer({ data: { 'text/uri-list': 'file:///a/%E0%A4%A.png' }, files: [fileOf('%E0%A4%A.png')] }));
    await flush();
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(['file:///a/%E0%A4%A.png'], [], []);
  });

  it('reports files that cannot be read (such as folders) and still sends the rest', async () => {
    const { stage, onDrop, onError } = setup();
    const folder = fileOf('Demo.app');
    vi.spyOn(folder, 'arrayBuffer').mockRejectedValue(new Error('NotFoundError'));
    fire(stage, 'drop', transfer({ files: [folder, fileOf('a.png')] }));
    await flush();
    expect(onError).toHaveBeenCalledWith('Could not read Demo.app: NotFoundError');
    expect(onDrop).toHaveBeenCalledExactlyOnceWith([], [{ name: 'a.png', data: new Uint8Array([1, 2]) }], []);
  });

  it('describes a non-error read failure', async () => {
    const { stage, onError } = setup();
    const odd = fileOf('x.png');
    vi.spyOn(odd, 'arrayBuffer').mockRejectedValue('nope');
    fire(stage, 'drop', transfer({ files: [odd] }));
    await flush();
    expect(onError).toHaveBeenCalledWith('Could not read x.png: nope');
  });

  it('skips files over the size cap without reading them and reports their names', async () => {
    const { stage, onDrop } = setup();
    const big = fileOf('big.mov');
    Object.defineProperty(big, 'size', { value: MAX_DROPPED_FILE_BYTES + 1 });
    const read = vi.spyOn(big, 'arrayBuffer');
    const edge = fileOf('edge.png');
    Object.defineProperty(edge, 'size', { value: MAX_DROPPED_FILE_BYTES });
    vi.spyOn(edge, 'arrayBuffer').mockResolvedValue(new Uint8Array([9]).buffer);
    fire(stage, 'drop', transfer({ files: [big, edge] }));
    await flush();
    expect(read).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledExactlyOnceWith([], [{ name: 'edge.png', data: new Uint8Array([9]) }], ['big.mov']);
  });

  it('prefers the uri over an oversized file that also arrived as a uri', async () => {
    const { stage, onDrop } = setup();
    const big = fileOf('big.mov');
    Object.defineProperty(big, 'size', { value: MAX_DROPPED_FILE_BYTES + 1 });
    fire(stage, 'drop', transfer({ data: { 'text/uri-list': 'file:///a/big.mov' }, files: [big] }));
    await flush();
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(['file:///a/big.mov'], [], []);
  });

  it('posts nothing when the drop carries nothing usable', async () => {
    const { stage, onDrop } = setup();
    fire(stage, 'drop', transfer({ types: ['Files'] }));
    fire(stage, 'drop', transfer({ types: ['text/plain'] }));
    await flush();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('stops listening when disposed', () => {
    const { stage, target } = setup();
    target.dispose();
    expect(fire(stage, 'dragover', transfer({ files: [fileOf('a.png')] })).defaultPrevented).toBe(false);
  });
});
