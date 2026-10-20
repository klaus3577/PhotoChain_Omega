import { use } from 'react';

import { AuthContext, type AuthState } from './authContext';

/** A munkamenet állapota; csak az AuthProvider alatt használható. */
export function useAuth(): AuthState {
  const state = use(AuthContext);
  if (!state) throw new Error('A useAuth csak az AuthProvider alatt használható.');
  return state;
}
