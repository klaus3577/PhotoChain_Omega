// A szöveges keresés (ILIKE) feltételének unit tesztje: a keresőszó különleges karakterei szó
// szerint értendők, a kis- és nagybetű nem számít.
import { describe, expect, it } from 'vitest';

import { containsText } from './search.js';

describe('containsText', () => {
  it('a LIKE-minta különleges karakterei (%, _, \\) escape-elve kerülnek a feltételbe', () => {
    expect(containsText('50%_\\x')).toEqual({ contains: '50\\%\\_\\\\x', mode: 'insensitive' });
  });

  it('a közönséges szöveg változatlan', () => {
    expect(containsText('Anna')).toEqual({ contains: 'Anna', mode: 'insensitive' });
  });
});
