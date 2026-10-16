import { describe, expect, it } from 'vitest';
import { ACTION_IDS, ACTION_TITLES, TOOLBAR_GROUPS, isActionId } from '../../src/shared/actions';

describe('actions', () => {
  it('puts every action on the toolbar exactly once with its title', () => {
    const items = TOOLBAR_GROUPS.flat();
    expect(items.map((item) => item.id).sort()).toEqual([...ACTION_IDS].sort());
    for (const item of items) {
      expect(item.title).toBe(ACTION_TITLES[item.id]);
      expect(item.icon).toMatch(/^[a-z-]+$/);
    }
  });

  it('recognizes action ids', () => {
    expect(isActionId('screenshot')).toBe(true);
    expect(isActionId('format-disk')).toBe(false);
    expect(isActionId(3)).toBe(false);
  });
});
