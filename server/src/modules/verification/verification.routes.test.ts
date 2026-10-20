// A hitelesség-ellenőrző útvonalainak egységtesztje: az egyidejűségi korlát kulcsa (kliensenként).
import { describe, expect, it } from 'vitest';

import { clientKeyOf } from './verification.routes.js';

describe('clientKeyOf', () => {
  it('IPv4-címnél maga a cím – az IPv6-ba ágyazott alakban érkezőnél is', () => {
    expect(clientKeyOf({ ip: '203.0.113.7' })).toBe('203.0.113.7');
    expect(clientKeyOf({ ip: '::ffff:203.0.113.7' })).toBe('203.0.113.7');
  });

  it('IPv6-címnél a /56-os alhálózat: a címek váltogatása nem kerüli meg a korlátot', () => {
    expect(clientKeyOf({ ip: '2001:db8:aa:bb01::1' })).toBe(
      clientKeyOf({ ip: '2001:db8:aa:bbff::2' }),
    );
    expect(clientKeyOf({ ip: '2001:db8:aa:bb01::1' })).not.toBe(
      clientKeyOf({ ip: '2001:db8:ab:bb01::1' }),
    );
  });

  it('ha a kapcsolat már bontott (az IP-cím nem ismert), közös kulcsot ad', () => {
    expect(clientKeyOf({ ip: undefined })).toBe('ismeretlen');
  });
});
