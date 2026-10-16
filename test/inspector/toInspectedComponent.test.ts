import { describe, expect, it } from 'vitest';
import { formatPropValue, toInspectedComponent } from '../../src/inspector/toInspectedComponent';

const source = { file: '/app/src/App.tsx', line: 3, column: 5 };

describe('formatPropValue', () => {
  it.each([
    [{ preview_long: '{height: 224}' }, '{height: 224}'],
    ['Copy', '"Copy"'],
    [() => undefined, 'ƒ()'],
    [17, '17'],
    [undefined, 'undefined'],
    [{ fontSize: 17 }, '{"fontSize":17}'],
  ])('formats %j', (value, expected) => {
    expect(formatPropValue(value)).toBe(expected);
  });

  it('truncates long values', () => {
    const formatted = formatPropValue('x'.repeat(300));
    expect(formatted).toHaveLength(120);
    expect(formatted.endsWith('…')).toBe(true);
  });
});

describe('toInspectedComponent', () => {
  it('reads name, dehydrated props, owners and source', () => {
    const component = toInspectedComponent(
      {
        type: 'full-data',
        value: {
          displayName: 'PrimaryButton',
          props: { data: { children: 'Copy', disabled: false } },
          owners: [{ displayName: 'Demo' }, { id: 1 }, null],
        },
      },
      source,
    );
    expect(component).toEqual({
      name: 'PrimaryButton',
      props: [
        { name: 'children', value: '"Copy"' },
        { name: 'disabled', value: 'false' },
      ],
      owners: ['Demo'],
      source,
    });
  });

  it('hides props whose value is undefined', () => {
    const component = toInspectedComponent(
      { type: 'full-data', value: { props: { data: { accessibilityLabel: { type: 'undefined' }, testID: undefined, title: 'x' } }, owners: [] } },
      undefined,
    );
    expect(component?.props).toEqual([{ name: 'title', value: '"x"' }]);
  });

  it('falls back to the first owner name and plain props', () => {
    expect(
      toInspectedComponent({ type: 'full-data', value: { props: { title: 'x' }, owners: [{ displayName: 'Styled(Text)' }] } }, undefined),
    ).toEqual({ name: 'Styled(Text)', props: [{ name: 'title', value: '"x"' }], owners: ['Styled(Text)'], source: undefined });
  });

  it('handles missing props and owners', () => {
    expect(toInspectedComponent({ type: 'full-data', value: { props: null, owners: 'x' } }, undefined)).toEqual({
      name: 'Unknown',
      props: [],
      owners: [],
      source: undefined,
    });
  });

  it.each([{ type: 'not-found' }, { type: 'full-data', value: null }])('returns undefined for %j', (payload) => {
    expect(toInspectedComponent(payload, source)).toBeUndefined();
  });
});
