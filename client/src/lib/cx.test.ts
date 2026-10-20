import { describe, expect, it } from 'vitest';

import { cx } from './cx';

describe('cx', () => {
  it('az osztályneveket szóközzel fűzi össze, a hamis értékeket (feltételes osztály) kihagyja', () => {
    const active = false;

    expect(cx('a', active && 'b', undefined, null, '', 'c')).toBe('a c');
  });
});
