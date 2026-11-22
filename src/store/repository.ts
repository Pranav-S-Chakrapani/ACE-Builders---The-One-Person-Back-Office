/**
 * Generic repository contract for one collection.
 * Signatures are synchronous for the localStorage adapter; a DB adapter
 * may need these to become async.
 */
export interface Repository<T extends { id: string }> {
  list(): T[];
  getById(id: string): T | undefined;
  create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T;
  update(id: string, patch: Partial<Omit<T, 'id' | 'createdAt'>>): T | undefined;
  remove(id: string): boolean;
}

/** Repository for a single-object collection (e.g. settings). */
export interface SingletonRepository<T> {
  get(): T;
  set(patch: Partial<T>): T;
}

