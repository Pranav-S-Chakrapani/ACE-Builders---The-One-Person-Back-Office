import { createLocalStorageRepositories } from './localStorageRepository';

export type { Repository } from './repository';

/** Shape of the store: one Repository per collection. */
export type Stores = ReturnType<typeof createLocalStorageRepositories>;

/**
 * Single store factory. A future DB adapter replaces this function's body.
 */
export function createStore(): Stores {
  return createLocalStorageRepositories();
}

