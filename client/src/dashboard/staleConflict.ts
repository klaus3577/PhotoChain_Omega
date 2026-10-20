// A vezérlőpult műveleteinek elavult-sor hibája (L22): a kép közben megváltozott – elrejtették (409)
// vagy eltűnt a felhasználó elől (404). Ilyenkor a lista frissítése mutatja meg a valós állapotot.
import { ApiError } from '../api/http';

export const isStaleConflict = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 404 || error.status === 409);
