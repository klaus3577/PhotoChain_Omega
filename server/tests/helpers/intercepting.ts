// Tesztsegéd a versenyhelyzetek és az adatbázishibák kiszámítható előidézéséhez: a Prisma-kliens,
// amely egy delegált (pl. photo, order) megadott műveletét egy beavatkozással előzi meg – egy
// párhuzamos kérés hatását utánozza, vagy hibát dob (az adatbázis nem érhető el).
import type { PrismaClient } from '../../src/generated/prisma/client.js';

type Model = 'photo' | 'order' | 'user' | 'review';

/**
 * A kliens másolata, amelyben a model.operation hívása előtt lefut a before(target, args): a target
 * a valódi kliens (a beavatkozás ezen át ír), az args a művelet argumentumai.
 */
export function intercepting(
  client: PrismaClient,
  model: Model,
  operation: string,
  before: (target: PrismaClient, args: unknown[]) => Promise<unknown>,
): PrismaClient {
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (property !== model) return typeof value === 'function' ? value.bind(target) : value;
      return new Proxy(target[model], {
        get(delegate, method) {
          const member: unknown = Reflect.get(delegate, method);
          if (typeof member !== 'function') return member;
          if (method !== operation) return member.bind(delegate);
          return async (...args: unknown[]) => {
            await before(target, args);
            return member.apply(delegate, args);
          };
        },
      });
    },
  });
}

/** A beavatkozás: az adatbázis nem érhető el. */
export const databaseDown = async (): Promise<never> => {
  throw new Error('az adatbázis nem érhető el');
};
