// A felhasználók végpontjainak kliense (L23): a publikus fotósprofil (GET /api/users/:id) és a saját
// profil módosítása (PATCH /api/me). A válasz külső adat: futás közben is ellenőrizzük; az azonosító
// csak a szerver formájában (UUID) indít kérést.
import { describe, expect, it } from 'vitest';

import { jsonResponse, stubFetch } from '../test/fetch';
import { OWNER_ID } from '../test/photos';
import { profile, profileResponse, profileUser, userResponse } from '../test/users';
import { getProfile, isUserId, updateProfile } from './users.api';

const unexpected = { code: 'UNEXPECTED_RESPONSE' };

describe('getProfile', () => {
  it('a GET /api/users/:id válaszából az ellenőrzött profilt adja', async () => {
    const fetchMock = stubFetch(profileResponse());

    await expect(getProfile(OWNER_ID)).resolves.toEqual(profile());
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/users/${OWNER_ID}`);
  });

  it('a bemutatkozás, a képek és az átlag nélküli profil is érvényes', async () => {
    stubFetch(
      profileResponse(profile({ bio: null, photoCount: 0, rating: { average: null, count: 0 } })),
    );

    await expect(getProfile(OWNER_ID)).resolves.toMatchObject({
      bio: null,
      photoCount: 0,
      rating: { average: null, count: 0 },
    });
  });

  it('nem UUID azonosítóval kérés nélkül hibát dob (más alakú érték más API-címre sem vihet)', async () => {
    const fetchMock = stubFetch();

    await expect(getProfile('..')).rejects.toBeInstanceOf(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isUserId('..')).toBe(false);
    expect(isUserId(OWNER_ID)).toBe(true);
  });

  it('a hibás alakú profilt váratlan válasznak tekinti', async () => {
    const responses = [
      profileResponse(profile({ id: '1' })),
      profileResponse(profile({ displayName: 7 })),
      profileResponse(profile({ bio: 42 })),
      profileResponse(profile({ photoCount: -1 })),
      profileResponse(profile({ rating: { average: 6, count: 1 } })),
      profileResponse(profile({ createdAt: 'tegnap' })),
      jsonResponse(200, { data: { user: null } }),
    ];
    stubFetch(...responses);

    for (let i = 0; i < responses.length; i += 1) {
      await expect(getProfile(OWNER_ID)).rejects.toMatchObject(unexpected);
    }
  });
});

describe('updateProfile', () => {
  it('PATCH /api/me a megadott mezőkkel; a válasz a felhasználó (a munkamenet alakja)', async () => {
    const fetchMock = stubFetch(userResponse(profileUser));

    await expect(updateProfile({ displayName: 'Fotós Fanni', bio: null })).resolves.toEqual(
      profileUser,
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/me');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ displayName: 'Fotós Fanni', bio: null });
  });

  it('a hibás alakú választ váratlan válasznak tekinti', async () => {
    stubFetch(jsonResponse(200, { data: { user: { id: 'x' } } }));

    await expect(updateProfile({ displayName: 'Fanni', bio: 'Hello' })).rejects.toMatchObject(
      unexpected,
    );
  });
});
