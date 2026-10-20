import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAuth } from './useAuth';

function Reader() {
  useAuth();
  return null;
}

describe('useAuth', () => {
  it('provider nélkül hibát dob – a programhiba nem marad rejtve', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Reader />)).toThrow(/AuthProvider/);
  });
});
